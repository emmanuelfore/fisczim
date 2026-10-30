const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow } = require('electron');

const RENDER_TIMEOUT_MS = 30000;
const PRINT_TIMEOUT_MS = 30000;

function readState(win) {
  return win.webContents.executeJavaScript(
    "document.documentElement.dataset.pdfPrintState || ''",
  ).catch(() => '');
}

function waitForRender(win) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    const poll = async () => {
      if (win.isDestroyed()) {
        reject(new Error('PDF print window closed unexpectedly'));
        return;
      }
      const state = await readState(win);
      if (state === 'ready') {
        resolve();
        return;
      }
      if (state === 'error') {
        const message = await win.webContents.executeJavaScript(
          "document.documentElement.dataset.pdfPrintError || ''",
        ).catch(() => '');
        reject(new Error(message || 'Failed to render PDF'));
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('Timed out rendering PDF'));
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

/**
 * Renders a PDF to canvas pages in a hidden window and prints it through
 * Chromium, which is the only path that honours deviceName/silent printing on
 * every platform (loading a PDF URL directly prints a blank page).
 */
function printPdfFile(filePath, printerName) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });

    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (!win.isDestroyed()) win.destroy();
      if (error) reject(error);
      else resolve(true);
    };

    const url = pathToFileURL(path.join(__dirname, 'pdfPrint.html'));
    url.searchParams.set('file', filePath);

    win.loadURL(url.href).catch((error) => finish(error));
    win.on('closed', () => finish(new Error('PDF print window closed unexpectedly')));

    waitForRender(win)
      .then(() => {
        const options = {
          silent: true,
          printBackground: true,
          marginsType: 0,
          pageSize: 'A4',
        };
        if (printerName && printerName.trim() !== '') options.deviceName = printerName;

        win.webContents.print(options, (success, errorType) => {
          finish(success ? null : new Error(errorType || 'Print failed'));
        });

        setTimeout(() => finish(new Error('Print timed out')), PRINT_TIMEOUT_MS);
      })
      .catch((error) => finish(error));
  });
}

module.exports = { printPdfFile };
