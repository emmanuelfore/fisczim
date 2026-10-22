import QRCode from "qrcode";
import fs from "fs";
import path from "path";

/**
 * Build a printable fiscal receipt HTML with QR + fiscal proof fields
 * (mirrors what Interface renders after fiscalize).
 */
export async function buildFiscalReceiptHtml({ parsed, fiscal, companyName }) {
  const receipt = fiscal.receipt || {};
  const qrPayload = fiscal.qrCode || "";
  const qrDataUrl = qrPayload
    ? await QRCode.toDataURL(qrPayload, { width: 180, margin: 1 })
    : "";

  const lines = (receipt.receiptLines || parsed.items.map((item, i) => ({
    receiptLineNo: i + 1,
    receiptLineName: item.name,
    receiptLineQuantity: item.quantity,
    receiptLinePrice: item.unitPrice,
    receiptLineTotal: item.quantity * item.unitPrice,
  }))).map(
    (line) => `
      <tr>
        <td>${escapeHtml(line.receiptLineName)}</td>
        <td class="num">${line.receiptLineQuantity}</td>
        <td class="num">${formatMoney(line.receiptLinePrice)}</td>
        <td class="num">${formatMoney(line.receiptLineTotal)}</td>
      </tr>`
  );

  const taxes = (receipt.receiptTaxes || [])
    .map(
      (tax) => `
      <div class="row">
        <span>VAT ${tax.taxPercent}%</span>
        <span>${formatMoney(tax.taxAmount)}</span>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Fiscal Receipt ${escapeHtml(receipt.invoiceNo || parsed.invoiceNumber || "")}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Consolas, monospace; width: 80mm; margin: 0 auto; padding: 12px; color: #111; }
    h1 { font-size: 14px; margin: 0 0 4px; text-align: center; }
    .muted { color: #444; font-size: 11px; text-align: center; margin: 2px 0; }
    hr { border: none; border-top: 1px dashed #000; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 2px 0; vertical-align: top; }
    th { text-align: left; border-bottom: 1px solid #000; }
    .num { text-align: right; white-space: nowrap; }
    .row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
    .total { font-weight: 700; font-size: 13px; }
    .fiscal { text-align: center; margin-top: 14px; }
    .fiscal img { width: 120px; height: 120px; }
    .fiscal-meta { font-size: 10px; margin: 4px 0; word-break: break-all; }
  </style>
</head>
<body>
  <h1>${escapeHtml(companyName || "FISCAL RECEIPT")}</h1>
  <p class="muted">FISCAL INVOICE</p>
  <p class="muted">${escapeHtml(receipt.invoiceNo || parsed.invoiceNumber || "")}</p>
  <p class="muted">${escapeHtml(receipt.receiptDate || new Date().toISOString())}</p>
  <hr />
  <table>
    <thead>
      <tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr>
    </thead>
    <tbody>${lines.join("")}</tbody>
  </table>
  <hr />
  ${taxes}
  <div class="row total">
    <span>TOTAL (${escapeHtml(receipt.receiptCurrency || parsed.currency || "USD")})</span>
    <span>${formatMoney(receipt.receiptTotal)}</span>
  </div>
  <hr />
  <div class="fiscal">
    ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Fiscal QR" />` : "<p>No QR returned</p>"}
    <p class="fiscal-meta"><strong>Verification</strong><br/>${escapeHtml(fiscal.fiscalCode || "")}</p>
    <p class="fiscal-meta">Receipt # ${escapeHtml(String(fiscal.receiptNumber ?? receipt.receiptGlobalNo ?? ""))}</p>
    <p class="fiscal-meta">Global No ${escapeHtml(String(receipt.receiptGlobalNo ?? ""))}</p>
    <p class="fiscal-meta">Counter ${escapeHtml(String(receipt.receiptCounter ?? ""))}</p>
    <p class="fiscal-meta">Fiscal Day ${escapeHtml(String(receipt.fiscalDayNo ?? ""))}</p>
  </div>
</body>
</html>`;
}

export async function writeFiscalReceiptFiles({ outputFolder, baseName, html, fiscal }) {
  fs.mkdirSync(outputFolder, { recursive: true });
  const htmlPath = path.join(outputFolder, `${baseName}.html`);
  const jsonPath = path.join(outputFolder, `${baseName}.fiscal.json`);
  fs.writeFileSync(htmlPath, html, "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify(fiscal, null, 2), "utf8");
  return { htmlPath, jsonPath };
}

function formatMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return n.toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
