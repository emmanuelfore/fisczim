/**
 * ZIMRA offline signing primitives.
 *
 * Must stay byte-for-byte aligned with the server (server/lib/fiscal-signatures.ts
 * and server/zimra.ts) or the printed QR/verification code will not match the
 * receipt FDMS eventually records.
 */
const crypto = require('crypto');

const ZIMRA_QR_BASE = {
  production: 'https://fdms.zimra.co.zw/',
  test: 'https://fdmstest.zimra.co.zw/',
};

function normalizeSignedAmountToCents(value) {
  return Math.round(Number(value) * 100).toString();
}

function formatTaxPercentForSignature(taxID, taxPercent) {
  if (taxID === 1 || taxPercent === undefined || taxPercent === null) return '';
  return Number(taxPercent).toFixed(2);
}

function buildReceiptTaxesSignatureString(taxes) {
  return [...(taxes || [])]
    .sort((a, b) => {
      if (a.taxID !== b.taxID) return a.taxID - b.taxID;
      return (a.taxCode || '').localeCompare(b.taxCode || '');
    })
    .map((tax) => {
      const percent = formatTaxPercentForSignature(tax.taxID, tax.taxPercent);
      const amount = normalizeSignedAmountToCents(tax.taxAmount);
      const sales = normalizeSignedAmountToCents(tax.salesAmountWithTax);
      return `${tax.taxCode || ''}${percent}${amount}${sales}`;
    })
    .join('');
}

function buildReceiptDeviceSignatureInput({
  deviceId,
  receiptType,
  receiptCurrency,
  receiptGlobalNo,
  receiptDate,
  receiptTotal,
  receiptTaxes,
  previousReceiptHash,
}) {
  const base = [
    String(parseInt(String(deviceId), 10)),
    String(receiptType).toUpperCase(),
    String(receiptCurrency).toUpperCase(),
    String(receiptGlobalNo),
    receiptDate,
    normalizeSignedAmountToCents(receiptTotal),
    buildReceiptTaxesSignatureString(receiptTaxes),
  ].join('');
  return previousReceiptHash ? `${base}${previousReceiptHash}` : base;
}

function calculateVerificationCode(signatureBase64) {
  const signatureBytes = Buffer.from(signatureBase64, 'base64');
  const hex = signatureBytes.toString('hex').toUpperCase();
  const md5 = crypto.createHash('md5').update(hex).digest('hex').toUpperCase();
  return `${md5.slice(0, 4)}-${md5.slice(4, 8)}-${md5.slice(8, 12)}-${md5.slice(12, 16)}`;
}

function buildQrCode(signatureBase64, deviceId, receiptGlobalNo, receiptDate, environment) {
  const signatureBytes = Buffer.from(signatureBase64, 'base64');
  const code = crypto.createHash('md5').update(signatureBytes).digest('hex').toUpperCase().slice(0, 16);
  const [year, month, day] = String(receiptDate).slice(0, 10).split('-');
  const qrDate = `${day}${month}${year}`;
  const base = environment === 'production' ? ZIMRA_QR_BASE.production : ZIMRA_QR_BASE.test;
  return `${base}${String(deviceId).padStart(10, '0')}${qrDate}${String(receiptGlobalNo).padStart(10, '0')}${code}`;
}

/** ZIMRA receipt date in Africa/Harare: YYYY-MM-DDTHH:mm:ss (no timezone). */
function formatZimraDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

function generateOfflineFiscalData({ receiptData, previousReceiptHash, deviceId, privateKeyPem, environment }) {
  const stringToSign = buildReceiptDeviceSignatureInput({
    deviceId,
    receiptType: receiptData.receiptType,
    receiptCurrency: receiptData.receiptCurrency,
    receiptGlobalNo: receiptData.receiptGlobalNo,
    receiptDate: receiptData.receiptDate,
    receiptTotal: receiptData.receiptTotal,
    receiptTaxes: receiptData.receiptTaxes,
    previousReceiptHash,
  });

  const hash = crypto.createHash('sha256').update(stringToSign, 'utf8').digest('base64');
  const signer = crypto.createSign('SHA256');
  signer.update(stringToSign, 'utf8');
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64');
  const verificationCode = calculateVerificationCode(signature);
  const qrCode = buildQrCode(
    signature,
    deviceId,
    receiptData.receiptGlobalNo,
    receiptData.receiptDate,
    environment || receiptData.environment,
  );

  return { hash, signature, verificationCode, qrCode, stringToSign };
}

module.exports = {
  generateOfflineFiscalData,
  buildReceiptDeviceSignatureInput,
  buildReceiptTaxesSignatureString,
  calculateVerificationCode,
  buildQrCode,
  formatZimraDate,
  normalizeSignedAmountToCents,
  ZIMRA_QR_BASE,
};
