/**
 * FiscalPrinter — locally installed Electron app
 * Watches spool folder → fiscalize → silent print to configured local printer.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
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

  while (queue.length) {
    const filePath = queue.shift();
    log(`Processing ${path.basename(filePath)}…`);
    const result = await processJobSafe(filePath, config, { printMode: "electron" });
    if (result.ok) {
      log(
        `OK ${result.proof.fiscalCode?.slice?.(0, 16) || ""}… printed=${result.printed}` +
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
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    depth: 0,
  });
  watcher.on("add", (filePath) => {
    if (!/\.(txt|json|rcpt)$/i.test(filePath)) return;
    queue.push(filePath);
    drainQueue(config);
  });
  log(`Watching ${config.spoolFolder}`);
}

app.whenReady().then(async () => {
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

  await createWindow();
  await startWatch(config);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
