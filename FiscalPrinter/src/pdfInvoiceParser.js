/**
 * PDF invoice parser for FiscalPrinter.
 *
 * Reads PDF text with pdfjs-dist (pure JS — no Poppler/pdftotext binary needed
 * on Windows) and understands the "Palladium" A4 layout used by these invoices:
 *
 *   Fiscal Tax Invoice / Fiscal Credit Note
 *   Number / Date / Reference / Account / Reason
 *   Buyer Details / Bank Details
 *   Line | HS Code | Item | Description | Quantity | Unit | Price Inc | VAT | Total Inc
 *   Subtotal / Discount / Delivery / VAT Total / Invoice Total
 *
 * It returns both the raw parsed document and a FiscalStack "parsed" object
 * compatible with `toFiscalizePayload()` in fiscalStackClient.js.
 */

import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let pdfjsLib = null;

function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  // pdfjs probes for the optional `canvas` package; text extraction never
  // renders, so silence the noisy polyfill warnings.
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
  } finally {
    console.log = log;
    console.warn = warn;
  }
  return pdfjsLib;
}

/* --------------------------- PDF text extraction --------------------------- */

/**
 * Rebuild column-aligned text from positioned glyph runs (the shape
 * `pdftotext -layout` produces), so table templates keep working.
 */
