/**
 * Parse a captured print job into invoice fields for FiscalStack.
 *
 * 1) JSON → FiscalStack-shaped body
 * 2) POS text → Interface/FiscalBridge marker parser (ReadFile)
 * 3) Simple pipe text → fallback demo format
 */

import { ReceiptParser, posInvoiceToParsed } from "./receiptParser.js";

function taxTypeFromLabel(label = "") {
  const t = String(label).toLowerCase();
  if (t.includes("exem") || t.includes("exempt")) return "EXEMPT";
  if (t.includes("zero") || t.includes("0%")) return "ZERO_RATED";
  return "STANDARD";
}

function parseJsonJob(content) {
  const data = JSON.parse(content);
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("JSON job must include a non-empty items[] array");
  }

  return {
    invoiceNumber: data.invoiceNumber || data.invoiceNo || null,
    date: data.date || null,
    currency: data.currency || "USD",
    paymentMethod: data.paymentMethod || "CASH",
    transactionType: data.transactionType || "FiscalInvoice",
    relatedInvoiceNumber: data.relatedInvoiceNumber || null,
    creditNoteReason: data.creditNoteReason || null,
    buyer: data.buyer || null,
    items: data.items.map((item) => ({
      name: item.name || item.itemName || item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice ?? item.price),
      taxType: item.taxType || taxTypeFromLabel(item.taxLabel),
      taxInclusive: item.taxInclusive ?? true,
    })),
  };
}

function parsePosJob(content, config) {
  const parser = new ReceiptParser(config.parse || config);
  const currencies = config.currencies || [
    { keyword: "USD", name: "USD" },
    { keyword: "US$", name: "USD" },
    { keyword: "ZWG", name: "ZWG" },
    { keyword: "ZWL", name: "ZWG" },
  ];
  const invoiceData = parser.parseReceipt(content, currencies);
  return posInvoiceToParsed(invoiceData);
}

function parseSimpleTextJob(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meta = {
    invoiceNumber: null,
    currency: "USD",
    paymentMethod: "CASH",
    transactionType: "FiscalInvoice",
    buyer: {},
  };
  const items = [];
  let inItems = false;

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (/^---+$/.test(line) || upper.startsWith("ITEM")) {
      if (upper.startsWith("ITEM")) inItems = true;
      if (/^---+$/.test(line) && items.length > 0) inItems = false;
      continue;
    }

    const kv = line.match(/^([A-Za-z ]+)\s*[:=]\s*(.+)$/);
    if (kv && !inItems) {
      const key = kv[1].trim().toUpperCase();
      const value = kv[2].trim();
      if (key.startsWith("INVOICE")) meta.invoiceNumber = value;
      else if (key.startsWith("CURRENCY")) meta.currency = value.toUpperCase();
      else if (key.startsWith("PAYMENT")) meta.paymentMethod = value.toUpperCase();
      else if (key.startsWith("CUSTOMER") || key.startsWith("BUYER") || key === "NAME") {
        meta.buyer.name = value;
      } else if (key === "TIN") meta.buyer.tin = value;
      else if (key === "VAT" || key === "VATNUMBER") meta.buyer.vatNumber = value;
      continue;
    }

    if (upper.startsWith("TOTAL")) continue;

    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length >= 3 && !Number.isNaN(Number(parts[1]))) {
        items.push({
          name: parts[0],
          quantity: Number(parts[1]),
          unitPrice: Number(parts[2]),
          taxType: taxTypeFromLabel(parts[3] || "STANDARD"),
          taxInclusive: true,
        });
        inItems = true;
      }
    }
  }

  if (items.length === 0) {
    throw new Error("Could not parse any line items from text job");
  }

  const buyer =
    meta.buyer && Object.keys(meta.buyer).length > 0
      ? Object.fromEntries(Object.entries(meta.buyer).filter(([, v]) => v))
      : undefined;

  return {
    invoiceNumber: meta.invoiceNumber,
    currency: meta.currency,
    paymentMethod: meta.paymentMethod,
    transactionType: meta.transactionType,
    buyer,
    items,
  };
}

export function parseJob(content, fileName = "", config = {}) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Empty print job");

  const looksJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    fileName.toLowerCase().endsWith(".json");

  if (looksJson) return parseJsonJob(trimmed);

  // Prefer real POS markers (Interface / FiscalBridge)
  try {
    return parsePosJob(trimmed, config);
  } catch (posErr) {
    try {
      return parseSimpleTextJob(trimmed);
    } catch {
      throw new Error(
        `Failed to parse print job as POS receipt (${posErr.message}). ` +
          "Adjust parse markers in config.json, or use JSON / pipe text format."
      );
    }
  }
}
