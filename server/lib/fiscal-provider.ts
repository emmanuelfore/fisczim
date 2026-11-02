import { createHash, X509Certificate } from "node:crypto";
import { storage } from "../storage.js";
import { ZimraDevice, getZimraBaseUrl } from "../zimra.js";
import { LekukaDevice, generateLekukaKeypair } from "../lekuka.js";
import { getLekukaGatewayUrl } from "../../shared/lekuka.js";
import { getZimraLogger } from "./fiscalization.js";

export type FiscalProvider = "ZIMRA" | "LEKUKA";

/** The company's gateway does not have this operation at all. */
export class UnsupportedOperationError extends Error {}

/** Local fiscal-day state makes the call meaningless — a 400, not a 500. */
export class FiscalDayStateError extends Error {}

export function companyUsesLekuka(company: any): boolean {
  return company?.fiscalProvider === "LEKUKA"
    || String(company?.country || "").toLowerCase() === "lesotho"
    || (process.env.COUNTRY_SCOPE || "").trim().toLowerCase() === "lesotho";
}

export function providerOf(company: any): FiscalProvider {
  return companyUsesLekuka(company) ? "LEKUKA" : "ZIMRA";
}

export function zimraDeviceFromCompany(company: any) {
  return new ZimraDevice({
    deviceId: String(company.fdmsDeviceId),
    // The certificate CN is built from the serial, so renewing with a placeholder
    // produces a certificate the gateway will not accept for this device.
    deviceSerialNo: company.fdmsDeviceSerialNo || "UNKNOWN",
    activationKey: company.fdmsApiKey || "",
    privateKey: company.zimraPrivateKey || "",
    certificate: company.zimraCertificate || "",
    baseUrl: getZimraBaseUrl((company.zimraEnvironment as "test" | "production") || "test"),
  }, getZimraLogger(Number(company.id)));
}

export function lekukaDeviceFromCompany(company: any) {
  return new LekukaDevice({
    baseUrl: (company.lekukaGatewayUrl || getLekukaGatewayUrl(company.zimraEnvironment)).trim(),
    deviceId: String(company.fdmsDeviceId).trim(),
    privateKey: company.zimraPrivateKey || undefined,
    certificate: company.zimraCertificate || undefined,
    deviceModelName: company.fdmsDeviceModelName || "Server",
    deviceModelVersion: company.fdmsDeviceModelVersion || "1.0",
  });
}

export function fiscalDeviceFromCompany(company: any) {
  return companyUsesLekuka(company) ? lekukaDeviceFromCompany(company) : zimraDeviceFromCompany(company);
}

export function certificateThumbprint(certificate?: string | null): string | undefined {
  if (!certificate) return undefined;
  try {
    return createHash("sha1").update(new X509Certificate(certificate).raw).digest("hex").toUpperCase();
  } catch {
    // Unparseable stored certificate: let the gateway pick the pending one.
    return undefined;
  }
}

/**
 * Expiry of the stored device certificate, straight from its X509 validity —
 * no gateway round-trip, and the same date the gateway reports as
 * certificateValidTill. Null when no usable certificate is stored.
 */
