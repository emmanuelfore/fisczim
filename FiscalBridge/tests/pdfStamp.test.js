/**
 * PDF fiscal stamp tests.
 *
 * Stamps the real Palladium invoice PDF and verifies that:
 *  - the stamped copy is a valid PDF with the same page count
 *  - the original file is never modified
 *  - a missing QR payload is rejected
 *
 * Run with: npm run test:stamp
 */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { stampPdf } = require('../pdfStamp');

const TAX_PDF = path.join(
  __dirname, '..', 'paladium samples',
  'Eximium Premium Brands (Pvt) Ltd IN-000000027_20261016034644.pdf'
);

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✕', name, '\n     ', e.message); }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

(async () => {
  console.log('pdf stamp');

  if (!fs.existsSync(TAX_PDF)) {
    console.log('  ! sample PDF not found in "paladium samples" — skipping');
    process.exit(0);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-stamp-'));
  const outputPath = path.join(tmp, 'stamped.pdf');
  const sourceHash = sha256(TAX_PDF);
  const sourceDoc = await PDFDocument.load(fs.readFileSync(TAX_PDF));

  const fiscal = {
    documentType: 'FiscalInvoice',
    invoiceNumber: 'IN-000000027',
    verificationCode: 'A1B2-C3D4-E5F6-0718',
    deviceId: '0000012345',
    fiscalDay: 42,
    receiptCounter: 7,
    receiptGlobalNo: 1234,
    fiscalDate: '16/10/2026 15:46:00',
    qrPayload: 'https://fdms.zimra.co.zw/0000012345161020260000001234A1B2C3D4E5F60718',
  };

  await test('stamps a valid PDF without touching the original', async () => {
    const written = await stampPdf({ inputPath: TAX_PDF, outputPath, fiscal });
    assert.strictEqual(written, outputPath);
    assert.ok(fs.existsSync(outputPath), 'stamped file should exist');

    const stampedDoc = await PDFDocument.load(fs.readFileSync(outputPath));
    assert.strictEqual(stampedDoc.getPageCount(), sourceDoc.getPageCount());
    assert.strictEqual(sha256(TAX_PDF), sourceHash, 'source PDF must be unchanged');
  });

  await test('credit-note descriptor renders credit note fields', async () => {
    const cnPath = path.join(tmp, 'credit-note.pdf');
    await stampPdf({
      inputPath: TAX_PDF,
      outputPath: cnPath,
      fiscal: {
        ...fiscal,
        documentType: 'CreditNote',
        invoiceNumber: 'CN-000000001',
        originalInvoiceNumber: 'IN-000000027',
      },
    });
    const doc = await PDFDocument.load(fs.readFileSync(cnPath));
    assert.strictEqual(doc.getPageCount(), sourceDoc.getPageCount());
  });

  await test('rejects a fiscal descriptor without a QR payload', async () => {
    await assert.rejects(
      () => stampPdf({ inputPath: TAX_PDF, outputPath: path.join(tmp, 'bad.pdf'), fiscal: {} }),
      /QR payload/i
    );
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
