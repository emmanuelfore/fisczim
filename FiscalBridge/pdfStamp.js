/**
 * PDF fiscal stamp for FiscalBridge.
 *
 * Takes the original invoice PDF and overlays a QR code plus the fiscal data
 * block on its last page. The source file is never modified; the caller gets a
 * stamped copy in the target folder.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Default stamp area (PDF points, origin bottom-left). The default matches the
 * Palladium letter/A4 layout, where the bottom-left area is empty. Override it
 * with `config.pdfStampBox = { x, y, width, height }` for other layouts.
 */
const DEFAULT_STAMP_BOX = { x: 26, y: 100, width: 360, height: 98 };

/** pdf-lib's standard fonts only support WinAnsi; keep the stamp printable. */
function _pdfText(value) {
  return String(value == null ? '' : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, '?');
}

function _clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Stamp QR + fiscal data onto a copy of `inputPath`.
 *
 * @param {object} opts
 * @param {string} opts.inputPath   original invoice PDF (never modified)
 * @param {string} opts.outputPath  stamped copy
 * @param {object} opts.fiscal      fiscal data (see renderer's descriptor)
 * @param {object} [opts.box]       stamp area override
 * @returns {Promise<string>}       output path
 */
async function stampPdf({ inputPath, outputPath, fiscal, box = DEFAULT_STAMP_BOX }) {
  if (!inputPath || !outputPath) throw new Error('inputPath and outputPath are required');
  if (!fiscal || !fiscal.qrPayload) throw new Error('Fiscal QR payload is missing');

  const pdf = await PDFDocument.load(fs.readFileSync(inputPath), { ignoreEncryption: true });
  const pages = pdf.getPages();
  if (!pages.length) throw new Error('PDF has no pages');

  const page = pages[pages.length - 1];
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Keep the stamp inside the page even for non-A4 / landscape documents.
  const b = {
    x: _clamp(Number(box && box.x) || DEFAULT_STAMP_BOX.x, 4, Math.max(4, pageWidth - 60)),
    y: _clamp(Number(box && box.y) || DEFAULT_STAMP_BOX.y, 4, Math.max(4, pageHeight - 60)),
    width: _clamp(Number(box && box.width) || DEFAULT_STAMP_BOX.width, 120, Math.max(120, pageWidth - 8)),
    height: _clamp(Number(box && box.height) || DEFAULT_STAMP_BOX.height, 60, Math.max(60, pageHeight - 8)),
  };
  b.width = Math.min(b.width, pageWidth - b.x - 4);
  b.height = Math.min(b.height, pageHeight - b.y - 4);

  const qrPng = await QRCode.toBuffer(String(fiscal.qrPayload), {
    type: 'png',
    margin: 1,
    width: 300,
    errorCorrectionLevel: 'M',
  });
  const qrImg = await pdf.embedPng(qrPng);

  const pad = 4;
  const qrSize = Math.max(20, Math.min(b.height - pad * 2, b.width * 0.3));
  page.drawRectangle({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  });
  page.drawImage(qrImg, { x: b.x + pad, y: b.y + pad, width: qrSize, height: qrSize });

  const isCredit = fiscal.documentType === 'CreditNote';
  const isDebit = fiscal.documentType === 'DebitNote';
  const lines = [
    ['Verification Code:', fiscal.verificationCode || fiscal.fiscalCode || ''],
    ['Device ID:', fiscal.deviceId || ''],
    ['Fiscal Day No:', fiscal.fiscalDay ?? ''],
    ['Receipt Counter:', [fiscal.receiptCounter, fiscal.receiptGlobalNo].filter(v => v != null && v !== '').join('/')],
    [isCredit ? 'Credit Note No:' : isDebit ? 'Debit Note No:' : 'Invoice No:', fiscal.invoiceNumber || ''],
  ];
  if ((isCredit || isDebit) && fiscal.originalInvoiceNumber) {
    lines.push(['Original Invoice:', fiscal.originalInvoiceNumber]);
  }
  lines.push(['Fiscal Date:', fiscal.fiscalDate || '']);

  const tx = b.x + pad * 2 + qrSize;
  const textWidth = Math.max(40, b.x + b.width - pad - tx);
  let size = 7.2;
  // Shrink just enough that all rows fit inside the box.
  while (size > 5.4 && 12 + lines.length * (size + 2.2) > b.height - pad * 2 - 2) size -= 0.2;
  const lineHeight = size + 2.2;

  let ty = b.y + b.height - pad - 9;
  page.drawText(fiscal.training ? 'FISCAL DATA - TRAINING' : 'FISCAL DATA', {
    x: tx,
    y: ty,
    size: Math.max(7.5, size + 1.4),
    font: bold,
    color: fiscal.training ? rgb(0.75, 0.1, 0.15) : rgb(0, 0, 0),
  });
  ty -= 12;

  for (const [label, value] of lines) {
    page.drawText(_pdfText(label), { x: tx, y: ty, size, font: bold });
    page.drawText(_pdfText(value), {
      x: tx + Math.min(78, textWidth * 0.38),
      y: ty,
      size,
      font,
      maxWidth: textWidth * 0.62,
    });
    ty -= lineHeight;
  }

  if (fiscal.training) {
    page.drawText('TRAINING COPY - NOT A VALID FISCAL INVOICE', {
      x: tx,
      y: b.y + pad + 1,
      size: 6,
      font: bold,
      color: rgb(0.75, 0.1, 0.15),
      maxWidth: textWidth,
    });
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, await pdf.save());
  return outputPath;
}

module.exports = { stampPdf, DEFAULT_STAMP_BOX };
