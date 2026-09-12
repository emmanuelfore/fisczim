import axios, { AxiosInstance } from "axios";
import https from "https";
import crypto from "crypto";
import forge from "node-forge";

/**
 * Client for Revenue Services Lesotho's LEKAKU E-Invoicing Gateway API v1.11.
 *
 * LEKAKU uses the same high-level fiscal-day lifecycle as FDMS, but levy taxes
 * are sent as `additionalTaxes` on a receipt line and must be repeated in the
 * aggregated `receiptTaxes` list.  Keep this client separate from ZIMRA: tax
 * identifiers and gateway URLs are issued by their respective authorities.
 */
export type LekakuTaxType =
  | "Exempt"
  | "FixedValueLevy"
  | "NonVAT"
  | "PercentageLevy"
  | "VAT"
  | "WithholdingTax";

export type LekakuTaxRoundingType = "PerReceipt" | "PerReceiptLine";

export interface LekakuConfig {
  /** LEKAKU gateway URL supplied by RSL; do not infer this from a ZIMRA URL. */
  baseUrl: string;
  deviceId: number | string;
  privateKey?: string;
  certificate?: string;
  timeoutMs?: number;
  /** Sent as HTTP headers on every request (FDMS convention). */
  deviceModelName?: string;
  deviceModelVersion?: string;
}

export interface LekakuAdditionalTax {
  taxID: number;
  receiptLineId: number;
  taxType: Extract<LekakuTaxType, "FixedValueLevy" | "PercentageLevy" | "WithholdingTax">;
  taxRate: number;
  taxCode?: string;
  /** Required by LEKAKU for a FixedValueLevy. */
  appliedForQuantity?: number;
}

export interface LekakuReceiptLine {
  receiptLineType: "Sale" | "Discount" | "Payout";
  receiptLineNo: number;
  receiptLineName: string;
  receiptLineQuantity: number;
  receiptLineTotal: number;
  receiptLinePrice?: number;
  receiptLineHSCode?: string;
  taxID: number;
  taxType: Extract<LekakuTaxType, "VAT" | "NonVAT" | "Exempt">;
  taxRate?: number;
  taxCode?: string;
  additionalTaxes?: LekakuAdditionalTax[];
}

export interface LekakuReceiptTax {
  taxID: number;
  taxType: LekakuTaxType;
  taxRate?: number;
  taxCode?: string;
  taxAmount: number;
  salesAmountWithTax: number;
}

export interface LekakuReceiptPayment {
  moneyTypeCode: "Cash" | "Card" | "MobileWallet" | "Coupon" | "Credit" | "BankTransfer" | "Other";
  paymentAmount: number;
}

export interface LekakuReceipt {
  receiptType: "Receipt" | "FiscalInvoice" | "Payout" | "CreditNote" | "DebitNote";
  receiptCurrency: "LSL";
  receiptCounter: number;
  receiptGlobalNo: number;
  invoiceNo: string;
  receiptDate: string;
  receiptLinesTaxInclusive: boolean;
  receiptLines: LekakuReceiptLine[];
  receiptTaxes?: LekakuReceiptTax[];
  receiptPayments: LekakuReceiptPayment[];
  receiptTotal?: number;
  taxRoundingType?: LekakuTaxRoundingType;
  buyerData?: unknown;
  receiptNotes?: string;
  creditDebitNote?: unknown;
  receiptDeviceSignature?: { hash: string; signature: string };
}

export class LekakuApiError extends Error {
  constructor(public statusCode: number, public endpoint: string, public details?: unknown) {
    super(`LEKAKU request to ${endpoint} failed (${statusCode})`);
    this.name = "LekakuApiError";
  }
}

const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
const taxKey = (tax: Pick<LekakuReceiptTax, "taxID" | "taxCode">) => `${tax.taxID}:${tax.taxCode || ""}`;

/**
 * Builds the tax table required by LEKAKU v1.11, including levy taxes.
 * Receipt totals are derived from this table so RCPT038 and RCPT039 use the
 * same amount that is sent to the gateway.
 */
