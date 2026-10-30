const fs = require('fs');
const path = require('path');

// Store in the writable app-data dir. process.cwd() is read-only in packaged
// installs, which silently lost every record and broke duplicate detection.
function resolveStoreDir() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') return app.getPath('userData');
  } catch (e) { /* running outside Electron (tests/CLI) */ }
  return process.cwd();
}

const STORE_FILE = path.join(resolveStoreDir(), 'documents.json');
const LEGACY_STORE_FILE = path.join(process.cwd(), 'documents.json');

// One-time migration so existing history (and its dedup data) is not lost.
try {
  if (LEGACY_STORE_FILE !== STORE_FILE &&
      fs.existsSync(LEGACY_STORE_FILE) && !fs.existsSync(STORE_FILE)) {
    fs.copyFileSync(LEGACY_STORE_FILE, STORE_FILE);
  }
} catch (e) {
  console.warn('[DocumentStore] Legacy store migration failed:', e.message);
}

function loadDocuments() {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) || [];
  } catch (e) {
    console.error('[DocumentStore] Failed to read store:', e.message);
    return [];
  }
}

function saveDocuments(docs) {
  // Write-then-rename so a crash mid-write can't truncate the dedup history
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(docs, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

function addDocument(doc) {
  const docs = loadDocuments();
  // Upsert by id so status transitions for the same file replace the record
  const idx = doc && doc.id ? docs.findIndex((d) => d.id === doc.id) : -1;
  if (idx >= 0) docs[idx] = { ...docs[idx], ...doc };
  else docs.unshift(doc);
  saveDocuments(docs);
  return docs;
}

function updateDocument(id, updates) {
  const docs = loadDocuments();
  const idx = docs.findIndex((d) => d.id === id);
  if (idx >= 0) {
    docs[idx] = { ...docs[idx], ...updates };
    saveDocuments(docs);
  }
  return docs;
}

function getDocuments() {
  return loadDocuments();
}

module.exports = { loadDocuments, saveDocuments, addDocument, updateDocument, getDocuments, STORE_FILE };