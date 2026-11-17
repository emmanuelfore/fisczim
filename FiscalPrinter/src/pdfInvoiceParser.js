/**
 * Palladium invoice / credit note PDF parser.
 *
 * Reads positioned text with pdf.js (pure JS — works on Windows without
 * poppler) and returns structured data suitable for fiscalisation.
 *
 * Strategy:
 *  - Header/buyer/bank fields: find the label, take text to its right on the
 *    same baseline (within that block's column).
 *  - Line items: columns are located from the table header ("Line", "HS Code",
 *    ...). Each cell is assigned to the nearest header column. Rows without a
 *    line number are treated as wrapped description text.
 *  - Totals: label → value on the same baseline.
 *  - Everything is cross-checked (line sums vs subtotal, VAT, total) and any
 *    mismatch is reported in `warnings`. Do NOT fiscalise if `errors` is non-empty.
 */

import fs from "fs";

let pdfjsPromise;
function loadPdfjs() {
  pdfjsPromise ||= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

const Y_TOL = 2.5;
const KNOWN_VAT_RATES = [15.5, 15, 14.5, 5, 0];

/* ------------------------------------------------------------------ */
/* Low-level text extraction                                           */
/* ------------------------------------------------------------------ */

export async function extractPages(input) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(Buffer.isBuffer(input) ? input : fs.readFileSync(input));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    pages.push(
      items
        .filter((i) => i.str && i.str.trim())
        .map((i) => ({
          str: i.str.trim(),
          x: i.transform[4],
          y: i.transform[5],
          w: i.width || 0,
          get cx() {
            return this.x + this.w / 2;
          },
        }))
    );
  }
  await doc.destroy();
  return pages;
}

const sameLine = (a, b) => Math.abs(a.y - b.y) <= Y_TOL;
const norm = (s) => s.replace(/\s+/g, " ").replace(/\s*:\s*$/, "").trim().toLowerCase();

function findLabel(items, label, { minX = -Infinity, maxX = Infinity } = {}) {
  const want = norm(label);
  return items.find((i) => norm(i.str) === want && i.x >= minX && i.x <= maxX);
}

/** Text to the right of a label on the same baseline, stopping at maxX. */
function valueRightOf(items, label, opts = {}) {
  const lab = findLabel(items, label, opts);
  if (!lab) return undefined;
  const maxX = opts.valueMaxX ?? Infinity;
  const parts = items
    .filter((i) => i !== lab && sameLine(i, lab) && i.x > lab.x && i.x < maxX)
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str)
    .join(" ");
  return parts.replace(/^[:\s]+/, "").replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Value helpers                                                       */
/* ------------------------------------------------------------------ */

export function parseMoney(raw) {
  if (raw == null || raw === "") return { amount: null, currency: null };
  const s = String(raw).replace(/\s+/g, " ").trim();
  const negative = /^-|\(.*\)|-\s*$/.test(s) || /^[A-Z]{3}\s*-/.test(s);
  const currency = (s.match(/[A-Z]{3}/) || [null])[0];
  const num = s.replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!num) return { amount: null, currency };
  const amount = Number(num) * (negative ? -1 : 1);
  return { amount: Number.isFinite(amount) ? amount : null, currency };
}