function layoutText(items) {
  const glyphs = [];
  for (const item of items) {
    if (!item.str) continue;
    glyphs.push({
      x: item.transform[4],
      y: item.transform[5],
      w: item.width || 0,
      h: Math.abs(item.transform[3]) || item.height || 10,
      str: item.str,
    });
  }
  glyphs.sort((a, b) => (Math.abs(b.y - a.y) > 0.01 ? b.y - a.y : a.x - b.x));

  const rows = [];
  for (const g of glyphs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - g.y) <= Math.max(row.h, g.h) * 0.5) {
      row.parts.push(g);
      row.h = Math.max(row.h, g.h);
    } else {
      rows.push({ y: g.y, h: g.h, parts: [g] });
    }
  }

  const lines = [];
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);
    let line = "";
    let endX = null;
    let charWidth = 0;
    for (const part of row.parts) {
      if (part.str.trim()) charWidth = part.w / part.str.length || charWidth;
      if (endX !== null) {
        const gap = part.x - endX;
        const average = charWidth || part.h * 0.5;
        if (gap > average * 0.55 && !/\s$/.test(line)) {
          line += " ".repeat(Math.min(80, Math.max(1, Math.round(gap / average))));
        }
      }
      line += part.str;
      endX = part.x + part.w;
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

export async function extractTextFromPdfAsync(input) {
  const pdfjs = loadPdfjs();
  const data = Buffer.isBuffer(input)
    ? new Uint8Array(input)
    : new Uint8Array(fs.readFileSync(input));

  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  const pages = [];
  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(layoutText(content.items));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages.join("\n\f\n");
}

/* ------------------------------- text parser ------------------------------- */

const TITLE_RE = /Fiscal\s+(Tax Invoice|Credit Note)/i;

export function isPalladiumInvoice(text) {
  return TITLE_RE.test(String(text || ""));
}

export function parsePalladiumInvoice(text) {
  const rawLines = String(text || "").replace(/\r/g, "\n").split("\n");
  // Collapsed lines keep values from both columns (invoice meta lives on the
  // right). Left-only lines expose the company/address block cleanly.
  const lines = rawLines.map((line) => line.replace(/\s+/g, " ").trim());
  const columns = rawLines.map((line) =>
    line
      .split(/\s{2,}/)
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  );
  const leftLines = columns.map((parts) => parts[0] || "");
  const rightLines = columns.map((parts) => parts[parts.length - 1] || "");

  const result = {
    documentType: null,
    invoiceNumber: null,
    date: null,
    time: null,
    page: null,
    reference: null,
    required: null,
    account: null,
    reason: null,
    salesPerson: null,
    currency: null,
    priceInclusive: null,
    company: {
      name: null,
      addressLines: [],
      phone: null,
      email: null,
      tin: null,
      vat: null,
    },
    buyer: {
      name: null,
      tradeName: null,
      address: null,
      tin: null,
      vat: null,
      email: null,
      phone: null,
    },
    bank: { accountName: null, bank: null, accounts: [] },
    items: [],
    totals: {
      subtotal: null,
      discount: null,
      delivery: null,
      vatTotal: null,
      invoiceTotal: null,
    },
  };

  // --- header fields -------------------------------------------------------
  for (const line of lines) {
    if (!line) continue;
    let m;

    if (!result.documentType && (m = line.match(TITLE_RE))) {
      result.documentType = m[0].replace(/\s+/g, " ").trim();
    }
    if (!result.invoiceNumber && (m = line.match(/(?:^|\s)Number:\s*([A-Za-z0-9-]+)/))) {
      result.invoiceNumber = m[1];
    }
    if (!result.date && (m = line.match(/(?:^|\s)Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/))) {
      result.date = m[1];
    }
    if (!result.page && (m = line.match(/(?:^|\s)Page:\s*(\d+)/))) {
      result.page = m[1];
    }
    if (result.reference == null && (m = line.match(/(?:^|\s)Reference:\s*(.*)$/))) {
      result.reference = m[1].trim() || null;
    }
    if (!result.required && (m = line.match(/(?:^|\s)Required:\s*(\d{1,2}\/\d{1,2}\/\d{4})/))) {
      result.required = m[1];
    }
    if (!result.account && (m = line.match(/(?:^|\s)Account:\s*(\S+)/))) {
      result.account = m[1];
    }
    if (result.reason == null && (m = line.match(/(?:^|\s)Reason\s*:\s*(.*)$/))) {
      result.reason = m[1].trim() || null;
    }
    if (result.salesPerson == null && (m = line.match(/Sales Person\s*:\s*(.*)$/i))) {
      result.salesPerson = m[1].trim() || null;
    }
    if (!result.currency && (m = line.match(/Invoiced Currency\s*:\s*([A-Z]{3})/i))) {
      result.currency = m[1].toUpperCase();
    }
    if (!result.time && (m = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s*[AP]M)/i))) {
      if (!result.date) result.date = m[1];
      result.time = m[2].toUpperCase();
    }
  }

  // --- company block -------------------------------------------------------
  const tinLineIndex = leftLines.findIndex((line) => /TIN:\s*\d+\s+VAT:\s*\d+/i.test(line));
  const companyStart = leftLines.findIndex(
    (line, index) =>
      Boolean(line) &&
      !TITLE_RE.test(line) &&
      !/^(Number|Date|Page|Reference|Required|Account|Reason|Ph|Email)\s*:/i.test(line) &&
      (tinLineIndex === -1 || index < tinLineIndex)
  );

  if (companyStart >= 0) {
    result.company.name = leftLines[companyStart];
    const addressLines = [];
    for (let i = companyStart + 1; i < (tinLineIndex === -1 ? leftLines.length : tinLineIndex); i++) {
      const line = leftLines[i];
      if (!line) continue;
      if (/^Ph\s*:/i.test(line)) {
        result.company.phone = line.replace(/^Ph\s*:\s*/i, "").trim();
        continue;
      }
      if (/^Email\s*:/i.test(line)) {
        result.company.email = line.replace(/^Email\s*:\s*/i, "").trim();
        continue;
      }
      if (/:/.test(line)) continue;
      addressLines.push(line);
    }
    result.company.addressLines = addressLines;
  }

  const tinMatch = text.match(/TIN:\s*(\d+)\s+VAT:\s*(\d+)/i);
  if (tinMatch) {
    result.company.tin = tinMatch[1];
    result.company.vat = tinMatch[2];
  }

  // --- buyer (left column) / bank (right column) ---------------------------
  for (const line of leftLines) {
    let m;
    if (!result.buyer.name && (m = line.match(/^Customer Name\s*:\s*(.*)$/i))) {
      result.buyer.name = cleanValue(m[1]);
    }
    if (!result.buyer.tradeName && (m = line.match(/^Trade Name\s*:\s*(.*)$/i))) {
      result.buyer.tradeName = cleanValue(m[1]);
    }
    if (!result.buyer.address && (m = line.match(/^Customer Address\s*:\s*(.*)$/i))) {
      result.buyer.address = cleanValue(m[1]);
    }
    if (!result.buyer.tin && (m = line.match(/^Customer TIN\s*:\s*(.*)$/i))) {
      result.buyer.tin = cleanValue(m[1]);
    }
    if (!result.buyer.vat && (m = line.match(/^Customer VAT\s*:\s*(.*)$/i))) {
      result.buyer.vat = cleanValue(m[1]);
    }
    if (!result.buyer.email && (m = line.match(/^E-?mail\s*:\s*(.*)$/i))) {
      result.buyer.email = cleanValue(m[1]);
    }
    if (!result.buyer.phone && (m = line.match(/^Telephone\s*:\s*(.*)$/i))) {
      result.buyer.phone = cleanValue(m[1].replace(/^Cell\s*:/i, ""));
    }
  }

  for (const line of rightLines) {
    let m;
    if (!result.bank.accountName && (m = line.match(/^Account Name\s*:\s*(.*)$/i))) {
      result.bank.accountName = cleanValue(m[1]);
    } else if (!result.bank.bank && (m = line.match(/^Bank\s*:\s*(.*)$/i))) {
      result.bank.bank = cleanValue(m[1]);
    } else if ((m = line.match(/^Account Type\s*:\s*(.*)$/i))) {
      result.bank.accounts.push({ type: cleanValue(m[1]), number: null });
    } else if ((m = line.match(/^Account Number\s*:\s*(.*)$/i))) {
      const last = result.bank.accounts[result.bank.accounts.length - 1];
      if (last && !last.number) last.number = cleanValue(m[1]);
      else result.bank.accounts.push({ type: null, number: cleanValue(m[1]) });
    }
  }

  // --- totals --------------------------------------------------------------
  const totalFields = [
    ["subtotal", /^Subtotal\s*:/i],
    ["discount", /^Discount\s*:/i],
    ["delivery", /^Delivery\s*:/i],
    ["vatTotal", /^VAT Total\s*:/i],
    ["invoiceTotal", /^Invoice Total\s*:/i],
  ];
  for (const line of lines) {
    for (const [key, re] of totalFields) {
      if (result.totals[key] == null && re.test(line)) {
        const amount = parseAmount(line.slice(line.indexOf(":") + 1));
        if (amount != null) result.totals[key] = amount.value;
        if (!result.currency && amount?.currency) result.currency = amount.currency;
      }
    }
  }

  // --- line items ----------------------------------------------------------
  const headerIndex = lines.findIndex(
    (line) => /HS Code/i.test(line) && /Total Inc/i.test(line)
  );
  if (headerIndex >= 0) {
    if (/Price Inc/i.test(lines[headerIndex])) result.priceInclusive = true;
    else if (/Price Excl/i.test(lines[headerIndex])) result.priceInclusive = false;

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (/^(Subtotal|Discount|Delivery|VAT Total|Invoice Total)\s*:/i.test(line)) break;
      if (/^\d+\s+/.test(line)) {
        const item = parseItemLine(line);
        if (item) result.items.push(item);
      }
    }
  }

  if (!result.currency) result.currency = "USD";
  return result;
}