export function prepareLekakuReceipt(input: LekakuReceipt): LekakuReceipt {
  const receipt = structuredClone(input);
  const rounding = receipt.taxRoundingType || "PerReceipt";
  const taxes = new Map<string, LekakuReceiptTax>();

  const add = (tax: LekakuReceiptTax) => {
    const key = taxKey(tax);
    const existing = taxes.get(key);
    if (existing) {
      existing.taxAmount = money(existing.taxAmount + tax.taxAmount);
      existing.salesAmountWithTax = money(existing.salesAmountWithTax + tax.salesAmountWithTax);
    } else taxes.set(key, tax);
  };

  for (const line of receipt.receiptLines) {
    const additional = line.additionalTaxes || [];
    for (const levy of additional) {
      if (levy.receiptLineId !== line.receiptLineNo) {
        throw new Error(`LEKAKU levy tax ${levy.taxID} must reference receipt line ${line.receiptLineNo}`);
      }
      if (levy.taxType === "FixedValueLevy" && !(levy.appliedForQuantity && levy.appliedForQuantity > 0)) {
        throw new Error(`LEKAKU fixed levy ${levy.taxID} requires appliedForQuantity`);
      }
    }
  }

  // Shared per-line base math (spec: pre-tax base; inclusive lines strip the
  // fixed levies first, then divide out the summed percentage rates).
  const parsed = receipt.receiptLines.map((line) => {
    const additional = line.additionalTaxes || [];
    const percentageTaxes = [
      { taxID: line.taxID, taxCode: line.taxCode, taxType: line.taxType, taxRate: line.taxRate || 0 },
      ...additional.filter(t => t.taxType === "PercentageLevy" || t.taxType === "WithholdingTax"),
    ];
    const fixedLevies = additional.filter(t => t.taxType === "FixedValueLevy");
    const fixedRaw = fixedLevies.reduce((sum, levy) => sum + levy.taxRate * (levy.appliedForQuantity || line.receiptLineQuantity), 0);
    const percentageRate = percentageTaxes.reduce((sum, tax) => sum + tax.taxRate, 0);
    const base = receipt.receiptLinesTaxInclusive
      ? (line.receiptLineTotal - fixedRaw) / (1 + percentageRate / 100)
      : line.receiptLineTotal;
    return { line, percentageTaxes, fixedLevies, base };
  });

  if (rounding === "PerReceiptLine") {
    // Round each line first, then sum (round-then-sum).
    for (const p of parsed) {
      const calc = (rate: number) => money(p.base * rate / 100);
      for (const tax of p.percentageTaxes) {
        const taxAmount = tax.taxType === "Exempt" ? 0 : calc(tax.taxRate);
        const salesAmountWithTax = receipt.receiptLinesTaxInclusive
          ? money(p.base + taxAmount)
          : money(p.line.receiptLineTotal + taxAmount);
        add({ ...tax, taxAmount, salesAmountWithTax });
      }
      for (const levy of p.fixedLevies) {
        const taxAmount = money(levy.taxRate * (levy.appliedForQuantity || p.line.receiptLineQuantity));
        add({
          taxID: levy.taxID, taxCode: levy.taxCode, taxType: levy.taxType, taxRate: levy.taxRate,
          taxAmount,
          salesAmountWithTax: receipt.receiptLinesTaxInclusive ? money(p.base + taxAmount) : money(p.line.receiptLineTotal + taxAmount),
        });
      }
    }
  } else {
    // PerReceipt (default): aggregate bases per (taxID, taxCode) bucket,
    // then round once (aggregate-then-round).
    interface Bucket {
      tax: { taxID: number; taxCode?: string; taxType: LekakuTaxType; taxRate: number };
      baseSum: number; lineSum: number; fixedRaw: number;
    }
    const buckets = new Map<string, Bucket>();
    const bucketOf = (tax: Bucket["tax"]): Bucket => {
      const key = taxKey(tax);
      let b = buckets.get(key);
      if (!b) {
        b = { tax, baseSum: 0, lineSum: 0, fixedRaw: 0 };
        buckets.set(key, b);
      }
      return b;
    };
    for (const p of parsed) {
      for (const tax of p.percentageTaxes) {
        const b = bucketOf({ taxID: tax.taxID, taxCode: tax.taxCode, taxType: tax.taxType as LekakuTaxType, taxRate: tax.taxRate });
        b.baseSum += p.base;
        b.lineSum += p.line.receiptLineTotal;
      }
      for (const levy of p.fixedLevies) {
        const b = bucketOf({ taxID: levy.taxID, taxCode: levy.taxCode, taxType: levy.taxType, taxRate: levy.taxRate });
        b.baseSum += p.base;
        b.lineSum += p.line.receiptLineTotal;
        b.fixedRaw += levy.taxRate * (levy.appliedForQuantity || p.line.receiptLineQuantity);
      }
    }
    for (const b of buckets.values()) {
      const isFixed = b.fixedRaw > 0 || (b.tax.taxType === "FixedValueLevy");
      const taxAmount = b.tax.taxType === "Exempt" ? 0 : isFixed ? money(b.fixedRaw) : money(b.baseSum * b.tax.taxRate / 100);
      const salesAmountWithTax = receipt.receiptLinesTaxInclusive
        ? money(b.baseSum + taxAmount)
        : money(b.lineSum + taxAmount);
      taxes.set(taxKey(b.tax), { ...b.tax, taxAmount, salesAmountWithTax });
    }
  }

  receipt.receiptTaxes = [...taxes.values()].sort((a, b) => a.taxID - b.taxID || (a.taxCode || "").localeCompare(b.taxCode || ""));
  receipt.receiptTotal = money(receipt.receiptLinesTaxInclusive
    ? receipt.receiptLines.reduce((sum, line) => sum + line.receiptLineTotal, 0)
    : receipt.receiptLines.reduce((sum, line) => sum + line.receiptLineTotal, 0) + receipt.receiptTaxes.reduce((sum, tax) => sum + tax.taxAmount, 0));

  const paymentsTotal = money(receipt.receiptPayments.reduce((sum, payment) => sum + payment.paymentAmount, 0));
  if (paymentsTotal !== receipt.receiptTotal) {
    throw new Error(`LEKAKU payments (${paymentsTotal}) must equal receipt total (${receipt.receiptTotal})`);
  }
  return receipt;
}

