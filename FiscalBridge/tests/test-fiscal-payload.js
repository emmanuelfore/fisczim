'use strict';
const parserEngine = require('../parserEngine');
const profile = require('../profiles/memp-tax-invoice@1.json');
const fs = require('fs');

const testSrc = fs.readFileSync('./tests/test-memp-invoice.js', 'utf8');
const m = testSrc.match(/const INVOICE_TEXT = `([\s\S]*?)`;/);
const parsed = parserEngine.parseWithProfile(m[1], profile);
const fiscal = parserEngine.toFiscalInvoice(parsed);

console.log('=== FISCAL PAYLOAD (sent to /api/zimra/fiscalise) ===');
console.log(JSON.stringify(fiscal, null, 2));

let pass = true;
function assert(cond, msg) {
  if (!cond) { console.error('  FAIL:', msg); pass = false; }
  else console.log('  OK:', msg);
}

assert(fiscal !== null, 'fiscal is not null');
assert(fiscal.invoiceNumber === 'INV0011686', 'invoiceNumber = INV0011686 (got ' + fiscal.invoiceNumber + ')');
assert(fiscal.date === '2026-10-22', 'date = 2026-10-22 (got ' + fiscal.date + ')');
assert(fiscal.currency === 'USD', 'currency = USD (LSL mapped to USD) (got ' + fiscal.currency + ')');
assert(Array.isArray(fiscal.items) && fiscal.items.length === 2, '2 items (got ' + fiscal.items.length + ')');

const i1 = fiscal.items[0];
assert(i1.name.includes('PREPACK DOUBLE') || i1.name.includes('BRACKET'), 'item1 name contains description');
assert(i1.quantity === 3, 'item1 quantity = 3 (got ' + i1.quantity + ')');
assert(i1.unitPrice === 15.65, 'item1 unitPrice = 15.65 (got ' + i1.unitPrice + ')');
assert(i1.taxType === 'STANDARD', 'item1 taxType = STANDARD (got ' + i1.taxType + ')');
assert(i1.taxInclusive === false, 'item1 taxInclusive = false');
assert(i1.sku === 'RPREM19OAK20', 'item1 sku = RPREM19OAK20 (got ' + i1.sku + ')');

const i2 = fiscal.items[1];
assert(i2.quantity === 1, 'item2 quantity = 1');
assert(i2.unitPrice === 113.04, 'item2 unitPrice = 113.04 (got ' + i2.unitPrice + ')');
assert(i2.sku === '003569', 'item2 sku = 003569 (got ' + i2.sku + ')');

// buyer — Cash Customer has no VAT/TIN so buyer block should be minimal or absent
// (no vatNumber / tin since they don't pass digit checks)
if (fiscal.buyer) {
  assert(fiscal.buyer.name === 'Cash Customer', 'buyer.name = Cash Customer (got ' + fiscal.buyer.name + ')');
  assert(!fiscal.buyer.vatNumber, 'buyer.vatNumber absent for Cash Customer (no 9-digit VAT)');
}

console.log('\n' + (pass ? '✅ All assertions passed' : '❌ Some assertions failed'));
