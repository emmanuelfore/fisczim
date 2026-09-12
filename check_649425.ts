import crypto from 'crypto';

const rType = 'FISCALINVOICE';
const rCurr = 'USD';
const rGlobal = 1808;
const rDate = '2026-09-01T09:16:28';
const rTotal = 500; // 5 * 100

// Taxes
// Tax A: ID 515, percent 15.5, taxAmount 0.13, salesAmountWithTax 1
const taxA_code = 'A';
const taxA_percent = '15.50';
const taxA_amount = 13; // 0.13 * 100
const taxA_sales = 100; // 1 * 100
const taxA_str = `${taxA_code}${taxA_percent}${taxA_amount}${taxA_sales}`;

// Tax B: ID 2, code B, percent 0, taxAmount 0, salesAmountWithTax 4
const taxB_code = 'B';
const taxB_percent = '0.00';
const taxB_amount = 0;
const taxB_sales = 400; // 4 * 100
const taxB_str = `${taxB_code}${taxB_percent}${taxB_amount}${taxB_sales}`;

// Note: sorted by taxID asc (2 then 515)
const concatenatedTaxes = taxB_str + taxA_str;

const stringToSign = `35685${rType}${rCurr}${rGlobal}${rDate}${rTotal}${concatenatedTaxes}`;
const hash = crypto.createHash('sha256').update(stringToSign).digest('base64');

console.log('stringToSign:', stringToSign);
console.log('hash:', hash);
console.log('submitted:', 'Lle2xkSFAvscjVn9TP4fNgzZnr9dhX5fQNWMqZJLwsA=');
