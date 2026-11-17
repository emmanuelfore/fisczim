/**
 * Training mode pipeline.
 *
 * Generates a printable sample invoice + QR code. Completely offline:
 * no FiscalStack API call, no database write, no fiscal counter consumed.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { buildTrainingInvoiceHtml, writeTrainingFiles } from "./trainingInvoice.js";
import { printHtmlCli } from "./printLocal.js";

export function loadTrainingData(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Training file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Training file must be valid JSON: ${err.message}`);
  }
}

/**
 * @returns {Promise<{htmlPath:string, pdfPath:string|null, data:object, printed:boolean}>}
 */
export async function generateTrainingInvoice({
  inputPath,
  config = {},
  outputFolder,
  pdf = false,
  print = false,
  printerName = "",
}) {
  const data = loadTrainingData(inputPath);
  const html = await buildTrainingInvoiceHtml({ data, config });

  const invoiceNumber = data.invoice?.number || "training";
  const baseName = sanitize(`training-${invoiceNumber}-${Date.now()}`);
  const outDir = outputFolder || path.join(process.cwd(), "spool", "training");

  const { htmlPath } = writeTrainingFiles({
    outputFolder: outDir,
    baseName,
    html,
  });

  let pdfPath = null;
  if (pdf) {
    pdfPath = path.join(outDir, `${baseName}.pdf`);
    await htmlToPdf(htmlPath, pdfPath);
  }

  let printed = false;
  if (print) {
    await printHtmlCli(htmlPath, printerName || config.printerName || "");
    printed = true;
  }

  return { htmlPath, pdfPath, data, printed };
}

/**
 * Render HTML → PDF using the locally installed Electron binary.
 * Keeps FiscalPrinter dependency-free (Electron is already required by the app).
 */
export async function htmlToPdf(htmlPath, pdfPath) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = path.join(here, "..", "electron", "training-pdf.cjs");

  let electronPath = "";
  try {
    const mod = await import("electron");
    electronPath = typeof mod.default === "string" ? mod.default : mod.default?.default || "";
  } catch {
    /* handled below */
  }

  if (!electronPath || !fs.existsSync(electronPath)) {
    throw new Error(
      "Electron is not available for PDF export. Run the app with `npm start` and use 'Save training PDF', " +
        "or install dependencies with `npm install`."
    );
  }

  await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [script, htmlPath, pdfPath], {
      stdio: "inherit",
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Electron PDF export exited with code ${code}`))
    );
  });

  if (!fs.existsSync(pdfPath)) {
    throw new Error("PDF was not created");
  }
  return pdfPath;
}

function sanitize(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-");
}
