const fs = require('fs');
const path = require('path');

const UX_FILE = path.join(process.cwd(), 'ux-state.json');

function loadUxState() {
  try {
    if (!fs.existsSync(UX_FILE)) return {};
    return JSON.parse(fs.readFileSync(UX_FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function saveUxState(state) {
  fs.writeFileSync(UX_FILE, JSON.stringify(state, null, 2));
}

function setPreferredPrinter(printerName) {
  const state = loadUxState();
  state.preferredPrinter = printerName;
  saveUxState(state);
}

function getPreferredPrinter() {
  return loadUxState().preferredPrinter || null;
}

function setQueueVisibility(visible) {
  const state = loadUxState();
  state.showQueue = !!visible;
  saveUxState(state);
}

function getQueueVisibility() {
  return loadUxState().showQueue !== false;
}

module.exports = { loadUxState, saveUxState, setPreferredPrinter, getPreferredPrinter, setQueueVisibility, getQueueVisibility, UX_FILE };