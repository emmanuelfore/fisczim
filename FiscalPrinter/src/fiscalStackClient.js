/**
 * FiscalStack pass-through client — same contract as Interface/FiscalStackClient.cs
 * POST /api/v1/fiscalize with X-API-Key
 */

export class FiscalStackClient {
  constructor({ apiEndpoint, apiKey }) {
    this.apiEndpoint = apiEndpoint.endsWith("/") ? apiEndpoint : `${apiEndpoint}/`;
    this.apiKey = apiKey;
  }

  async fiscalize(payload) {
    const res = await fetch(`${this.apiEndpoint}fiscalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const message = body?.message || body?.error || text || res.statusText;
      throw new Error(`Fiscalization failed (${res.status}): ${message}`);
    }

    return body;
  }
}

/**
 * Build FiscalStack fiscalize body from a parsed print job.
 */
function cleanBuyer(buyer) {
  if (!buyer || typeof buyer !== "object") return undefined;
  const out = {};
  for (const [key, value] of Object.entries(buyer)) {
    if (value == null) continue;
    const s = String(value).trim();
    if (!s) continue;
    out[key] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

export function toFiscalizePayload(parsed, config) {
  return {
    items: parsed.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxType: item.taxType || "STANDARD",
      taxInclusive: item.taxInclusive ?? true,
    })),
    currency: parsed.currency || config.currency || "USD",
    paymentMethod: parsed.paymentMethod || config.paymentMethod || "CASH",
    transactionType: parsed.transactionType || "FiscalInvoice",
    invoiceNumber: parsed.invoiceNumber || undefined,
    date: parsed.date || undefined,
    buyer: cleanBuyer(parsed.buyer),
    relatedInvoiceNumber: parsed.relatedInvoiceNumber || undefined,
    creditNoteReason: parsed.creditNoteReason || undefined,
  };
}