function parseItemLine(line) {
  const tokens = line.trim().split(/\s+/);
  // Minimum: line, hs, code, description, qty, unit, price, vat, total
  if (tokens.length < 9) return null;
  if (!/^\d+$/.test(tokens[0])) return null;

  const total = parseNumber(tokens[tokens.length - 1]);
  const vat = parseNumber(tokens[tokens.length - 2]);
  const price = parseNumber(tokens[tokens.length - 3]);
  const unit = tokens[tokens.length - 4];
  const quantity = parseNumber(tokens[tokens.length - 5]);
  if (quantity == null || price == null || vat == null || total == null) return null;

  const rest = tokens.slice(1, tokens.length - 5);
  const hsCode = rest.shift() || "";
  const code = rest.shift() || "";
  const description = rest.join(" ");

  return {
    line: Number(tokens[0]),
    hsCode,
    code,
    description,
    quantity,
    unit,
    price,
    vat,
    total,
  };
}

/* ----------------------------- FiscalStack map ---------------------------- */

export async function parsePdfInvoiceAsync(filePath) {
  const text = await extractTextFromPdfAsync(filePath);
  return { text, parsed: parsePalladiumInvoice(text) };
}

/**
 * Rich parsed document used by the PDF stamping / PDF fiscalization pipeline.
 *
 * Shape:
 *   { documentType, number, date, originalInvoiceNumber, reason, currency,
 *     supplier, buyer, items[], totals, warnings[], errors[] }
 */
