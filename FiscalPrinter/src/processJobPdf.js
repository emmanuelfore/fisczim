/**
 * processJobPdf — PDF-first fiscalization pipeline.
 *
 * Flow:
 *   PDF file → parse with pdfInvoiceParser → build fiscalize payload
 *   → POST /api/v1/fiscalize → stamp real QR + fiscal data onto a copy
 *   → silent-print the stamped PDF (Electron path) → move original to processed
 *
 * The original PDF is NEVER modified. The stamped copy lands in outputFolder.
 */

import fs from "fs";
import path from "path";
import { FiscalStackClient } from "./fiscalStackClient.js";
import { parseInvoicePdf } from "./pdfInvoiceParser.js";
import { stampPdf } from "./pdfStamp.js";
import { saveFiscalJson } from "./printLocal.js";

function moveFile(src, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(src));
  try {
    fs.renameSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
  return dest;
}

function vatRateToTaxType(vatRate) {
  if (vatRate == null || vatRate === 0) return "ZERO_RATED";
  return "STANDARD";
}

/** Convert a parsed PDF document → FiscalStack /api/v1/fiscalize body. */
export function parsedPdfToFiscalizePayload(parsed, config) {
  if (parsed.errors.length) {
    throw new Error(`PDF parse errors: ${parsed.errors.join("; ")}`);
  }

  const isCreditNote = parsed.documentType === "CreditNote";
  const isDebitNote  = parsed.documentType === "DebitNote";

  const items = parsed.items.map((item) => {
    const absQty   = Math.abs(item.quantity);
    const absPrice = Math.abs(item.price);
    return {
      name:         item.description || item.code || "Item",
      sku:          item.code || undefined,
      quantity:     absQty,
      unitPrice:    absPrice,
      taxType:      vatRateToTaxType(item.vatRate),
      // Palladium invoices label the column "Price Inc"; the parser reports it.
      taxInclusive: parsed.priceInclusive !== false,
      hsCode:       item.hsCode || undefined,
    };
  });

  const buyer = parsed.buyer;
  const buyerPayload =
    buyer && (buyer.name || buyer.tin || buyer.vat)
      ? {
          name:      buyer.name    || undefined,
          tin:       buyer.tin     || undefined,
          vatNumber: buyer.vat     || undefined,
          email:     buyer.email   || undefined,
          phone:     buyer.phone || buyer.cell || undefined,
        }
      : undefined;

  return {
    items,
    currency:      parsed.currency || config.currency || "USD",
    paymentMethod: config.paymentMethod || "CASH",
    transactionType: isCreditNote ? "CreditNote"
                   : isDebitNote  ? "DebitNote"
                   : "FiscalInvoice",
    invoiceNumber:        parsed.number    || undefined,
    date:                 parsed.date      || undefined,
    relatedInvoiceNumber: parsed.originalInvoiceNumber || undefined,
    creditNoteReason:     parsed.reason    || (isCreditNote ? "Credit note" : undefined),
    buyer:                buyerPayload,
  };
}

/**
 * Build a stamp-box descriptor from the fiscal API response.
 * Mirrors buildTrainingFiscalData shape but uses real data.
 */
function buildRealFiscalDescriptor(parsed, apiResponse) {
  const receipt = apiResponse.receipt || {};
  return {
    training:              false,
    documentType:          parsed.documentType,
    originalInvoiceNumber: parsed.originalInvoiceNumber,
    invoiceNumber:         parsed.number,
    verificationCode:      apiResponse.verificationCode  ?? apiResponse.fiscalCode ?? "",
    deviceId:              String(apiResponse.deviceId   ?? ""),
    fiscalDay:             receipt.fiscalDayNo            ?? 0,
    receiptCounter:        receipt.receiptCounter         ?? 0,
    receiptGlobalNo:       receipt.receiptGlobalNo        ?? apiResponse.receiptNumber ?? 0,
    fiscalDate:            receipt.receiptDate
                             ? new Date(receipt.receiptDate).toLocaleString("en-ZW", { hour12: false })
                             : new Date().toLocaleString("en-ZW", { hour12: false }),
    qrPayload:             apiResponse.qrCode            ?? "",
  };
}

