/**
 * Palladium receipt profile tests.
 *
 * These run against the real PDFs in "../paladium samples" using the same
 * pdfjs text extraction path as the app.
 *
 * Run with: npm run test:palladium
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../parserEngine');
const { extractTextFromPdfAsync } = require('../a4InvoiceParser');

const profDir = path.join(__dirname, '..', 'profiles');
const profiles = fs.readdirSync(profDir).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(profDir, f), 'utf8')));

const sampleDir = path.join(__dirname, '..', 'paladium samples');
const TAX_PDF = path.join(sampleDir, 'Eximium Premium Brands (Pvt) Ltd IN-000000027_20261016034644.pdf');
const CN_PDF  = path.join(sampleDir, 'Eximium Premium Brands (Pvt) Ltd CN-000000001_20261016034820.pdf');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✕', name, '\n     ', e.message); }
}

(async () => {
  console.log('palladium profiles');

  if (!fs.existsSync(TAX_PDF) || !fs.existsSync(CN_PDF)) {
    console.log('  ! sample PDFs not found in "paladium samples" — skipping');
    process.exit(0);
  }

  const taxText = await extractTextFromPdfAsync(TAX_PDF);
  const cnText  = await extractTextFromPdfAsync(CN_PDF);

  await test('invoice PDF detects the combined Palladium profile', () => {
    const { profile, confidence } = E.detect(taxText, profiles);
    assert.ok(profile, 'a profile should match');
    assert.strictEqual(profile.id, 'palladium-fiscal');
    assert.strictEqual(confidence, 1);
  });

  await test('credit-note PDF detects the combined Palladium profile', () => {
    const { profile, confidence } = E.detect(cnText, profiles);
    assert.ok(profile, 'a profile should match');
    assert.strictEqual(profile.id, 'palladium-fiscal');
    assert.strictEqual(confidence, 1);
  });

  const taxOut = E.parseAutoDetect(taxText, profiles, TAX_PDF);
  const cnOut  = E.parseAutoDetect(cnText, profiles, CN_PDF);

  await test('combined profile auto-detects invoice vs credit note', () => {
    assert.strictEqual(taxOut.document_type, 'Tax Invoice');
    assert.strictEqual(taxOut.transaction_type, 'FiscalInvoice');
    assert.strictEqual(cnOut.document_type, 'Credit Note');
    assert.strictEqual(cnOut.transaction_type, 'CreditNote');
  });

  await test('invoice header, parties and bank details', () => {
    assert.strictEqual(taxOut.status, 'ok');
    assert.strictEqual(taxOut.invoice_number, 'IN-000000027');
    assert.strictEqual(taxOut.date, '2026-10-16');
    assert.strictEqual(taxOut.reference, 'test');
    assert.strictEqual(taxOut.currency, 'USD');

    assert.strictEqual(taxOut.supplier.name, 'Eximium Premium Brands (Pvt) Ltd');
    assert.strictEqual(taxOut.supplier.tin, '2002533710');
    assert.strictEqual(taxOut.supplier.vat_no, '220451470');
    assert.strictEqual(taxOut.supplier.address, '84 West Road, Avondale, Harare Harare');
    assert.strictEqual(taxOut.supplier.bank.account_name, 'EXIMIUM PREMIUM BRANDS PVT LTD');
    assert.strictEqual(taxOut.supplier.bank.bank_name, 'CBZ Borrowdale Branch');
    assert.strictEqual(taxOut.supplier.bank.account_number, '27808160027');

    assert.strictEqual(taxOut.customer.name, 'Sample Inv');
  });

  await test('invoice line item maps the Palladium columns', () => {
    assert.strictEqual(taxOut.line_items.length, 1);
    const item = taxOut.line_items[0];
    assert.strictEqual(item.hs_code, '85434000');
    assert.strictEqual(item.code, 'VOL018BLU');
    assert.strictEqual(item.description, 'V18X-BLUEBERRY');
    assert.strictEqual(item.qty, 1);
    assert.strictEqual(item.unit, 'EA');
    assert.strictEqual(item.unit_price_excl, 1);
    assert.strictEqual(item.vat_amount, 0.16);
    // 0.16 VAT on 1.00 is the printed cent rounding of the 15.5% standard rate
    // (VAT rose from 15% to 15.5% on 1 January 2026).
    assert.strictEqual(item.vat_pct, 15.5);
    assert.strictEqual(item.vat_class, 'standard');
    assert.strictEqual(item.total_excl, 1);
    assert.strictEqual(item.total_incl, 1.16);
  });

  await test('invoice totals and fiscal payload', () => {
    assert.deepStrictEqual(taxOut.totals, {
      total_excl: 1,
      discount: 0,
      delivery: 0,
      vat: 0.16,
      grand_total: 1.16,
    });
    assert.deepStrictEqual(taxOut.validation_warnings, []);

    const fiscal = E.toFiscalInvoice(taxOut);
    assert.strictEqual(fiscal.invoiceNumber, 'IN-000000027');
    assert.strictEqual(fiscal.date, '2026-10-16');
    assert.strictEqual(fiscal.currency, 'USD');
    assert.strictEqual(fiscal.transactionType, 'FiscalInvoice');
    assert.strictEqual(fiscal.items.length, 1);
    assert.strictEqual(fiscal.items[0].name, 'V18X-BLUEBERRY');
    assert.strictEqual(fiscal.items[0].sku, 'VOL018BLU');
    assert.strictEqual(fiscal.items[0].quantity, 1);
    assert.strictEqual(fiscal.items[0].unitPrice, 1);
    assert.strictEqual(fiscal.items[0].taxType, 'STANDARD');
    // The parsed rate must travel with the line; without it the fiscal receipt
    // was signed at a guessed 15%.
    assert.strictEqual(fiscal.items[0].vatPct, 15.5);
    // Printed VAT and total are carried through so the fiscal receipt matches
    // the invoice the customer holds.
    assert.strictEqual(fiscal.taxAmount, 0.16);
    assert.strictEqual(fiscal.total, 1.16);
    assert.strictEqual(fiscal.buyer.name, 'Sample Inv');
  });

  await test('credit note header, reason and negative amounts', () => {
    assert.strictEqual(cnOut.status, 'ok');
    assert.strictEqual(cnOut.invoice_number, 'CN-000000001');
    assert.strictEqual(cnOut.reason, 'DAMAGED');
    assert.strictEqual(cnOut.reference, 'REV-IN-000000027');
    assert.strictEqual(cnOut.line_items.length, 1);
    assert.strictEqual(cnOut.line_items[0].qty, -1);
    assert.strictEqual(cnOut.line_items[0].total_excl, -1);
    assert.strictEqual(cnOut.line_items[0].total_incl, -1.16);
    assert.strictEqual(cnOut.totals.total_excl, -1);
    assert.strictEqual(cnOut.totals.vat, -0.16);
    assert.strictEqual(cnOut.totals.grand_total, -1.16);
    assert.deepStrictEqual(cnOut.validation_warnings, []);

    const fiscal = E.toFiscalInvoice(cnOut);
    assert.strictEqual(fiscal.transactionType, 'CreditNote');
    assert.strictEqual(fiscal.invoiceNumber, 'CN-000000001');
  });

  // Real Palladium invoices print gross line prices: 20 × 8.35 = 167.00 with
  // 22.41 VAT already inside the 167.00. The fiscal payload must carry the
  // gross price and mark the lines tax-inclusive; otherwise ZIMRA adds another
  // 15.5% and the receipt total balloons to 416.25 (invoice 70494).
  const inclusiveText = [
    'Fiscal Tax Invoice',
    'Number: IN-000000081',
    'Date: 11/14/2026',
    'Reference: IN-000000081',
    'Buyer Details:',
    'Customer Name : Walk-in Customer',
    'Line      HS Code             Item       Description     Quantity       Unit            Price Inc                     VAT                 Total Inc',
    '1        85434000          BLZ065BLI    B65X-BLUEBERRY ON ICE   20    EA    8.35    22.41    167.00',
    '2        85434000          BLZ100COC    B10X- COCONUT   20    EA    10.00    26.84    200.00',
    'Subtotal: USD 317.75',
    'Discount: USD 0.00',
    'Delivery: USD 0.00',
    'VAT Total : USD 49.25',
    'Invoice Total: USD 367.00',
  ].join('\n');
  const palladiumProfile = profiles.find(p => p.id === 'palladium-fiscal');
  const inclusiveOut = E.parseWithProfile(inclusiveText, palladiumProfile);

  await test('inclusive invoice keeps gross prices and derives 15.5% VAT', () => {
    assert.strictEqual(inclusiveOut.price_basis, 'inclusive');
    const [first, second] = inclusiveOut.line_items;
    assert.strictEqual(first.unit_price_incl, 8.35);
    assert.strictEqual(first.vat_amount, 22.41);
    assert.strictEqual(first.vat_pct, 15.5);
    assert.strictEqual(first.total_incl, 167);
    assert.strictEqual(first.total_excl, 144.59);
    assert.strictEqual(second.total_incl, 200);
    assert.strictEqual(second.total_excl, 173.16);
    assert.deepStrictEqual(inclusiveOut.validation_warnings, []);
  });

  await test('inclusive fiscal payload uses the printed gross total, not gross + tax', () => {
    const fiscal = E.toFiscalInvoice(inclusiveOut, {
      priceBasis: 'auto',
      standardRate: 15.5,
      taxRates: [0, 5, 15.5],
    });
    assert.strictEqual(fiscal.priceBasis, 'inclusive');
    assert.strictEqual(fiscal.taxInclusive, true);
    assert.strictEqual(fiscal.total, 367);
    assert.strictEqual(fiscal.taxAmount, 49.25);
    assert.strictEqual(fiscal.items[0].unitPrice, 8.35);
    assert.strictEqual(fiscal.items[0].vatPct, 15.5);
    assert.strictEqual(fiscal.items[0].taxInclusive, true);
    assert.strictEqual(fiscal.items[1].unitPrice, 10);
  });

  await test('a 13.42% rate derived from inclusive cents is corrected to the live standard', () => {
    const broken = {
      profile: 'palladium-fiscal@1',
      profile_tax: { vat_standard_pct: 15.5, price_basis: 'inclusive' },
      price_basis: 'inclusive',
      invoice_number: 'IN-000000081',
      date: '2026-11-14',
      transaction_type: 'FiscalInvoice',
      line_items: [{
        description: 'B65X-BLUEBERRY ON ICE',
        qty: 20,
        unit_price_incl: 8.35,
        unit_price_excl: 7.23,
        total_incl: 167,
        total_excl: 144.59,
        vat_amount: 22.41,
        vat_pct: 13.42,
        vat_class: 'other',
      }],
      totals: { vat: 49.25, grand_total: 367 },
    };
    const fiscal = E.toFiscalInvoice(broken, { standardRate: 15.5, taxRates: [0, 5, 15.5] });
    assert.strictEqual(fiscal.items[0].vatPct, 15.5);
    assert.strictEqual(fiscal.items[0].unitPrice, 8.35);
    assert.strictEqual(fiscal.items[0].taxInclusive, true);
    assert.strictEqual(fiscal.total, 367);
    assert.strictEqual(fiscal.taxAmount, 49.25);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
