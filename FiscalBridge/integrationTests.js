const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseA4InvoicePdfAsync, toFiscalStackInvoice } = require('./a4InvoiceParser');
const { enqueue, syncQueue, health } = require('./enterpriseQueue');
const { recordSync, getMetrics } = require('./observability');
const { secureDelete } = require('./compliance');

async function main() {
  console.log('Running integration tests...');

  const sample = process.argv[2] || process.env.A4_SAMPLE_PDF;
  if (!sample) {
    console.log('Parser: SKIPPED (pass a PDF path as argv[2] or set A4_SAMPLE_PDF)');
  } else {
    const inv = await parseA4InvoicePdfAsync(sample);
    assert.ok(inv.invoiceNumber, 'invoice number missing');
    const mapped = toFiscalStackInvoice(inv);
    assert.strictEqual(mapped.invoiceNumber, inv.invoiceNumber);
    console.log('Parser + schema mapping: OK');
  }

  const h = health();
  assert.ok(typeof h.queueDepth === 'number');
  console.log('Queue health: OK');

  recordSync(1, 0);
  const m = getMetrics();
  assert.ok(m.syncSuccess >= 1);
  console.log('Observability: OK');

  const tmp = path.join(os.tmpdir(), `fiscalbridge-secure-delete-${Date.now()}.txt`);
  fs.writeFileSync(tmp, 'secret');
  assert.strictEqual(secureDelete(tmp), true);
  assert.ok(!fs.existsSync(tmp));
  console.log('Compliance secure delete: OK');

  console.log('All integration tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
