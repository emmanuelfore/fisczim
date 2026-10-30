/**
 * Quick smoke test for the memp-tax-invoice profile against the real invoice text.
 * Run: node FiscalBridge/tests/test-memp-invoice.js
 */
'use strict';

const parserEngine = require('../parserEngine');
const profile = require('../profiles/memp-tax-invoice@1.json');

// Simulated pdftotext -layout output of INV0011686
// (matches the column structure pdf-parse / pdftotext produces)
const INVOICE_TEXT = `Tax Invoice

Memp Hardware & Furniture Fittings

VAT No:  50024074                                          Number:   INV0011686
                                                           Date:     22/10/2026
Along Main South Road 1    Along Main South Road 1         Page:     1/1
Borokhoaneng               Borokhoaneng                   Reference:
Maseru 100                 Maseru 100                     Sales Rep: Setumo Mphana
Lesotho                    Lesotho                        Due Date  31/10/2026
Online quotations: mathulo@mempholdings.co.ls +266 5909 0209  Overall Discount%: 0.00%

Cash Customer
Customer VAT No:

Description                                   Quantity  Excl. Price   Disc %    VAT %   Exclusive Total  Inclusive Total
RPREM19OAK20 - PREPACK DOUBLE
BRACKET WITH LID OAK PER 20                          3      M15.65    0.00%    15.00%         M46.95          M53.99
003569 - BORING BIT                                  1     M113.04    0.00%    15.00%        M113.04         M130.00

BANKING DETAILS:                                            Total Discount:     M0.00
Bank: Standard Lesotho Bank                                Total Exclusive:  M159.99
Account Name: Memp Hardware                                    Total VAT:     M24.00
Account Number: 9080010336291                                  Sub Total:    M183.99
Branch Name: Maseru
Branch Code: 06-06-67
Swift Code: SBICLSMX
Bring proof of deposit or transfer of funds.               Total:  M183.99

THANK YOU FOR YOUR BUSINESS. PLEASE CALL AGAIN.
`;

const result = parserEngine.parseWithProfile(INVOICE_TEXT, profile, 'INV0011686.pdf');

console.log('\n=== PARSE RESULT ===');
console.log('Invoice #:  ', result.invoice_number);
console.log('Date:       ', result.date);
console.log('Due Date:   ', result.due_date);
console.log('Sales Rep:  ', result.sales_rep);
console.log('Currency:   ', result.currency);
console.log('Supplier:   ', result.supplier?.name, '| VAT:', result.supplier?.vat_no);
console.log('Customer:   ', result.customer?.name, '| VAT:', result.customer?.vat_no);
console.log('');
console.log('Line Items:');
result.line_items.forEach((it, i) => {
  console.log(`  [${i+1}] code=${it.code} desc="${it.description}" qty=${it.qty} price=${it.unit_price_excl} vat%=${it.vat_pct} excl=${it.total_excl} incl=${it.total_incl}`);
});
console.log('');
console.log('Totals:', result.totals);
console.log('');
console.log('Validation:', result.validation_warnings.length, 'issues', result.validation_warnings);
console.log('Confidence:', result.confidence);

// Assertions
let pass = true;
function assert(cond, msg) {
  if (!cond) { console.error('  FAIL:', msg); pass = false; }
  else console.log('  OK:', msg);
}

assert(result.invoice_number === 'INV0011686', `invoice_number = INV0011686 (got ${result.invoice_number})`);
assert(result.date === '2026-10-22', `date = 2026-10-22 (got ${result.date})`);
assert(result.due_date === '2026-10-31', `due_date = 2026-10-31 (got ${result.due_date})`);
assert(result.supplier?.name === 'Memp Hardware & Furniture Fittings', `supplier name (got "${result.supplier?.name}")`);
assert(result.supplier?.vat_no === '50024074', `supplier vat_no (got ${result.supplier?.vat_no})`);
assert(result.customer?.name === 'Cash Customer', `customer name (got "${result.customer?.name}")`);
assert(result.line_items.length === 2, `2 line items (got ${result.line_items.length})`);

const item1 = result.line_items[0];
assert(item1.code === 'RPREM19OAK20', `item1 code = RPREM19OAK20 (got ${item1.code})`);
assert(item1.qty === 3, `item1 qty = 3 (got ${item1.qty})`);
assert(item1.unit_price_excl === 15.65, `item1 price = 15.65 (got ${item1.unit_price_excl})`);
assert(item1.total_excl === 46.95, `item1 excl total = 46.95 (got ${item1.total_excl})`);
assert(item1.total_incl === 53.99, `item1 incl total = 53.99 (got ${item1.total_incl})`);

const item2 = result.line_items[1];
assert(item2.code === '003569', `item2 code = 003569 (got ${item2.code})`);
assert(item2.total_excl === 113.04, `item2 excl total = 113.04 (got ${item2.total_excl})`);

assert(result.totals.total_excl === 159.99, `totals.total_excl = 159.99 (got ${result.totals.total_excl})`);
assert(result.totals.vat === 24.00, `totals.vat = 24.00 (got ${result.totals.vat})`);
assert(result.totals.sub_total === 183.99, `totals.sub_total = 183.99 (got ${result.totals.sub_total})`);
assert(result.totals.grand_total === 183.99, `totals.grand_total = 183.99 (got ${result.totals.grand_total})`);

const hasFails = result.validation_warnings.filter(w => w.severity === 'fail');
assert(hasFails.length === 0, `No validation failures (got ${hasFails.length})`);

console.log('\n' + (pass ? '✅ All assertions passed' : '❌ Some assertions failed'));