export async function parseInvoicePdf(input) {
  const errors = [];
  const warnings = [];

  let text;
  try {
    text = await extractTextFromPdfAsync(input);
  } catch (err) {
    return emptyDocument([`Could not read PDF: ${err.message}`], warnings);
  }

  if (!text.trim()) {
    return emptyDocument(["No extractable text in PDF"], warnings);
  }

  if (!isPalladiumInvoice(text)) {
    // Fall back to the POS marker parser for other PDF layouts.
    try {
      const parsed = await parseJobFromFileCompat(text);
      return {
        ...emptyDocument([], ["Unrecognised PDF layout — parsed with the POS marker parser"]),
        documentType: parsed.transactionType === "CreditNote" ? "CreditNote" : "FiscalInvoice",
        number: parsed.invoiceNumber || null,
        date: parsed.date || null,
        currency: parsed.currency || "USD",
        priceInclusive: true,
        buyer: {
          name: parsed.buyer?.name || null,
          tin: parsed.buyer?.tin || null,
          vat: parsed.buyer?.vatNumber || null,
          email: parsed.buyer?.email || null,
          phone: parsed.buyer?.phone || null,
          cell: null,
        },
        items: (parsed.items || []).map((item, index) => ({
          line: index + 1,
          hsCode: item.hsCode || "",
          code: item.sku || "",
          description: item.name,
          quantity: item.quantity,
          unit: "EA",
          price: item.unitPrice,
          vat: 0,
          vatRate: item.taxType === "ZERO_RATED" ? 0 : 15.5,
          total: item.quantity * item.unitPrice,
        })),
        totals: {
          subtotal: parsed.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
          discount: 0,
          delivery: 0,
          vatTotal: 0,
          invoiceTotal: parsed.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
        },
      };
    } catch (err) {
      return emptyDocument([`Unrecognised PDF layout: ${err.message}`], warnings);
    }
  }

  const doc = parsePalladiumInvoice(text);
  const isCredit = /credit/i.test(doc.documentType || "");
  const isDebit = /debit/i.test(doc.documentType || "");
  const number = doc.invoiceNumber || null;

  if (!number) errors.push("Invoice number not found");
  if (doc.items.length === 0) errors.push("No line items found in the invoice table");
  if (doc.totals.invoiceTotal == null) warnings.push("Invoice total not found");

  const items = doc.items.map((item) => ({
    line: item.line,
    hsCode: item.hsCode,
    code: item.code,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    price: item.price,
    vat: item.vat,
    vatRate:
      item.price !== 0
        ? round((Math.abs(item.vat) / Math.abs(item.price)) * 100)
        : 0,
    total: item.total,
  }));

  if (
    doc.totals.invoiceTotal != null &&
    doc.totals.subtotal != null &&
    doc.totals.vatTotal != null
  ) {
    const expected =
      doc.totals.subtotal -
      (doc.totals.discount || 0) +
      (doc.totals.delivery || 0) +
      doc.totals.vatTotal;
    if (Math.abs(doc.totals.invoiceTotal - expected) > 0.05) {
      warnings.push(
        `Invoice total ${doc.totals.invoiceTotal.toFixed(2)} differs from ` +
          `Subtotal + VAT (${expected.toFixed(2)})`
      );
    }
  }

  return {
    documentType: isCredit ? "CreditNote" : isDebit ? "DebitNote" : "FiscalInvoice",
    number,
    date: toIsoDate(doc.date),
    originalInvoiceNumber: isCredit || isDebit ? relatedInvoiceNumber(doc.reference) : null,
    reason: doc.reason || null,
    currency: doc.currency || "USD",
    priceInclusive: doc.priceInclusive !== false,
    supplier: {
      name: doc.company.name,
      tin: doc.company.tin,
      vat: doc.company.vat,
      address: doc.company.addressLines.join(", ") || null,
      phone: doc.company.phone || null,
      email: doc.company.email || null,
    },
    buyer: {
      name: doc.buyer.name,
      tradeName: doc.buyer.tradeName,
      address: doc.buyer.address,
      tin: doc.buyer.tin,
      vat: doc.buyer.vat,
      email: doc.buyer.email,
      phone: doc.buyer.phone,
      cell: null,
    },
    items,
    totals: doc.totals,
    warnings,
    errors,
  };
}

