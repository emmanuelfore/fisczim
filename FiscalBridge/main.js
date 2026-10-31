const { app, BrowserWindow, ipcMain, Menu, dialog, Notification, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const log = require('electron-log');
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
} catch (e) {
  log.warn('[Updater] electron-updater not available (dev mode):', e.message);
}
const ConfigManager = require('./configManager');
const documentStore = require('./documentStore');
const deviceStore   = require('./deviceStore');
const profileStore  = require('./profileStore');
const parserEngine  = require('./parserEngine');
const fiscalChain   = require('./fiscalChain');
const enterpriseQueue = require('./enterpriseQueue');
const { writeFiscalPdf } = require('./fiscalPdf');
const { getInstance: getStatusIndicator } = require('./statusIndicator');
const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const execFileAsync = promisify(execFile);

// Configure Logger
log.transports.file.level = "info";
log.info('[FiscalBridge] App starting...');
console.log('DEBUG app type:', typeof app);

const DEV_URL = 'http://localhost:5001/fiscalbridge';
const PROD_URL = 'https://fiscalstack.co.zw/fiscalbridge';
const LOCAL_FILE = path.join(__dirname, 'index.html');

// Store active watchers and configuration
const activeWatchers = new Map();
const pendingFileEvents = new Map(); // filePath -> debounce timer
let mainWindow = null;
let configManager = null;
let tray = null;

/**
 * Resolve the URL to load in the main window
 */
function resolveStartUrl() {
  // Offline-first: always load the bundled local UI unless explicitly overridden.
  if (process.env.ELECTRON_START_URL) {
    return process.env.ELECTRON_START_URL;
  }

  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      // Only allow remote startUrl when online mode is explicitly enabled.
      if (config.offlineMode === false && config.startUrl) {
        return config.startUrl;
      }
    }
  } catch (err) {
    console.error('[resolveStartUrl] Failed to read config.json:', err.message);
  }

  // Load local file by default for standalone/offline Electron app
  return LOCAL_FILE;
}

/**
 * Read/write configuration
 */
function migrateConfig(config) {
  const c = config || {};
  if (!c.configVersion || c.configVersion < 2) {
    c.configVersion = 2;
    c.sourceFolder = c.sourceFolder || (c.folders && c.folders.source) || '';
    c.targetFolder = c.targetFolder || (c.folders && c.folders.target) || '';
    c.errorFolder  = c.errorFolder  || (c.folders && c.folders.error)  || '';
    c.printFormat  = c.printFormat  || 'thermal';
    c.preferredPrinter = c.preferredPrinter || c.printerName || null;
  }
  
  // Set default folders if not configured
  const homeDir = app.getPath('home');
  if (!c.sourceFolder) {
    c.sourceFolder = path.join(homeDir, 'FiscalBridge', 'source');
  }
  if (!c.targetFolder) {
    c.targetFolder = path.join(homeDir, 'FiscalBridge', 'fiscalised');
  }
  if (!c.errorFolder) {
    c.errorFolder = path.join(homeDir, 'FiscalBridge', 'errors');
  }
  if (!c.originalFolder) {
    c.originalFolder = path.join(homeDir, 'FiscalBridge', 'originals');
  }
  
  // Ensure folders object is consistent with top-level folder properties
  if (!c.folders) {
    c.folders = { source: c.sourceFolder, target: c.targetFolder, error: c.errorFolder, original: c.originalFolder };
  } else {
    // Prefer top-level properties over nested folders object
    c.folders.source = c.sourceFolder;
    c.folders.target = c.targetFolder;
    c.folders.error = c.errorFolder;
    c.folders.original = c.originalFolder;
  }
  
  // Create default folders if they don't exist
  try {
    [c.sourceFolder, c.targetFolder, c.errorFolder, c.originalFolder].forEach(folder => {
      if (folder && !fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        log.info('[Config] Created default folder:', folder);
      }
    });
  } catch (err) {
    log.error('[Config] Failed to create default folders:', err.message);
  }
  
  return c;
}

function readConfig() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      const migrated = migrateConfig(parsed);
      if (migrated.configVersion !== parsed.configVersion) {
        fs.writeFileSync(configPath, JSON.stringify(migrated, null, 2));
      }
      return migrated;
    }
  } catch (err) {
    console.error('[readConfig] Failed to read config.json:', err.message);
  }
  return migrateConfig({});
}

function writeConfig(config) {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('[writeConfig] Failed to write config.json:', err.message);
    throw err;
  }
}

/**
 * Register all IPC handlers
 */
/**
 * Stale configs often name a printer that no longer exists, which Chromium only
 * reports as an opaque "Invalid deviceName provided". Validate up front and fall
 * back to the OS default printer when one is available.
 */
async function resolvePrintFallback(event, printerName) {
  if (!printerName) return { printerName: null, usedDefault: false };

  let printers = [];
  try { printers = await event.sender.getPrintersAsync(); } catch (e) { /* list unavailable */ }
  if (!printers.length) return { printerName, usedDefault: false };
  if (printers.some(p => p.name === printerName)) return { printerName, usedDefault: false };

  const fallback = (printers.find(p => p.isDefault) || {}).name || null;
  log.warn('[Print] Configured printer not found:', printerName, '| default:', fallback || 'none');
  if (fallback) return { printerName: fallback, usedDefault: true };
  return { error: `Printer "${printerName}" is unavailable. Connect it or choose another printer in Settings.` };
}

// ── Offline fiscal signing ───────────────────────────────────────────────────
let lastBootstrapAt = 0;
let offlineTimer = null;

function notifyRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  try { mainWindow.webContents.send(channel, payload); } catch { /* renderer unavailable */ }
}

async function bootstrapOfflineFiscal({ force = false } = {}) {
  const config = readConfig();
  if (!config.apiEndpoint || !config.apiKey) throw new Error('API endpoint or key not configured');
  if (!force && Date.now() - lastBootstrapAt < 5 * 60 * 1000) return fiscalChain.getState();
  const state = await fiscalChain.bootstrap({
    apiEndpoint: config.apiEndpoint,
    apiKey: config.apiKey,
  });
  lastBootstrapAt = Date.now();
  return state;
}

