import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;
const ENCODING = "base64";

/**
 * Validates and gets the encryption key from environment variable.
 * Must be 32 bytes (256 bits).
 */
function getKey(): Buffer {
  const hexKey = process.env.COMPANY_VAULT_KEY;
  if (!hexKey) {
    throw new Error("COMPANY_VAULT_KEY environment variable is missing.");
  }
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) {
    throw new Error("COMPANY_VAULT_KEY must be exactly 32 bytes (64 hex characters).");
  }
  return key;
}

/**
 * Encrypts a plaintext string into an AES-256-GCM ciphertext string.
 * Format: iv||authTag||ciphertext (in base64).
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;
  
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(plaintext, "utf8", ENCODING);
  ciphertext += cipher.final(ENCODING);
  
  const authTag = cipher.getAuthTag();
  
  // Pack output into single string
  return `${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${ciphertext}`;
}

/**
 * Decrypts a ciphertext string back to plaintext.
 */
export function decryptField(ciphertextString: string): string {
  if (!ciphertextString || !ciphertextString.includes(":")) return ciphertextString;
  
  const key = getKey();
  const parts = ciphertextString.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }
  
  const [ivBase64, authTagBase64, ciphertextText] = parts;
  const iv = Buffer.from(ivBase64, ENCODING);
  const authTag = Buffer.from(authTagBase64, ENCODING);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertextText, ENCODING, "utf8");
  plaintext += decipher.final("utf8");
  
  return plaintext;
}
