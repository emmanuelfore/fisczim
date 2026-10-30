const assert = require('assert');
const { parseA4InvoicePdfAsync } = require('./a4InvoiceParser');
const { listPrinters } = require('./printPdf');

async function main() {
  console.log('Running basic tests...');

  const sample = process.argv[2] || process.env.A4_SAMPLE_PDF;
  if (!sample) {
    console.log('Parser: SKIPPED (pass a PDF path as argv[2] or set A4_SAMPLE_PDF)');
  } else {
    const inv = await parseA4InvoicePdfAsync(sample);
    assert.ok(inv.invoiceNumber, 'invoice number missing');
    assert.ok(inv.items.length > 0, 'no line items parsed');
    console.log('Parser: OK', inv.invoiceNumber, inv.items.length, 'items');
  }

  const printers = listPrinters();
  console.log('Printers found:', printers.length);
  console.log('All basic tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