function applySyncResults(results) {
  let changed = 0;
  for (const result of results || []) {
    if (!result.idempotencyKey) continue;
    const doc = documentStore.getDocuments().find((d) => d.queueId === result.idempotencyKey);
    if (!doc) continue;

    if (result.ok) {
      const body = result.body || {};
      const receipt = body.receipt || {};
      documentStore.updateDocument(doc.id, {
        status: 'fiscalised',
        offline: false,
        syncedAt: new Date().toISOString(),
        fiscalCode: body.fiscalCode || doc.fiscalCode,
        apiResponse: {
          fiscalCode: body.fiscalCode || doc.fiscalCode,
          qrCode: body.qrCode || doc.apiResponse?.qrCode,
          verificationCode: body.verificationCode || doc.apiResponse?.verificationCode,
          receiptGlobalNo: receipt.receiptGlobalNo ?? body.receiptNumber ?? doc.apiResponse?.receiptGlobalNo,
          receiptCounter: receipt.receiptCounter ?? doc.apiResponse?.receiptCounter,
          fiscalDayNo: receipt.fiscalDayNo ?? doc.apiResponse?.fiscalDayNo,
          message: 'Synced from offline queue',
          offline: false,
        },
        parseError: undefined,
      });
      changed += 1;
    } else if (result.permanent) {
      documentStore.updateDocument(doc.id, {
        status: 'needs_review',
        parseError: 'Sync rejected: ' + (result.body?.message || result.body?.error || `HTTP ${result.status}`),
      });
      changed += 1;
    } else if (result.status) {
      documentStore.updateDocument(doc.id, {
        parseError: 'Sync failed: ' + (result.body?.message || `HTTP ${result.status}`),
      });
      changed += 1;
    }
  }
  return changed;
}

async function flushOfflineQueue(config) {
  const result = await enterpriseQueue.syncQueue({
    apiEndpoint: config.apiEndpoint,
    apiKey: config.apiKey,
    endpoint: '/api/v1/fiscalize',
    passphrase: config.passphrase,
  });
  const changed = applySyncResults(result.results);
  if (result.remaining === 0) {
    try { await bootstrapOfflineFiscal({ force: true }); } catch { /* stay on cached state */ }
  }
  if (changed > 0 || result.results.length > 0) {
    notifyRenderer('offline-sync-complete', result);
  }
  return result;
}

async function runOfflineMaintenance() {
  const config = readConfig();
  if (!config.apiEndpoint || !config.apiKey) return;
  try {
    if (enterpriseQueue.getQueueLength() > 0) {
      await flushOfflineQueue(config);
    } else {
      await bootstrapOfflineFiscal();
    }
  } catch (e) {
    log.warn('[Offline] Maintenance skipped:', e.message);
  }
}

function startOfflineMaintenance() {
  if (offlineTimer) clearInterval(offlineTimer);
  offlineTimer = setInterval(runOfflineMaintenance, 30000);
  setTimeout(runOfflineMaintenance, 2000);
}

