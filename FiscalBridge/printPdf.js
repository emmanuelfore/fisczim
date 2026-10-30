const { execFileSync } = require('child_process');
const os = require('os');

// Windows removed wmic from default installs (11 24H2), so enumerate through
// PowerShell instead.
function listWindowsPrinters() {
  const out = execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
    { encoding: 'utf8', windowsHide: true },
  );
  return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function listPrinters() {
  const platform = os.platform();
  try {
    if (platform === 'win32') return listWindowsPrinters();
    const out = execFileSync('lpstat', ['-p'], { encoding: 'utf8' });
    return out.split('\n').map((l) => (l.match(/^printer\s+(\S+)/) || [])[1]).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Standalone/CLI printing only. The Electron app prints PDFs through
 * pdfPrintWindow.js so the configured printer and the real result are honoured.
 */
function printPdf(filePath, printerName) {
  const platform = os.platform();
  if (platform === 'linux' || platform === 'darwin') {
    const args = printerName ? ['-d', printerName, filePath] : [filePath];
    execFileSync('lp', args, { stdio: 'inherit' });
    return true;
  }
  if (platform === 'win32') {
    // Best effort: depends on the PDF handler exposing a PrintTo/Print verb.
    const command = printerName
      ? `Start-Process -FilePath ${psQuote(filePath)} -Verb PrintTo -ArgumentList ${psQuote(`"${printerName}"`)}`
      : `Start-Process -FilePath ${psQuote(filePath)} -Verb Print`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'inherit',
      windowsHide: true,
    });
    return true;
  }
  throw new Error('Unsupported platform: ' + platform);
}

module.exports = { listPrinters, printPdf };
