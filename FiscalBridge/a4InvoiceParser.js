/**
 * A4 Invoice Parser
 *
 * Parses FiscalStack-style A4 invoice PDF text into a structured object that
 * mirrors the FiscalStack Invoice / InvoiceItem models. Text is extracted with
 * pdfjs-dist and rebuilt as layout-preserving lines, so no native PDF tooling
 * (pdftotext/poppler) is required on the target machine.
 */

function cleanMoney(v) {
  if (v == null) return null;
  return parseFloat(String(v).replace(/[^0-9.]/g, ''));
}

function cleanPercent(v) {
  if (v == null) return null;
  return parseFloat(String(v).replace(/[^0-9.]/g, ''));
}

function parseMemp(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = {
    invoiceNumber: null,
    reference: null,
    date: null,
    dueDate: null,
    salesRep: null,
    overallDiscountPercent: null,
    page: null,
    seller: { name: null, vatNumber: null, postalAddress: null, physicalAddress: null, phone: null },
    buyer: { name: null, vatNumber: null, postalAddress: null, physicalAddress: null, phone: null },
    items: [],
    totals: {
      discount: null,
      exclusive: null,
      vat: null,
      subtotal: null,
      rounding: null,
      grandTotal: null,
      balanceDue: null,
    },
  };

  for (const line of lines) {
    let m;
    if (!result.invoiceNumber) {
      m = line.match(/(?:NUMBER|Number):\s*(INV[A-Z0-9-]+)/i);
      if (m) result.invoiceNumber = m[1].trim();
    }
    if (!result.reference) {
      m = line.match(/(?:REFERENCE|Reference):\s*(\S.*)/i);
      if (m && m[1].trim()) result.reference = m[1].trim();
    }
    if (!result.date) {
      m = line.match(/(?:DATE|Date):\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) result.date = m[1].trim();
    }
    if (!result.dueDate) {
      m = line.match(/DUE DATE\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) result.dueDate = m[1].trim();
    }
    if (!result.salesRep) {
      m = line.match(/Sales Rep:\s*(.+)/i);
      if (m && m[1].trim()) result.salesRep = m[1].trim();
    }
    if (result.overallDiscountPercent == null) {
      m = line.match(/OVERALL DISCOUNT\s*%:\s*([\d.]+%?)/i);
      if (m) result.overallDiscountPercent = cleanPercent(m[1]);
    }
    if (!result.page) {
      m = line.match(/PAGE:\s*(\d+\/\d+)/i);
      if (m) result.page = m[1].trim();
    }
  }

  for (const line of lines) {
    let m;
    m = line.match(/Total Discount:\s*M?([\d,]+\.\d{2})/i);
    if (m) result.totals.discount = cleanMoney(m[1]);
    m = line.match(/Total Exclusive:\s*M?([\d,]+\.\d{2})/i);
    if (m) result.totals.exclusive = cleanMoney(m[1]);
    m = line.match(/Total VAT:\s*M?([\d,]+\.\d{2})/i);
    if (m) result.totals.vat = cleanMoney(m[1]);
    m = line.match(/Sub Total:\s*M?([\d,]+\.\d{2})/i);
    if (m) result.totals.subtotal = cleanMoney(m[1]);
    m = line.match(/Total Rounding:\s*M?([\d,]+\.\d{2})/i);
    if (m) result.totals.rounding = cleanMoney(m[1]);
    m = line.match(/Grand Total:\s*M?([\d,]+\.\d{2})/i);
    if (m) result.totals.grandTotal = cleanMoney(m[1]);
    m = line.match(/(?:^|\s)Total:\s*M?([\d,]+\.\d{2})/i);
    if (m && result.totals.grandTotal == null) result.totals.grandTotal = cleanMoney(m[1]);
  }

  // Balance due (may be on following line)
  for (let i = 0; i < lines.length; i++) {
    if (/BALANCE DUE/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const mm = lines[j].match(/M?([\d,]+\.\d{2})/);
        if (mm) { result.totals.balanceDue = cleanMoney(mm[1]); break; }
      }
      break;
    }
  }

  // Items table
  const headerIdx = lines.findIndex((l) =>
    /Description/i.test(l) && /Quantity/i.test(l) && /Excl/i.test(l)
  );

  if (headerIdx >= 0) {
    const itemRegex = /^(.+?)\s+(\d+(?:\.\d+)?)\s+M?([\d,]+\.\d{2})\s+([\d.]+%)\s+([\d.]+%)\s+M?([\d,]+\.\d{2})\s+M?([\d,]+\.\d{2})\s*$/;
    let i = headerIdx + 1;
    while (i < lines.length && !/BANKING DETAILS/i.test(lines[i]) && !/THANK YOU/i.test(lines[i])) {
      const line = lines[i].trimEnd();
      if (line.trim() === '') { i++; continue; }
      const m = line.match(itemRegex);
      if (m) {
        result.items.push({
          description: m[1].trim().replace(/\s+/g, ' '),
          quantity: parseFloat(m[2]),
          exclPrice: cleanMoney(m[3]),
          discPercent: cleanPercent(m[4]),
          vatPercent: cleanPercent(m[5]),
          exclTotal: cleanMoney(m[6]),
          inclTotal: cleanMoney(m[7]),
        });
      } else if (result.items.length > 0 && !/\d{2}\.\d{2}%/.test(line) && !/Total/i.test(line)) {
        result.items[result.items.length - 1].description += ' ' + line.trim().replace(/\s+/g, ' ');
      }
      i++;
    }
  }

  // Seller / buyer
  const fromIdx = lines.findIndex((l) => /^\s*FROM\b/i.test(l));
  if (fromIdx >= 0) {
    const sellerNameLine = lines[fromIdx + 1];
    if (sellerNameLine) {
      const parts = sellerNameLine.split(/\s{2,}/).filter(Boolean);
      if (parts[0]) result.seller.name = parts[0].trim();
      if (parts[1]) result.buyer.name = parts[1].trim();
    }
  }

  if (!result.seller.name) {
    for (const line of lines) {
      const t = line.trim();
      if (t && !/Tax Invoice|COPY TAX INVOICE/i.test(t) && !/VAT No:/i.test(t) && !/Along Main/i.test(t) && !/Lesotho/i.test(t) && !/Online quotations/i.test(t)) {
        result.seller.name = t;
        break;
      }
    }
  }

  if (!result.buyer.name) {
    for (const line of lines) {
      const t = line.trim();
      if (/^Cash Customer$/i.test(t)) { result.buyer.name = t; break; }
    }
  }

  for (const line of lines) {
    const m = line.match(/VAT NO:\s*([\d]+)/i);
    if (m && !result.seller.vatNumber) result.seller.vatNumber = m[1];
    const m2 = line.match(/CUSTOMER VAT NO:\s*([\d]*)/i);
    if (m2) result.buyer.vatNumber = m2[1].trim() || null;
  }

  return result;
}

