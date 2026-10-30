const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUEUE_FILE = path.join(process.cwd(), 'offline-queue.enc');
const DEAD_LETTER_FILE = path.join(process.cwd(), 'offline-dead-letter.enc');
const AUDIT_FILE = path.join(process.cwd(), 'offline-audit.log');

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
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function readQueue(file, passphrase) {
  try {
    if (!fs.existsSync(file)) return [];
    const blob = JSON.parse(fs.readFileSync(file, 'utf8'));
    return decrypt(blob, passphrase) || [];
  } catch (e) {
    return [];
  }
}

function writeQueue(file, queue, passphrase) {
  const blob = encrypt(queue, passphrase);
  atomicWrite(file, JSON.stringify(blob));
}

function audit(event) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
  fs.appendFileSync(AUDIT_FILE, line);
}

function enqueue(receipt, passphrase) {
  const queue = readQueue(QUEUE_FILE, passphrase);
  const idempotencyKey = receipt.idempotencyKey || crypto.randomUUID();
  const item = { idempotencyKey, ...receipt, attempts: 0, nextAttemptAt: Date.now(), queuedAt: new Date().toISOString() };
  queue.push(item);
  writeQueue(QUEUE_FILE, queue, passphrase);
  audit({ action: 'enqueue', idempotencyKey });
  return queue.length;
}

function getQueueLength(passphrase) {
  return readQueue(QUEUE_FILE, passphrase).length;
}

async function syncQueue(config) {
  const passphrase = config.passphrase || 'fiscalbridge-default-key';
  const queue = readQueue(QUEUE_FILE, passphrase);
  if (queue.length === 0) return { synced: 0, remaining: 0, deadLettered: 0 };

  const baseUrl = config.apiEndpoint || '';
  const endpoint = config.endpoint || '/api/v1/fiscalize';
  const apiKey = config.apiKey || '';
  const maxRetries = config.maxRetries || 5;

  let synced = 0;
  let deadLettered = 0;
  const remaining = [];
  const dead = readQueue(DEAD_LETTER_FILE, passphrase);

  for (const item of queue) {
    if (item.nextAttemptAt && Date.now() < item.nextAttemptAt) {
      remaining.push(item);
      continue;
    }
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.idempotencyKey,
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify(item.payload || item),
      });
      if (res.ok) {
        synced++;
        audit({ action: 'sync_success', idempotencyKey: item.idempotencyKey });
      } else {
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= maxRetries) {
          dead.push(item);
          deadLettered++;
          audit({ action: 'dead_letter', idempotencyKey: item.idempotencyKey, attempts: item.attempts });
        } else {
          const backoff = Math.min(300000, 1000 * Math.pow(2, item.attempts));
          item.nextAttemptAt = Date.now() + backoff;
          remaining.push(item);
          audit({ action: 'sync_retry', idempotencyKey: item.idempotencyKey, attempts: item.attempts, backoff });
        }
      }
    } catch (e) {
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts >= maxRetries) {
        dead.push(item);
        deadLettered++;
        audit({ action: 'dead_letter', idempotencyKey: item.idempotencyKey, error: e.message });
      } else {
        const backoff = Math.min(300000, 1000 * Math.pow(2, item.attempts));
        item.nextAttemptAt = Date.now() + backoff;
        remaining.push(item);
        audit({ action: 'sync_error', idempotencyKey: item.idempotencyKey, error: e.message });
      }
    }
  }

  writeQueue(QUEUE_FILE, remaining, passphrase);
  if (dead.length > 0) writeQueue(DEAD_LETTER_FILE, dead, passphrase);

  return { synced, remaining: remaining.length, deadLettered };
}

function health() {
  const passphrase = 'fiscalbridge-default-key';
  return {
    queueDepth: getQueueLength(passphrase),
    deadLetterDepth: readQueue(DEAD_LETTER_FILE, passphrase).length,
    auditFile: AUDIT_FILE,
  };
}

module.exports = { enqueue, syncQueue, getQueueLength, health, QUEUE_FILE, DEAD_LETTER_FILE, AUDIT_FILE };