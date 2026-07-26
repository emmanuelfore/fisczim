const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const log = require('electron-log');
const ConfigManager = require('./configManager');

// Configure Logger
log.transports.file.level = "info";
log.info('[FiscalBridge] App starting...');

const DEV_URL = 'http://localhost:5001/fiscalbridge';
const PROD_URL = 'https://fiscalstack.co.zw/fiscalbridge';
const LOCAL_FILE = path.join(__dirname, 'index.html');

// Store active watchers and configuration
const activeWatchers = new Map();
let mainWindow = null;
let configManager = null;

/**
 * Resolve the URL to load in the main window
 */
function resolveStartUrl() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      if (config.startUrl) {
        return config.startUrl;
      }
    }
  } catch (err) {
    console.error('[resolveStartUrl] Failed to read config.json:', err.message);
  }

  if (process.env.ELECTRON_START_URL) {
    return process.env.ELECTRON_START_URL;
  }

  // Load local file by default for standalone Electron app
  return LOCAL_FILE;
}

/**
 * Read/write configuration
 */
function readConfig() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[readConfig] Failed to read config.json:', err.message);
  }
  return {};
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
function registerIpcHandlers() {
  // Configuration management
  ipcMain.handle('get-config', () => {
    return readConfig();
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
        existingWatcher.close();
      }

      // Create new watcher
      const watcher = chokidar.watch(sourceFolder, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      });

      watcher.on('add', (filePath) => {
        log.info(`[FileWatch] New receipt file: ${filePath}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('receipt-file-added', {
            filePath,
            sourceFolder,
            targetFolder
          });
        }
      });

      watcher.on('error', (error) => {
        log.error(`[FileWatch] Error: ${error}`);
      });

      activeWatchers.set('source', watcher);
      return { success: true, watching: true };
    } catch (err) {
      log.error(`[start-folder-watch] Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('stop-folder-watch', async () => {
    try {
      const watcher = activeWatchers.get('source');
      if (watcher) {
        watcher.close();
        activeWatchers.delete('source');
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // File operations
  ipcMain.handle('read-receipt-file', async (_event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('move-receipt-file', async (_event, sourcePath, targetPath) => {
    try {
      // Ensure target directory exists
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Copy to target with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const targetFileName = `REVMAX_${timestamp}.txt`;
      const finalTargetPath = path.join(targetDir, targetFileName);

      fs.copyFileSync(sourcePath, finalTargetPath);
      
      // Delete source
      fs.unlinkSync(sourcePath);
      
      return { success: true, targetPath: finalTargetPath };
    } catch (err) {
      log.error(`[move-receipt-file] Error: ${err.message}`);
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
  ipcMain.handle('get-fiscal-config', () => {
    return configManager.getConfig();
  });

  ipcMain.handle('update-fiscal-config', async (_event, updates) => {
    return configManager.updateConfig(updates);
  });

  ipcMain.handle('get-device-status', () => {
    return configManager.getDeviceStatus();
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

  ipcMain.handle('set-vat-rates', async (_event, vatA, vatB, vatC, vatD, vatE, vatF) => {
    return configManager.setVatRates(vatA, vatB, vatC, vatD, vatE, vatF);
  });

  ipcMain.handle('get-vat-rate', async (_event, type) => {
    return configManager.getVatRate(type);
  });

  // Folder/File browsing dialogs
  ipcMain.handle('browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Folder'
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('browse-file', async (_event, filters = []) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Select File',
      filters: filters
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('print-receipt', async (_event, html, printerName) => {
    return new Promise((resolve, reject) => {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false }
      });

      const timeout = setTimeout(() => {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.destroy();
        }
        reject('Print timeout');
      }, 10000);

      printWindow.webContents.on('did-finish-load', () => {
        clearTimeout(timeout);
        printWindow.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: printerName || undefined,
          marginsType: 0,
          pageSize: {
            width: 80000,
            height: 800000
          }
        }, (success, errorType) => {
          if (!printWindow.isDestroyed()) {
            printWindow.destroy();
          }
          if (success) {
            resolve(true);
          } else {
            reject(errorType);
          }
        });
      });

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    });
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
function createWindow() {
  Menu.setApplicationMenu(null);

  // Initialize config manager
  configManager = new ConfigManager(app.getPath('userData'));

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

  registerIpcHandlers();

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

  mainWindow.on('closed', () => {
    // Clean up watchers
    activeWatchers.forEach(watcher => watcher.close());
    activeWatchers.clear();
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();
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
