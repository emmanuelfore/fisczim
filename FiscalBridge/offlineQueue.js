const fs = require('fs');
const path = require('path');
const { fetch } = require('undici');

const QUEUE_FILE = path.join(process.cwd(), 'offline-queue.json');

function loadQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function enqueue(receipt) {
  const queue = loadQueue();
  queue.push({ ...receipt, queuedAt: new Date().toISOString() });
  saveQueue(queue);
  return queue.length;
}

function removeFromQueue(predicate) {
  const queue = loadQueue().filter((r) => !predicate(r));
  saveQueue(queue);
  return queue.length;
}

async function syncQueue(config) {
  const queue = loadQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const endpoint = config && config.endpoint ? config.endpoint : '/api/v1/fiscalize';
  const baseUrl = config && config.apiEndpoint ? config.apiEndpoint : '';
  const apiKey = config && config.apiKey ? config.apiKey : '';

  let synced = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify(item.payload || item),
      });
      if (res.ok) {
        synced++;
      } else {
        remaining.push(item);
      }
    } catch (e) {
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  return { synced, remaining: remaining.length };
}

function getQueueLength() {
  return loadQueue().length;
}

module.exports = { loadQueue, saveQueue, enqueue, removeFromQueue, syncQueue, getQueueLength, QUEUE_FILE };