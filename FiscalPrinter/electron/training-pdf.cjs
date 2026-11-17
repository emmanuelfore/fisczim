/**
 * Electron headless helper: HTML → A4 PDF.
 *
 *   electron electron/training-pdf.cjs <input.html> <output.pdf>
 *
 * Used by `npm run training:pdf`. Exits non-zero on failure so the CLI can
 * report a useful error.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const htmlPath = args[0] ? path.resolve(args[0]) : "";
const pdfPath = args[1] ? path.resolve(args[1]) : "";

function fail(message) {
  console.error(`[training-pdf] ${message}`);
  app.exit(1);
}

if (!htmlPath || !pdfPath) {
  fail("Usage: electron electron/training-pdf.cjs <input.html> <output.pdf>");
}

if (!fs.existsSync(htmlPath)) {
  fail(`HTML file not found: ${htmlPath}`);
}

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
        javascript: false,
        sandbox: true,
        contextIsolation: true,
      },
    });

    await win.loadFile(htmlPath);

    const pdf = await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: "default" },
    });

    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    fs.writeFileSync(pdfPath, pdf);
    console.log(`[training-pdf] wrote ${pdfPath}`);
  } catch (err) {
    console.error(`[training-pdf] ${err.message}`);
    app.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
});
