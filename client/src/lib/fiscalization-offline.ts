/**
 * Desktop / Web POS — local fiscal signing WITHOUT node-forge.
 *
 * node-forge does RSA in pure JS (~70ms for 2048-bit on desktop V8, seconds
 * on low-end devices, and it blocks the UI thread). This module instead uses
 * the platform-native WebCrypto API (async, ~1-5ms, non-blocking):
 *   - RSA-SHA256 (RSASSA-PKCS1-v1_5) via crypto.subtle.sign
 *   - a minimal DER reader to convert PKCS#1 / PKCS#8 PEM keys to JWK
 *   - a compact pure-JS MD5 (only used for short hash/verification-code
 *     inputs — MD5 itself was never the bottleneck)
 *
 * A lazy node-forge fallback is kept for non-secure contexts where
 * crypto.subtle is unavailable (practically never: localhost and https are
 * both secure contexts).
 */

interface RsaParams {
    n: Uint8Array;
    e: Uint8Array;
    d: Uint8Array;
    p: Uint8Array;
    q: Uint8Array;
    dp: Uint8Array;
    dq: Uint8Array;
    qi: Uint8Array;
}

let subtleKeyCache: { pem: string; key: CryptoKey } | null = null;

function getSubtle(): SubtleCrypto | null {
    try {
        const c = (globalThis as any)?.crypto;
        return c?.subtle ?? null;
    } catch {
        return null;
    }
}

function pemToDer(pem: string): Uint8Array {
    const b64 = pem
        .replace(/-----BEGIN [^-]*-----/, "")
        .replace(/-----END [^-]*-----/, "")
        .replace(/\s+/g, "");
    let bin: string;
    if (typeof atob === "function") {
        bin = atob(b64);
    } else {
        // Node fallback (tests / SSR) — never shipped to the browser bundle.
        bin = (globalThis as any).Buffer.from(b64, "base64").toString("binary");
    }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
}

class DerReader {
    pos = 0;
    constructor(public buf: Uint8Array) {}

    readTag(): number {
        if (this.pos >= this.buf.length) throw new Error("DER: unexpected end");
        return this.buf[this.pos++];
    }

    readLength(): number {
        const first = this.readTag();
        if (first < 0x80) return first;
        const count = first & 0x7f;
        if (count === 0 || count > 4) throw new Error("DER: bad length");
        let len = 0;
        for (let i = 0; i < count; i++) len = (len << 8) | this.readTag();
        return len;
    }

    expectTag(tag: number): void {
        const t = this.readTag();
        if (t !== tag) throw new Error(`DER: expected tag ${tag.toString(16)}, got ${t.toString(16)}`);
    }

    peekTag(): number {
        if (this.pos >= this.buf.length) throw new Error("DER: unexpected end");
        return this.buf[this.pos];
    }

    readInteger(): Uint8Array {
        this.expectTag(0x02);
        const len = this.readLength();
        const end = this.pos + len;
        if (end > this.buf.length) throw new Error("DER: integer overrun");
        let v = this.buf.slice(this.pos, end);
        this.pos = end;
        // Strip DER sign-padding for unsigned JWK encoding
        while (v.length > 1 && v[0] === 0x00) v = v.slice(1);
        return v;
    }

    readSequence(): DerReader {
        this.expectTag(0x30);
        const len = this.readLength();
        const end = this.pos + len;
        if (end > this.buf.length) throw new Error("DER: sequence overrun");
        const sub = new DerReader(this.buf.slice(this.pos, end));
        this.pos = end;
        return sub;
    }

    skip(): void {
        this.readTag();
        const len = this.readLength();
        this.pos += len;
        if (this.pos > this.buf.length) throw new Error("DER: skip overrun");
    }

    get done(): boolean {
        return this.pos >= this.buf.length;
    }
}

/** Parse a PKCS#1 ("BEGIN RSA PRIVATE KEY") or PKCS#8 ("BEGIN PRIVATE KEY") PEM. */
function parseRsaPrivateKey(pem: string): RsaParams {
    const top = new DerReader(pemToDer(pem)).readSequence();
    top.readInteger(); // version
    let rsa: DerReader;
    if (top.peekTag() === 0x30) {
        // PKCS#8: skip algorithm identifier, unwrap inner OCTET STRING
        top.skip();
        top.expectTag(0x04);
        const len = top.readLength();
        const inner = top.buf.slice(top.pos, top.pos + len);
        rsa = new DerReader(inner).readSequence();
        rsa.readInteger(); // version
    } else {
        rsa = top;
    }
    const [n, e, d, p, q, dp, dq, qi] = [
        rsa.readInteger(), rsa.readInteger(), rsa.readInteger(), rsa.readInteger(),
        rsa.readInteger(), rsa.readInteger(), rsa.readInteger(), rsa.readInteger(),
    ];
    if (!rsa.done) throw new Error("DER: trailing bytes in RSA key");
    for (const v of [n, e, d, p, q, dp, dq, qi]) {
        if (v.length === 0) throw new Error("DER: empty RSA parameter");
    }
    return { n, e, d, p, q, dp, dq, qi };
}

