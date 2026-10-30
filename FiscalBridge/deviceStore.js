/**
 * deviceStore.js — Local persistent store for device details, device status,
 * fiscalisation records, and audit log entries.
 *
 * Backed by a single JSON file (device-store.json) in the same directory as
 * the app.  Mirrors the pattern used by documentStore.js.
 */

const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(process.cwd(), 'device-store.json');

// ── Default store shape ────────────────────────────────────────────────────
function _defaultStore() {
  return {
    deviceDetails: null,   // cached from /api/zimra/device-details
    deviceStatus: null,    // cached from /api/zimra/device-status
    fiscalisations: [],    // each transact response record
    auditLog: [],           // day open/close, counter reset, etc.
  };
}

// ── Load / save ────────────────────────────────────────────────────────────
function _load() {
  try {
    if (!fs.existsSync(STORE_FILE)) return _defaultStore();
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    // Merge with defaults so new fields appear on old files
    return { ..._defaultStore(), ...data };
  } catch {
    return _defaultStore();
  }
}

function _save(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

// ── Device details ──────────────────────────────────────────────────────────
function getDeviceDetails() {
  return _load().deviceDetails;
}

function saveDeviceDetails(details) {
  const store = _load();
  store.deviceDetails = { ...details, cachedAt: new Date().toISOString() };
  _save(store);
  return store.deviceDetails;
}

// ── Device status ───────────────────────────────────────────────────────────
function getDeviceStatus() {
  return _load().deviceStatus;
}

function saveDeviceStatus(status) {
  const store = _load();
  store.deviceStatus = { ...status, cachedAt: new Date().toISOString() };
  _save(store);
  return store.deviceStatus;
}

// ── Fiscalisation records ───────────────────────────────────────────────────
function getFiscalisations() {
  return _load().fiscalisations;
}

function addFiscalisation(record) {
  const store = _load();
  store.fiscalisations.unshift({
    id: 'fiscal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    ...record,
  });
  // Keep last 500 records
  if (store.fiscalisations.length > 500) store.fiscalisations.length = 500;
  _save(store);
  return store.fiscalisations[0];
}

function getFiscalisation(id) {
  return _load().fiscalisations.find(f => f.id === id);
}

// ── Audit log ───────────────────────────────────────────────────────────────
function getAuditLog() {
  return _load().auditLog;
}

function appendAuditLog(entry) {
  const store = _load();
  store.auditLog.unshift({
    id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  // Keep last 1000 entries
  if (store.auditLog.length > 1000) store.auditLog.length = 1000;
  _save(store);
  return store.auditLog[0];
}

module.exports = {
  getDeviceDetails,
  saveDeviceDetails,
  getDeviceStatus,
  saveDeviceStatus,
  getFiscalisations,
  addFiscalisation,
  getFiscalisation,
  getAuditLog,
  appendAuditLog,
  STORE_FILE,
};
