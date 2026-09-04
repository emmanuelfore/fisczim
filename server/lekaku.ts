import axios, { AxiosInstance } from "axios";
import https from "https";
import crypto from "crypto";

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

    const percentageTaxes = [
      { taxID: line.taxID, taxCode: line.taxCode, taxType: line.taxType, taxRate: line.taxRate || 0 },
      ...additional.filter(t => t.taxType === "PercentageLevy" || t.taxType === "WithholdingTax"),
    ];
    const fixedLevy = additional
      .filter(t => t.taxType === "FixedValueLevy")
      .reduce((sum, levy) => sum + levy.taxRate * (levy.appliedForQuantity || line.receiptLineQuantity), 0);
    const percentageRate = percentageTaxes.reduce((sum, tax) => sum + tax.taxRate, 0);
    const base = receipt.receiptLinesTaxInclusive
      ? (line.receiptLineTotal - fixedLevy) / (1 + percentageRate / 100)
      : line.receiptLineTotal;

    const calculatePercentage = (rate: number) => money(base * rate / 100);
    for (const tax of percentageTaxes) {
      // LEKAKU's PerReceiptLine mode rounds each line before aggregation.
      // PerReceipt is rounded at the tax bucket level below.
      const taxAmount = tax.taxType === "Exempt" ? 0 : calculatePercentage(tax.taxRate);
      const salesAmountWithTax = receipt.receiptLinesTaxInclusive
        ? money(base + taxAmount)
        : money(line.receiptLineTotal + taxAmount);
      add({ ...tax, taxAmount, salesAmountWithTax });
    }
    for (const levy of additional.filter(t => t.taxType === "FixedValueLevy")) {
      const taxAmount = money(levy.taxRate * (levy.appliedForQuantity || line.receiptLineQuantity));
      add({
        taxID: levy.taxID, taxCode: levy.taxCode, taxType: levy.taxType, taxRate: levy.taxRate,
        taxAmount,
        salesAmountWithTax: receipt.receiptLinesTaxInclusive ? money(base + taxAmount) : money(line.receiptLineTotal + taxAmount),
      });
    }
  }

  // In PerReceipt mode, recompute percentage tax amounts from grouped bases.
  // The line-level amounts above are already correct for PerReceiptLine.
  if (rounding === "PerReceipt") {
    // The receipt-level formula and the line aggregation coincide for an
    // exclusive receipt. Inclusive multi-tax lines require LEKAKU's exact
    // per-line allocation, which the base calculation above preserves.
    for (const tax of taxes.values()) tax.taxAmount = money(tax.taxAmount);
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

  /** Registration is the only unauthenticated device operation in API v1.11. */
  async verifyTaxpayerInformation(): Promise<any> {
    try {
      return (await this.client.get(`/Public/v1/${this.deviceId}/VerifyTaxpayerInformation`)).data;
    } catch (error: any) {
      throw new LekakuApiError(error.response?.status || 0, `/Public/v1/${this.deviceId}/VerifyTaxpayerInformation`, error.response?.data || error.message);
    }
  }

  async registerDevice(certificateRequest: string, deviceModelName?: string, deviceModelVersion?: string): Promise<any> {
    const endpoint = `/Public/v1/${this.deviceId}/RegisterDevice`;
    try {
      return (await this.client.post(endpoint, { certificateRequest, deviceModelName, deviceModelVersion })).data;
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
