import crypto from "crypto";
import QRCode from "qrcode";

function qrSecret(): string {
  return (
    process.env.FISCAL_QR_SECRET ||
    process.env.JWT_SECRET ||
    "fiscalstack-fiscal-qr"
  );
}

/**
 * Deterministic token that authorises the public QR PNG for one invoice.
 * The token is embedded in the URL written back to Zoho Books, so the
 * endpoint can stay public without exposing arbitrary invoices.
 */
export function signInvoiceQrToken(companyId: number, invoiceNumber: string): string {
  return crypto
    .createHmac("sha256", qrSecret())
    .update(`${companyId}:${invoiceNumber}`)
    .digest("hex")
    .slice(0, 40);
}

export function verifyInvoiceQrToken(
  companyId: number,
  invoiceNumber: string,
  token: string | undefined,
): boolean {
  if (!token) return false;
  const expected = signInvoiceQrToken(companyId, invoiceNumber);
  if (token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export function buildInvoiceQrUrl(
  publicBaseUrl: string,
  companyId: number,
  invoiceNumber: string,
): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const token = signInvoiceQrToken(companyId, invoiceNumber);
  return `${base}/api/public/fiscal/qr?c=${companyId}&invoice=${encodeURIComponent(invoiceNumber)}&t=${token}`;
}

export async function renderQrPng(data: string): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    type: "png",
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