export function getLekakuReceiptSignatureInput(receipt: LekakuReceipt, deviceId: number | string, previousReceiptHash?: string): string {
  // Callers that already have the exact gateway tax table (for example a
  // stored/offline receipt) must not have it recalculated before signing.
  const prepared = receipt.receiptTaxes && receipt.receiptTotal !== undefined ? receipt : prepareLekakuReceipt(receipt);
  const taxInput = prepared.receiptTaxes!.map(t => {
    const rate = t.taxRate === undefined ? "" : t.taxRate.toFixed(2);
    return `${t.taxCode || ""}${rate}${Math.round(t.taxAmount * 100)}${Math.round(t.salesAmountWithTax * 100)}`;
  }).join("");
  return `${deviceId}${prepared.receiptType.toUpperCase()}${prepared.receiptCurrency.toUpperCase()}${prepared.receiptGlobalNo}${prepared.receiptDate}${Math.round(prepared.receiptTotal! * 100)}${taxInput}${previousReceiptHash || ""}`;
}

export class LekakuDevice {
  private readonly client: AxiosInstance;
  private readonly deviceId: string;
  private readonly privateKey?: string;

  constructor(config: LekakuConfig) {
    this.deviceId = String(config.deviceId);
    this.privateKey = config.privateKey;
    this.client = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ""),
      timeout: config.timeoutMs || 30_000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // RSL requires the device model as headers (FDMS convention,
        // same as ZIMRA's 'Server'/'1.0' defaults).
        DeviceModelName: config.deviceModelName || "Server",
        DeviceModelVersion: config.deviceModelVersion || "1.0",
      },
      httpsAgent: config.privateKey && config.certificate
        ? new https.Agent({ key: config.privateKey, cert: config.certificate, rejectUnauthorized: true })
        : undefined,
    });
  }

  /** Builds the exact SHA-256 input mandated by LEKAKU section 13.2.1. */
  signReceipt(receipt: LekakuReceipt, previousReceiptHash?: string): LekakuReceipt {
    if (!this.privateKey) throw new Error("A LEKAKU device private key is required to sign a receipt");
    const prepared = prepareLekakuReceipt(receipt);
    const input = getLekakuReceiptSignatureInput(prepared, this.deviceId, previousReceiptHash);
    const hash = crypto.createHash("sha256").update(input, "utf8").digest("base64");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(input, "utf8");
    signer.end();
    return { ...prepared, receiptDeviceSignature: { hash, signature: signer.sign(this.privateKey, "base64") } };
  }

  private async request<T>(method: "GET" | "POST", version: "v1" | "v2", action: string, data?: unknown): Promise<T> {
    const endpoint = `/Device/${version}/${this.deviceId}/${action}`;
    try {
      return (await this.client.request<T>({ method, url: endpoint, data })).data;
    } catch (error: any) {
      throw new LekakuApiError(error.response?.status || 0, endpoint, error.response?.data || error.message);
    }
  }

  /**
   * Registration is the only unauthenticated device operation in API v1.11.
   * RSL expects a POST carrying the activation key and device serial
   * (PascalCase fields); the device ID rides in the URL.
   */
  async verifyTaxpayerInformation(activationKey?: string, deviceSerialNo?: string): Promise<any> {
    const endpoint = `/Public/v1/${this.deviceId}/VerifyTaxpayerInformation`;
    try {
      return (await this.client.post(endpoint, {
        ...(activationKey ? { ActivationKey: activationKey } : {}),
        ...(deviceSerialNo ? { DeviceSerialNo: deviceSerialNo } : {}),
      })).data;
    } catch (error: any) {
      throw new LekakuApiError(error.response?.status || 0, endpoint, error.response?.data || error.message);
    }
  }

  async registerDevice(certificateRequest: string, activationKey?: string, deviceSerialNo?: string): Promise<any> {
    const endpoint = `/Public/v1/${this.deviceId}/RegisterDevice`;
    try {
      return (await this.client.post(endpoint, {
        certificateRequest,
        // RSL-issued activation key + serial (mirrors the ZIMRA flow);
        // omitted when the device has none.
        ...(activationKey ? { ActivationKey: activationKey } : {}),
        ...(deviceSerialNo ? { DeviceSerialNo: deviceSerialNo } : {}),
      })).data;
    } catch (error: any) {
      throw new LekakuApiError(error.response?.status || 0, endpoint, error.response?.data || error.message);
    }
  }

  getConfig() { return this.request<any>("GET", "v2", "GetConfig"); }
  getStatus() { return this.request<any>("GET", "v1", "GetStatus"); }
  openDay(fiscalDayNo?: number) { return this.request<any>("POST", "v1", "OpenDay", fiscalDayNo ? { fiscalDayNo } : {}); }
  submitReceipt(receipt: LekakuReceipt, previousReceiptHash?: string) {
    return this.request<any>("POST", "v2", "SubmitReceipt", {
      deviceID: Number(this.deviceId),
      receipt: this.signReceipt(receipt, previousReceiptHash),
    });
  }

  generateQrCode(hash: string, globalNo: number, receiptDate: string): string {
    return `LEKAKU|${this.deviceId}|${globalNo}|${receiptDate}|${hash}`;
  }
}

/**
 * Generates a fresh RSA keypair + CSR for LEKAKU device registration,
 * mirroring the ZIMRA flow. The private key is kept server-side (saved to
 * the company); only the CSR is sent to RSL, which returns the certificate.
 */
export function generateLekakuKeypair(deviceId: string | number, deviceSerialNo?: string): {
  privateKey: string;
  certificateRequest: string;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  const serial = (deviceSerialNo || "").trim();
  // RSL spec: CN = RSL-<Fiscal_device_serial_no>-<zero_padded_10_digit_deviceId>
  // e.g. SN: 001 + 187 => RSL-SN: 001-0000000187
  const paddedId = String(deviceId).trim().padStart(10, "0");
  csr.setSubject([{ name: "commonName", value: serial ? `RSL-${serial}-${paddedId}` : `RSL-${paddedId}` }]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    certificateRequest: forge.pki.certificationRequestToPem(csr),
  };
}
