import { Pool } from 'pg';
import { ZimraDevice } from './server/zimra';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query('SELECT * FROM companies WHERE id = 109');
  const company = res.rows[0];

  const device = new ZimraDevice({
    deviceId: company.fdms_device_id,
    deviceSerialNo: company.fdms_device_serial_no || 'UNKNOWN',
    activationKey: company.fdms_api_key,
    privateKey: company.zimra_private_key,
    certificate: company.zimra_certificate,
    baseUrl: 'https://fdmsapi.zimra.co.zw'
  });

  // GlobalNo 9 exact payload (failing with RCPT020)
  const receiptData = {
    receiptType: 'FiscalInvoice' as any,
    receiptCurrency: 'USD',
    receiptGlobalNo: 9,
    receiptCounter: 6,
    fiscalDayNo: 4,
    receiptDate: '2026-09-01T08:47:33',
    receiptLinesTaxInclusive: true,
    receiptTotal: 3322.49,
    receiptTaxes: [] as any[],
    receiptLines: [
      { taxID: 515, taxCode: 'A', taxPercent: 15.5, receiptLineNo: 1, receiptLineName: 'Peak', receiptLineType: 'Sale' as any, receiptLinePrice: 0.15, receiptLineTotal: 1988.79, receiptLineHSCode: '27160000', receiptLineQuantity: 13258.6 },
      { taxID: 515, taxCode: 'A', taxPercent: 15.5, receiptLineNo: 2, receiptLineName: 'Std', receiptLineType: 'Sale' as any, receiptLinePrice: 0.09, receiptLineTotal: 503.08, receiptLineHSCode: '27160000', receiptLineQuantity: 5589.77 },
      { taxID: 515, taxCode: 'A', taxPercent: 15.5, receiptLineNo: 3, receiptLineName: 'Debt Repayment', receiptLineType: 'Sale' as any, receiptLinePrice: 0.05, receiptLineTotal: 662.93, receiptLineHSCode: '00000000', receiptLineQuantity: 13258.6 },
      { taxID: 515, taxCode: 'A', taxPercent: 15.5, receiptLineNo: 4, receiptLineName: 'Debt Repayment', receiptLineType: 'Sale' as any, receiptLinePrice: 0.03, receiptLineTotal: 167.69, receiptLineHSCode: '00000000', receiptLineQuantity: 5589.67 },
    ],
    receiptPayments: [{ moneyTypeCode: 'Cash' as any, paymentAmount: 3322.49 }],
  };

  // Use device's internal prepareReceipt + signature generation
  // We'll call submitReceipt with a fake network so it doesn't actually submit
  // Instead let's access the private method via cast
  const prepared = (device as any).prepareReceipt(receiptData);
  
  console.log('=== Prepared Receipt ===');
  console.log('receiptTotal:', prepared.receiptTotal);
  console.log('receiptTaxes:', JSON.stringify(prepared.receiptTaxes, null, 2));
  
  // Reconstruct stringToSign exactly as zimra.ts does
  const sortedTaxes = [...prepared.receiptTaxes].sort((a: any, b: any) => {
    if (a.taxID !== b.taxID) return a.taxID - b.taxID;
    return (a.taxCode || '').localeCompare(b.taxCode || '');
  });

  const concatenatedTaxes = sortedTaxes.map((t: any) => {
    let percentStr = '';
    if (t.taxID !== 1 && t.taxPercent !== undefined && t.taxPercent !== null) {
      percentStr = t.taxPercent.toFixed(2);
    }
    const amount = Math.round(t.taxAmount * 100);
    const sales = Math.round(t.salesAmountWithTax * 100);
    const part = `${t.taxCode || ''}${percentStr}${amount}${sales}`;
    console.log(`Tax part: taxID=${t.taxID} taxCode=${t.taxCode} percent=${percentStr} amount_cents=${amount} sales_cents=${sales} → "${part}"`);
    return part;
  }).join('');

  const deviceIdStr = parseInt(company.fdms_device_id).toString();
  const rType = prepared.receiptType.toUpperCase();
  const rCurr = prepared.receiptCurrency.toUpperCase();
  const rGlobal = prepared.receiptGlobalNo;
  const rDate = prepared.receiptDate;
  const rTotal = Math.round(prepared.receiptTotal * 100);

  const stringToSign = `${deviceIdStr}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${concatenatedTaxes}`;
  const computedHash = crypto.createHash('sha256').update(stringToSign, 'utf8').digest('base64');

  console.log('\n=== Signature Verification ===');
  console.log('stringToSign:', stringToSign);
  console.log('rTotal (cents):', rTotal);
  console.log('Computed hash:', computedHash);
  console.log('Submitted hash: hkq8RsWyRTdGl9ILsAIXZ0KSMfWcqH0NuGo13EMGnhA=');
  console.log('Match:', computedHash === 'hkq8RsWyRTdGl9ILsAIXZ0KSMfWcqH0NuGo13EMGnhA=');

  process.exit(0);
}
run().catch(console.error);
