import { apiFetch } from "./api";

export const BACKGROUND_PRINT_MAX_WAIT_MS = 45_000;

/** True when the invoice has enough fiscal data to print a compliant receipt. */
export function isInvoiceReadyForPrint(invoice: any): boolean {
  if (!invoice) return false;
  const fdmsStatus = (invoice.fdmsStatus || "").toString().toLowerCase();
  return Boolean(
    invoice.qrCodeData ||
    invoice.receiptQRData ||
    invoice.fiscalCode ||
    invoice.verificationCode ||
    invoice.syncedWithFdms ||
    invoice._offline ||
    invoice._simulation ||
    fdmsStatus === "fiscalized" ||
    fdmsStatus === "failed"
  );
}

function isLocalInvoiceId(id: unknown): boolean {
  if (id == null) return true;
  const value = String(id);
  return value.startsWith("optimistic_") || value.startsWith("offline_");
}

/** Fetch the latest invoice record from the server (includes fiscal fields). */
export async function fetchInvoiceById(invoiceId: number | string): Promise<any | null> {
  if (isLocalInvoiceId(invoiceId)) return null;
  try {
    const res = await apiFetch(`/api/invoices/${invoiceId}`);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Wait for fiscal data before printing — mirrors web POS behaviour.
 * Polls GET /api/invoices/:id until qrCodeData / fiscal fields are present.
 */
export async function ensureInvoiceReadyForPrint(
  invoice: any,
  options?: { items?: any[]; maxWaitMs?: number }
): Promise<any> {
  const items = options?.items;
  const maxWaitMs = options?.maxWaitMs ?? BACKGROUND_PRINT_MAX_WAIT_MS;

  let current = {
    ...invoice,
    items: items || invoice?.items || invoice?.lineItems || invoice?.invoiceItems,
  };

  if (invoice?._offline || invoice?._simulation) {
    return current;
  }

  if (isInvoiceReadyForPrint(current)) {
    return current;
  }

  const invoiceId = current.id;
  if (isLocalInvoiceId(invoiceId)) {
    return current;
  }

  const start = Date.now();
  const pollIntervalMs = 1500;

  while (Date.now() - start < maxWaitMs) {
    const refreshed = await fetchInvoiceById(invoiceId);
    if (refreshed) {
      current = {
        ...current,
        ...refreshed,
        items: refreshed.items || refreshed.lineItems || current.items,
      };
      if (isInvoiceReadyForPrint(current)) {
        return current;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.warn(
    `[FiscalPrint] Timed out waiting for fiscal fields on invoice ${invoiceId}; printing with available data.`
  );
  return current;
}
