const chokidar = require('chokidar');
const path = require('path');
const { parseA4InvoicePdfAsync } = require('./a4InvoiceParser');
const { listPrinters, printPdf } = require('./printPdf');

function startWatcher(folder, printerName) {
  const printer = printerName || (listPrinters()[0] || null);
  console.log('Watching folder:', folder);
  console.log('Printer:', printer || '(system default)');

  const watcher = chokidar.watch(folder, { ignored: /(^|[\/\\])\../, persistent: true, awaitWriteFinish: { stabilityThreshold: 500 } });

  watcher.on('add', async (filePath) => {
    if (!/\.pdf$/i.test(filePath)) return;
    try {
      console.log('New PDF detected:', filePath);
      const invoice = await parseA4InvoicePdfAsync(filePath);
      console.log('Parsed:', invoice.invoiceNumber, invoice.totals.grandTotal);
      printPdf(filePath, printer);
      console.log('Printed:', filePath);
    } catch (err) {
      console.error('Failed to process/print', filePath, err && err.message ? err.message : err);
    }
  });

  return watcher;
}

module.exports = { startWatcher };

if (require.main === module) {
  const folder = process.argv[2];
  const printer = process.argv[3];
  if (!folder) {
    console.error('Usage: node watchAndPrint.js <folder> [printerName]');
    process.exit(1);
  }
  startWatcher(folder, printer);
}