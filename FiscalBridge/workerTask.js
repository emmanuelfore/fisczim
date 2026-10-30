const { parentPort } = require('worker_threads');
const { parseA4InvoicePdfAsync } = require('./a4InvoiceParser');

parentPort.on('message', async ({ task, data }) => {
  try {
    if (task === 'parsePdf') {
      const result = await parseA4InvoicePdfAsync(data.filePath);
      parentPort.postMessage({ ok: true, result });
    } else {
      parentPort.postMessage({ ok: false, error: 'Unknown task' });
    }
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e.message });
  }
});
