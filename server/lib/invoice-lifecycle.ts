/**
 * Shared invoice lifecycle rules.
 *
 * An invoice stays correctable between commercial issue (status `issued`) and
 * a successful ZIMRA/fiscal-device submission. Once a fiscal code, QR code,
 * verification code, submission id or ledger posting exists, commercial
 * changes must go through a credit note, debit note or reversal instead.
 */
export const DRAFT_INVOICE_STATUSES = new Set(["draft", "quote"]);
export const CORRECTABLE_INVOICE_STATUSES = new Set(["draft", "quote", "issued"]);

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

/** Fiscal/accounting evidence that makes an invoice commercially immutable. */
export function invoiceImmutableReasons(invoice: any): string[] {
  const reasons: string[] = [];
  if (hasValue(invoice?.fiscalCode)) reasons.push("a fiscal code is present");
  if (hasValue(invoice?.fiscalSignature)) reasons.push("a fiscal signature is present");
  if (hasValue(invoice?.qrCodeData)) reasons.push("fiscal QR data is present");
  if (hasValue(invoice?.verificationCode)) reasons.push("a verification code is present");
  if (hasValue(invoice?.submissionId)) reasons.push("a fiscal submission is present");
  if (invoice?.syncedWithFdms === true) reasons.push("the invoice was synced to FDMS");
  const fdmsStatus = String(invoice?.fdmsStatus || "").trim().toLowerCase();
  if (fdmsStatus === "issued" || fdmsStatus === "fiscalized") {
    reasons.push(`the FDMS status is ${fdmsStatus}`);
  }
  // isFiscalized is the POS fiscalization preference and defaults to true,
  // including on draft credit and debit notes with no receipt.
  if (hasValue(invoice?.journalEntryId)) reasons.push("a journal entry is attached");
  return reasons;
}