const num = (raw) => parseMoney(raw).amount;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Palladium prints US dates (MM/DD/YYYY). Returns ISO yyyy-mm-dd. */
export function parseUsDate(raw) {
  const m = String(raw || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function parseTime(raw) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = (m[4] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}:${m[3] || "00"}`;
}

function nearestRate(pct) {
  let best = null;
  for (const r of KNOWN_VAT_RATES) if (best === null || Math.abs(r - pct) < Math.abs(best - pct)) best = r;
  return best;
}

/* ------------------------------------------------------------------ */
/* Section parsers                                                     */
/* ------------------------------------------------------------------ */

const COLUMN_HEADERS = {
  line: ["line"],
  hsCode: ["hs code"],
  code: ["item"],
  description: ["description"],
  quantity: ["quantity", "qty"],
  unit: ["unit"],
  price: ["price inc", "price excl", "price"],
  vat: ["vat"],
  total: ["total inc", "total excl", "total"],
};

function findColumns(items) {
  const lineHdr = items.find((i) => norm(i.str) === "line");
  if (!lineHdr) return null;
  const headerRow = items.filter((i) => Math.abs(i.y - lineHdr.y) <= 4);
  const cols = {};
  for (const [key, labels] of Object.entries(COLUMN_HEADERS)) {
    const hit = headerRow.find((i) => labels.includes(norm(i.str)));
    if (hit) cols[key] = hit;
  }
  if (!cols.line || !cols.description || !cols.total) return null;
  return cols;
}

function parseItems(pages, warnings) {
  const items = [];
  for (const [pageIdx, page] of pages.entries()) {
    const cols = findColumns(page);
    if (!cols) continue;
    const headerY = Math.max(...Object.values(cols).map((c) => c.y));
    const bottom = findLabel(page, "Subtotal")?.y ?? findLabel(page, "Invoiced Currency")?.y ?? 0;
    const colList = Object.entries(cols).map(([key, it]) => ({ key, cx: it.cx }));

    const body = page
      .filter((i) => i.y < headerY - Y_TOL && i.y > bottom + Y_TOL)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    // group into rows
    const rows = [];
    for (const it of body) {
      const row = rows.find((r) => sameLine(r[0], it));
      row ? row.push(it) : rows.push([it]);
    }

    for (const row of rows) {
      const cells = {};
      for (const it of row) {
        let best = colList[0];
        for (const c of colList) if (Math.abs(c.cx - it.cx) < Math.abs(best.cx - it.cx)) best = c;
        cells[best.key] = cells[best.key] ? `${cells[best.key]} ${it.str}` : it.str;
      }
      const isNewLine = /^\d+$/.test(cells.line || "") && cells.total != null;
      if (isNewLine) {
        items.push({
          lineNo: Number(cells.line),
          hsCode: (cells.hsCode || "").replace(/\D/g, ""),
          code: cells.code || "",
          description: cells.description || "",
          quantity: num(cells.quantity),
          unit: cells.unit || "",
          price: num(cells.price),
          vat: num(cells.vat),
          total: num(cells.total),
          page: pageIdx + 1,
        });
      } else if (items.length) {
        // wrapped description / extra text belongs to previous line
        const extra = row.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
        items.at(-1).description = `${items.at(-1).description} ${extra}`.trim();
      } else {
        warnings.push(`Ignored text above first line item: "${row.map((i) => i.str).join(" ")}"`);
      }
    }
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {string|Buffer} input PDF path or buffer
 * @returns {Promise<object>} parsed document with `errors` / `warnings`
 */
export async function parseInvoicePdf(input) {
  const pages = await extractPages(input);
  if (!pages.length || !pages.some((p) => p.length)) {
    return { errors: ["PDF has no extractable text (scanned image?)"], warnings: [] };
  }
  const first = pages[0];
  const last = pages.at(-1);
  const errors = [];
  const warnings = [];

  // ---- document type ----
  const title = first.find((i) => /fiscal (tax invoice|credit note|debit note)|tax invoice|credit note|debit note/i.test(i.str));
  const titleText = title?.str || "";
  const documentType = /credit/i.test(titleText)
    ? "CreditNote"
    : /debit/i.test(titleText)
      ? "DebitNote"
      : "FiscalInvoice";

  // ---- right-hand meta block ----
  const metaX = findLabel(first, "Number")?.x ?? 400;
  const meta = (l) => valueRightOf(first, l, { minX: metaX - 5 });
  const number = meta("Number");
  const reference = meta("Reference") || "";
  const reason = meta("Reason") || "";

  // ---- seller ----
  const sellerLines = first
    .filter((i) => i.x < 200 && i.y > (findLabel(first, "Buyer Details")?.y ?? 0) + Y_TOL && i.y < (title?.y ?? 9999))
    .sort((a, b) => b.y - a.y);
  const sellerName = sellerLines.find((i) => !/:/.test(i.str))?.str || "";
  const sellerTin = valueRightOf(first, "TIN", { maxX: 60, valueMaxX: 80 }) || "";
  const sellerVat = valueRightOf(first, "VAT", { maxX: 200 }) || "";
  const tinY = findLabel(first, "TIN", { maxX: 60 })?.y;
  const sellerAddress = sellerLines
    .filter((i) => i.str !== sellerName && !/^(Ph|Email|TIN|VAT)\b/i.test(i.str) && (tinY == null || i.y > tinY + Y_TOL))
    .map((i) => i.str);

  // ---- buyer (left column, stop before bank column) ----
  const bankX = findLabel(first, "Account Name")?.x ?? 360;
  const buyer = (l) => valueRightOf(first, l, { maxX: 200, valueMaxX: bankX - 5 }) || "";
  const phoneRaw = buyer("Telephone");
  const buyerData = {
    name: buyer("Customer Name"),
    tradeName: buyer("Trade Name"),
    address: buyer("Customer Address").replace(/^[:\s,]+/, ""),
    tin: buyer("Customer TIN").replace(/\D/g, ""),
    vat: buyer("Customer VAT").replace(/\D/g, ""),
    email: buyer("E-mail"),
    phone: phoneRaw.replace(/Cell\s*:?\s*$/i, "").trim(),
    cell: (phoneRaw.match(/Cell\s*:?\s*(.*)$/i) || [, ""])[1].trim(),
  };

  // ---- totals (last page) ----
  const tot = (l) => parseMoney(valueRightOf(last, l, { minX: 300 }));
  const subtotal = tot("Subtotal");
  const discount = tot("Discount");
  const delivery = tot("Delivery");
  const vatTotal = tot("VAT Total");
  const invoiceTotal = tot("Invoice Total");
  const currency =
    valueRightOf(last, "Invoiced Currency")?.match(/[A-Z]{3}/)?.[0] ||
    invoiceTotal.currency ||
    subtotal.currency ||
    null;

  // ---- footer date/time (bottom-left) ----
  const footer = last.filter((i) => i.y < 60 && i.x < 250).sort((a, b) => a.x - b.x);
  const footerDate = footer.find((i) => /\d+\/\d+\/\d{4}/.test(i.str))?.str;
  const footerTime = footer.find((i) => /\d+:\d{2}/.test(i.str))?.str;

  // ---- items ----
  const items = parseItems(pages, warnings);

  // ---- derive VAT rates & tax-inclusive flag ----
  const sumTotal = round2(items.reduce((s, i) => s + (i.total || 0), 0));
  const sumVat = round2(items.reduce((s, i) => s + (i.vat || 0), 0));
  const exclusive =
    subtotal.amount != null && invoiceTotal.amount != null && vatTotal.amount != null &&
    Math.abs(subtotal.amount + vatTotal.amount + (delivery.amount || 0) - (discount.amount || 0) - invoiceTotal.amount) < 0.02;
  const taxInclusive = !exclusive;

  for (const it of items) {
    const base = taxInclusive ? (it.total || 0) - (it.vat || 0) : it.total || 0;
    const pct = base ? Math.abs((it.vat || 0) / base) * 100 : 0;
    it.vatRate = nearestRate(pct);
    if (base && Math.abs(pct - it.vatRate) > 1) {
      warnings.push(`Line ${it.lineNo}: VAT ${pct.toFixed(2)}% doesn't match a known rate (using ${it.vatRate}%)`);
    }
    if (!it.hsCode) warnings.push(`Line ${it.lineNo}: missing HS code`);
    if (it.quantity == null || it.total == null) errors.push(`Line ${it.lineNo}: could not read quantity/total`);
  }

  // ---- validation ----
  if (!number) errors.push("Document number not found");
  if (!items.length) errors.push("No line items found");
  if (invoiceTotal.amount == null) errors.push("Invoice Total not found");
  if (!currency) errors.push("Currency not found");
  if (subtotal.amount != null && Math.abs(sumTotal - subtotal.amount) > 0.02) {
    errors.push(`Line totals (${sumTotal}) ≠ Subtotal (${subtotal.amount})`);
  }
  if (vatTotal.amount != null && Math.abs(sumVat - vatTotal.amount) > 0.02) {
    errors.push(`Line VAT (${sumVat}) ≠ VAT Total (${vatTotal.amount})`);
  }
  if (documentType === "CreditNote") {
    if (!reference) errors.push("Credit note has no Reference (original invoice number)");
    if (!reason) warnings.push("Credit note has no Reason");
    if (invoiceTotal.amount != null && invoiceTotal.amount > 0) {
      warnings.push("Credit note total is positive — expected negative amounts");
    }
  }
  if (!taxInclusive) {
    warnings.push("Line prices are tax-EXCLUSIVE (Subtotal + VAT = Total) despite 'Inc' column labels");
  }

  return {
    documentType,
    title: titleText,
    number,
    date: parseUsDate(meta("Date")),
    time: parseTime(footerTime),
    printedDate: parseUsDate(footerDate),
    reference,
    originalInvoiceNumber:
      documentType === "CreditNote" || documentType === "DebitNote"
        ? (reference.match(/(IN-\d+)/i)?.[1] || reference.replace(/^REV-/i, "")).toUpperCase()
        : null,
    reason,
    requiredDate: parseUsDate(meta("Required")),
    account: meta("Account") || "",
    salesPerson: valueRightOf(first, "Sales Person") || "",
    currency,
    taxInclusive,
    seller: { name: sellerName, address: sellerAddress, tin: sellerTin.replace(/\D/g, ""), vat: sellerVat.replace(/\D/g, "") },
    buyer: buyerData,
    items,
    totals: {
      subtotal: subtotal.amount,
      discount: discount.amount,
      delivery: delivery.amount,
      vatTotal: vatTotal.amount,
      invoiceTotal: invoiceTotal.amount,
    },
    pageCount: pages.length,
    errors,
    warnings,
  };
}
