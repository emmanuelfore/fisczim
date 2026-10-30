const fs = require('fs');
const path = require('path');

const METRICS_FILE = path.join(process.cwd(), 'metrics.json');

function loadMetrics() {
  try {
    if (!fs.existsSync(METRICS_FILE)) return { queueDepth: 0, syncSuccess: 0, syncFailure: 0, lastSync: null };
    return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
  } catch (e) {
    return { queueDepth: 0, syncSuccess: 0, syncFailure: 0, lastSync: null };
  }
}

function saveMetrics(m) {
  fs.writeFileSync(METRICS_FILE, JSON.stringify(m, null, 2));
}

function recordSync(successCount, failureCount) {
  const m = loadMetrics();
  m.syncSuccess = (m.syncSuccess || 0) + successCount;
  m.syncFailure = (m.syncFailure || 0) + failureCount;
  m.lastSync = new Date().toISOString();
  saveMetrics(m);
}

function setQueueDepth(depth) {
  const m = loadMetrics();
  m.queueDepth = depth;
  saveMetrics(m);
}

function getMetrics() {
  return loadMetrics();
}

module.exports = { loadMetrics, saveMetrics, recordSync, setQueueDepth, getMetrics, METRICS_FILE };