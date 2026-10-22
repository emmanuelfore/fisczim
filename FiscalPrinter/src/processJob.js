import fs from "fs";
import path from "path";
import { parseJob } from "./parseJob.js";
import { FiscalStackClient, toFiscalizePayload } from "./fiscalStackClient.js";
import { buildFiscalReceiptHtml } from "./fiscalReceipt.js";
import { maybeSaveDebugHtml, saveFiscalJson, printHtmlElectron, printHtmlCli } from "./printLocal.js";

function moveFile(src, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(src));
  fs.renameSync(src, dest);
  return dest;
}

/**
 * Core pipeline for the installed local app:
 *   print job → parse POS receipt → FiscalStack fiscalize → silent print to local printer
 *
 * HTML is only the receipt layout fed to the printer API — not a user document.
 */
export async function processJobFile(filePath, config, options = {}) {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const baseName = `${path.basename(fileName, path.extname(fileName))}-${Date.now()}`;

  if (!config.apiKey) {
    throw new Error("apiKey is missing — set your FiscalStack X-API-Key in config");
  }

  const parsed = parseJob(content, fileName, config);
  const client = new FiscalStackClient({
    apiEndpoint: config.apiEndpoint,
    apiKey: config.apiKey,
  });

  const payload = toFiscalizePayload(parsed, config);
  const fiscal = await client.fiscalize(payload);

  const html = await buildFiscalReceiptHtml({
    parsed,
    fiscal,
    companyName: config.companyName,
  });

  const jsonPath = saveFiscalJson(fiscal, config.outputFolder, baseName);
  const debugHtmlPath = maybeSaveDebugHtml(
    html,
    config.outputFolder,
    baseName,
    config.saveDebugHtml === true
  );

  let printed = false;
  let printError = null;

  if (config.printerName || options.forcePrint) {
    try {
      if (options.printMode === "electron") {
        await printHtmlElectron(html, config.printerName);
      } else if (debugHtmlPath) {
        await printHtmlCli(debugHtmlPath, config.printerName);
      } else {
        // Need a temp file for CLI lp/xdg-open
        const tmp = maybeSaveDebugHtml(html, config.outputFolder, `${baseName}-print`, true);
        await printHtmlCli(tmp, config.printerName);
        if (!config.saveDebugHtml) {
          try {
            fs.unlinkSync(tmp);
          } catch {
            /* ignore */
          }
        }
      }
      printed = true;
    } catch (err) {
      printError = err.message;
    }
  }

  let processedPath = null;
  try {
    if (
      fs.existsSync(filePath) &&
      path.resolve(path.dirname(filePath)) === path.resolve(config.spoolFolder)
    ) {
      processedPath = moveFile(filePath, config.processedFolder);
    }
  } catch {
    /* keep original */
  }

  return {
    parsed,
    fiscal,
    html,
    jsonPath,
    debugHtmlPath,
    printed,
    printError,
    processedPath,
    proof: {
      fiscalCode: fiscal.fiscalCode,
      qrCode: fiscal.qrCode,
      receiptNumber: fiscal.receiptNumber,
      receiptDate: fiscal.receipt?.receiptDate,
      fiscalDayNo: fiscal.receipt?.fiscalDayNo,
      receiptCounter: fiscal.receipt?.receiptCounter,
      receiptGlobalNo: fiscal.receipt?.receiptGlobalNo,
    },
  };
}

export async function processJobSafe(filePath, config, options = {}) {
  try {
    const result = await processJobFile(filePath, config, options);
    return { ok: true, ...result };
  } catch (err) {
    try {
      if (
        fs.existsSync(filePath) &&
        path.resolve(path.dirname(filePath)) === path.resolve(config.spoolFolder)
      ) {
        moveFile(filePath, config.failedFolder);
      }
    } catch {
      /* ignore */
    }
    return { ok: false, error: err.message, filePath };
  }
}