export function certificateExpiry(certificate?: string | null): string | null {
  if (!certificate) return null;
  try {
    const validTo = new X509Certificate(certificate).validTo;
    const parsed = new Date(validTo);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
}

export interface IssueCertificateResult {
  provider: FiscalProvider;
  certificate?: string;
  privateKeyStored: boolean;
  confirmationRequired: boolean;
  response: any;
}

/**
 * Renew the device security certificate. Rotation replaces the key pair the
 * server signs with, so every till that holds the old credentials must
 * re-provision afterwards.
 *
 * A caller-supplied CSR means the client keeps its own private key and only the
 * issued certificate is stored; otherwise the key pair is generated and stored
 * server-side and never returned.
 */
export async function issueCompanyCertificate(
  company: any,
  options: { certificateRequest?: string } = {},
): Promise<IssueCertificateResult> {
  const companyId = Number(company.id);
  const suppliedCsr = typeof options.certificateRequest === "string" ? options.certificateRequest.trim() : "";
  const provider = providerOf(company);

  if (provider === "LEKUKA") {
    let csr = suppliedCsr;
    let privateKey: string | undefined;
    if (!csr) {
      const pair = generateLekukaKeypair(company.fdmsDeviceId, company.fdmsDeviceSerialNo);
      privateKey = pair.privateKey;
      csr = pair.certificateRequest;
    }
    const response = await lekukaDeviceFromCompany(company).issueCertificate(csr);
    const certificate = response?.certificate || response?.data?.certificate;
    if (certificate) {
      await storage.updateCompany(companyId, (privateKey
        ? { zimraPrivateKey: privateKey, zimraCertificate: certificate }
        : { zimraCertificate: certificate }) as any);
      // Keep the caller's record in step with the store: the confirmation
      // thumbprint must come from the certificate that was just issued.
      company.zimraCertificate = certificate;
      if (privateKey) company.zimraPrivateKey = privateKey;
    }
    return {
      provider,
      certificate,
      privateKeyStored: Boolean(privateKey && certificate),
      // RSL runs a two-step process: the certificate only becomes active after ConfirmCertificate.
      confirmationRequired: Boolean(certificate),
      response,
    };
  }

  if (suppliedCsr) {
    throw new UnsupportedOperationError(
      "This fiscal gateway builds the certificate signing request itself — omit certificateRequest.",
    );
  }

  const keys = await zimraDeviceFromCompany(company).issueCertificate();
  await storage.updateCompany(companyId, {
    zimraPrivateKey: keys.privateKey,
    zimraCertificate: keys.certificate,
  });
  return {
    provider,
    certificate: keys.certificate,
    privateKeyStored: true,
    confirmationRequired: false,
    response: keys,
  };
}

export async function confirmCompanyCertificate(company: any): Promise<{ provider: FiscalProvider; data: any }> {
  if (!companyUsesLekuka(company)) {
    throw new UnsupportedOperationError(
      "This fiscal gateway issues certificates in a single step — there is nothing to confirm.",
    );
  }
  const data = await lekukaDeviceFromCompany(company)
    .confirmCertificate(certificateThumbprint(company.zimraCertificate));
  return { provider: "LEKUKA", data };
}

export interface OpenDayResult {
  fiscalDayNo: number;
  alreadyOpen: boolean;
  result?: any;
}

/**
 * RSL day open. The gateway is the authority on the day number, so local state
 * is only ever synced from its answer.
 */
export async function openLekukaFiscalDay(company: any): Promise<OpenDayResult> {
  const companyId = Number(company.id);
  const device = lekukaDeviceFromCompany(company);
  const current: any = await device.getStatus().catch(() => null);

  if (current?.fiscalDayStatus === "FiscalDayOpened") {
    const fiscalDayNo = Number(current.lastFiscalDayNo || company.currentFiscalDayNo || 0);
    await storage.updateCompany(companyId, {
      currentFiscalDayNo: fiscalDayNo,
      fiscalDayOpen: true,
      lastFiscalDayStatus: "FiscalDayOpened",
    } as any);
    return { fiscalDayNo, alreadyOpen: true };
  }

  const result: any = await device.openDay();
  const fiscalDayNo = Number(result?.fiscalDayNo ?? result?.FiscalDay ?? (company.currentFiscalDayNo || 0) + 1);
  await storage.updateCompany(companyId, {
    fiscalDayOpen: true,
    fiscalDayOpenedAt: new Date(),
    currentFiscalDayNo: fiscalDayNo,
    dailyReceiptCount: 0,
    lastFiscalDayStatus: "FiscalDayOpened",
  } as any);
  return { fiscalDayNo, alreadyOpen: false, result };
}

export interface CloseDayResult {
  fiscalDayNo: number;
  counters: any[];
  result: any;
}

export async function closeLekukaFiscalDay(
  company: any,
  body: { fiscalDayNo?: number; counters?: any[]; receiptCounter?: number } = {},
): Promise<CloseDayResult> {
  const companyId = Number(company.id);
  const fiscalDayNo = Number(body.fiscalDayNo ?? company.currentFiscalDayNo);
  if (!fiscalDayNo) {
    throw new FiscalDayStateError("No fiscal day has been opened yet");
  }

  const counters = body.counters ?? await storage.calculateFiscalCounters(companyId, fiscalDayNo);
  const result = await lekukaDeviceFromCompany(company).closeDay({
    fiscalDayNo,
    // RSL stamps the day with its close date; the open date plus a working day
    // is what the UAT device expects when the day runs long.
    fiscalDayDate: company.fiscalDayOpenedAt
      ? new Date(new Date(company.fiscalDayOpenedAt).getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : undefined,
    receiptCounter: body.receiptCounter ?? company.dailyReceiptCount ?? 0,
    counters,
  });

  await storage.updateCompany(companyId, {
    fiscalDayOpen: false,
    fiscalDayClosedAt: new Date(),
    lastFiscalDayStatus: "FiscalDayClosed",
    dailyReceiptCount: 0,
  } as any);
  return { fiscalDayNo, counters, result };
}