// Lazy import avoids a circular dependency at module load time.
async function parseJobFromFileCompat(text) {
  const { parseJob } = await import("./parseJob.js");
  return parseJob(text, "", {});
}

function emptyDocument(errors, warnings) {
  return {
    documentType: "FiscalInvoice",
    number: null,
    date: null,
    originalInvoiceNumber: null,
    reason: null,
    currency: "USD",
    supplier: { name: null, tin: null, vat: null, address: null, phone: null, email: null },
    buyer: { name: null, tradeName: null, address: null, tin: null, vat: null, email: null, phone: null, cell: null },
    items: [],
    totals: { subtotal: null, discount: null, delivery: null, vatTotal: null, invoiceTotal: null },
    warnings,
    errors,
  };
}

export function pdfInvoiceToParsed(parsed) {
  const isCredit =
    /credit/i.test(parsed.documentType || "") ||
    /^CN/i.test(parsed.invoiceNumber || "");

  const items = (parsed.items || []).map((item) => ({
    name: item.description || item.code || item.hsCode || "Item",
    quantity: item.quantity,
    unitPrice: item.price,
    taxType: "STANDARD",
    taxInclusive: parsed.priceInclusive !== false,
  }));

  if (items.length === 0) {
    throw new Error("PDF invoice parser found no line items — is this a supported invoice layout?");
  }

  const related = isCredit ? relatedInvoiceNumber(parsed.reference) : null;

  return {
    invoiceNumber: parsed.invoiceNumber || null,
    date: toIsoDate(parsed.date),
    currency: parsed.currency || "USD",
    paymentMethod: "CASH",
    transactionType: isCredit ? "CreditNote" : "FiscalInvoice",
    relatedInvoiceNumber: related,
    creditNoteReason: isCredit ? parsed.reason || undefined : undefined,
    buyer: {
      name: parsed.buyer?.name || undefined,
      tradeName: parsed.buyer?.tradeName || undefined,
      address: parsed.buyer?.address || undefined,
      tin: parsed.buyer?.tin || undefined,
      vatNumber: parsed.buyer?.vat || undefined,
      email: parsed.buyer?.email || undefined,
      phone: parsed.buyer?.phone || undefined,
    },
    items,
  };
}

/* --------------------------------- helpers -------------------------------- */

function cleanValue(value) {
  // Buyer and bank blocks share a row. Once whitespace is collapsed, cut the
  // value where the right-hand bank column begins.
  const cleaned = String(value ?? "")
    .split(/\s+(?:Account Name|Account Type|Account Number|Bank)\s*:/i)[0]
    .replace(/^:+/, "")
    .trim();
  return cleaned || null;
}

function parseNumber(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/,/g, "").replace(/^\+/, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseAmount(text) {
  const str = String(text ?? "");
  const currencyMatch = str.match(/\b(USD|ZWG|ZWL|ZAR|LSL|EUR|GBP)\b/i);
  const numberMatch = str.match(/-?\s*[\d,]+\.\d{2}/);
  if (!numberMatch) return null;
  const negative = /-/.test(str.slice(0, str.indexOf(numberMatch[0]) + 1));
  const value = Number(numberMatch[0].replace(/[,\s]/g, ""));
  if (!Number.isFinite(value)) return null;
  return {
    value: negative ? -Math.abs(value) : value,
    currency: currencyMatch ? currencyMatch[1].toUpperCase() : null,
  };
}

function relatedInvoiceNumber(reference) {
  if (!reference) return undefined;
  return String(reference).replace(/^REV-?/i, "").trim() || undefined;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toIsoDate(date) {
  if (!date) return null;
  const m = String(date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return date;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
