#!/usr/bin/env node
import path from "path";
import fs from "fs";
import chokidar from "chokidar";
import { spawn } from "child_process";
import { loadConfig, projectRoot } from "./config.js";
import { processJobSafe } from "./processJob.js";
import { processPdfSafe } from "./processJobPdf.js";
import { generateTrainingInvoice } from "./training.js";
import { trainingStampPdf } from "./pdfStamp.js";
import { parseInvoicePdf } from "./pdfInvoiceParser.js";

const [command = "help", ...args] = process.argv.slice(2);
const config = loadConfig();

function logResult(result) {
  if (!result.ok) {
    console.error(`[FAIL] ${result.filePath}: ${result.error}`);
    return;
  }
  console.log(`[OK] fiscalized`);
  console.log(`     verification: ${result.proof.fiscalCode || result.proof.verificationCode || ""}`);
  console.log(
    `     day=${result.proof.fiscalDayNo} counter=${result.proof.receiptCounter} global=${result.proof.receiptGlobalNo}`
  );
  console.log(`     printed to local printer: ${result.printed}${result.printError ? ` (${result.printError})` : ""}`);
  if (result.debugHtmlPath) console.log(`     debug HTML: ${result.debugHtmlPath}`);
  if (result.stampedPath) console.log(`     stamped PDF: ${result.stampedPath}`);
}

function isPdf(filePath) {
  return /\.pdf$/i.test(filePath);
}

function processFile(filePath) {
  return isPdf(filePath)
    ? processPdfSafe(filePath, config, { forcePrint: Boolean(config.printerName) })
    : processJobSafe(filePath, config, { forcePrint: Boolean(config.printerName) });
}

async function processOne(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exitCode = 1;
    return;
  }
  const result = await processFile(abs);
  logResult(result);
  if (!result.ok) process.exitCode = 1;
}

async function watchSpool() {
  console.log(`CLI watcher: ${config.spoolFolder}`);
  console.log(`For the installed local app with silent print, use: npm start`);
  const watcher = chokidar.watch(config.spoolFolder, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    depth: 0,
  });
  watcher.on("add", async (filePath) => {
    if (!/\.(txt|json|rcpt|pdf)$/i.test(filePath)) return;
    console.log(`\nNew job: ${path.basename(filePath)}`);
    logResult(await processFile(filePath));
  });
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pdf") flags.pdf = true;
    else if (arg === "--print") flags.print = true;
    else if (arg === "--open") flags.open = true;
    else if (arg === "--out") flags.out = args[++i];
    else if (arg === "--printer") flags.printer = args[++i];
    else rest.push(arg);
  }
  return { flags, rest };
}

async function runTraining(args) {
  const { flags, rest } = parseFlags(args);
  const filePath = rest[0];
  if (!filePath) {
    console.error("Usage: npm run training -- <file.json> [--pdf] [--print] [--printer <name>] [--out <dir>] [--open]");
    process.exitCode = 1;
    return;
  }

  const result = await generateTrainingInvoice({
    inputPath: path.resolve(filePath),
    config,
    outputFolder: flags.out ? path.resolve(flags.out) : undefined,
    pdf: Boolean(flags.pdf),
    print: Boolean(flags.print),
    printerName: flags.printer || "",
  });

  console.log("[TRAINING] sample document generated (no fiscalization, no invoice changed)");
  console.log(`     HTML: ${result.htmlPath}`);
  if (result.pdfPath) console.log(`     PDF:  ${result.pdfPath}`);
  if (result.printed) console.log("     sent to local printer");

  if (flags.open) {
    const opener =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const target = result.pdfPath || result.htmlPath;
    const openerArgs = process.platform === "win32" ? ["/c", "start", "", target] : [target];
    spawn(opener, openerArgs, { detached: true, stdio: "ignore" }).unref();
  }
}

function help() {
  console.log(`
FiscalPrinter — locally installed app

  npm start                     Electron app (watch spool + silent print to local printer)
  npm run watch                 Headless CLI watcher (dev on Linux)
  npm run process -- <file>     Process one job (fiscalize + print)
  npm run test:pos              Sample POS text (Interface markers)
  npm run build:win             Windows installer (run on Windows / CI)

  PDF invoices (Palladium "Fiscal Tax Invoice" / "Fiscal Credit Note"):
  npm run parse -- <file.pdf>   Parse a PDF and print the extracted fields
  npm run process -- <file.pdf>  Parse → fiscalize → stamp QR on a copy → print
                                (original PDF is never modified)

  Training mode (offline — never calls the API, never changes an invoice):
  npm run training:invoice      Print-style A4 sample invoice + QR
  npm run training:credit       Sample credit note + QR
  npm run training:pdf          Generate the sample invoice as a PDF
  npm run training -- <file> --pdf --open
                                Generate any training JSON, optionally to PDF
  npm run training -- <file> --print --printer "Printer name"
                                Send the training sample to a printer
  npm run training:stamp -- <file.pdf> [--out <dir>]
                                Stamp a training QR + fiscal block onto a copy
                                of the original invoice (source untouched)
  npm run training:stamp:samples
                                Same, using the bundled Palladium samples

HTML is only the internal receipt layout for the printer API.
The installed app prints to your local printer — users do not open HTML files.
`);
  console.log(`Project: ${projectRoot}`);
}

switch (command) {
  case "watch":
    await watchSpool();
    break;
  case "process":
    if (!args[0]) {
      console.error("Usage: npm run process -- <file>");
      process.exit(1);
    }
    await processOne(args[0]);
    break;
  case "training":
    await runTraining(args);
    break;
  case "training-stamp": {
    const { flags, rest } = parseFlags(args);
    if (!rest.length) {
      console.error("Usage: npm run training:stamp -- <invoice.pdf> [more.pdf] [--out <dir>]");
      process.exit(1);
    }
    for (const file of rest) {
      const { outputPath, fiscal, parsed } = await trainingStampPdf({
        inputPath: path.resolve(file),
        outputFolder: flags.out ? path.resolve(flags.out) : undefined,
        config,
      });
      console.log(`[TRAINING] ${parsed.documentType} ${fiscal.invoiceNumber} stamped (original untouched)`);
      console.log(`     Total: ${parsed.currency} ${parsed.totals.invoiceTotal}  lines: ${parsed.items.length}`);
      console.log(`     PDF:  ${outputPath}`);
      console.log(`     Code: ${fiscal.verificationCode}`);
      for (const w of parsed.warnings) console.log(`     ! ${w}`);
    }
    break;
  }
  case "parse": {
    if (!args.length) {
      console.error("Usage: npm run parse -- <invoice.pdf> [...]");
      process.exit(1);
    }
    for (const file of args) {
      const parsed = await parseInvoicePdf(path.resolve(file));
      console.log(JSON.stringify(parsed, null, 2));
      if (parsed.errors.length) process.exitCode = 2;
    }
    break;
  }
  default:
    help();
}
