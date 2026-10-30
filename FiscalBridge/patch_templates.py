import sys

with open('renderer.js', 'r') as f:
    content = f.read()

start_marker = '// \u2500\u2500\u2500 Invoice Templates \u2014 faithful ports of FiscalStack web+POS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
end_marker   = "function buildReceiptHTML(invoice, fiscal, cfg) {\n  const tpl = PRINT_TEMPLATES[cfg.printTemplate||'standard'] || PRINT_TEMPLATES.standard;\n  return tpl.generate(invoice, fiscal, cfg);\n}\n"

start = content.find(start_marker)
end   = content.find(end_marker)
if start == -1 or end == -1:
    print(f"Markers not found: start={start}, end={end}")
    sys.exit(1)
end += len(end_marker)

new_block = r"""// ─── Receipt Templates (3 templates matching FiscalStack web app) ─────────────
// 1. thermal80  — Receipt48.tsx (80mm ZIMRA-compliant)
// 2. thermal58  — Receipt48.tsx (58mm compact)
// 3. modernA4   — invoice-templates.ts "Modern Blue" + pdf-document.tsx

// ── Shared helpers ────────────────────────────────────────────────────────────
function _thermalTaxGroups(items) {
  const groups = {};
  (items || []).forEach(i => {
    const rate  = parseFloat(i.taxRate || i.vatRate || i.vat_pct || 0);
    const qty   = parseFloat(i.qty || i.quantity || 1);
    const price = parseFloat(i.unitPrice || i.price || 0);
    const total = parseFloat(i.lineTotal || i.totalAmount || (qty * price));
    const taxAmt = (total * (rate / 100)) / (1 + rate / 100);
    const netAmt = total - taxAmt;
    const key = rate.toFixed(2);
    if (!groups[key]) groups[key] = { rate, net: 0, tax: 0, gross: 0, name: rate === 0 ? 'Exempt' : `${rate}%` };
    groups[key].net   += netAmt;
    groups[key].tax   += taxAmt;
    groups[key].gross += total;
  });
  return Object.values(groups);
}

function _fmtCode(c) { return (c || '').replace(/-/g, '').match(/.{1,4}/g)?.join('-') || c; }

// ── Template 1 & 2: Thermal — matches Receipt48.tsx exactly ───────────────────
function _buildThermal(width, invoice, fiscal, cfg) {
  const items     = invoice.items || [];
  const isVat     = !!(cfg.vatNumber || fiscal.vatNumber);
  const taxGroups = _thermalTaxGroups(items);
  const totalQty  = items.reduce((s, i) => s + parseFloat(i.qty || i.quantity || 1), 0);
  const currency  = invoice.currency || 'USD';

  const fiscalCode    = fiscal.fiscalCode    || invoice.fiscalCode    || '';
  const verCode       = fiscal.verificationCode || fiscal.receiptVerificationCode || '';
  const qrData        = fiscal.qrCode        || fiscal.qrCodeData     || invoice.qrCodeData || '';
  const receiptGlobal = fiscal.receiptGlobalNo || invoice.receiptGlobalNo || '';
  const receiptCtr    = fiscal.receiptCounter  || invoice.receiptCounter  || '';
  const fiscalDay     = fiscal.fiscalDayNo     || invoice.fiscalDayNo    || cfg.fiscalDayNo || '---';
  const deviceSerial  = cfg.fdmsDeviceSerialNo || cfg.deviceSerialNumber  || fiscal.deviceSerialNo || '---';
  const deviceId      = cfg.fdmsDeviceId       || cfg.deviceId            || fiscal.deviceId       || '---';

  const isFiscalised = !!(fiscalCode || receiptGlobal || verCode);
  const isCreditNote = invoice.transactionType === 'CreditNote' || fiscal.isCreditNote;
  const isDebitNote  = invoice.transactionType === 'DebitNote'  || fiscal.isDebitNote;
  let docTitle = isCreditNote ? 'CREDIT NOTE' : isDebitNote ? 'DEBIT NOTE'
    : isFiscalised ? (isVat ? 'FISCAL TAX INVOICE' : 'FISCAL INVOICE')
    : (isVat ? 'TAX INVOICE' : 'INVOICE');

  const receiptNo  = `${receiptCtr || '---'}/${receiptGlobal || '---'}`;
  const dateStr    = invoice.date
    ? new Date(invoice.date + 'T00:00:00').toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : new Date().toLocaleString('en-GB');
  const custRef    = invoice.invoiceNumber || '---';
  const isLesotho  = (cfg.country === 'Lesotho' || cfg.fiscalProvider === 'LEKUKA');
  const verifyUrl  = isLesotho ? 'https://invoice.rsl.org.ls/' : 'https://fdms.zimra.co.zw/verify';

  // Buyer block
  const buyerName = invoice.buyer?.name || '';
  const isWalkIn  = !buyerName || ['walk-in','walk in','guest','cash customer'].some(s => buyerName.toLowerCase().includes(s));
  const buyerBlock = !isWalkIn ? `
    <div class="sep"></div>
    <div class="bold underline">BUYER</div>
    <div>${esc(buyerName)}</div>
    ${invoice.buyer?.tin        ? `<div>TIN: ${esc(invoice.buyer.tin)}</div>`        : ''}
    ${invoice.buyer?.vatNumber  ? `<div>VAT No: ${esc(invoice.buyer.vatNumber)}</div>` : ''}
    ${invoice.buyer?.email      ? `<div>${esc(invoice.buyer.email)}</div>`            : ''}
    ${invoice.buyer?.phone      ? `<div>${esc(invoice.buyer.phone)}</div>`            : ''}
  ` : '';

  // Items — matching Receipt48 line layout
  const itemRows = items.map(i => {
    const qty   = parseFloat(i.qty || i.quantity || 1);
    const price = parseFloat(i.unitPrice || i.price || 0);
    const total = parseFloat(i.lineTotal || i.totalAmount || (qty * price));
    const desc  = esc(i.description || i.name || 'Item');
    const sub   = qty !== 1 ? `<div class="sub">${qty.toFixed(3)} each ${price.toFixed(2)}</div>` : '';
    return `<div class="row"><span class="desc">${desc}</span><span class="bold">${total.toFixed(2)}</span></div>${sub}`;
  }).join('');

  // Tax summary — matches Receipt48 block [40-44]
  const taxHtml = isVat ? `
    <div class="sep"></div>
    <div class="center bold underline">TAX SUMMARY</div>
    ${taxGroups.map(g => `
      <div class="taxrow">Tax Code ${esc(g.name)} (${g.rate}%)</div>
      <div class="row sub"><span>Net Amt</span><span>${g.net.toFixed(2)}</span></div>
      <div class="row sub"><span>VAT</span><span>${g.tax.toFixed(2)}</span></div>
      <div class="row sub bold"><span>Total Amt</span><span>${g.gross.toFixed(2)}</span></div>
    `).join('<div class="dotsep"></div>')}
  ` : '';

  const verCodeFmt = verCode ? _fmtCode(verCode) : fiscalCode ? _fmtCode(fiscalCode) : '';
  const qrBlock = `
    <div class="sep"></div>
    ${qrData ? `<div class="center qr-place" data-qr="${esc(qrData)}"><canvas></canvas></div>` : ''}
    ${verCodeFmt ? `
      <div class="center small bold">VERIFICATION CODE:</div>
      <div class="center bold" style="word-break:break-all;font-size:10px">${esc(verCodeFmt)}</div>
    ` : !isFiscalised ? `<div class="center small" style="font-style:italic">Not yet fiscalised</div>` : ''}
    <div class="center small">Verify at: ${verifyUrl}</div>
  `;

  const logoHtml = cfg.logoFile ? `<div class="center"><img src="${esc(cfg.logoFile)}" style="max-height:60px;max-width:92%;margin-bottom:6px"></div>` : '';
  const invoiceTotal = parseFloat(invoice.total || invoice.invoiceAmount || 0);

  return `<html><head><style>
    @media print { @page { size: ${width} auto; margin: 0; } }
    *  { margin:0; padding:0; box-sizing:border-box; color:#000 !important; border-color:#000 !important; }
    body { font-family:'Courier New',Courier,monospace; font-size:10px; color:#000; width:${width}; padding:10px 8px; line-height:1.4; -webkit-font-smoothing:none; }
    .center  { text-align:center; }
    .bold    { font-weight:bold; }
    .underline { text-decoration:underline; }
    .small   { font-size:8px; }
    .sep     { border-top:1px dashed #000; margin:5px 0; }
    .dotsep  { border-top:1px dotted #aaa; margin:3px 0; }
    .row     { display:flex; justify-content:space-between; margin-bottom:2px; }
    .desc    { width:68%; word-break:break-word; }
    .sub     { font-size:9px; padding-left:8px; color:#444; }
    .taxrow  { font-size:9px; text-transform:uppercase; }
    canvas   { display:block; margin:0 auto; }
  </style></head><body>
    ${logoHtml}
    <div class="center bold" style="font-size:13px;text-transform:uppercase;margin-bottom:2px">${esc(cfg.companyName || '')}</div>
    ${cfg.branchName ? `<div class="center">${esc(cfg.branchName)}</div>` : ''}
    <div class="center">
      <p>TIN: ${esc(cfg.tin || '---')}</p>
      ${isVat && cfg.vatNumber ? `<p>VAT No: ${esc(cfg.vatNumber)}</p>` : ''}
    </div>
    ${cfg.address ? `<div class="center" style="white-space:pre-wrap">${esc(cfg.address)}</div>` : ''}
    ${cfg.phone   ? `<div class="center">Tel: ${esc(cfg.phone)}</div>` : ''}
    ${cfg.email   ? `<div class="center">${esc(cfg.email)}</div>` : ''}
    <div class="sep"></div>
    <div class="center bold" style="font-size:12px">${esc(docTitle)}</div>
    <div class="sep"></div>

    <div class="row"><span>Invoice No:</span><span class="bold">${esc(receiptNo)}</span></div>
    <div class="row"><span>Fiscal Day No:</span><span>${esc(String(fiscalDay))}</span></div>
    <div class="row"><span>Device Serial No:</span><span>${esc(deviceSerial)}</span></div>
    <div class="row"><span>Device ID:</span><span>${esc(deviceId)}</span></div>
    <div class="row"><span>Customer Ref No:</span><span>${esc(custRef)}</span></div>
    <div class="row"><span>Date &amp; Time:</span><span>${esc(dateStr)}</span></div>

    ${buyerBlock}
    <div class="sep"></div>

    ${itemRows}
    <div class="sep"></div>

    <div class="row bold" style="font-size:11px"><span>TOTAL (${esc(currency)})</span><span>${invoiceTotal.toFixed(2)}</span></div>
    <div class="sep" style="border-style:dotted"></div>
    <div class="row"><span class="small">TENDERED:</span><span>${parseFloat(invoice.paymentAmount || invoiceTotal).toFixed(2)}</span></div>
    <div class="row"><span class="small">CHANGE:</span><span>${parseFloat(invoice.change || 0).toFixed(2)}</span></div>
    <div class="sep"></div>

    <div>Number of Items: ${totalQty.toFixed(3)}</div>
    ${taxHtml}
    ${qrBlock}
    <div class="sep"></div>
    <div class="center small" style="font-style:italic">${esc(invoice.notes || 'Thank you for your business!')}</div>
    <div class="center small" style="margin-top:4px">Powered by FiscalStack</div>

    <script>
      document.querySelectorAll('.qr-place[data-qr]').forEach(function(el) {
        var data = el.getAttribute('data-qr');
        var canvas = el.querySelector('canvas');
        if (canvas && typeof QRCode !== 'undefined') {
          QRCode.toCanvas(canvas, data, { width: 160, margin: 1, errorCorrectionLevel: 'M' }, function() {});
        } else if (canvas) {
          el.innerHTML = '<div style="font-size:8px;word-break:break-all;text-align:center">' + data.slice(0,80) + '<\/div>';
        }
      });
    <\/script>
  </body></html>`;
}

// ── Template 3: Modern Blue A4 — matches invoice-templates.ts + pdf-document.tsx ─
function _buildModernA4(invoice, fiscal, cfg) {
  const accent = '#2563eb', secondary = '#dbeafe', surface = '#f8fafc',
        text = '#0f172a', muted = '#64748b', border = '#dbe3ef';
  const isVat = !!(cfg.vatNumber || fiscal.vatNumber);
  const items = invoice.items || [];
  const fiscalCode    = fiscal.fiscalCode    || invoice.fiscalCode    || '';
  const verCode       = fiscal.verificationCode || '';
  const qrData        = fiscal.qrCode        || fiscal.qrCodeData     || invoice.qrCodeData || '';
  const receiptGlobal = fiscal.receiptGlobalNo || invoice.receiptGlobalNo || '';
  const receiptCtr    = fiscal.receiptCounter  || invoice.receiptCounter  || '';
  const fiscalDay     = fiscal.fiscalDayNo     || invoice.fiscalDayNo    || cfg.fiscalDayNo || '—';
  const deviceSerial  = cfg.fdmsDeviceSerialNo || cfg.deviceSerialNumber  || '—';
  const deviceId      = cfg.fdmsDeviceId       || cfg.deviceId            || '—';
  const isFiscalised  = !!(fiscalCode || receiptGlobal || verCode);
  const isCreditNote  = invoice.transactionType === 'CreditNote' || fiscal.isCreditNote;
  const isDebitNote   = invoice.transactionType === 'DebitNote'  || fiscal.isDebitNote;
  const isLesotho     = (cfg.country === 'Lesotho' || cfg.fiscalProvider === 'LEKUKA');
  const verifyUrl     = isLesotho ? 'https://invoice.rsl.org.ls/' : 'https://fdms.zimra.co.zw/verify';

  let docTitle = isCreditNote ? 'FISCAL CREDIT NOTE' : isDebitNote ? 'FISCAL DEBIT NOTE'
    : isFiscalised ? (isVat ? 'FISCAL TAX INVOICE' : 'FISCAL INVOICE')
    : (isVat ? 'TAX INVOICE' : 'INVOICE');

  const dateStr = invoice.date
    ? new Date(invoice.date + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
    : new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  const logoHtml = cfg.logoFile
    ? `<img src="${esc(cfg.logoFile)}" style="height:52px;object-fit:contain;display:block;margin-bottom:6px">`
    : '';

  const itemRows = items.map((i, idx) => {
    const qty   = parseFloat(i.qty || i.quantity || 1);
    const price = parseFloat(i.unitPrice || i.price || 0);
    const total = parseFloat(i.lineTotal || i.totalAmount || (qty * price));
    const vat   = i.taxRate != null ? i.taxRate + '%' : (i.taxCode || 'A');
    return `<tr style="border-bottom:1px solid ${border}">
      <td style="padding:7px 10px;color:${muted};font-size:11px">${idx + 1}</td>
      <td style="padding:7px 10px">${esc(i.description || i.name || '—')}${i.sku || i.code ? `<div style="font-size:9px;color:${muted}">${esc(i.sku || i.code)}</div>` : ''}</td>
      <td style="padding:7px 10px;text-align:right">${qty.toFixed(2)}</td>
      <td style="padding:7px 10px;text-align:right">${price.toFixed(2)}</td>
      <td style="padding:7px 10px;text-align:right;color:${muted};font-size:10px">${esc(vat)}</td>
      <td style="padding:7px 10px;text-align:right;font-weight:600">${total.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const taxGroups = _thermalTaxGroups(items);
  const taxSummary = isVat && taxGroups.length ? `
    <div style="margin-top:20px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${muted};margin-bottom:6px">Tax Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:${surface}">
          <th style="text-align:left;padding:5px 8px;color:${muted}">Code</th>
          <th style="text-align:right;padding:5px 8px;color:${muted}">Net</th>
          <th style="text-align:right;padding:5px 8px;color:${muted}">VAT</th>
          <th style="text-align:right;padding:5px 8px;color:${muted}">Total</th>
        </tr></thead>
        <tbody>${taxGroups.map(g => `<tr style="border-top:1px solid ${border}">
          <td style="padding:5px 8px">Tax Code ${esc(g.name)} (${g.rate}%)</td>
          <td style="text-align:right;padding:5px 8px">${g.net.toFixed(2)}</td>
          <td style="text-align:right;padding:5px 8px">${g.tax.toFixed(2)}</td>
          <td style="text-align:right;padding:5px 8px;font-weight:600">${g.gross.toFixed(2)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '';

  const verCodeFmt = verCode ? _fmtCode(verCode) : fiscalCode ? _fmtCode(fiscalCode) : '';
  const fiscalBlock = (fiscalCode || receiptGlobal || verCodeFmt || qrData) ? `
    <div style="margin-top:20px;padding:14px 16px;background:${secondary};border:1px solid ${border};border-radius:6px;display:flex;gap:16px;align-items:flex-start">
      <div style="flex:1">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${accent};margin-bottom:8px">Fiscal Information</div>
        ${receiptCtr ? `<div style="font-size:11px;margin-bottom:3px"><strong>Invoice No:</strong> ${esc(receiptCtr)}/${esc(receiptGlobal)}</div>` : ''}
        ${fiscalDay  ? `<div style="font-size:11px;margin-bottom:3px"><strong>Fiscal Day No:</strong> ${esc(String(fiscalDay))}</div>` : ''}
        ${deviceSerial !== '—' ? `<div style="font-size:11px;margin-bottom:3px"><strong>Device Serial:</strong> ${esc(deviceSerial)}</div>` : ''}
        ${deviceId     !== '—' ? `<div style="font-size:11px;margin-bottom:3px"><strong>Device ID:</strong> ${esc(deviceId)}</div>` : ''}
        ${verCodeFmt ? `<div style="margin-top:6px;font-size:10px"><strong>Verification Code:</strong><br><span style="font-family:monospace;font-size:11px;word-break:break-all">${esc(verCodeFmt)}</span></div>` : ''}
        <div style="margin-top:6px;font-size:9px;color:${muted}">Verify at: ${verifyUrl}</div>
      </div>
      ${qrData ? `<div class="qr-a4" data-qr="${esc(qrData)}" style="flex-shrink:0"><canvas></canvas></div>` : ''}
    </div>` : '';

  const buyerName = invoice.buyer?.name || '';
  const isWalkIn  = !buyerName || ['walk-in','walk in','guest','cash customer'].some(s => buyerName.toLowerCase().includes(s));
  const buyerBlock = !isWalkIn ? `
    <div style="background:${surface};border:1px solid ${border};border-radius:6px;padding:12px 14px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${muted};margin-bottom:4px">Bill To</div>
      <div style="font-weight:600">${esc(buyerName)}</div>
      ${invoice.buyer?.vatNumber ? `<div style="font-size:11px;color:${muted}">VAT: ${esc(invoice.buyer.vatNumber)}</div>` : ''}
      ${invoice.buyer?.tin       ? `<div style="font-size:11px;color:${muted}">TIN: ${esc(invoice.buyer.tin)}</div>`        : ''}
    </div>` : `<div style="background:${surface};border:1px solid ${border};border-radius:6px;padding:12px 14px"><div style="font-size:11px;color:${muted}">Cash / Walk-in Customer</div></div>`;

  const invoiceTotal = parseFloat(invoice.total || invoice.invoiceAmount || 0);
  const vatTotal     = parseFloat(invoice.taxAmount || invoice.vatAmount || 0);
  const netTotal     = invoiceTotal - vatTotal;
  const currency     = invoice.currency || 'USD';

  return `<html><head><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:${text}; background:#fff; }
    @media print { @page { size:A4; margin:0; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>
    <div style="padding:28px 32px 16px;border-bottom:2px solid ${accent}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          ${logoHtml}
          <div style="font-size:20px;font-weight:700;color:${accent}">${esc(cfg.companyName || '')}</div>
          ${cfg.address    ? `<div style="font-size:11px;color:${muted};margin-top:2px">${esc(cfg.address)}</div>` : ''}
          ${cfg.phone      ? `<div style="font-size:11px;color:${muted}">Tel: ${esc(cfg.phone)}</div>` : ''}
          ${cfg.tin        ? `<div style="font-size:10px;color:${muted}">TIN: ${esc(cfg.tin)}</div>` : ''}
          ${isVat && cfg.vatNumber ? `<div style="font-size:10px;color:${muted}">VAT No: ${esc(cfg.vatNumber)}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:${text}">${esc(docTitle)}</div>
          <div style="font-size:12px;color:${muted};margin-top:4px">${esc(dateStr)}</div>
        </div>
      </div>
    </div>

    <div style="padding:20px 32px 28px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${[
          ['Invoice No.', invoice.invoiceNumber || '—'],
          ['Receipt No.', receiptGlobal || '—'],
          ['Currency',    currency],
          ['TIN',         cfg.tin || '—'],
          ['VAT No.',     isVat ? (cfg.vatNumber || '—') : 'N/A'],
          ['Date',        dateStr],
        ].map(([k, v]) => `<div style="background:${surface};border:1px solid ${border};border-radius:6px;padding:9px 12px">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${muted};margin-bottom:2px">${esc(k)}</div>
          <div style="font-size:11px;font-weight:600">${esc(String(v))}</div>
        </div>`).join('')}
      </div>

      <div style="margin-bottom:20px">${buyerBlock}</div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead><tr style="background:${accent}">
          <th style="color:#fff;padding:8px 10px;text-align:left;font-size:11px">#</th>
          <th style="color:#fff;padding:8px 10px;text-align:left;font-size:11px">Description</th>
          <th style="color:#fff;padding:8px 10px;text-align:right;font-size:11px">Qty</th>
          <th style="color:#fff;padding:8px 10px;text-align:right;font-size:11px">Unit Price</th>
          <th style="color:#fff;padding:8px 10px;text-align:right;font-size:11px">VAT</th>
          <th style="color:#fff;padding:8px 10px;text-align:right;font-size:11px">Amount</th>
        </tr></thead>
        <tbody style="border:1px solid ${border}">${itemRows}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
        <div style="width:260px;border:1px solid ${border};border-radius:6px;overflow:hidden">
          <div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid ${border};font-size:12px">
            <span style="color:${muted}">Subtotal</span><span>${netTotal.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid ${border};font-size:12px">
            <span style="color:${muted}">VAT</span><span>${vatTotal.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 14px;background:${secondary};font-size:15px;font-weight:700;color:${accent}">
            <span>TOTAL</span><span>${invoiceTotal.toFixed(2)} ${esc(currency)}</span>
          </div>
        </div>
      </div>

      ${taxSummary}
      ${fiscalBlock}

      <div style="margin-top:24px;padding-top:12px;border-top:1px solid ${border};display:flex;justify-content:space-between;font-size:10px;color:${muted}">
        <span style="font-style:italic">${esc(invoice.notes || 'Thank you for your business!')}</span>
        <span>Powered by FiscalStack</span>
      </div>
    </div>

    <script>
      document.querySelectorAll('.qr-a4[data-qr]').forEach(function(el) {
        var data = el.getAttribute('data-qr');
        var canvas = el.querySelector('canvas');
        if (canvas && typeof QRCode !== 'undefined') {
          QRCode.toCanvas(canvas, data, { width: 120, margin: 1, errorCorrectionLevel: 'M' }, function() {});
        } else if (canvas) {
          el.innerHTML = '<div style="font-size:8px;word-break:break-all;max-width:120px">' + data.slice(0,60) + '<\/div>';
        }
      });
    <\/script>
  </body></html>`;
}

// ── The 3 canonical templates ─────────────────────────────────────────────────
const PRINT_TEMPLATES = {
  thermal80: {
    label:  'Fiscal Receipt — 80mm thermal',
    format: 'thermal',
    generate(invoice, fiscal, cfg) { return _buildThermal('80mm', invoice, fiscal, cfg); },
  },
  thermal58: {
    label:  'Compact Receipt — 58mm thermal',
    format: 'thermal',
    generate(invoice, fiscal, cfg) { return _buildThermal('58mm', invoice, fiscal, cfg); },
  },
  modernA4: {
    label:  'Modern Blue — A4 Invoice',
    format: 'a4',
    generate(invoice, fiscal, cfg) { return _buildModernA4(invoice, fiscal, cfg); },
  },
};
// Alias for old configs
PRINT_TEMPLATES.standard = PRINT_TEMPLATES.thermal80;

function buildReceiptHTML(invoice, fiscal, cfg) {
  const tpl = PRINT_TEMPLATES[cfg.printTemplate || 'thermal80'] || PRINT_TEMPLATES.thermal80;
  return tpl.generate(invoice, fiscal, cfg);
}

"""

new_content = content[:start] + new_block + content[end:]

with open('renderer.js', 'w') as f:
    f.write(new_content)
print(f"Done. Old block: {end-start} chars, new block: {len(new_block)} chars")
PYEOF
