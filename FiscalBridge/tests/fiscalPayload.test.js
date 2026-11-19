/**
 * Fiscal payload tests.
 *
 * The renderer is a browser bundle, but the fiscal payload builders are pure
 * functions. They are extracted from renderer.js and evaluated with a stubbed
 * `config` so the exact ZIMRA wire format can be asserted.
 *
 * Regression covered here: every STANDARD line used to be sent with a guessed
 * 15% TAXR because the rate parsed from the document never travelled with the
 * item. Zimbabwe's standard rate is 15.5% from 1 January 2026.
 *
 * Run with: npm run test:payload
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
const start = source.indexOf('function _standardVatRate');
const escStart = source.indexOf('function _escXml');
const end = escStart < 0 ? -1 : source.indexOf('\n}', escStart) + 2;
if (start < 0 || end <= start) {
  console.error('Could not locate the fiscal payload helpers in renderer.js');
  process.exit(1);
}

const stub = 'var liveTaxConfig = global.__FB_TAX_CONFIG || null;\n' +
  'var config = { vatA: global.__FB_VAT_A };\n' +
  source.slice(start, end) +
  '\nmodule.exports = { _standardVatRate, _itemVatRate, _buildItemsXML };';

function loadWithVatA(vatA, taxConfig) {
  global.__FB_VAT_A = vatA;
  global.__FB_TAX_CONFIG = taxConfig || null;
  const m = new Module('fiscal-payload-extract', module);
  m.filename = path.join(__dirname, 'fiscal-payload-extract.js');
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(stub, m.filename);
  return m.exports;
}

// The duplicate guard keys documents by transaction type + invoice number, so
// a Palladium reprint (new PDF, same number) is recognised.
const idStart = source.indexOf('function _invoiceIdentity');
const idEnd = source.indexOf('\n}', idStart) + 2;
const identity = (() => {
  const m = new Module('fiscal-identity-extract', module);
  m.filename = path.join(__dirname, 'fiscal-identity-extract.js');
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(source.slice(idStart, idEnd) + '\nmodule.exports = { _invoiceIdentity };', m.filename);
  return m.exports;
})();

// Old stored documents have no taxInclusive flag; reconcile their printed
// totals before resending them.
const infStart = source.indexOf('function _inferTaxInclusive');
const infEnd = source.indexOf('\n}', infStart) + 2;
const infer = (() => {
  const m = new Module('fiscal-inclusive-extract', module);
  m.filename = path.join(__dirname, 'fiscal-inclusive-extract.js');
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(source.slice(infStart, infEnd) + '\nmodule.exports = { _inferTaxInclusive };', m.filename);
  return m.exports;
})();

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✕', name, '\n     ', e.message); }
}

console.log('fiscal payload');

const percent = loadWithVatA('15.5');
const fraction = loadWithVatA('0.155');
const stale = loadWithVatA('0.15');
const live = loadWithVatA('0.15', { source: 'getconfig', standardRate: 15.5, rates: [0, 5, 15.5] });

test('config.vatA is normalised from percentage or fraction', () => {
  assert.strictEqual(percent._standardVatRate(), 15.5);
  assert.strictEqual(fraction._standardVatRate(), 15.5);
  assert.strictEqual(stale._standardVatRate(), 15);
});

test('config.vatA is not trusted over the parsed line rate', () => {
  // The Palladium sample prints 0.16 VAT on 1.00 — 15.5% rounded.
  const xml = stale._buildItemsXML([
    { name: 'V18X-BLUEBERRY', quantity: 1, unitPrice: 1, taxType: 'STANDARD', vatPct: 15.5 },
  ]);
  assert.ok(xml.includes('<TAXR>15.5</TAXR>'), xml);
  assert.ok(!xml.includes('<TAXR>15</TAXR>'), xml);
});

test('the live GetConfig rate overrides the local fallback', () => {
  assert.strictEqual(live._standardVatRate(), 15.5);
  assert.strictEqual(live._itemVatRate({ taxType: 'STANDARD', vatPct: 15.5 }), 15.5);
});

test('an unconfigured rate derived from inclusive cents is never sent', () => {
  // 22.41 VAT on 167.00 gross reads as 13.42% of the gross, but the only
  // configured standard rate is 15.5%. 70494 was signed at 13.42% and ZIMRA
  // rejected it with RCPT025 "Invalid tax is used".
  assert.strictEqual(live._itemVatRate({ taxType: 'STANDARD', vatPct: 13.42 }), 15.5);
  const xml = live._buildItemsXML([
    { name: 'B65X-BLUEBERRY ON ICE', quantity: 20, unitPrice: 8.35, taxType: 'STANDARD', vatPct: 13.42 },
  ]);
  assert.ok(xml.includes('<TAXR>15.5</TAXR>'), xml);
  assert.ok(xml.includes('<AMT>167.00</AMT>'), xml);
});

test('configured non-standard rates (zero, exempt) are preserved', () => {
  assert.strictEqual(live._itemVatRate({ taxType: 'STANDARD', vatPct: 0 }), 0);
  assert.strictEqual(live._itemVatRate({ taxType: 'EXEMPT', vatPct: 15.5 }), 0);
});

test('lines without a parsed rate fall back to the configured standard rate', () => {
  const xml = percent._buildItemsXML([
    { name: 'Item', quantity: 2, unitPrice: 10, taxType: 'STANDARD' },
  ]);
  assert.ok(xml.includes('<TAXR>15.5</TAXR>'), xml);
  assert.ok(xml.includes('<AMT>20.00</AMT>'), xml);
});

test('exempt lines are always zero rated, even if a rate leaks in', () => {
  const xml = percent._buildItemsXML([
    { name: 'Exempt item', quantity: 1, unitPrice: 5, taxType: 'EXEMPT', vatPct: 15.5 },
  ]);
  assert.ok(xml.includes('<TAXR>0</TAXR>'), xml);
});

test('a fractional per-line rate is treated as a percentage', () => {
  assert.strictEqual(percent._itemVatRate({ taxType: 'STANDARD', vatPct: 0.155 }), 15.5);
});

test('item names are XML escaped', () => {
  const xml = percent._buildItemsXML([
    { name: 'A & B <co>', quantity: 1, unitPrice: 1, taxType: 'STANDARD', vatPct: 15.5 },
  ]);
  assert.ok(xml.includes('A &amp; B &lt;co&gt;'), xml);
});

test('stored documents without a flag infer inclusive pricing from their totals', () => {
  // Invoice 70494 as stored by the buggy build: 20 × 8.35 = 167.00 per line,
  // printed total 367.00 and VAT 49.25 already inside it.
  const legacy = {
    items: [
      { quantity: 20, unitPrice: 8.35 },
      { quantity: 20, unitPrice: 10.00 },
    ],
    total: 367.00,
    taxAmount: 49.25,
  };
  assert.strictEqual(infer._inferTaxInclusive(legacy, legacy.items), true);

  const exclusive = {
    items: [{ quantity: 20, unitPrice: 8.35 }],
    total: 192.89,
    taxAmount: 25.89,
  };
  // total == lineSum + VAT (167 + 25.89 = 192.89) means the prices are net.
  assert.strictEqual(infer._inferTaxInclusive(exclusive, exclusive.items), false);

  const exactNet = {
    items: [{ quantity: 20, unitPrice: 8.35 }],
    total: 191.28,
    taxAmount: 24.28,
  };
  // total == lineSum + VAT (167 + 24.28 = 191.28) is the exclusive signature.
  assert.strictEqual(infer._inferTaxInclusive(exactNet, exactNet.items), false);

  assert.strictEqual(infer._inferTaxInclusive({ taxInclusive: false, total: 367, taxAmount: 49.25 }, legacy.items), false);
});

test('duplicate identity is the transaction type plus a normalised number', () => {
  assert.strictEqual(
    identity._invoiceIdentity({ invoiceNumber: ' in-000000027 ', transactionType: 'FiscalInvoice' }).key,
    'FiscalInvoice::IN-000000027'
  );
  // A missing transaction type defaults to an invoice, so old records still match.
  assert.strictEqual(
    identity._invoiceIdentity({ invoiceNumber: 'IN-000000027' }).key,
    'FiscalInvoice::IN-000000027'
  );
  assert.notStrictEqual(
    identity._invoiceIdentity({ invoiceNumber: 'CN-000000001', transactionType: 'CreditNote' }).key,
    identity._invoiceIdentity({ invoiceNumber: 'CN-000000001', transactionType: 'FiscalInvoice' }).key
  );
  assert.strictEqual(identity._invoiceIdentity({ invoiceNumber: '   ' }), null);
  assert.strictEqual(identity._invoiceIdentity(null), null);
});

test('VAT-inclusive pricing is the default in settings and the wizard', () => {
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // Main-process config migration and parse options default to inclusive.
  assert.ok(mainSrc.includes("c.priceBasis = c.priceBasis || 'inclusive'"));
  assert.ok(mainSrc.includes("priceBasis: cfg.priceBasis || 'inclusive'"));
  assert.ok(!mainSrc.includes("cfg.priceBasis || 'auto'"));

  // Renderer migration, legacy fallback, and both form loaders default to inclusive.
  assert.ok(rendererSrc.includes("c.priceBasis = c.priceBasis || 'inclusive'"));
  assert.ok(rendererSrc.includes("const configured = config.priceBasis || 'inclusive'"));
  assert.ok(rendererSrc.includes("config.priceBasis || 'inclusive'"));
  assert.ok(!rendererSrc.includes("priceBasis || 'auto'"));

  // Both selects render inclusive first and mark it selected.
  assert.strictEqual((htmlSrc.match(/<option value="inclusive" selected>/g) || []).length, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
