#!/usr/bin/env node
import path from "path";
import fs from "fs";
import chokidar from "chokidar";
import { loadConfig, projectRoot } from "./config.js";
import { processJobSafe } from "./processJob.js";

const [command = "help", ...args] = process.argv.slice(2);
const config = loadConfig();

function logResult(result) {
  if (!result.ok) {
    console.error(`[FAIL] ${result.filePath}: ${result.error}`);
    return;
  }
  console.log(`[OK] fiscalized`);
  console.log(`     verification: ${result.proof.fiscalCode}`);
  console.log(
    `     day=${result.proof.fiscalDayNo} counter=${result.proof.receiptCounter} global=${result.proof.receiptGlobalNo}`
  );
  console.log(`     printed to local printer: ${result.printed}${result.printError ? ` (${result.printError})` : ""}`);
  if (result.debugHtmlPath) console.log(`     debug HTML: ${result.debugHtmlPath}`);
}

async function processOne(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exitCode = 1;
    return;
  }
  const result = await processJobSafe(abs, config, { forcePrint: Boolean(config.printerName) });
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
    if (!/\.(txt|json|rcpt)$/i.test(filePath)) return;
    console.log(`\nNew job: ${path.basename(filePath)}`);
    logResult(await processJobSafe(filePath, config, { forcePrint: Boolean(config.printerName) }));
  });
}

function help() {
  console.log(`
FiscalPrinter — locally installed app

  npm start                 Electron app (watch spool + silent print to local printer)
  npm run watch             Headless CLI watcher (dev on Linux)
  npm run process -- <file> Process one job
  npm run test:pos          Sample POS text (Interface markers)
  npm run build:win         Windows installer (run on Windows / CI)

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
  default:
    help();
}