/**
 * Core PDF pipeline:
 *   parse → fiscalize → stamp → (print) → move-original
 */
export async function processPdfFile(filePath, config, options = {}) {
  const fileName = path.basename(filePath);
  const baseName = `${path.basename(fileName, ".pdf")}-${Date.now()}`;

  if (!config.apiKey) {
    throw new Error("apiKey is missing — set your FiscalStack X-API-Key in config");
  }

  // 1. Parse
  const parsed = await parseInvoicePdf(filePath);
  if (parsed.errors.length) {
    throw new Error(`Cannot fiscalize — PDF parse errors: ${parsed.errors.join("; ")}`);
  }
  if (parsed.warnings.length) {
    parsed.warnings.forEach((w) => console.warn(`[PDF] ${w}`));
  }

  // 2. Build payload & fiscalize
  const payload = parsedPdfToFiscalizePayload(parsed, config);
  const client = new FiscalStackClient({ apiEndpoint: config.apiEndpoint, apiKey: config.apiKey });
  const apiResponse = await client.fiscalize(payload);

  // 3. Stamp the original PDF with real fiscal data
  const fiscal = buildRealFiscalDescriptor(parsed, apiResponse);
  const stampedPath = path.join(config.outputFolder, `${baseName}.fiscal.pdf`);
  await stampPdf({
    inputPath:  filePath,
    outputPath: stampedPath,
    fiscal,
    box:        config.stampBox,
  });

  // 4. Save fiscal JSON alongside
  const jsonPath = saveFiscalJson(apiResponse, config.outputFolder, baseName);

  // 5. Print stamped PDF (Electron only — CLI has no silent-print for PDF)
  let printed = false;
  let printError = null;
  if (config.printerName || options.forcePrint) {
    try {
      if (options.printMode === "electron") {
        const { printPdfElectron } = await import("./printLocal.js");
        await printPdfElectron(stampedPath, config.printerName);
        printed = true;
      }
    } catch (err) {
      printError = err.message;
    }
  }

  // 6. Move original to processed
  let processedPath = null;
  try {
    if (
      fs.existsSync(filePath) &&
      path.resolve(path.dirname(filePath)) === path.resolve(config.spoolFolder)
    ) {
      processedPath = moveFile(filePath, config.processedFolder);
    }
  } catch { /* keep original */ }

  const receipt = apiResponse.receipt || {};
  return {
    parsed,
    apiResponse,
    fiscal,
    stampedPath,
    jsonPath,
    printed,
    printError,
    processedPath,
    proof: {
      fiscalCode:        apiResponse.fiscalCode,
      verificationCode:  apiResponse.verificationCode,
      qrCode:            apiResponse.qrCode,
      receiptNumber:     apiResponse.receiptNumber,
      receiptDate:       receipt.receiptDate,
      fiscalDayNo:       receipt.fiscalDayNo,
      receiptCounter:    receipt.receiptCounter,
      receiptGlobalNo:   receipt.receiptGlobalNo,
      validationStatus:  apiResponse.validationStatus,
      synced:            apiResponse.synced,
    },
  };
}

export async function processPdfSafe(filePath, config, options = {}) {
  try {
    const result = await processPdfFile(filePath, config, options);
    return { ok: true, ...result };
  } catch (err) {
    try {
      if (
        fs.existsSync(filePath) &&
        path.resolve(path.dirname(filePath)) === path.resolve(config.spoolFolder)
      ) {
        moveFile(filePath, config.failedFolder);
      }
    } catch { /* ignore */ }
    return { ok: false, error: err.message, filePath };
  }
}