const fs = require('fs');

let pdfjsLib = null;
function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  // pdfjs probes for the optional `canvas` package on require in Node and logs
  // a Path2D warning; text extraction never renders, so it is just noise.
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  } finally {
    console.log = log;
    console.warn = warn;
  }
  return pdfjsLib;
}

/**
 * Rebuilds column-aligned text (the shape `pdftotext -layout` produces) from
 * positioned glyph runs, so the table templates keep parsing without a native
 * Poppler binary on Windows.
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
    let line = '';
    let endX = null;
    let charWidth = 0;
    for (const part of row.parts) {
      if (part.str.trim()) charWidth = part.w / part.str.length || charWidth;
      if (endX !== null) {
        const gap = part.x - endX;
        const average = charWidth || part.h * 0.5;
        if (gap > average * 0.55 && !/\s$/.test(line)) {
          line += ' '.repeat(Math.min(80, Math.max(1, Math.round(gap / average))));
        }
      }
      line += part.str;
      endX = part.x + part.w;
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

async function extractTextFromPdfAsync(input) {
  const pdfjs = loadPdfjs();
  const data = Buffer.isBuffer(input) ? new Uint8Array(input) : new Uint8Array(fs.readFileSync(input));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
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
  return pages.join('\n\f\n');
}

async function parseA4InvoicePdfAsync(input) {
  const text = await extractTextFromPdfAsync(input);
  return parseA4Invoice(text);
}



function parseGeneric(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = {
    invoiceNumber: null, reference: null, date: null, dueDate: null, salesRep: null,
    overallDiscountPercent: null, page: null,
    seller: { name: null, vatNumber: null, postalAddress: null, physicalAddress: null, phone: null },
    buyer: { name: null, vatNumber: null, postalAddress: null, physicalAddress: null, phone: null },
    items: [],
    totals: { discount: null, exclusive: null, vat: null, subtotal: null, rounding: null, grandTotal: null, balanceDue: null },
  };
  for (const line of lines) {
    let m;
    if (!result.invoiceNumber) { m = line.match(/INV\d{4,}/); if (m) result.invoiceNumber = m[0]; }
    if (!result.date) { m = line.match(/(\d{2}\/\d{2}\/\d{4})/); if (m) result.date = m[1]; }
    m = line.match(/(?:Grand Total|Total):\s*M?([\d,]+\.\d{2})/i); if (m && result.totals.grandTotal == null) result.totals.grandTotal = cleanMoney(m[1]);
    m = line.match(/M?([\d,]+\.\d{2})/); // collect money lines loosely
  }
  return result;
}

function detectTemplate(text) {
  const t = String(text || '');
  if (/COPY TAX INVOICE/i.test(t)) return 'mempA';
  if (/Tax Invoice/i.test(t)) return 'mempB';
  return 'generic';
}

const templates = {
  mempA: parseMemp,
  mempB: parseMemp,
  generic: parseGeneric,
};

function applyOverrides(result, overrides) {
  if (!overrides) return result;
  if (overrides.invoiceNumber && typeof overrides.invoiceNumber.exec === 'function') {
    const m = overrides.invoiceNumber.exec(result._text || '');
    if (m) result.invoiceNumber = m[1] || m[0];
  }
  // allow direct values
  for (const key of ['invoiceNumber','date','dueDate','salesRep']) {
    if (overrides[key] != null && typeof overrides[key] !== 'object') result[key] = overrides[key];
  }
  if (overrides.totals) Object.assign(result.totals, overrides.totals);
  return result;
}

function parseA4Invoice(text, templateOrOptions = 'auto') {
  let template = 'auto';
  let overrides = null;
  if (typeof templateOrOptions === 'string') template = templateOrOptions;
  else if (templateOrOptions && typeof templateOrOptions === 'object') {
    template = templateOrOptions.template || 'auto';
    overrides = templateOrOptions.overrides || null;
  }
  const t = template === 'auto' ? detectTemplate(text) : template;
  const parser = templates[t] || parseGeneric;
  const result = parser(text);
  // stash text for regex overrides
  result._text = text;
  const out = applyOverrides(result, overrides);
  delete out._text;
  return out;
}


function toFiscalStackInvoice(parsed) {
  const invoice = {
    invoiceNumber: parsed.invoiceNumber,
    issueDate: parsed.date ? parsed.date.split('/').reverse().join('-') : null,
    dueDate: parsed.dueDate ? parsed.dueDate.split('/').reverse().join('-') : null,
    customerName: parsed.buyer && parsed.buyer.name ? parsed.buyer.name : null,
    buyerVat: parsed.buyer && parsed.buyer.vatNumber ? parsed.buyer.vatNumber : null,
    subtotal: parsed.totals && parsed.totals.exclusive != null ? parsed.totals.exclusive.toFixed(2) : null,
    taxAmount: parsed.totals && parsed.totals.vat != null ? parsed.totals.vat.toFixed(2) : null,
    total: parsed.totals && parsed.totals.grandTotal != null ? parsed.totals.grandTotal.toFixed(2) : null,
    items: (parsed.items || []).map((it) => ({
      description: it.description,
      quantity: String(it.quantity),
      unitPrice: it.exclPrice != null ? it.exclPrice.toFixed(2) : null,
      taxRate: it.vatPercent != null ? String(it.vatPercent) : '0',
      lineTotal: it.exclTotal != null ? it.exclTotal.toFixed(2) : null,
    })),
  };
  return invoice;
}

module.exports = { parseA4Invoice, parseMemp, detectTemplate, parseGeneric, parseA4InvoicePdfAsync, extractTextFromPdfAsync, toFiscalStackInvoice, cleanMoney, cleanPercent };