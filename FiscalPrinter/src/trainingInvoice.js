/**
 * TRAINING / DEMO invoice renderer.
 *
 * Renders an A4 document that looks like the invoices customers already know
 * (Palladium "Fiscal Tax Invoice" / "Fiscal Credit Note") and stamps a QR code
 * on it. It is completely offline:
 *
 *   - never calls /api/v1/fiscalize
 *   - never writes to the database
 *   - never consumes a real fiscal receipt counter
 *
 * This is only for training staff on the FiscalPrinter app and for printing
 * sample paperwork. Every document is clearly marked as a training copy.
 */

import QRCode from "qrcode";
import fs from "fs";
import path from "path";

const DEFAULT_WATERMARK = "TRAINING — NOT A VALID FISCAL INVOICE";

export async function buildTrainingInvoiceHtml({ data, config = {} }) {
  const doc = normalizeDocument(data, config);

  const qrPayload =
    doc.training.qrPayload ||
    buildDefaultQrPayload(doc) ||
    "FISCALPRINTER-TRAINING";

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const itemRows = doc.items
    .map(
      (item, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td>${escapeHtml(item.hsCode)}</td>
        <td>${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="c">${escapeHtml(item.quantity)}</td>
        <td class="c">${escapeHtml(item.unit)}</td>
        <td class="r">${formatMoney(item.price)}</td>
        <td class="r">${formatMoney(item.vat)}</td>
        <td class="r">${formatMoney(item.total)}</td>
      </tr>`
    )
    .join("");

  const buyerRows = [
    ["Customer Name", doc.buyer.name],
    ["Trade Name", doc.buyer.tradeName],
    ["Customer Address", doc.buyer.address],
    ["Customer TIN", doc.buyer.tin],
    ["Customer VAT", doc.buyer.vat],
    ["E-mail", doc.buyer.email],
    ["Telephone", doc.buyer.phone],
  ]
    .map(
      ([label, value]) => `
      <tr>
        <td class="dot-label">${escapeHtml(label)}</td>
        <td class="dot-value">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  // Bank accounts are rendered as pairs (type/number) like the source invoice.
  const bankAccountRows = doc.bank.accounts
    .map(
      (account) => `
      <tr>
        <td class="dot-label">Account Type</td>
        <td class="dot-value">${escapeHtml(account.type)}</td>
      </tr>
      <tr>
        <td class="dot-label">Account Number</td>
        <td class="dot-value">${escapeHtml(account.number)}</td>
      </tr>`
    )
    .join("");

  const bankHeadRows = [
    ["Account Name", doc.bank.accountName],
    ["Bank", doc.bank.bank],
  ]
    .filter(([, value]) => String(value ?? "").trim() !== "")
    .map(
      ([label, value]) => `
      <tr>
        <td class="dot-label">${escapeHtml(label)}</td>
        <td class="dot-value">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  const metaRows = [
    ["Number", doc.invoice.number],
    ["Date", doc.invoice.date],
    ["Page", doc.invoice.page],
    ["Reference", doc.invoice.reference],
    ["Required", doc.invoice.required],
    ["Account", doc.invoice.account],
    ["Reason", doc.invoice.reason],
  ]
    .filter(([, value]) => String(value ?? "").trim() !== "")
    .map(
      ([label, value]) => `
      <tr>
        <td class="meta-label">${escapeHtml(label)}:</td>
        <td class="meta-value">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  const totals = doc.totals;
  const currency = doc.invoice.currency;

  const totalsRows = [
    ["Subtotal:", totals.subtotal],
    ["Discount:", totals.discount],
    ["Delivery:", totals.delivery],
    ["VAT Total :", totals.vatTotal],
  ]
    .map(
      ([label, value]) => `
      <tr>
        <td class="t-label">${escapeHtml(label)}</td>
        <td class="t-value">${formatCurrency(value, currency)}</td>
      </tr>`
    )
    .join("");

  const training = doc.training;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.invoice.number)} — ${escapeHtml(doc.title)} (Training)</title>
<style>
  @page { size: A4; margin: 10mm 10mm 8mm 10mm; }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    position: relative;
    width: 190mm;
    min-height: 270mm;
    margin: 0 auto;
    z-index: 1;
    display: flex;
    flex-direction: column;
  }

  /* ---------- training watermark ---------- */
  .watermark {
    position: fixed;
    top: 46%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-28deg);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: rgba(190, 30, 45, 0.08);
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
  }

  /* ---------- header ---------- */
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12mm;
  }

  .brand { display: flex; gap: 8px; max-width: 95mm; }

  .logo-mark {
    width: 13mm;
    height: 13mm;
    border: 1.4px solid #000;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.5px;
    flex: 0 0 auto;
  }

  .company-name { font-weight: 700; font-size: 11px; margin: 0 0 2px; }

  .company-line { line-height: 1.35; }

  .company-meta { margin-top: 4px; }
  .company-meta span { margin-right: 8px; }

  .meta { width: 82mm; flex: 0 0 auto; }

  .doc-title {
    margin: 0 0 6px;
    font-size: 19px;
    font-weight: 700;
    text-align: right;
    letter-spacing: 0.2px;
  }

  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 1px 0; vertical-align: top; }
  .meta-label { width: 24mm; }
  .meta-value { font-weight: 400; }

  /* ---------- parties ---------- */
  .parties {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10mm;
    margin-top: 7mm;
  }

  .buyer { width: 98mm; }
  .bank { width: 78mm; }

  .section-title { font-weight: 700; margin: 0 0 2px; font-size: 10px; }

  .dots { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .dots td {
    border-bottom: 1px dotted #555;
    padding: 1.5px 0;
    vertical-align: bottom;
    height: 14px;
  }
  .dot-label { width: 30mm; font-weight: 700; white-space: nowrap; }
  .dot-label::before { content: "• "; font-weight: 400; }
  .dot-value { padding-left: 2px; white-space: nowrap; overflow: hidden; }

  .bank .dot-label { width: 27mm; }
  .bank .dot-value { white-space: normal; font-size: 8.5px; line-height: 1.15; padding-left: 4px; }

  .bank-box {
    border: 1.4px solid #000;
    padding: 4px 6px 3px;
  }

  .sales-person {
    margin-top: 4mm;
    text-align: right;
    font-weight: 700;
  }

  /* ---------- items ---------- */
  .items {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 2mm;
    height: 126mm;
  }

  .items th,
  .items td {
    border: 1px solid #333;
    padding: 2px 4px;
    vertical-align: top;
    overflow: hidden;
  }

  .items thead th {
    background: #c9ccd1;
    font-weight: 700;
    text-align: left;
    height: 18px;
    vertical-align: middle;
  }

  .items tbody tr:first-child td { height: 18px; }

  .items .num { text-align: right; }
  .items .c { text-align: center; }
  .items .r { text-align: right; }

  .col-line { width: 10mm; }
  .col-hs { width: 20mm; }
  .col-item { width: 24mm; }
  .col-desc { width: 48mm; }
  .col-qty { width: 16mm; }
  .col-unit { width: 13mm; }
  .col-price { width: 21mm; }
  .col-vat { width: 16mm; }
  .col-total { width: 22mm; }

  /* ---------- bottom ---------- */
  .bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6mm;
    margin-top: 0;
  }

  .stamp {
    width: 74mm;
    border: 1px solid #333;
    border-top: 0;
    padding: 3mm 3mm 2mm;
    text-align: center;
  }

  .stamp img {
    width: 30mm;
    height: 30mm;
    display: block;
    margin: 0 auto 2px;
  }

  .stamp .stamp-title {
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 0.4px;
    color: #9b1c2c;
    margin-bottom: 2px;
  }

  .stamp .verify {
    font-size: 8px;
    word-break: break-all;
    margin: 1px 0;
  }

  .stamp .fiscal-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px 6px;
    margin-top: 2px;
    text-align: left;
    font-size: 7.5px;
  }

  .stamp .fiscal-grid b { font-weight: 700; }

  .totals {
    width: 76mm;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .totals td {
    border: 1px solid #333;
    padding: 4px 6px;
    font-weight: 700;
  }

  .totals .t-label { width: 38mm; background: #c9ccd1; }
  .totals .t-value { text-align: right; }

  .totals .grand .t-label { background: #c9ccd1; }
  .totals .grand .t-value { font-size: 10.5px; }

  /* ---------- footer ---------- */
  .footer {
    margin-top: auto;
    padding-top: 4mm;
  }

  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 3px;
  }

  .footer-row .currency { font-weight: 700; }

  .powered {
    text-align: center;
    font-size: 7.5px;
    color: #333;
    margin-top: 2px;
  }

  .training-note {
    text-align: center;
    font-size: 7.5px;
    color: #9b1c2c;
    font-weight: 700;
    margin-top: 2px;
    letter-spacing: 0.3px;
  }

  @media print {
    body { width: auto; }
    .page { width: auto; min-height: auto; }
  }
</style>
</head>
<body>
  <div class="watermark">${escapeHtml(training.watermark)}</div>
  <div class="page">

    <div class="top">
      <div class="brand">
        <div class="logo-mark">${escapeHtml(doc.company.logoMark)}</div>
        <div>
          <div class="company-name">${escapeHtml(doc.company.name)}</div>
          ${doc.company.addressLines
            .map((line) => `<div class="company-line">${escapeHtml(line)}</div>`)
            .join("")}
          <div class="company-line">Ph: ${escapeHtml(doc.company.phone)}</div>
          <div class="company-line">Email: ${escapeHtml(doc.company.email)}</div>
          <div class="company-line company-meta">
            <span>TIN: ${escapeHtml(doc.company.tin)}</span>
            <span>VAT: ${escapeHtml(doc.company.vat)}</span>
          </div>
        </div>
      </div>
      <div class="meta">
        <h1 class="doc-title">${escapeHtml(doc.title)}</h1>
        <table class="meta-table">${metaRows}</table>
      </div>
    </div>

    <div class="parties">
      <div class="buyer">
        <div class="section-title">Buyer Details:</div>
        <table class="dots">${buyerRows}</table>
      </div>
      <div class="bank">
        <div class="section-title">Bank Details:</div>
        <div class="bank-box">
          <table class="dots">
            ${bankHeadRows}
            ${bankAccountRows}
          </table>
        </div>
      </div>
    </div>

    <div class="sales-person">Sales Person: ${escapeHtml(doc.invoice.salesPerson)}</div>

    <table class="items">
      <colgroup>
        <col class="col-line" />
        <col class="col-hs" />
        <col class="col-item" />
        <col class="col-desc" />
        <col class="col-qty" />
        <col class="col-unit" />
        <col class="col-price" />
        <col class="col-vat" />
        <col class="col-total" />
      </colgroup>
      <thead>
        <tr>
          <th class="c">Line</th>
          <th>HS Code</th>
          <th>Item</th>
          <th>Description</th>
          <th class="c">Quantity</th>
          <th class="c">Unit</th>
          <th class="r">Price Inc</th>
          <th class="r">VAT</th>
          <th class="r">Total Inc</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="bottom">
      <div class="stamp">
        <img src="${qrDataUrl}" alt="Training QR code" />
        <div class="stamp-title">FISCAL QR — TRAINING COPY</div>
        <div class="verify"><b>Verification:</b> ${escapeHtml(training.verificationCode)}</div>
        <div class="fiscal-grid">
          <div><b>Receipt #</b> ${escapeHtml(training.receiptNumber)}</div>
          <div><b>Global No</b> ${escapeHtml(training.receiptGlobalNo)}</div>
          <div><b>Counter</b> ${escapeHtml(training.receiptCounter)}</div>
          <div><b>Fiscal Day</b> ${escapeHtml(training.fiscalDayNo)}</div>
          <div><b>Device</b> ${escapeHtml(training.deviceSerial)}</div>
          <div><b>Fiscalised</b> ${escapeHtml(training.fiscalisedAt)}</div>
        </div>
      </div>

      <table class="totals">
        ${totalsRows}
        <tr class="grand">
          <td class="t-label">Invoice Total:</td>
          <td class="t-value">${formatCurrency(totals.invoiceTotal, currency)}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <div class="footer-row">
        <span>${escapeHtml(doc.invoice.date)} &nbsp; ${escapeHtml(doc.invoice.time)}</span>
        <span class="currency">Invoiced Currency: &nbsp; ${escapeHtml(currency)}</span>
      </div>
      <div class="powered">${escapeHtml(doc.footer.poweredBy)}</div>
      <div class="training-note">${escapeHtml(training.watermark)}</div>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Fill in defaults and compute totals when the sample JSON omits them.
 */
export function normalizeDocument(data = {}, config = {}) {
  const invoice = data.invoice || {};
  const company = data.company || {};
  const buyer = data.buyer || {};
  const bank = data.bank || {};
  const training = data.training || {};

  const documentType = data.documentType || "Fiscal Tax Invoice";
  const isCreditNote = /credit/i.test(documentType);

  const items = (data.items || []).map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const price = Number(item.price ?? item.unitPrice ?? 0);
    const total = item.total != null ? Number(item.total) : quantity * price;
    const vat =
      item.vat != null
        ? Number(item.vat)
        : data.totals?.vatTotal != null
          ? 0
          : round(total - total / 1.155);

    return {
      hsCode: item.hsCode ?? "",
      code: item.code ?? "",
      description: item.description ?? item.name ?? "",
      quantity: formatQty(quantity),
      unit: item.unit ?? "EA",
      price: round(price),
      vat: round(vat),
      total: round(total),
    };
  });

  const subtotal =
    data.totals?.subtotal != null
      ? Number(data.totals.subtotal)
      : round(items.reduce((sum, item) => sum + item.total, 0));
  const vatTotal =
    data.totals?.vatTotal != null
      ? Number(data.totals.vatTotal)
      : round(items.reduce((sum, item) => sum + item.vat, 0));
  const discount = Number(data.totals?.discount ?? 0);
  const delivery = Number(data.totals?.delivery ?? 0);
  const invoiceTotal =
    data.totals?.invoiceTotal != null
      ? Number(data.totals.invoiceTotal)
      : round(subtotal - discount + delivery + vatTotal);

  const verificationCode =
    training.verificationCode ||
    makeVerificationCode(invoice.number || "TRAIN", documentType);

  return {
    title: documentType,
    documentType,
    isCreditNote,
    company: {
      name: company.name || "Training Company (Pvt) Ltd",
      logoMark: company.logoMark || initials(company.name || "TC"),
      addressLines: company.addressLines || ["Training address", "Harare", "Zimbabwe"],
      phone: company.phone ?? "",
      email: company.email ?? "",
      tin: company.tin || "0000000000",
      vat: company.vat || "0000000000",
    },
    invoice: {
      number: invoice.number || "TRN-000000001",
      date: invoice.date || new Date().toISOString().slice(0, 10),
      time:
        invoice.time ||
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      page: invoice.page ?? "1",
      reference: invoice.reference ?? "",
      required: invoice.required ?? invoice.date ?? "",
      account: invoice.account ?? "",
      reason: invoice.reason ?? "",
      salesPerson: invoice.salesPerson ?? "",
      currency: invoice.currency || config.currency || "USD",
    },
    buyer: {
      name: buyer.name ?? "",
      tradeName: buyer.tradeName ?? "",
      address: buyer.address ?? "",
      tin: buyer.tin ?? "",
      vat: buyer.vat ?? "",
      email: buyer.email ?? "",
      phone: buyer.phone ?? "",
    },
    bank: {
      accountName: bank.accountName ?? "",
      bank: bank.bank ?? "",
      accounts: bank.accounts || [],
    },
    items,
    totals: {
      subtotal: round(subtotal),
      discount: round(discount),
      delivery: round(delivery),
      vatTotal: round(vatTotal),
      invoiceTotal: round(invoiceTotal),
    },
    footer: {
      poweredBy:
        data.footer?.poweredBy ||
        "Training sample — FiscalPrinter demo layout",
    },
    training: {
      watermark: training.watermark || DEFAULT_WATERMARK,
      verificationCode,
      qrPayload: training.qrPayload || config.training?.qrPayload || "",
      receiptNumber: training.receiptNumber || "0",
      receiptGlobalNo: training.receiptGlobalNo || "0",
      receiptCounter: training.receiptCounter || "0",
      fiscalDayNo: training.fiscalDayNo || "0",
      deviceSerial: training.deviceSerial || "TRAINING-DEVICE",
      fiscalisedAt:
        training.fiscalisedAt ||
        `${invoice.date || new Date().toISOString().slice(0, 10)} ${invoice.time || ""}`.trim(),
    },
  };
}

function buildDefaultQrPayload(doc) {
  const base = "https://fiscalstack.co.zw/training/verify";
  const params = new URLSearchParams({
    invoice: doc.invoice.number,
    code: doc.training.verificationCode,
    demo: "1",
  });
  return `${base}?${params.toString()}`;
}

function makeVerificationCode(invoiceNumber, documentType) {
  const clean = String(invoiceNumber).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const kind = /credit/i.test(documentType) ? "CN" : "IN";
  return `TRAIN-${kind}-${clean || "DEMO"}`;
}

export function writeTrainingFiles({ outputFolder, baseName, html }) {
  fs.mkdirSync(outputFolder, { recursive: true });
  const htmlPath = path.join(outputFolder, `${baseName}.html`);
  fs.writeFileSync(htmlPath, html, "utf8");
  return { htmlPath };
}

/* ------------------------------ helpers ------------------------------ */

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatQty(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? "");
  return Number.isInteger(n) ? String(n) : String(n);
}

function formatMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toFixed(2)}`;
}

function formatCurrency(value, currency) {
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  const sign = n < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(n).toFixed(2)}`;
}

function initials(name) {
  return String(name)
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
