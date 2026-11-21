import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { parseInvoicePdf } from "../src/pdfInvoiceParser.js";
import { parsedPdfToFiscalizePayload } from "../src/processJobPdf.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const invoicePath = path.join(here, "..", "samples", "sample-invoice-palladium.pdf");
const creditPath = path.join(here, "..", "samples", "sample-credit-note-palladium.pdf");

test("parses the Palladium fiscal tax invoice", async () => {
  const parsed = await parseInvoicePdf(invoicePath);

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.documentType, "FiscalInvoice");
  assert.equal(parsed.number, "IN-000000027");
  assert.equal(parsed.date, "2026-10-16");
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.supplier.name, "Eximium Premium Brands (Pvt) Ltd");
  assert.equal(parsed.supplier.tin, "2002533710");
  assert.equal(parsed.supplier.vat, "220451470");
  assert.equal(parsed.buyer.name, "Sample Inv");

  assert.equal(parsed.items.length, 1);
  const item = parsed.items[0];
  assert.equal(item.hsCode, "85434000");
  assert.equal(item.code, "VOL018BLU");
  assert.equal(item.description, "V18X-BLUEBERRY");
  assert.equal(item.quantity, 1);
  assert.equal(item.price, 1);
  assert.equal(item.vat, 0.16);
  assert.equal(item.total, 1);

  assert.equal(parsed.totals.subtotal, 1);
  assert.equal(parsed.totals.vatTotal, 0.16);
  assert.equal(parsed.totals.invoiceTotal, 1.16);
  assert.equal(parsed.priceInclusive, true);

  const payload = parsedPdfToFiscalizePayload(parsed, { currency: "USD" });
  assert.equal(payload.transactionType, "FiscalInvoice");
  assert.equal(payload.invoiceNumber, "IN-000000027");
  assert.equal(payload.date, "2026-10-16");
  assert.equal(payload.items[0].taxInclusive, true);
});

test("parses the Palladium fiscal credit note", async () => {
  const parsed = await parseInvoicePdf(creditPath);

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.documentType, "CreditNote");
  assert.equal(parsed.number, "CN-000000001");
  assert.equal(parsed.originalInvoiceNumber, "IN-000000027");
  assert.equal(parsed.reason, "DAMAGED");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].quantity, -1);
  assert.equal(parsed.totals.invoiceTotal, -1.16);

  const payload = parsedPdfToFiscalizePayload(parsed, { currency: "USD" });
  assert.equal(payload.transactionType, "CreditNote");
  assert.equal(payload.relatedInvoiceNumber, "IN-000000027");
  assert.equal(payload.creditNoteReason, "DAMAGED");
  assert.equal(payload.items[0].quantity, 1);
});
