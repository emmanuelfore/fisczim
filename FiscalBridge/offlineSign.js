const crypto = require('crypto');
const forge = require('node-forge');

function getHash(data) {
  return crypto.createHash('md5').update(data, 'utf8').digest('hex');
}

function signData(data, privateKeyPem) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data, 'utf8');
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

function calculateVerificationCode(signature) {
  const hash = getHash(signature);
  let str = '';
  for (let i = 0; i < hash.length; i++) {
    const chr = hash.charAt(i);
    if (chr >= '0' && chr <= '9') str += chr;
    else str += chr.toUpperCase();
  }
  let resultStr = '';
  for (let i = 0; i < str.length; i += 2) {
    if (resultStr.length < 16) resultStr += str.charAt(i);
  }
  return resultStr;
}

function resolveTaxCode(taxID) {
  if (taxID === 3) return 'A';
  if (taxID === 2) return 'B';
  if (taxID === 1) return 'C';
  if (taxID === 4) return 'E';
  return 'A';
}

function generateOfflineFiscalData({ receiptData, previousReceiptHash, deviceId, privateKeyPem }) {
  const sortedTaxes = [...(receiptData.receiptTaxes || [])].sort((a, b) => {
    if (a.taxID !== b.taxID) return a.taxID - b.taxID;
    return (a.taxCode || '').localeCompare(b.taxCode || '');
  });

  const concatenatedTaxes = sortedTaxes.map((t) => {
    let percentStr = '';
    if (t.taxID !== 1 && t.taxPercent !== undefined && t.taxPercent !== null) {
      percentStr = Number(t.taxPercent).toFixed(2);
    }
    const amount = Math.round(t.taxAmount * 100);
    const sales = Math.round(t.salesAmountWithTax * 100);
    return `${t.taxCode || resolveTaxCode(t.taxID)}${percentStr}${amount}${sales}`;
  }).join('');

  const rType = receiptData.receiptType.toUpperCase();
  const rCurr = receiptData.receiptCurrency.toUpperCase();
  const rGlobal = receiptData.receiptGlobalNo;
  const rDate = receiptData.receiptDate;
  const rTotal = Math.round(receiptData.receiptTotal * 100);

  let stringToSign = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${concatenatedTaxes}`;
  if (previousReceiptHash) stringToSign += previousReceiptHash;

  const hash = crypto.createHash('sha256').update(stringToSign, 'utf8').digest('hex');
  const signature = signData(stringToSign, privateKeyPem);
  const verificationCode = calculateVerificationCode(signature);

  return { hash, signature, verificationCode, stringToSign };
}

module.exports = { generateOfflineFiscalData, signData, calculateVerificationCode, getHash, resolveTaxCode };