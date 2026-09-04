import forge from 'node-forge';

/**
 * Parses a PEM formatted private key and returns a node-forge private key object.
 */
export function getPrivateKey(pem: string): forge.pki.rsa.PrivateKey {
    try {
        return forge.pki.privateKeyFromPem(pem);
    } catch (error) {
        console.error("Failed to parse private key:", error);
        throw new Error("Invalid ZIMRA Private Key provided for offline signing.");
    }
}

/**
 * Computes the MD5 hash of the given string, returning it as a hex string.
 * This is used for the receiptDeviceSignature hash.
 */
export function getHash(data: string): string {
    const md = forge.md.md5.create();
    md.update(data, 'utf8');
    return md.digest().toHex();
}

/**
 * Computes the RSA-SHA256 signature of the given string using the private key.
 * Returns the base64 encoded signature.
 */
export function signData(data: string, privateKeyPem: string): string {
    const privateKey = getPrivateKey(privateKeyPem);
    const md = forge.md.sha256.create();
    md.update(data, 'utf8');
    const signature = privateKey.sign(md);
    return forge.util.encode64(signature);
}

/**
 * Re-implementation of ZIMRA's Verification Code calculation for QR codes.
 * Takes the base64 signature and returns the MD5 hex snippet.
 */
export function calculateVerificationCode(signature: string): string {
    const hash = getHash(signature);
    let str = "";
    for (let i = 0; i < hash.length; i++) {
        const chr = hash.charAt(i);
        if (chr >= '0' && chr <= '9') {
            str += chr;
        } else {
            str += chr.toUpperCase();
        }
    }
    // Spec: get characters at even indices, up to 16 characters
    let resultStr = "";
    for (let i = 0; i < str.length; i += 2) {
        if (resultStr.length < 16) {
            resultStr += str.charAt(i);
        }
    }
    return resultStr;
}

/**
 * Resolves the ZIMRA taxCode for a taxID using the same mapping as the
 * server's prepareReceipt (server/zimra.ts). The taxCode is part of the
 * canonical signature string (spec 13.2.1) — omitting it makes the device
 * signature mismatch and ZIMRA rejects the receipt with RCPT020.
 */
export function resolveTaxCode(taxID: number): string {
    if (taxID === 3) return 'A'; // Standard
    if (taxID === 2) return 'B'; // Zero Rated
    if (taxID === 1) return 'C'; // Exempt
    if (taxID === 4) return 'E'; // Other
    return 'A'; // Fallback
}

/**
 * Generates the offline signature and sequence numbers for an invoice.
 */
export function generateOfflineFiscalData(params: {
    receiptData: any; // Prepared receipt data matching ZIMRA spec format
    previousReceiptHash: string | null;
    deviceId: string;
    privateKeyPem: string;
}) {
    const { receiptData, previousReceiptHash, deviceId, privateKeyPem } = params;

    // "Taxes are ordered by taxID in ascending order and taxCode in alphabetical order"
    const sortedTaxes = [...(receiptData.receiptTaxes || [])].sort((a, b) => {
        if (a.taxID !== b.taxID) return a.taxID - b.taxID;
        return (a.taxCode || '').localeCompare(b.taxCode || '');
    });

    const concatenatedTaxes = sortedTaxes.map(t => {
        let percentStr = "";
        if (t.taxID !== 1 && t.taxPercent !== undefined && t.taxPercent !== null) {
            percentStr = t.taxPercent.toFixed(2);
        }
        const amount = Math.round(t.taxAmount * 100);
        const sales = Math.round(t.salesAmountWithTax * 100);
        // ZIMRA spec 13.2.1: taxCode || taxPercent || taxAmount || salesAmountWithTax.
        // The server always assigns a taxCode to the payload taxes, so ZIMRA
        // recomputes the canonical hash WITH the taxCode.
        return `${t.taxCode || resolveTaxCode(t.taxID)}${percentStr}${amount}${sales}`;
    }).join('');

    const rType = receiptData.receiptType.toUpperCase();
    const rCurr = receiptData.receiptCurrency.toUpperCase();
    const rGlobal = receiptData.receiptGlobalNo;
    const rDate = receiptData.receiptDate;
    const rTotal = Math.round(receiptData.receiptTotal * 100);

    let stringToSign = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${concatenatedTaxes}`;
    if (previousReceiptHash) {
        stringToSign += previousReceiptHash;
    }

    const hash = getHash(stringToSign);
    const signature = signData(stringToSign, privateKeyPem);
    const verificationCode = calculateVerificationCode(signature);

    return {
        hash,
        signature,
        verificationCode,
        stringToSign
    };
}