function bytesToB64Url(bytes: Uint8Array): string {
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
    }
    const b64 = typeof btoa === "function"
        ? btoa(bin)
        : (globalThis as any).Buffer.from(bin, "binary").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToB64(bytes: Uint8Array): string {
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
    }
    return typeof btoa === "function"
        ? btoa(bin)
        : (globalThis as any).Buffer.from(bin, "binary").toString("base64");
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
    if (subtleKeyCache && subtleKeyCache.pem === pem) return subtleKeyCache.key;
    const subtle = getSubtle();
    if (!subtle) throw new Error("WebCrypto subtle unavailable");
    let params: RsaParams;
    try {
        params = parseRsaPrivateKey(pem);
    } catch {
        throw new Error("Invalid ZIMRA Private Key provided for offline signing.");
    }
    const jwk = {
        kty: "RSA",
        n: bytesToB64Url(params.n),
        e: bytesToB64Url(params.e),
        d: bytesToB64Url(params.d),
        p: bytesToB64Url(params.p),
        q: bytesToB64Url(params.q),
        dp: bytesToB64Url(params.dp),
        dq: bytesToB64Url(params.dq),
        qi: bytesToB64Url(params.qi),
        alg: "RS256",
        ext: true,
    };
    const key = await subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
    subtleKeyCache = { pem, key };
    return key;
}

/**
 * Pre-warms the native key cache by importing the PEM in the background.
 * Call as soon as the fiscal context (private key) is loaded so checkout
 * signing is instant — import is the only slow step and it happens once.
 */
export function prewarmKeyCache(pem: string): void {
    if (!pem || (subtleKeyCache && subtleKeyCache.pem === pem)) return;
    setTimeout(() => {
        importRsaKey(pem).then(
            () => console.log("[FiscalSign] Key cache pre-warmed ✓"),
            (e) => console.warn("[FiscalSign] Key pre-warm failed:", e),
        );
    }, 0);
}

// ─── MD5 (compact pure-JS; inputs here are short hash/verify strings) ───────

function md5Bytes(input: Uint8Array): Uint8Array {
    const origLen = input.length;
    const bitLen = origLen * 8;
    // Padding: 0x80 + zeros + 64-bit LE length, total ≡ 0 (mod 64)
    const padLen = ((origLen + 8) >> 6) + 1;
    const msg = new Uint8Array(padLen * 64);
    msg.set(input);
    msg[origLen] = 0x80;
    const dv = new DataView(msg.buffer);
    // MD5 uses the low 64 bits of the bit length, little-endian
    dv.setUint32(msg.length - 8, bitLen >>> 0, true);
    dv.setUint32(msg.length - 4, Math.floor(bitLen / 0x100000000), true);

    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

    const T = new Uint32Array(64);
    for (let i = 0; i < 64; i++) T[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;

    const X = new Uint32Array(16);
    const rol = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
    const S = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];

    for (let off = 0; off < msg.length; off += 64) {
        for (let i = 0; i < 16; i++) X[i] = dv.getUint32(off + i * 4, true);
        let A = a, B = b, C = c, D = d;
        for (let i = 0; i < 64; i++) {
            let F: number, g: number;
            if (i < 16) { F = (B & C) | (~B & D); g = i; }
            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * i) % 16; }
            F = (F + A + T[i] + X[g]) >>> 0;
            A = D; D = C; C = B;
            B = (B + rol(F, S[i])) >>> 0;
        }
        a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0;
    }

    const out = new Uint8Array(16);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, a, true); odv.setUint32(4, b, true);
    odv.setUint32(8, c, true); odv.setUint32(12, d, true);
    return out;
}

function utf8Bytes(s: string): Uint8Array {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    // Minimal UTF-8 encoder fallback
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
        let cp = s.charCodeAt(i);
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
            const lo = s.charCodeAt(i + 1);
            if (lo >= 0xdc00 && lo <= 0xdfff) {
                cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                i++;
            }
        }
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
    return Uint8Array.from(out);
}

/**
 * Computes the MD5 hash of the given string, returning it as a hex string.
 * This is used for the receiptDeviceSignature hash.
 */
export function getHash(data: string): string {
    const digest = md5Bytes(utf8Bytes(data));
    let hex = "";
    for (const b of digest) hex += b.toString(16).padStart(2, "0");
    return hex;
}

// Lazy node-forge fallback (non-secure contexts only — never loaded otherwise)
let forgeFallback: any = null;
async function forgeSignFallback(data: string, pem: string): Promise<string> {
    if (!forgeFallback) {
        const mod = await import("node-forge");
        forgeFallback = (mod as any).default || mod;
    }
    const forge = forgeFallback;
    const key = forge.pki.privateKeyFromPem(pem);
    const md = forge.md.sha256.create();
    md.update(data, "utf8");
    return forge.util.encode64(key.sign(md));
}

/**
 * Computes the RSA-SHA256 signature of the given string using the private key.
 * Returns the base64 encoded signature. Native (async, ~ms) — never blocks.
 */
export async function signDataAsync(data: string, privateKeyPem: string): Promise<string> {
    const subtle = getSubtle();
    if (subtle) {
        try {
            const key = await importRsaKey(privateKeyPem);
            const sig = await subtle.sign("RSASSA-PKCS1-v1_5", key, utf8Bytes(data) as BufferSource);
            return bytesToB64(new Uint8Array(sig));
        } catch (e: any) {
            if (String(e?.message || "").includes("Invalid ZIMRA Private Key")) throw e;
            console.warn("[FiscalSign] WebCrypto sign failed, using fallback:", e?.message);
        }
    }
    return forgeSignFallback(data, privateKeyPem);
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
 * Async: RSA signing runs on the native (non-blocking) crypto backend.
 */
export async function generateOfflineFiscalData(params: {
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
    const signature = await signDataAsync(stringToSign, privateKeyPem);
    const verificationCode = calculateVerificationCode(signature);

    return {
        hash,
        signature,
        verificationCode,
        stringToSign
    };
}
