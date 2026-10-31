const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');

/**
 * Render an HTML document (fiscal copy with QR, logo and counters) to a PDF in
 * `targetDir`. A4 documents paginate themselves; thermal slips are sized to
 * their rendered content so the file has no blank tail.
 */
async function writeFiscalPdf(html, targetDir, baseName, format) {
  if (!html || !targetDir) throw new Error('Missing document content or target folder');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    let pageSize = 'A4';
    if (format !== 'a4') {
      const size = await win.webContents.executeJavaScript(
        '({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })'
      );
      const toInches = (px) => Math.max(0.5, px / 96);
      pageSize = { width: toInches(size.w), height: toInches(size.h) };
    }

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize,
      margins: { marginType: 'none' },
    });

    const safe = String(baseName || 'fiscal-document')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'fiscal-document';

    let fileName = `${safe}.pdf`;
    let counter = 1;
    while (fs.existsSync(path.join(targetDir, fileName))) {
      fileName = `${safe} (${counter++}).pdf`;
    }

    const finalPath = path.join(targetDir, fileName);
    fs.writeFileSync(finalPath, pdf);
    return finalPath;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { writeFiscalPdf };
