let safeStorage = null;
try {
  // Electron safeStorage (available in main process)
  const { safeStorage: ss } = require('electron');
  safeStorage = ss;
} catch (e) {
  safeStorage = null;
}

function getKey(passphrase) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    // Use OS keychain-backed encryption
    const encrypted = safeStorage.encryptString(passphrase || 'fiscalbridge-default-key');
    return encrypted;
  }
  // Fallback: env var or default (not secure)
  const envKey = process.env.FISCALBRIDGE_KEY;
  return envKey || passphrase || 'fiscalbridge-default-key';
}

function encryptValue(value) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(String(value));
  }
  return Buffer.from(String(value), 'utf8').toString('base64');
}

function decryptValue(blob) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.isBuffer(blob) ? blob : Buffer.from(blob));
  }
  return Buffer.from(String(blob), 'base64').toString('utf8');
}

module.exports = { getKey, encryptValue, decryptValue, isSecure: () => !!(safeStorage && safeStorage.isEncryptionAvailable()) };