function registerIpcHandlers() {
  // Configuration management
  ipcMain.handle('get-config', () => {
    return readConfig();
  });

  ipcMain.handle('get-fiscal-config', () => {
    // Merge both local stores; the user-facing config wins on conflicts
    // (it holds authoritative VAT/currency values used when fiscalising)
    const base = readConfig();
    let fiscal = {};
    try { fiscal = configManager ? configManager.getConfig() : {}; } catch (e) { /* ignore */ }
    return { ...fiscal, ...base };
  });

  ipcMain.handle('get-device-status', async () => {
    try {
      const config = readConfig();
      if (!config.apiEndpoint || !config.apiKey) {
        return { success: false, error: 'API endpoint or key not configured' };
      }

      // Fail fast so the UI doesn't sit in an "unknown" state on a dead endpoint
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let response;
      try {
        response = await fetch(`${config.apiEndpoint}/api/zimra/device-status`, {
          headers: { 'x-api-key': config.apiKey, 'Accept': 'application/json' },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          message = body?.Message || body?.message || body?.details || message;
        } catch (e) { /* non-JSON error body */ }
        return { success: false, error: message, status: response.status };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request timed out' : err.message;
      log.error('[DeviceStatus] Failed:', msg);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('save-config', async (_event, config) => {
    writeConfig(config);
    return { success: true };
  });

  // Folder monitoring (replaces Windows Forms timer-based file watching)
  ipcMain.handle('start-folder-watch', async (_event, sourceFolder, targetFolder) => {
    try {
      // Stop existing watcher if any
      const existingWatcher = activeWatchers.get('source');
      if (existingWatcher) {
        await existingWatcher.close();
        activeWatchers.delete('source');
      }
      for (const timer of pendingFileEvents.values()) clearTimeout(timer);
      pendingFileEvents.clear();

      // Create new watcher
      const watcher = chokidar.watch(sourceFolder, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        }
      });

      watcher.on('add', (filePath) => {
        // One pending event per path — repeated add events must not double-process
        if (pendingFileEvents.has(filePath)) return;
        log.info('[FolderWatch] File added:', filePath);
        const timer = setTimeout(() => {
          pendingFileEvents.delete(filePath);
          if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
            log.warn('[FolderWatch] Window unavailable, dropping event:', filePath);
            return;
          }
          try {
            mainWindow.webContents.send('receipt-file-added', {
              filePath,
              sourceFolder,
              targetFolder
            });
          } catch (err) {
            log.error('[FolderWatch] Failed to notify renderer:', err.message);
          }
        }, 500);
        pendingFileEvents.set(filePath, timer);
      });

      // Unhandled 'error' events crash the main process
      watcher.on('error', (err) => {
        const message = err && err.message ? err.message : String(err);
        log.error('[FolderWatch] Watcher error:', message);
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          try {
            mainWindow.webContents.send('folder-watch-error', { error: message });
          } catch (e) { /* renderer unavailable */ }
        }
      });

      activeWatchers.set('source', watcher);
      log.info('[FolderWatch] Started watching:', sourceFolder);
      updateTrayPresentation();
      return { success: true };
    } catch (err) {
      log.error('[FolderWatch] Failed to start:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('stop-folder-watch', async () => {
    try {
      const watcher = activeWatchers.get('source');
      if (watcher) {
        await watcher.close();
        activeWatchers.delete('source');
        log.info('[FolderWatch] Stopped watching');
      }
      for (const timer of pendingFileEvents.values()) clearTimeout(timer);
      pendingFileEvents.clear();
      updateTrayPresentation();
      return { success: true };
    } catch (err) {
      log.error('[FolderWatch] Failed to stop:', err.message);
      return { success: false, error: err.message };
    }
  });

  // File dialog for browsing files (e.g., logo images)
  ipcMain.handle('browse-file', async (_event, filters) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: filters || []
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return null;
      }
      return filePaths[0];
    } catch (err) {
      log.error('[BrowseFile] Failed:', err.message);
      return null;
    }
  });

  // Folder dialog for browsing directories
  ipcMain.handle('browse-folder', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory']
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return null;
      }
      return filePaths[0];
    } catch (err) {
      log.error('[BrowseFolder] Failed:', err.message);
      return null;
    }
  });

  // File operations
  ipcMain.handle('read-receipt-file', async (_event, filePath) => {
    try {
      log.info('[FileRead] Reading file:', filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // Check if file might be PDF binary even with wrong extension
      const buffer = fs.readFileSync(filePath);
      const isPdfBinary = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
      
      if (ext === '.pdf' || isPdfBinary) {
        // Read PDF as binary
        try {
          log.info('[FileRead] Reading PDF as binary:', filePath);
          const content = buffer;
          log.info('[FileRead] PDF binary read successful, content length:', content.length);
          return { success: true, content, fromPdf: true };
        } catch (pdfErr) {
          log.error('[FileRead] PDF binary read failed:', pdfErr.message);
          return { success: false, error: 'PDF read failed: ' + pdfErr.message };
        }
      }
      log.info('[FileRead] Reading text file:', filePath);
      const content = buffer.toString('utf8');
      log.info('[FileRead] Text file read successful, content length:', content.length);
      return { success: true, content };
    } catch (err) {
      log.error('[FileRead] File read error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('extract-pdf-text', async (_event, filePath) => {
    try {
      const text = await require('./a4InvoiceParser').extractTextFromPdfAsync(filePath);
      if (!text || !text.trim()) {
        return { success: false, error: 'No text found in PDF (scanned image? OCR required)' };
      }
      log.info('[PdfText] Extracted', text.length, 'chars from:', filePath);
      return { success: true, text };
    } catch (e) {
      log.error('[PdfText] Extraction failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  // Electron's bundled PDF viewer cannot render embedded/blob PDFs, so pages are
  // rasterised with poppler and returned as data URLs for an <img> preview.
  ipcMain.handle('render-pdf-pages', async (_event, filePath, opts = {}) => {
    if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'File not found' };
    const maxPages = Math.min(Math.max(parseInt(opts.maxPages, 10) || 10, 1), 50);
    const dpi = Math.min(Math.max(parseInt(opts.dpi, 10) || 150, 72), 300);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-pdf-preview-'));
    try {
      const prefix = path.join(tmpDir, 'page');
      const args = ['-png', '-r', String(dpi), '-f', '1', '-l', String(maxPages), filePath, prefix];
      try {
        await execFileAsync('pdftoppm', args, { timeout: 60000 });
      } catch (firstErr) {
        // pdftoppm missing on some installs; pdftocairo ships with the same package
        await execFileAsync('pdftocairo', args, { timeout: 60000 });
      }
      const files = fs.readdirSync(tmpDir)
        .filter(f => /\.png$/i.test(f))
        .sort((a, b) => {
          const na = parseInt((a.match(/-(\d+)\.png$/i) || [])[1], 10) || 0;
          const nb = parseInt((b.match(/-(\d+)\.png$/i) || [])[1], 10) || 0;
          return na - nb;
        });
      if (!files.length) return { success: false, error: 'No pages rendered' };
      const pages = files.map(name => {
        const buf = fs.readFileSync(path.join(tmpDir, name));
        return {
          width: buf.readUInt32BE(16),
          height: buf.readUInt32BE(20),
          dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
        };
      });
      log.info('[PdfRender] Rendered', pages.length, 'page(s) from:', filePath);
      return { success: true, pages };
    } catch (e) {
      log.error('[PdfRender] Failed:', e.message);
      return { success: false, error: 'PDF rendering failed: ' + e.message };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    }
  });

  // Persist the fiscalised document (QR, logo and fiscal counters baked in) as
  // a PDF next to the processed invoices. A4 documents paginate themselves;
  // thermal slips are sized to their rendered content so there is no blank tail.
  ipcMain.handle('write-fiscal-pdf', async (_event, html, targetDir, baseName, format) => {
    try {
      const finalPath = await writeFiscalPdf(html, targetDir, baseName, format);
      log.info('[FiscalPdf] Saved:', finalPath);
      return { success: true, path: finalPath };
    } catch (e) {
      log.error('[FiscalPdf] Failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('move-receipt-file', async (_event, sourcePath, targetPath) => {
    try {
      log.info('[FileMove] Moving file from:', sourcePath, 'to:', targetPath);
      // Callers pass the configured target folder; only treat the path as a file
      // if it already exists as one.
      let targetDir = targetPath;
      try {
        if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
          targetDir = path.dirname(targetPath);
        }
      } catch (e) { /* treat as directory */ }

      // Ensure target directory exists
      if (!fs.existsSync(targetDir)) {
        log.info('[FileMove] Creating target directory:', targetDir);
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Keep the original invoice filename; suffix only on collision
      const ext = path.extname(sourcePath);
      const baseName = path.basename(sourcePath, ext);
      let targetFileName = path.basename(sourcePath);
      let counter = 1;
      while (fs.existsSync(path.join(targetDir, targetFileName))) {
        targetFileName = `${baseName} (${counter})${ext}`;
        if (++counter > 1000) {
          targetFileName = `${baseName}_${Date.now()}${ext}`;
          break;
        }
      }
      const finalTargetPath = path.join(targetDir, targetFileName);

      log.info('[FileMove] Archiving to:', finalTargetPath);
      try {
        // Atomic when source and target share a filesystem
        fs.renameSync(sourcePath, finalTargetPath);
      } catch (renameErr) {
        if (renameErr.code !== 'EXDEV') throw renameErr;
        log.info('[FileMove] Cross-device move, copying then deleting');
        fs.copyFileSync(sourcePath, finalTargetPath);
        try {
          fs.unlinkSync(sourcePath);
        } catch (unlinkErr) {
          // Copy is safely in the target folder; caller retries the unlink
          log.error('[FileMove] Copied but could not delete source:', unlinkErr.message);
          return { success: false, copied: true, targetPath: finalTargetPath, error: unlinkErr.message };
        }
      }

      log.info('[FileMove] File move successful');
      return { success: true, targetPath: finalTargetPath };
    } catch (err) {
      log.error('[FileMove] File move error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-file', async (_event, filePath) => {
    try {
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (err) {
      log.error('[FileDelete] Failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Currency configuration (replaces CurConf.interface file)
  ipcMain.handle('save-currency-config', async (_event, currencies) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'CurConf.interface');
      const xmlContent = buildCurrencyXml(currencies);
      fs.writeFileSync(configPath, xmlContent);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('load-currency-config', async () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'CurConf.interface');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        return { success: true, content };
      }
      return { success: false, error: 'Config not found' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });



  // Printer management
  ipcMain.handle('get-printers', async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
  });

  // Fiscal configuration management
  ipcMain.handle('update-fiscal-config', async (_event, updates) => {
    return configManager.updateConfig(updates);
  });

  ipcMain.handle('increment-receipt-counter', () => {
    return configManager.incrementReceiptCounter();
  });

  ipcMain.handle('update-receipt-hash', async (_event, receiptData) => {
    return configManager.updateReceiptHash(receiptData);
  });

  ipcMain.handle('open-fiscal-day', () => {
    return configManager.openFiscalDay();
  });

  ipcMain.handle('close-fiscal-day', () => {
    return configManager.closeFiscalDay();
  });

  ipcMain.handle('is-fiscal-day-open', () => {
    return configManager.isFiscalDayOpen();
  });

  ipcMain.handle('reset-counters', () => {
    return configManager.resetCounters();
  });

  ipcMain.handle('set-tin', async (_event, tin) => {
    return configManager.setTIN(tin);
  });

  ipcMain.handle('set-currency', async (_event, currency) => {
    return configManager.setCurrency(currency);
  });

  ipcMain.handle('set-device-id', async (_event, deviceId) => {
    return configManager.setDeviceId(deviceId);
  });

  ipcMain.handle('set-zimra-servers', async (_event, zimraServer, verificationServer) => {
    return configManager.setZimraServers(zimraServer, verificationServer);
  });

  // A4 parser + printing + enterprise helpers
  ipcMain.handle('list-native-printers', async () => {
    try { return require('./printPdf').listPrinters(); } catch (e) { return []; }
  });

  ipcMain.handle('parse-a4-pdf', async (_event, filePath) => {
    try { return { success: true, data: await require('./a4InvoiceParser').parseA4InvoicePdfAsync(filePath) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('print-pdf-file', async (event, filePath, printerName) => {
    const { printPdfFile } = require('./pdfPrintWindow');
    const fallback = await resolvePrintFallback(event, printerName);
    if (fallback.error) return { success: false, error: fallback.error };

    // Chromium reports success when it silently drops a job with no default
    // printer, so refuse up front instead of claiming the PDF was printed.
    if (!fallback.printerName) {
      let defaultPrinter = null;
      try {
        const printers = await event.sender.getPrintersAsync();
        defaultPrinter = (printers.find(p => p.isDefault) || {}).name || null;
      } catch (e) { /* printer list unavailable */ }
      if (!defaultPrinter) {
        return { success: false, error: 'No printer available. Connect a printer or choose one in Settings.' };
      }
      fallback.printerName = defaultPrinter;
    }

    try {
      await printPdfFile(filePath, fallback.printerName);
      if (fallback.usedDefault) log.warn('[Print] Sent PDF to default printer:', fallback.printerName || 'system default');
      return { success: true, usedDefault: fallback.usedDefault || undefined, printerName: fallback.printerName || undefined };
    } catch (e) {
      if (!/invalid devicename/i.test(e.message)) {
        log.error('[Print] PDF print failed:', e.message);
        return { success: false, error: e.message };
      }

      // A printer can disappear between validation and printing; retry on the default.
      let defaultPrinter = null;
      try {
        const printers = await event.sender.getPrintersAsync();
        defaultPrinter = (printers.find(p => p.isDefault) || {}).name || null;
      } catch (e2) { /* printer list unavailable */ }

      if (defaultPrinter && defaultPrinter !== fallback.printerName) {
        log.warn('[Print] Printer', fallback.printerName, 'vanished; retrying PDF on default:', defaultPrinter);
        try {
          await printPdfFile(filePath, defaultPrinter);
          return { success: true, usedDefault: true, printerName: defaultPrinter };
        } catch (retryError) {
          log.error('[Print] PDF retry failed:', retryError.message);
          return { success: false, error: retryError.message };
        }
      }

      return { success: false, error: `Printer "${printerName}" is unavailable. Connect it or choose another printer in Settings.` };
    }
  });

  ipcMain.handle('get-queue-health', async () => {
    try { return enterpriseQueue.health(); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('get-offline-fiscal-state', async () => {
    try { return fiscalChain.getState(); }
    catch (e) { return { ready: false, reason: e.message, pending: 0 }; }
  });

  ipcMain.handle('bootstrap-offline-fiscal', async () => {
    try {
      return { success: true, state: await bootstrapOfflineFiscal({ force: true }) };
    } catch (e) {
      return { success: false, error: e.message, state: fiscalChain.getState() };
    }
  });

  ipcMain.handle('sign-offline-fiscal', async (_event, invoice, docId) => {
    try {
      return await fiscalChain.signAndQueue(invoice || {}, { docId });
    } catch (e) {
      log.warn('[Offline] Sign refused:', e.code || '', e.message);
      return { success: false, code: e.code || 'OFFLINE_SIGN_FAILED', error: e.message };
    }
  });

  ipcMain.handle('sync-offline-queue', async (_event, cfg) => {
    try { return await flushOfflineQueue(cfg || readConfig()); }
    catch (e) { return { error: e.message, results: [] }; }
  });

  ipcMain.handle('get-preferred-printer', async () => {
    try { return require('./uxHelpers').getPreferredPrinter(); } catch (e) { return null; }
  });

  ipcMain.handle('set-preferred-printer', async (_event, name) => {
    try { require('./uxHelpers').setPreferredPrinter(name); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('secure-status', async () => {
    try { return require('./secureKey').isSecure(); } catch (e) { return false; }
  });

  // Document store
  ipcMain.handle('get-documents', async () => {
    try { return require('./documentStore').getDocuments(); } catch (e) { return []; }
  });
  ipcMain.handle('save-documents', async (_event, docs) => {
    try { require('./documentStore').saveDocuments(docs || []); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  });
  ipcMain.handle('add-document', async (_event, doc) => {
    try { return require('./documentStore').addDocument(doc); }
    catch (e) {
      log.error('[Documents] add-document failed:', e.message);
      return null;
    }
  });
  ipcMain.handle('update-document', async (_event, id, updates) => {
    try { return require('./documentStore').updateDocument(id, updates); }
    catch (e) {
      log.error('[Documents] update-document failed:', e.message);
      return null;
    }
  });
  ipcMain.handle('file-exists', async (_event, filePath) => {
    try { return fs.existsSync(filePath); } catch (e) { return false; }
  });
  ipcMain.handle('get-document-stats', async () => {
    try {
      const docs = require('./documentStore').getDocuments();
      return {
        total: docs.length,
        fiscalised: docs.filter(d => d.status === 'fiscalised').length,
        queued: docs.filter(d => d.status === 'queued' || d.status === 'retrying').length,
        needsReview: docs.filter(d => d.status === 'needs_review').length,
      };
    } catch (e) { return { total: 0, fiscalised: 0, queued: 0, needsReview: 0 }; }
  });

  // Read log file (last N lines)
  ipcMain.handle('read-log-file', async (_event, maxLines) => {
    try {
      const logPath = require('electron-log').transports.file.getFile().path;
      const fs = require('fs');
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n');
      const n = maxLines || 200;
      return { success: true, lines: lines.slice(-n) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Open file with system default application
  ipcMain.handle('open-path', async (_event, filePath) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(filePath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Device store (local cache for device details, status, fiscalisations, audit) ──
  ipcMain.handle('get-cached-device-details', () => {
    return deviceStore.getDeviceDetails();
  });
  ipcMain.handle('save-cached-device-details', (_ev, details) => {
    return deviceStore.saveDeviceDetails(details);
  });
  ipcMain.handle('get-cached-device-status', () => {
    return deviceStore.getDeviceStatus();
  });
  ipcMain.handle('save-cached-device-status', (_ev, status) => {
    return deviceStore.saveDeviceStatus(status);
  });
  ipcMain.handle('get-fiscalisations', () => {
    return deviceStore.getFiscalisations();
  });
  ipcMain.handle('add-fiscalisation', (_ev, record) => {
    return deviceStore.addFiscalisation(record);
  });
  ipcMain.handle('get-audit-log', () => {
    return deviceStore.getAuditLog();
  });
  ipcMain.handle('append-audit-log', (_ev, entry) => {
    return deviceStore.appendAuditLog(entry);
  });

  // Export diagnostics
  ipcMain.handle('export-diagnostics', async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = require('electron-log').transports.file.getFile().path;
      const files = [];
      if (fs.existsSync(logPath)) files.push(logPath);
      const metricsPath = path.join(process.cwd(), 'metrics.json');
      if (fs.existsSync(metricsPath)) files.push(metricsPath);
      const auditPath = path.join(process.cwd(), 'offline-audit.log');
      if (fs.existsSync(auditPath)) files.push(auditPath);
      return { success: true, files };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Enterprise modules
  ipcMain.handle('get-metrics', async () => {
    try { return require('./observability').getMetrics(); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('record-sync', async (_event, success, failure) => {
    try { require('./observability').recordSync(success || 0, failure || 0); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('secure-encrypt', async (_event, value) => {
    try { return { success: true, data: require('./secureKey').encryptValue(value) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('secure-decrypt', async (_event, value) => {
    try { return { success: true, data: require('./secureKey').decryptValue(value) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('compliance-secure-delete', async (_event, file) => {
    try { return { success: require('./compliance').secureDelete(file) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('compliance-retention', async (_event, files, days) => {
    try { return { removed: require('./compliance').applyRetentionPolicy(files || [], days || 30) }; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('set-vat-rates', async (_event, vatA, vatB, vatC, vatD, vatE, vatF) => {
    return configManager.setVatRates(vatA, vatB, vatC, vatD, vatE, vatF);
  });

  ipcMain.handle('get-vat-rate', async (_event, type) => {
    return configManager.getVatRate(type);
  });

  // ── Status indicator IPC ──────────────────────────────────────────────────────
  const statusIndicator = getStatusIndicator();

  ipcMain.handle('get-status', async () => {
    return statusIndicator.getStatusObject();
  });

  ipcMain.handle('set-status', async (_event, status, queueCount) => {
    statusIndicator.setStatus(status, queueCount);
    return { success: true };
  });

  ipcMain.handle('set-device-info', async (_event, deviceInfo) => {
    statusIndicator.setDeviceInfo(deviceInfo);
    return { success: true };
  });

  // ── Parser engine IPC ──────────────────────────────────────────────────────
  // list-profiles: return all saved profiles (latest version each)
  ipcMain.handle('list-profiles', () => {
    try { return { success: true, profiles: profileStore.listProfiles() }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // get-profile: get specific profile (latest or by version)
  ipcMain.handle('get-profile', (_ev, id, version) => {
    try {
      const p = profileStore.getProfile(id, version || null);
      return p ? { success: true, profile: p } : { success: false, error: 'Not found' };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // save-profile: save/version-bump a profile object
  ipcMain.handle('save-profile', (_ev, profile) => {
    try { return { success: true, profile: profileStore.saveProfile(profile) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // delete-profile: remove all versions (careful!)
  ipcMain.handle('delete-profile', (_ev, id) => {
    try { return { success: true, removed: profileStore.deleteProfile(id) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // import-profile-file: import from a JSON file on disk
  ipcMain.handle('import-profile-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }], title: 'Import Parser Profile'
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, error: 'Cancelled' };
    try { return { success: true, profile: profileStore.importProfile(result.filePaths[0]) }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // export-profile-file: export a profile version to disk
  ipcMain.handle('export-profile-file', async (_ev, id, version) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${id}@${version || 'latest'}.json`, filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    try { profileStore.exportProfile(id, version, result.filePath); return { success: true, path: result.filePath }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  // parse-text: run the parser engine on extracted text.
  // `profileRef` may be a saved profile id (string), an inline draft profile object, or null (auto-detect).
  ipcMain.handle('parse-text', (_ev, text, profileRef, profileVersion) => {
    try {
      let profile = null;
      if (profileRef && typeof profileRef === 'object') {
        profile = profileRef;
      } else if (profileRef) {
        profile = profileStore.getProfile(profileRef, profileVersion || null);
        if (!profile) return { success: false, error: `Profile ${profileRef} not found` };
      }
      const result = profile
        ? parserEngine.parseWithProfile(text, profile)
        : parserEngine.parseAutoDetect(text, profileStore.listProfiles());
      return { success: true, result, fiscal: parserEngine.toFiscalInvoice(result) };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // parse-pdf-with-profile: extract PDF text, then parse with given profile id or auto-detect.
  ipcMain.handle('parse-pdf-with-profile', async (_ev, filePath, profileId) => {
    try {
      const text = await require('./a4InvoiceParser').extractTextFromPdfAsync(filePath);
      const profile = profileId ? profileStore.getProfile(profileId) : null;
      if (profileId && !profile) return { success: false, error: `Profile ${profileId} not found` };
      const result = profile
        ? parserEngine.parseWithProfile(text, profile, filePath)
        : parserEngine.parseAutoDetect(text, profileStore.listProfiles(), filePath);
      return { success: true, text, result, fiscal: parserEngine.toFiscalInvoice(result) };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // generate-qr-dataurl: returns a data:image/png;base64 string for a QR code
  ipcMain.handle('generate-qr-dataurl', async (_ev, text) => {
    if (!text) return { success: true, dataUrl: '' };
    try {
      const QRCode = require('qrcode');
      const dataUrl = await QRCode.toDataURL(text, { width: 132, margin: 1, errorCorrectionLevel: 'M' });
      return { success: true, dataUrl };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── Auto-updater IPC ──────────────────────────────────────────────────────
  ipcMain.handle('check-for-updates', async () => {
    if (!autoUpdater || !app.isPackaged) return { success: false, error: 'Not available (dev mode)' };
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version || null };
    } catch (e) { return { success: false, error: e.message }; }
  });
  ipcMain.handle('install-update', () => {
    if (!autoUpdater) return { success: false, error: 'Not available' };
    autoUpdater.quitAndInstall();
    return { success: true };
  });
  // Print/preview documents are loaded from data:/blob: URLs, which cannot
  // reference local files; logos must arrive as a data URL. Accepts the web
  // company logo URL too, so archived copies stay self-contained offline.
  ipcMain.handle('read-image-data-url', async (_event, filePath) => {
    try {
      if (/^https?:\/\//i.test(filePath)) {
        const res = await fetch(filePath, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
        const type = (res.headers.get('content-type') || '').split(';')[0];
        if (!type.startsWith('image/')) return { success: false, error: 'Not an image' };
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 3 * 1024 * 1024) return { success: false, error: 'Image too large' };
        return { success: true, dataUrl: `data:${type};base64,${buf.toString('base64')}` };
      }
      const mime = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
      }[path.extname(filePath).toLowerCase()];
      if (!mime) return { success: false, error: 'Unsupported image type' };
      const buf = fs.readFileSync(filePath);
      return { success: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // qr-data-url: render QR as PNG data URL (print windows have no QR library)
  ipcMain.handle('qr-data-url', async (_event, text, width) => {
    try {
      if (!text) return { success: false, error: 'empty' };
      const url = await require('qrcode').toDataURL(String(text), { width: width || 240, margin: 1, errorCorrectionLevel: 'M' });
      return { success: true, data: url };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('print-receipt', async (event, html, printerName, format) => {
    const target = await resolvePrintFallback(event, printerName);
    if (target.error) throw new Error(target.error);

    const printOnce = (deviceName) => new Promise((resolve, reject) => {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false }
      });

      const timeout = setTimeout(() => {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.destroy();
        }
        reject(new Error('Print timed out'));
      }, 10000);

      const pageSize = format === 'a4'
        ? 'A4'
        : { width: 80000, height: 800000 };

      printWindow.webContents.on('did-finish-load', () => {
        clearTimeout(timeout);

        // Only include deviceName if it's a non-empty string
        const printOptions = {
          silent: true,
          printBackground: true,
          marginsType: 0,
          pageSize
        };

        if (deviceName && deviceName.trim() !== '') {
          printOptions.deviceName = deviceName;
        }

        printWindow.webContents.print(printOptions, (success, errorType) => {
          if (!printWindow.isDestroyed()) {
            printWindow.destroy();
          }
          if (success) {
            resolve(true);
          } else {
            reject(new Error(errorType || 'Print failed'));
          }
        });
      });

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    });

    try {
      await printOnce(target.printerName);
      if (target.usedDefault) log.warn('[Print] Sent receipt to default printer:', target.printerName);
      return { success: true, usedDefault: target.usedDefault || undefined, printerName: target.printerName || undefined };
    } catch (e) {
      // Safety net: a printer can disappear between validation and printing
      if (!/invalid devicename/i.test(e.message)) throw e;

      let fallback = null;
      try {
        const printers = await event.sender.getPrintersAsync();
        fallback = (printers.find(p => p.isDefault) || {}).name || null;
      } catch (e2) { /* printer list unavailable */ }

      if (fallback && fallback !== target.printerName) {
        log.warn('[Print] Printer', target.printerName, 'vanished; retrying on default:', fallback);
        await printOnce(fallback);
        return { success: true, usedDefault: true, printerName: fallback };
      }
      throw new Error(`Printer "${printerName}" is unavailable. Connect it or choose another printer in Settings.`);
    }
  });
}

/**
 * Build currency XML configuration (replaces Windows Forms XML generation)
 */
function buildCurrencyXml(currencies) {
  let xml = '<CurrencyTags>';
  currencies.forEach(currency => {
    xml += `<currency>`;
    xml += `<keyword>${currency.keyword}</keyword>`;
    xml += `<Name>${currency.name}</Name>`;
    xml += '</currency>';
  });
  xml += '</CurrencyTags>';
  return xml;
}

/**
 * Create main window
 */
/** Auto-Updater — checks GitHub releases for updates on startup (packaged builds only). */
function setupAutoUpdater(mainWindow) {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking for update...');
  });
  autoUpdater.on('update-available', (info) => {
    log.info(`[Updater] Update available: ${info.version}`);
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', { version: info.version });
      new Notification({ title: 'FiscalBridge Update', body: `Version ${info.version} is downloading...` }).show();
    }
  });
  autoUpdater.on('update-not-available', (info) => {
    log.info('[Updater] Up to date.');
  });
  autoUpdater.on('error', (err) => {
    log.error(`[Updater] Error: ${err.message}`);
  });
  autoUpdater.on('download-progress', (progressObj) => {
    log.info(`[Updater] Downloading: ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[Updater] Update downloaded: ${info.version}. Ready to install.`);
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', { version: info.version });
      new Notification({
        title: 'FiscalBridge Update Ready',
        body: `Version ${info.version} will install on next restart. Click to restart now.`
      }).on('click', () => autoUpdater.quitAndInstall()).show();
    }
  });
  autoUpdater.checkForUpdatesAndNotify();
}

function createWindow() {
  Menu.setApplicationMenu(null);

  // Initialize config manager
  configManager = new ConfigManager(app.getPath('userData'));
  // Document store uses process.cwd() by default; no init needed.

  const config = readConfig();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: "FiscalBridge - Fiscal Interface",
    show: true
  });

  mainWindow.maximize();

  // Dev tools toggle
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  try { registerIpcHandlers(); } catch (e) { console.error('registerIpcHandlers error:', e); }

  const startUrl = resolveStartUrl();
  console.log('[FiscalBridge] Loading window from:', startUrl);
  
  // Use loadFile for local files, loadURL for remote URLs
  if (startUrl.startsWith('file:') || startUrl.endsWith('.html')) {
    mainWindow.loadFile(startUrl).catch(err => {
      console.error('[FiscalBridge] Failed to load file:', err);
      mainWindow.loadURL(`data:text/html;charset=utf-8,<html>
        <body style="font-family: sans-serif; padding: 2rem; background: #fff;">
          <h2 style="color: #e53e3e;">FiscalBridge Failed to Load</h2>
          <p><strong>Attempted to start at:</strong> ${startUrl}</p>
          <p><strong>Error:</strong> ${err.message}</p>
        </body>
      </html>`);
    });
  } else {
    mainWindow.loadURL(startUrl).catch(err => {
      console.error('[FiscalBridge] Failed to load URL:', err);
      mainWindow.loadURL(`data:text/html;charset=utf-8,<html>
        <body style="font-family: sans-serif; padding: 2rem; background: #fff;">
          <h2 style="color: #e53e3e;">FiscalBridge Failed to Load</h2>
          <p><strong>Attempted to start at:</strong> ${startUrl}</p>
          <p><strong>Error:</strong> ${err.message}</p>
        </body>
      </html>`);
    });
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[FiscalBridge] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[FiscalBridge] Window loaded successfully');
    log.info('[FiscalBridge] Window loaded successfully');
  });

  // Start auto-updater if packaged
  setupAutoUpdater(mainWindow);
  
  // Create system tray
  createTray();
  
  mainWindow.on('close', (event) => {
    // Don't quit the app when window is closed, just hide it (like C# app)
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  
  mainWindow.on('closed', () => {
    // Clean up watchers and queued notifications
    activeWatchers.forEach(watcher => watcher.close());
    activeWatchers.clear();
    for (const timer of pendingFileEvents.values()) clearTimeout(timer);
    pendingFileEvents.clear();
    mainWindow = null;
    updateTrayPresentation();
  });
}

/**
 * Create system tray with connection-status indicator
 */

// ── Tray status dot ───────────────────────────────────────────────────────────
// The tray icon is the base logo with a small colour-coded dot overlaid in the
// bottom-right corner: green online, amber offline, red config error, silver
// checking. Pixel order (RGBA vs BGRA) is detected at runtime because
// nativeImage.getBitmap()/createFromBitmap() are platform-dependent.
const STATUS_COLORS = {
  online: '#32D25A',
  offline: '#FFB900',
  error: '#DC3232',
  unknown: '#C0C0C0'
};
const TRAY_ICON_SIZE = 32;
const trayIconCache = new Map();
let bitmapOrder; // undefined = not detected yet
let lastTraySignature = null;

function getBitmapOrder() {
  if (bitmapOrder !== undefined) return bitmapOrder;
  try {
    // 1x1 opaque red probe: RGBA => [255,0,0,255], BGRA => [0,0,255,255]
    const probe = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
    );
    const bytes = probe.getBitmap();
    if (bytes && bytes.length >= 4) {
      if (bytes[0] > 200 && bytes[2] < 50) bitmapOrder = 'rgba';
      else if (bytes[2] > 200 && bytes[0] < 50) bitmapOrder = 'bgra';
      else bitmapOrder = null;
    } else {
      bitmapOrder = null;
    }
  } catch (e) {
    bitmapOrder = null;
  }
  log.info('[Tray] Bitmap pixel order:', bitmapOrder || 'unsupported (plain icon)');
  return bitmapOrder;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const v = parseInt(m ? m[1] : 'C0C0C0', 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function blendPixel(buf, offset, r, g, b, alpha, order) {
  if (alpha <= 0) return;
  const ri = order === 'rgba' ? 0 : 2;
  const bi = order === 'rgba' ? 2 : 0;
  const dstA = buf[offset + 3] / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA <= 0) {
    buf[offset] = 0; buf[offset + 1] = 0; buf[offset + 2] = 0; buf[offset + 3] = 0;
    return;
  }
  buf[offset + ri] = Math.round((r * alpha + buf[offset + ri] * dstA * (1 - alpha)) / outA);
  buf[offset + 1] = Math.round((g * alpha + buf[offset + 1] * dstA * (1 - alpha)) / outA);
  buf[offset + bi] = Math.round((b * alpha + buf[offset + bi] * dstA * (1 - alpha)) / outA);
  buf[offset + 3] = Math.round(outA * 255);
}

function drawStatusDot(buf, size, hex, order) {
  const { r, g, b } = hexToRgb(hex);
  const dotR = size * 0.20;
  const ringR = dotR + size * 0.055;
  const cx = size - ringR - 1;
  const cy = size - ringR - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > ringR + 1) continue;
      const offset = (y * size + x) * 4;
      const ringCov = Math.max(0, Math.min(1, ringR + 0.5 - dist));
      if (ringCov > 0) blendPixel(buf, offset, 255, 255, 255, ringCov, order);
      const dotCov = Math.max(0, Math.min(1, dotR + 0.5 - dist));
      if (dotCov > 0) blendPixel(buf, offset, r, g, b, dotCov, order);
    }
  }
}

function getTrayIcon(status) {
  const key = STATUS_COLORS[status] ? status : 'unknown';
  if (trayIconCache.has(key)) return trayIconCache.get(key);

  const base = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  const order = getBitmapOrder();
  // getBitmap/createFromBitmap round-trips are unreliable on macOS; use the
  // plain icon there. Colour is still conveyed by the menu and tooltip.
  if (base.isEmpty() || !order || process.platform === 'darwin') {
    trayIconCache.set(key, base);
    return base;
  }

  let image = base;
  const { width, height } = image.getSize();
  if (width !== TRAY_ICON_SIZE || height !== TRAY_ICON_SIZE) {
    image = image.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
  }
  const bitmap = Buffer.from(image.getBitmap());
  if (bitmap.length !== TRAY_ICON_SIZE * TRAY_ICON_SIZE * 4) {
    log.warn('[Tray] Unexpected icon bitmap size, using plain icon');
    trayIconCache.set(key, base);
    return base;
  }

  drawStatusDot(bitmap, TRAY_ICON_SIZE, STATUS_COLORS[key], order);
  const composed = nativeImage.createFromBitmap(bitmap, {
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE
  });
  const result = composed.isEmpty() ? base : composed;
  trayIconCache.set(key, result);
  return result;
}

function createDotImage(hex, size = 16) {
  const order = getBitmapOrder();
  if (!order) return null;
  const { r, g, b } = hexToRgb(hex);
  const bitmap = Buffer.alloc(size * size * 4, 0);
  const c = size / 2;
  const radius = size * 0.34;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius + 1) continue;
      const cov = Math.max(0, Math.min(1, radius + 0.5 - dist));
      blendPixel(bitmap, (y * size + x) * 4, r, g, b, cov, order);
    }
  }
  const image = nativeImage.createFromBitmap(bitmap, { width: size, height: size });
  return image.isEmpty() ? null : image;
}

function openFolder(folder) {
  if (!folder) return;
  try {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  } catch (e) {
    log.warn('[Tray] Could not create folder:', folder, e.message);
  }
  shell.openPath(folder).then((err) => {
    if (err) log.warn('[Tray] openPath failed:', err);
  }).catch((err) => log.warn('[Tray] openPath failed:', err.message));
}

function openLogFile() {
  try {
    const logPath = log.transports.file.getFile().path;
    shell.showItemInFolder(logPath);
  } catch (e) {
    log.warn('[Tray] Could not open log file:', e.message);
  }
}

function toggleWatchingFromTray() {
  // Let the renderer flip monitoring so its pill, toast and state stay in sync
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  try {
    mainWindow.webContents.send('tray-toggle-watch');
  } catch (e) {
    log.warn('[Tray] Failed to send toggle command:', e.message);
  }
}

// Gateways report FiscalDayOpened / FiscalDayClosed / FiscalDayCloseFailed;
// a close-failed day is still open, so it only offers a retry close.
function trayDayState(deviceInfo, cfg) {
  const raw = String((deviceInfo && deviceInfo.fiscalDayStatus) || (cfg && cfg.fiscalDayStatus) || '')
    .trim().toLowerCase();
  if (['fiscaldayopened', 'fiscaldayopen', 'opened', 'open'].includes(raw)) return 'open';
  if (['fiscaldayclosed', 'closed'].includes(raw)) return 'closed';
  if (['fiscaldayclosefailed', 'closefailed', 'close failed'].includes(raw)) return 'failed';
  return 'unknown';
}

function requestFiscalDayAction(kind) {
  // Run the same flows as the Day Close page so the UI, audit log and state
  // stay consistent; show the window first so confirmations are visible.
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  showWindow();
  try {
    mainWindow.webContents.send('tray-fiscal-day', kind);
  } catch (e) {
    log.warn('[Tray] Failed to send fiscal-day command:', e.message);
  }
}

async function checkForUpdatesFromTray() {
  if (!autoUpdater || !app.isPackaged) return;
  try {
    new Notification({ title: 'FiscalBridge', body: 'Checking for updates…' }).show();
    await autoUpdater.checkForUpdates();
  } catch (e) {
    new Notification({
      title: 'FiscalBridge Update',
      body: `Update check failed: ${e.message}`
    }).show();
  }
}

function buildTrayMenu() {
  const status = getStatusIndicator().getStatusObject();
  const cfg = readConfig();
  const watching = activeWatchers.has('source');
  const device = status.deviceInfo || {};

  const statusLabel = device.fiscalDay
    ? `${status.label} · Day ${device.fiscalDay}`
    : status.label;

  const template = [
    { label: statusLabel, icon: createDotImage(status.color) || undefined, enabled: false }
  ];

  const identity = [device.companyName, device.deviceId && String(device.deviceId)].filter(Boolean).join(' · ');
  if (identity) template.push({ label: identity, enabled: false });

  // The offline label already carries the queued count; avoid duplicating it
  if (status.queueCount > 0 && status.status !== 'offline') {
    template.push({
      label: `${status.queueCount} invoice${status.queueCount === 1 ? '' : 's'} queued for retry`,
      enabled: false
    });
  }

  const sourceName = cfg.sourceFolder ? path.basename(cfg.sourceFolder) : null;
  template.push({
    label: watching ? `Watching ${sourceName || 'inbox'}` : 'Watching paused',
    enabled: false
  });

  template.push({ type: 'separator' });
  template.push({ label: 'Show FiscalBridge', click: () => showWindow() });
  template.push({ label: 'Hide FiscalBridge', click: () => hideWindow() });
  template.push({ type: 'separator' });
  template.push({
    label: watching ? 'Pause watching' : 'Resume watching',
    click: () => toggleWatchingFromTray()
  });
  template.push({
    label: 'Open fiscalised folder',
    enabled: !!cfg.targetFolder,
    click: () => openFolder(cfg.targetFolder)
  });
  template.push({
    label: 'Open errors folder',
    enabled: !!cfg.errorFolder,
    click: () => openFolder(cfg.errorFolder)
  });
  template.push({ label: 'Open log file', click: () => openLogFile() });

  const dayState = trayDayState(device, cfg);
  template.push({ type: 'separator' });
  template.push({
    label: dayState === 'failed' ? 'Retry close fiscal day' : 'Close fiscal day',
    enabled: dayState === 'open' || dayState === 'failed',
    click: () => requestFiscalDayAction('close')
  });
  template.push({
    label: 'Open fiscal day',
    enabled: dayState === 'closed',
    click: () => requestFiscalDayAction('open')
  });

  if (autoUpdater && app.isPackaged) {
    template.push({ type: 'separator' });
    template.push({ label: 'Check for updates', click: () => checkForUpdatesFromTray() });
  }

  template.push({ type: 'separator' });
  template.push({
    label: 'Quit FiscalBridge',
    click: () => {
      app.isQuitting = true;
      app.quit();
    }
  });

  return Menu.buildFromTemplate(template);
}

function updateTrayPresentation() {
  if (!tray) return;
  const statusIndicator = getStatusIndicator();

  try {
    const icon = getTrayIcon(statusIndicator.getStatus());
    if (icon && !icon.isEmpty()) tray.setImage(icon);
  } catch (e) {
    log.warn('[Tray] Failed to update icon:', e.message);
  }

  try {
    tray.setToolTip(statusIndicator.getTooltip());
  } catch (e) {
    log.warn('[Tray] Failed to update tooltip:', e.message);
  }

  const s = statusIndicator.getStatusObject();
  const d = s.deviceInfo || {};
  const cfg = readConfig();
  const signature = JSON.stringify([
    s.status, s.queueCount, d.companyName, d.deviceId, d.fiscalDay,
    trayDayState(d, cfg),
    activeWatchers.has('source'), cfg.sourceFolder, cfg.targetFolder, cfg.errorFolder,
    !!autoUpdater && app.isPackaged
  ]);
  if (signature === lastTraySignature) return;
  lastTraySignature = signature;

  try {
    tray.setContextMenu(buildTrayMenu());
  } catch (e) {
    log.warn('[Tray] Failed to update menu:', e.message);
  }
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) {
    log.warn('[Tray] Icon not found at', iconPath, '- using default');
  }

  try {
    tray = new Tray(fs.existsSync(iconPath) ? getTrayIcon('unknown') : null);
  } catch (e) {
    log.error('[Tray] Failed to create tray:', e.message);
    return;
  }

  // Double-click to show window
  tray.on('double-click', () => showWindow());

  updateTrayPresentation();

  const statusIndicator = getStatusIndicator();
  statusIndicator.on('statusUpdated', updateTrayPresentation);
  statusIndicator.on('deviceInfoUpdated', updateTrayPresentation);
}


function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function hideWindow() {
  if (mainWindow) {
    mainWindow.hide();
  }
}

app.whenReady().then(() => {
  profileStore.init(app.getPath('userData'));
  enterpriseQueue.setBaseDir(app.getPath('userData'));
  fiscalChain.init(app.getPath('userData'));
  createWindow();
  startOfflineMaintenance();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
