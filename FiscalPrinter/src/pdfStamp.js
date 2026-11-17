/**
 * PDF fiscal stamp.
 *
 * Takes the ORIGINAL invoice PDF (e.g. Palladium "Fiscal Tax Invoice") and
 * overlays a QR code + fiscal data block on the last page. Nothing in the
 * source document is re-laid-out or changed — the output is the same invoice
 * with a fiscal stamp drawn on top.
 *
 * Training mode generates fake fiscal data locally (no API call, no counters).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { parseInvoicePdf } from "./pdfInvoiceParser.js";

/**
 * Default stamp box (PDF points, origin bottom-left) for the Palladium
 * Letter layout: empty area left of the Subtotal/Invoice Total box.
 */
export const DEFAULT_STAMP_BOX = { x: 26, y: 100, width: 360, height: 98 };

/** Pull invoice number / doc type from the Palladium file name. */
export function parseInvoiceFileName(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const m = base.match(/\b(IN|CN|DN)-(\d+)/i);
  const prefix = m ? m[1].toUpperCase() : "IN";
  return {
    number: m ? `${prefix}-${m[2]}` : base,
    documentType:
      prefix === "CN" ? "CREDITNOTE" : prefix === "DN" ? "DEBITNOTE" : "FISCALINVOICE",
  };
}

/** Build fake (training) fiscal data in the ZIMRA FDMS shape. */
export function buildTrainingFiscalData({ invoiceNumber, config = {}, overrides = {} }) {
  const t = config.training || {};
  const deviceId = String(overrides.deviceId ?? t.deviceId ?? "0000000000");
  const fiscalDay = Number(overrides.fiscalDay ?? t.fiscalDay ?? 1);
  const receiptCounter = Number(overrides.receiptCounter ?? Math.floor(Math.random() * 900) + 1);
  const receiptGlobalNo = Number(overrides.receiptGlobalNo ?? Math.floor(Math.random() * 90000) + 1);
  const date = overrides.date ? new Date(overrides.date) : new Date();

  const hash = crypto
    .createHash("md5")
    .update(`${deviceId}|${invoiceNumber}|${receiptGlobalNo}|${date.toISOString()}`)
    .digest("hex")
    .toUpperCase()
    .slice(0, 16);
  const verificationCode = hash.match(/.{4}/g).join("-");

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const qrBase = (t.qrUrl || "https://fdmstest.zimra.co.zw/").replace(/\/?$/, "/");
  const qrPayload =
    overrides.qrPayload ||
    `${qrBase}${deviceId.padStart(10, "0")}${dd}${mm}${yyyy}${String(receiptGlobalNo).padStart(10, "0")}${hash}`;

  return {
    training: true,
    deviceId,
    fiscalDay,
    receiptCounter,
    receiptGlobalNo,
    invoiceNumber,
    fiscalDate: `${dd}/${mm}/${yyyy} ${date.toTimeString().slice(0, 8)}`,
    verificationCode,
    qrPayload,
  };
}

/**
 * Stamp QR + fiscal data onto a PDF.
 * @param {object} opts
 * @param {string} opts.inputPath   original invoice PDF (never modified)
 * @param {string} opts.outputPath  stamped copy
 * @param {object} opts.fiscal      fiscal data (see buildTrainingFiscalData)
 * @param {object} [opts.box]       stamp area override
 */
export async function stampPdf({ inputPath, outputPath, fiscal, box = DEFAULT_STAMP_BOX }) {
  const pdf = await PDFDocument.load(fs.readFileSync(inputPath));
  const page = pdf.getPages().at(-1);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const qrPng = await QRCode.toBuffer(fiscal.qrPayload, {
    type: "png",
    margin: 1,
    width: 300,
    errorCorrectionLevel: "M",
  });
  const qrImg = await pdf.embedPng(qrPng);

  const pad = 4;
  const qrSize = box.height - pad * 2;
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  });
  page.drawImage(qrImg, { x: box.x + pad, y: box.y + pad, width: qrSize, height: qrSize });

  const tx = box.x + pad * 2 + qrSize;
  let ty = box.y + box.height - pad - 9;
  const line = (label, value, size = 7.2) => {
    page.drawText(label, { x: tx, y: ty, size, font: bold });
    page.drawText(String(value ?? ""), { x: tx + 78, y: ty, size, font });
    ty -= size + 2.2;
  };

  page.drawText(fiscal.training ? "FISCAL DATA — TRAINING" : "FISCAL DATA", {
    x: tx,
    y: ty,
    size: 9,
    font: bold,
    color: fiscal.training ? rgb(0.75, 0.1, 0.15) : rgb(0, 0, 0),
  });
  ty -= 12;
  line("Verification Code:", fiscal.verificationCode);
  line("Device ID:", fiscal.deviceId);
  line("Fiscal Day No:", fiscal.fiscalDay);
  line("Receipt Counter:", `${fiscal.receiptCounter}/${fiscal.receiptGlobalNo}`);
  const isCredit = fiscal.documentType === "CreditNote";
  const isDebit = fiscal.documentType === "DebitNote";
  line(isCredit ? "Credit Note No:" : isDebit ? "Debit Note No:" : "Invoice No:", fiscal.invoiceNumber);
  if ((isCredit || isDebit) && fiscal.originalInvoiceNumber) {
    line("Original Invoice:", fiscal.originalInvoiceNumber);
  }
  line("Fiscal Date:", fiscal.fiscalDate);

  if (fiscal.training) {
    page.drawText("TRAINING COPY — NOT A VALID FISCAL INVOICE", {
      x: tx,
      y: box.y + pad + 1,
      size: 6.5,
      font: bold,
      color: rgb(0.75, 0.1, 0.15),
    });
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, await pdf.save());
  return outputPath;
}

/** Convenience: parse + training-stamp one PDF. Throws if parsing has errors. */
export async function trainingStampPdf({ inputPath, outputFolder, config = {}, box, force = false }) {
  const parsed = await parseInvoicePdf(inputPath);
  if (parsed.errors.length && !force) {
    throw new Error(`${path.basename(inputPath)}: cannot stamp — ${parsed.errors.join("; ")}`);
  }
  const number = parsed.number || parseInvoiceFileName(inputPath).number;
  const fiscal = {
    ...buildTrainingFiscalData({ invoiceNumber: number, config }),
    documentType: parsed.documentType,
    originalInvoiceNumber: parsed.originalInvoiceNumber,
  };
  const outDir = outputFolder || path.join(path.dirname(inputPath), "spool", "training");
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outDir, `${base}_TRAINING_FISCAL.pdf`);
  await stampPdf({ inputPath, outputPath, fiscal, box: box || config.stampBox || DEFAULT_STAMP_BOX });
  return { outputPath, fiscal, parsed };
}
