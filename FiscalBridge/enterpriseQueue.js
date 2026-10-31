const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ENDPOINT = '/api/v1/fiscalize';
let baseDir = process.cwd();
let syncing = null;

function queueFile() { return path.join(baseDir, 'offline-queue.enc'); }
function deadLetterFile() { return path.join(baseDir, 'offline-dead-letter.enc'); }
function auditFile() { return path.join(baseDir, 'offline-audit.log'); }

/**
 * Point the queue at the app's userData directory. Packaged Windows builds run
 * from Program Files, where process.cwd() is not writable.
 */
function setBaseDir(dir) {
  if (!dir || dir === baseDir) return;
  const previous = baseDir;
  baseDir = dir;
  fs.mkdirSync(baseDir, { recursive: true });
  const oldQueue = path.join(previous, 'offline-queue.enc');
  if (fs.existsSync(oldQueue) && !fs.existsSync(queueFile())) {
    try { fs.copyFileSync(oldQueue, queueFile()); } catch { /* ignore migration failure */ }
  }
}

// Derive a 32-byte key from a passphrase (configurable). In production, use OS keychain.
function getKey(passphrase) {
  return crypto.scryptSync(passphrase || 'fiscalbridge-default-key', 'fiscalbridge-salt', 32);
}

function encrypt(data, passphrase) {
  const key = getKey(passphrase);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
}

function decrypt(blob, passphrase) {
  const key = getKey(passphrase);
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const data = Buffer.from(blob.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

function atomicWrite(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readQueue(file, passphrase) {
  try {
    if (!fs.existsSync(file)) return [];
    const blob = JSON.parse(fs.readFileSync(file, 'utf8'));
    return decrypt(blob, passphrase) || [];
  } catch {
    return [];
  }
}

function writeQueue(file, queue, passphrase) {
  const blob = encrypt(queue, passphrase);
  atomicWrite(file, JSON.stringify(blob));
}

function audit(event) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(auditFile(), line);
  } catch { /* audit must never block a receipt */ }
}

function getQueue(passphrase) {
  return readQueue(queueFile(), passphrase);
}

function hasItem(idempotencyKey, passphrase) {
  if (!idempotencyKey) return false;
  return getQueue(passphrase).some((item) => item.idempotencyKey === idempotencyKey);
}

function enqueue(receipt, passphrase) {
  const queue = readQueue(queueFile(), passphrase);
  const idempotencyKey = receipt.idempotencyKey || crypto.randomUUID();
  const item = { idempotencyKey, ...receipt, attempts: 0, nextAttemptAt: Date.now(), queuedAt: new Date().toISOString() };
  queue.push(item);
  writeQueue(queueFile(), queue, passphrase);
  audit({ action: 'enqueue', idempotencyKey });
  return queue.length;
}

function getQueueLength(passphrase) {
  return readQueue(queueFile(), passphrase).length;
}

function getDeadLetter(passphrase) {
  return readQueue(deadLetterFile(), passphrase);
}

async function postItem(baseUrl, endpoint, apiKey, item) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': item.idempotencyKey,
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      body: JSON.stringify(item.payload || item),
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { text: text.slice(0, 500) }; }
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

function isPermanentFailure(status) {
  return [400, 401, 403, 404].includes(status);
}

/**
 * Flush the queue in order. Each success is persisted immediately, so a crash
 * cannot resend a receipt that FDMS already recorded. Serialized so the auto
 * timer, startup flush and manual sync cannot race.
 */
function syncQueue(config = {}) {
  if (syncing) return syncing;
  syncing = (async () => {
    const passphrase = config.passphrase || 'fiscalbridge-default-key';
    const queue = readQueue(queueFile(), passphrase);
    if (queue.length === 0) return { synced: 0, remaining: 0, deadLettered: 0, results: [] };

    const baseUrl = String(config.apiEndpoint || '').replace(/\/+$/, '');
    const endpoint = config.endpoint || DEFAULT_ENDPOINT;
    const apiKey = config.apiKey || '';
    const maxRetries = config.maxRetries || 5;

    let synced = 0;
    let deadLettered = 0;
    const remaining = [];
    const results = [];
    const dead = readQueue(deadLetterFile(), passphrase);

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (item.nextAttemptAt && Date.now() < item.nextAttemptAt) {
        remaining.push(item);
        continue;
      }
      if (!baseUrl) {
        remaining.push(item);
        continue;
      }

      try {
        const response = await postItem(baseUrl, endpoint, apiKey, item);
        if (response.ok) {
          synced += 1;
          results.push({ idempotencyKey: item.idempotencyKey, ok: true, status: response.status, body: response.body });
          audit({ action: 'sync_success', idempotencyKey: item.idempotencyKey });
        } else {
          item.attempts = (item.attempts || 0) + 1;
          results.push({ idempotencyKey: item.idempotencyKey, ok: false, status: response.status, body: response.body, permanent: isPermanentFailure(response.status) });
          if (isPermanentFailure(response.status) || item.attempts >= maxRetries) {
            dead.push({ ...item, lastStatus: response.status, lastError: response.body?.message || null });
            deadLettered += 1;
            audit({ action: 'dead_letter', idempotencyKey: item.idempotencyKey, status: response.status, attempts: item.attempts });
          } else {
            const backoff = Math.min(300000, 1000 * Math.pow(2, item.attempts));
            item.nextAttemptAt = Date.now() + backoff;
            remaining.push(item);
            audit({ action: 'sync_retry', idempotencyKey: item.idempotencyKey, status: response.status, attempts: item.attempts, backoff });
          }
        }
      } catch (error) {
        item.attempts = (item.attempts || 0) + 1;
        results.push({ idempotencyKey: item.idempotencyKey, ok: false, status: 0, error: error.message });
        if (item.attempts >= maxRetries) {
          dead.push({ ...item, lastError: error.message });
          deadLettered += 1;
          audit({ action: 'dead_letter', idempotencyKey: item.idempotencyKey, error: error.message });
        } else {
          const backoff = Math.min(300000, 1000 * Math.pow(2, item.attempts));
          item.nextAttemptAt = Date.now() + backoff;
          remaining.push(item);
          audit({ action: 'sync_error', idempotencyKey: item.idempotencyKey, error: error.message });
        }
      }

      // Persist progress after every item; remaining must include the unvisited tail.
      writeQueue(queueFile(), remaining.concat(queue.slice(index + 1)), passphrase);
    }

    writeQueue(queueFile(), remaining, passphrase);
    if (dead.length > 0) writeQueue(deadLetterFile(), dead, passphrase);

    return { synced, remaining: remaining.length, deadLettered, results };
  })().finally(() => { syncing = null; });

  return syncing;
}

function health(passphrase) {
  return {
    queueDepth: getQueueLength(passphrase),
    deadLetterDepth: getDeadLetter(passphrase).length,
    auditFile: auditFile(),
    queueFile: queueFile(),
  };
}

module.exports = {
  setBaseDir,
  enqueue,
  syncQueue,
  getQueue,
  getQueueLength,
  getDeadLetter,
  hasItem,
  health,
  QUEUE_FILE: queueFile,
  DEAD_LETTER_FILE: deadLetterFile,
  AUDIT_FILE: auditFile,
};
