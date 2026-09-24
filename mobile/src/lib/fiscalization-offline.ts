import forge from 'node-forge';

// Native JSI crypto (react-native-quick-crypto) — RSA in native code (~ms).
// Optional: present after `expo install` + a dev-client/EAS rebuild. When it
// is missing (older binary), we fall back to node-forge automatically.
let nativeCrypto: any = null;
try {
    const qc = require('react-native-quick-crypto');
    nativeCrypto = qc?.default || qc;
} catch {
    nativeCrypto = null;
}

function bytesToB64(bytes: Uint8Array): string {
    const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += table[(n >> 18) & 63] + table[(n >> 12) & 63] + table[(n >> 6) & 63] + table[n & 63];
    }
    const rem = bytes.length - i;
    if (rem === 1) {
        const n = bytes[i] << 16;
        out += table[(n >> 18) & 63] + table[(n >> 12) & 63] + "==";
    } else if (rem === 2) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += table[(n >> 18) & 63] + table[(n >> 12) & 63] + table[(n >> 6) & 63] + "=";
    }
    return out;
}

/** Native RSA-SHA256 sign. Returns base64 or null when unavailable/failed. */
function nativeSign(data: string, privateKeyPem: string): string | null {
    try {
        if (!nativeCrypto?.sign) return null;
        const key: any = { key: privateKeyPem };
        if (nativeCrypto.constants?.RSA_PKCS1_PADDING !== undefined) {
            key.padding = nativeCrypto.constants.RSA_PKCS1_PADDING;
        }
        const out = nativeCrypto.sign("sha256", data, key);
        if (!out) return null;
        if (typeof out.toString === "function") {
            try {
                const b64 = out.toString("base64");
                if (typeof b64 === "string" && b64.length > 0) return b64;
            } catch { /* fall through to manual encoding */ }
        }
        const bytes = out instanceof Uint8Array ? out : Uint8Array.from(out as any);
        return bytesToB64(bytes);
    } catch (e) {
        console.warn("[FiscalSign] Native sign failed, using forge fallback:", (e as any)?.message);
        return null;
    }
}

let parsedKeyCache: { pem: string; key: forge.pki.rsa.PrivateKey } | null = null;

/**
 * Parses a PEM formatted private key and returns a node-forge private key object.
 */
export function getPrivateKey(pem: string): forge.pki.rsa.PrivateKey {
    if (parsedKeyCache && parsedKeyCache.pem === pem) {
        return parsedKeyCache.key;
    }
    try {
        const key = forge.pki.privateKeyFromPem(pem);
        parsedKeyCache = { pem, key };
        return key;
    } catch (error) {
        console.error("Failed to parse private key:", error);
        throw new Error("Invalid ZIMRA Private Key provided for offline signing.");
    }
}

/**
 * Pre-warms the RSA key cache by parsing the PEM in the background.
 * Call this as soon as the fiscal context (private key) is loaded so that
 * subsequent signing calls (checkout) are instant — the slow part is only
 * the first parse of the PEM string.
 */
export function prewarmKeyCache(pem: string): void {
    if (!pem || (parsedKeyCache && parsedKeyCache.pem === pem)) return;
    // Run async so it doesn't block the caller
    setTimeout(() => {
        try {
            getPrivateKey(pem);
            console.log('[FiscalSign] Key cache pre-warmed ✓');
        } catch (e) {
            console.warn('[FiscalSign] Key pre-warm failed:', e);
        }
    }, 0);
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
 * Fast path: native JSI crypto (non-blocking, ~ms). Fallback: node-forge.
 */
export function signData(data: string, privateKeyPem: string): string {
    const native = nativeSign(data, privateKeyPem);
    if (native) return native;
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
