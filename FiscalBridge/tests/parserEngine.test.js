/**
 * parserEngine tests — run with: npm run test:parser
 * Pure Node `assert`, no dependencies. Uses the bundled starter profiles in ../profiles.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../parserEngine');

const profDir = path.join(__dirname, '..', 'profiles');
const profiles = fs.readdirSync(profDir).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(profDir, f), 'utf8')));
const memp = profiles.find(p => p.id === 'memp-tax-invoice');
const fixture = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✕', name, '\n     ', e.message); }
}

console.log('parserEngine');

// ── Helpers ──────────────────────────────────────────────────────────────────
test('parseDate: DD/MM/YYYY without timezone shift', () => {
  assert.strictEqual(E.parseDate('01/03/2026'), '2026-03-01');
  assert.strictEqual(E.parseDate('31/12/26'), '2026-12-31');
});
test('parseDate: month names', () => {
  assert.strictEqual(E.parseDate('29 Oct 2026'), '2026-10-29');
  assert.strictEqual(E.parseDate('October 5, 2026'), '2026-10-05');
});
test('parseDate: rejects invalid dates', () => {
  assert.strictEqual(E.parseDate('31/02/2026'), null);
  assert.strictEqual(E.parseDate('garbage'), null);
});
test('parseMoney: symbols, thousands, negatives', () => {
  assert.strictEqual(E.parseMoney('M 1,234.50', { currency_symbol: 'M' }), 1234.5);
  assert.strictEqual(E.parseMoney('(10.00)'), -10);
});

// ── Detection ────────────────────────────────────────────────────────────────
test('detect: original invoice → memp-tax-invoice', () => {
  const { profile } = E.detect(fixture('memp-original.txt'), profiles);
  assert.strictEqual(profile.id, 'memp-tax-invoice');
});
test('detect: copy invoice → memp-copy-tax-invoice', () => {
  const { profile } = E.detect(fixture('memp-copy.txt'), profiles);
  assert.strictEqual(profile.id, 'memp-copy-tax-invoice');
});
test('detect: unrelated text → no profile', () => {
  const { profile, confidence } = E.detect('Hello world receipt', profiles);
  assert.strictEqual(profile, null);
  assert.strictEqual(confidence, 0);
});
test('parseAutoDetect: no match → needs_review', () => {
  const r = E.parseAutoDetect('nothing here', profiles);
  assert.strictEqual(r.status, 'needs_review');
  assert.strictEqual(E.toFiscalInvoice(r), null);
});

// ── Full parse (original) ────────────────────────────────────────────────────
const out = E.parseWithProfile(fixture('memp-original.txt'), memp, 'memp-original.txt');

test('header fields', () => {
  assert.strictEqual(out.invoice_number, 'INV0010564');
  assert.strictEqual(out.date, '2026-10-01');
  assert.strictEqual(out.due_date, '2026-10-31');
  assert.strictEqual(out.is_copy, false);
});
test('customer party via anchor_bottom', () => {
  assert.strictEqual(out.customer.name, 'Acme Holdings (Pvt) Ltd');
  assert.strictEqual(out.customer.vat_no, '220123456');
});
test('line items incl. multi-line description', () => {
  assert.strictEqual(out.line_items.length, 3);
  assert.strictEqual(out.line_items[0].code, 'WID001');
  assert.strictEqual(out.line_items[0].description, 'Widget Large Blue edition');
  assert.strictEqual(out.line_items[0].qty, 2);
  assert.strictEqual(out.line_items[2].vat_pct, 0);
  assert.strictEqual(out.line_items[2].vat_class, 'exempt');
});
test('totals: TOTAL not confused with SUB-TOTAL / Excl. Total', () => {
  assert.strictEqual(out.totals.total_excl, 650);
  assert.strictEqual(out.totals.vat, 75);
  assert.strictEqual(out.totals.sub_total, 725);
  assert.strictEqual(out.totals.grand_total, 725);
});
test('bank: "Account No" does not swallow "Account Name"', () => {
  const bank = out.supplier && out.supplier.bank;
  assert.ok(bank, 'bank block parsed');
  assert.strictEqual(bank.account_name, 'MEMP Trading');
  assert.strictEqual(bank.account_number, '0123456789');
  assert.strictEqual(bank.branch_code, '4105');
});
test('validation passes with high confidence', () => {
  const fails = out.validation_warnings.filter(w => w.severity === 'fail');
  assert.deepStrictEqual(fails, []);
  assert.ok(out.confidence >= 0.9, 'confidence ' + out.confidence);
});

// ── Copy detection ───────────────────────────────────────────────────────────
test('is_copy honours profile.copy_markers', () => {
  const t = fixture('memp-copy.txt');
  const copyProf = profiles.find(p => p.id === 'memp-copy-tax-invoice');
  assert.strictEqual(E.parseWithProfile(t, copyProf).is_copy, true);
  assert.strictEqual(E.parseWithProfile(t, { ...copyProf, copy_markers: ['NOPE'] }).is_copy, false);
});

// ── Multi-line auto mode ─────────────────────────────────────────────────────
test("multiline 'auto': prefix line merges into following item", () => {
  const prof = { ...memp, line_items: { ...memp.line_items, multiline_products: 'auto' } };
  const text = ['Description  Qty', '-----', 'Premium', 'GADGET  1.00  10.00  0.00  15.00  10.00  11.50',
    'extra info', 'Total:  11.50'].join('\n');
  const items = E.runItems(text.split('\n'), prof);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].description, 'Premium GADGET extra info');
});

// ── Tax mapping + fiscal conversion ──────────────────────────────────────────
test('tax.code_map adds tax_id/tax_code; toFiscalInvoice maps shape', () => {
  const prof = { ...memp, tax: { ...memp.tax, code_map: { '15': { tax_id: 1, tax_code: 'A' }, '0': { tax_id: 2, tax_code: 'E' } } } };
  const r = E.parseWithProfile(fixture('memp-original.txt'), prof);
  const f = E.toFiscalInvoice(r);
  assert.strictEqual(f.invoiceNumber, 'INV0010564');
  assert.strictEqual(f.issueDate, '2026-10-01');
  assert.strictEqual(f.total, '725.00');
  assert.strictEqual(f.taxAmount, '75.00');
  assert.strictEqual(f.subtotal, '650.00');
  assert.strictEqual(f.items.length, 3);
  assert.strictEqual(f.items[0].taxCode, 'A');
  assert.strictEqual(f.items[2].taxCode, 'E');
  assert.strictEqual(f.items[0].unitPrice, '100.00');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
