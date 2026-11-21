/**
 * FiscalPrinter — locally installed Electron app
 * Watches spool folder → fiscalize → silent print to configured local printer.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

let mainWindow = null;
let watcher = null;
let processing = false;
const queue = [];

async function loadEsm(rel) {
  const href = pathToFileUrl(path.join(__dirname, "..", rel));
  return import(href);
}

function pathToFileUrl(p) {
  let resolved = path.resolve(p);
  if (process.platform === "win32") {
    resolved = "/" + resolved.replace(/\\/g, "/");
  }
  return `file://${resolved}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 560,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function log(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("log", line);
  }
  console.log(line);
}

async function drainQueue(config) {
  if (processing) return;
  processing = true;
  const { processJobSafe } = await loadEsm("src/processJob.js");
  const { processPdfSafe } = await loadEsm("src/processJobPdf.js");

  while (queue.length) {
    const filePath = queue.shift();
    const isPdf = /\.pdf$/i.test(filePath);
    log(`Processing ${path.basename(filePath)}…`);
    const result = isPdf
      ? await processPdfSafe(filePath, config, { printMode: "electron" })
      : await processJobSafe(filePath, config, { printMode: "electron" });
    if (result.ok) {
      const proofLabel =
        result.proof?.fiscalCode?.slice?.(0, 16) ||
        result.proof?.verificationCode ||
        "";
      log(
        `OK ${proofLabel}… printed=${result.printed}` +
          (result.printError ? ` (print warn: ${result.printError})` : "")
      );
      mainWindow?.webContents.send("job-done", {
        ok: true,
        proof: result.proof,
        printed: result.printed,
      });
    } else {
      log(`FAIL: ${result.error}`);
      mainWindow?.webContents.send("job-done", { ok: false, error: result.error });
    }
  }
  processing = false;
}

async function startWatch(config) {
  if (watcher) await watcher.close();
  watcher = chokidar.watch(config.spoolFolder, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
    depth: 0,
  });
  watcher.on("add", (filePath) => {
    if (!/\.(txt|json|rcpt|pdf)$/i.test(filePath)) return;
    queue.push(filePath);
    drainQueue(config);
  });
  log(`Watching ${config.spoolFolder}`);
}

/**
 * TRAINING MODE — offline sample invoice + QR.
 *
 * This path deliberately never imports FiscalStackClient / processJob, so a
 * training print cannot call /fiscalize, write an invoice or consume a fiscal
 * counter. It only renders an HTML/PDF document and prints it locally.
 */
async function runTraining(config, { template = "invoice", action = "preview" } = {}) {
  const { buildTrainingInvoiceHtml, writeTrainingFiles } = await loadEsm("src/trainingInvoice.js");
  const { printHtmlElectron } = await loadEsm("src/printLocal.js");

  const sampleName =
    template === "credit" ? "training-credit-note.json" : "training-invoice.json";
  const inputPath = path.join(__dirname, "..", "samples", sampleName);
  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  const html = await buildTrainingInvoiceHtml({ data, config });
  const baseName = `training-${template}-${Date.now()}`;
  const outDir = path.join(config.outputFolder, "training");
  const { htmlPath } = writeTrainingFiles({ outputFolder: outDir, baseName, html });

  const result = { htmlPath, pdfPath: null, printed: false };

  if (action === "preview") {
    const preview = new BrowserWindow({
      width: 900,
      height: 1100,
      title: "FiscalPrinter — Training sample (not a valid fiscal invoice)",
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    await preview.loadFile(htmlPath);
    return result;
  }

  if (action === "pdf") {
    result.pdfPath = path.join(outDir, `${baseName}.pdf`);
    await printHtmlToPdf(htmlPath, result.pdfPath);
    return result;
  }

  if (action === "print") {
    await printHtmlElectron(html, config.printerName);
    result.printed = true;
    return result;
  }

  return result;
}

function printHtmlToPdf(htmlPath, pdfPath) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, javascript: false, sandbox: true },
    });
    const finish = (err) => {
      if (!win.isDestroyed()) win.destroy();
      if (err) reject(err);
      else resolve();
    };
    win.webContents.on("did-fail-load", (_e, code, desc) =>
      finish(new Error(`PDF window failed to load (${code}): ${desc}`))
    );
    win.webContents.on("did-finish-load", async () => {
      try {
        const pdf = await win.webContents.printToPDF({
          pageSize: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        });
        fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
        fs.writeFileSync(pdfPath, pdf);
        finish();
      } catch (err) {
        finish(err);
      }
    });
    win.loadFile(htmlPath);
  });
}

app.whenReady().then(async () => {
  // An installed app cannot write inside resources/app.asar. Point config,
  // spool folders and training output at the per-user data directory.
  if (app.isPackaged) {
    process.env.FISCALPRINTER_ROOT = app.getPath("userData");
  }

  const { loadConfig, saveConfig } = await loadEsm("src/config.js");
  let config = loadConfig();

  ipcMain.handle("get-config", () => config);
  ipcMain.handle("save-config", (_e, next) => {
    config = { ...config, ...next, parse: { ...config.parse, ...(next.parse || {}) } };
    saveConfig(config);
    return config;
  });
  ipcMain.handle("get-printers", async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, isDefault: p.isDefault }));
  });
  ipcMain.handle("start-watch", async () => {
    await startWatch(config);
    return true;
  });
  ipcMain.handle("process-file", async (_e, filePath) => {
    queue.push(filePath);
    await drainQueue(config);
    return true;
  });
  ipcMain.handle("process-pdf", async (_e, filePath) => {
    const { processPdfSafe } = await loadEsm("src/processJobPdf.js");
    log(`Fiscalizing PDF: ${path.basename(filePath)}…`);
    const result = await processPdfSafe(filePath, config, { printMode: "electron" });
    if (result.ok) {
      const code = result.proof?.verificationCode || result.proof?.fiscalCode?.slice?.(0, 16) || "";
      log(`OK ${code}  stamped=${path.basename(result.stampedPath)}  printed=${result.printed}`);
      mainWindow?.webContents.send("job-done", { ok: true, proof: result.proof, printed: result.printed, stampedPath: result.stampedPath });
    } else {
      log(`PDF FAIL: ${result.error}`);
      mainWindow?.webContents.send("job-done", { ok: false, error: result.error });
    }
    return result.ok;
  });
  ipcMain.handle("training-pick-pdf", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Choose an invoice PDF to stamp (training)",
      filters: [{ name: "PDF invoice", extensions: ["pdf"] }],
      properties: ["openFile"],
    });
    return canceled ? null : filePaths[0];
  });
  ipcMain.handle("training-stamp", async (_e, inputPath) => {
    try {
      const { trainingStampPdf } = await loadEsm("src/pdfStamp.js");
      const result = await trainingStampPdf({
        inputPath,
        outputFolder: path.join(config.outputFolder, "training"),
        config,
      });
      log(`Training stamp ready: ${path.basename(result.outputPath)}`);
      await shell.openPath(result.outputPath);
      return { ok: true, ...result };
    } catch (err) {
      log(`Training stamp failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle("training-run", async (_e, options) => {
    try {
      const result = await runTraining(config, options);
      const label = result.pdfPath ? path.basename(result.pdfPath) : path.basename(result.htmlPath || "sample");
      log(`Training sample ready: ${label}`);
      return { ok: true, ...result };
    } catch (err) {
      log(`Training failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  await createWindow();
  await startWatch(config);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
