const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fiscalBridgeAPI', {
  // Identity
  isElectron: true,

  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Folder Monitoring
  startFolderWatch: (sourceFolder, targetFolder) =>
    ipcRenderer.invoke('start-folder-watch', sourceFolder, targetFolder),
  stopFolderWatch: () => ipcRenderer.invoke('stop-folder-watch'),
  onReceiptFileAdded: (callback) => {
    const wrapper = (_, data) => callback(data);
    callback._ipcWrapper = wrapper;
    ipcRenderer.on('receipt-file-added', wrapper);
  },
  offReceiptFileAdded: (callback) => {
    if (callback._ipcWrapper) {
      ipcRenderer.removeListener('receipt-file-added', callback._ipcWrapper);
      delete callback._ipcWrapper;
    }
  },
  onFolderWatchError: (callback) => {
    ipcRenderer.on('folder-watch-error', (_e, data) => callback(data));
  },
  onTrayToggleWatch: (callback) => {
    ipcRenderer.on('tray-toggle-watch', () => callback());
  },

  // File Operations
  readReceiptFile: (filePath) => ipcRenderer.invoke('read-receipt-file', filePath),
  extractPdfText: (filePath) => ipcRenderer.invoke('extract-pdf-text', filePath),
  renderPdfPages: (filePath, opts) => ipcRenderer.invoke('render-pdf-pages', filePath, opts),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  moveReceiptFile: (sourcePath, targetPath) =>
    ipcRenderer.invoke('move-receipt-file', sourcePath, targetPath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),

  // Currency Configuration
  saveCurrencyConfig: (currencies) => ipcRenderer.invoke('save-currency-config', currencies),
  loadCurrencyConfig: () => ipcRenderer.invoke('load-currency-config'),

  // Printer Management
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  qrDataUrl: (text, width) => ipcRenderer.invoke('qr-data-url', text, width),
  printReceipt: (html, printerName, format) =>
    ipcRenderer.invoke('print-receipt', html, printerName, format),
  listNativePrinters: () => ipcRenderer.invoke('list-native-printers'),

  // Enterprise / UI
  readLogFile: (maxLines) => ipcRenderer.invoke('read-log-file', maxLines),
  getDocuments: () => ipcRenderer.invoke('get-documents'),
  saveDocuments: (docs) => ipcRenderer.invoke('save-documents', docs),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),

  // Fiscal Configuration Management
  getFiscalConfig: () => ipcRenderer.invoke('get-fiscal-config'),
  updateFiscalConfig: (updates) => ipcRenderer.invoke('update-fiscal-config', updates),
  getDeviceStatus: () => ipcRenderer.invoke('get-device-status'),
  incrementReceiptCounter: () => ipcRenderer.invoke('increment-receipt-counter'),
  updateReceiptHash: (receiptData) => ipcRenderer.invoke('update-receipt-hash', receiptData),
  openFiscalDay: () => ipcRenderer.invoke('open-fiscal-day'),
  closeFiscalDay: () => ipcRenderer.invoke('close-fiscal-day'),
  isFiscalDayOpen: () => ipcRenderer.invoke('is-fiscal-day-open'),
  resetCounters: () => ipcRenderer.invoke('reset-counters'),
  setTin: (tin) => ipcRenderer.invoke('set-tin', tin),
  setCurrency: (currency) => ipcRenderer.invoke('set-currency', currency),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  setDeviceId: (deviceId) => ipcRenderer.invoke('set-device-id', deviceId),
  setZimraServers: (zimraServer, verificationServer) =>
    ipcRenderer.invoke('set-zimra-servers', zimraServer, verificationServer),
  setVatRates: (vatA, vatB, vatC, vatD, vatE, vatF) =>
    ipcRenderer.invoke('set-vat-rates', vatA, vatB, vatC, vatD, vatE, vatF),
  getVatRate: (type) => ipcRenderer.invoke('get-vat-rate', type),

  // Folder/File Browsing
  browseFolder: () => ipcRenderer.invoke('browse-folder'),
  browseFile: (filters) => ipcRenderer.invoke('browse-file', filters),

  // A4 PDF Parser
  parseA4Pdf: (filePath) => ipcRenderer.invoke('parse-a4-pdf', filePath),
  printPdfFile: (filePath, printerName) =>
    ipcRenderer.invoke('print-pdf-file', filePath, printerName),

  // Enterprise Queue / Observability
  getQueueHealth: () => ipcRenderer.invoke('get-queue-health'),
  syncOfflineQueue: (cfg) => ipcRenderer.invoke('sync-offline-queue', cfg),
  getMetrics: () => ipcRenderer.invoke('get-metrics'),
  recordSync: (success, failure) => ipcRenderer.invoke('record-sync', success, failure),

  // Secure key
  secureStatus: () => ipcRenderer.invoke('secure-status'),
  secureEncrypt: (value) => ipcRenderer.invoke('secure-encrypt', value),
  secureDecrypt: (value) => ipcRenderer.invoke('secure-decrypt', value),

  // Compliance
  secureDelete: (file) => ipcRenderer.invoke('compliance-secure-delete', file),
  retentionPolicy: (files, days) => ipcRenderer.invoke('compliance-retention', files, days),

  // Document Store (new)
  getDocuments: (filter) => ipcRenderer.invoke('get-documents', filter),
  addDocument: (doc) => ipcRenderer.invoke('add-document', doc),
  updateDocument: (id, updates) => ipcRenderer.invoke('update-document', id, updates),
  getDocumentStats: () => ipcRenderer.invoke('get-document-stats'),

  // Logs + Diagnostics (new)
  readLogFile: (maxLines) => ipcRenderer.invoke('read-log-file', maxLines),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),
  appendAuditLog: (entry) => ipcRenderer.invoke('append-audit-log', entry),

  // ── Parser engine + Profile store ──────────────────────────────────────────
  listProfiles:        ()                       => ipcRenderer.invoke('list-profiles'),
  getProfile:          (id, version)            => ipcRenderer.invoke('get-profile', id, version),
  saveProfile:         (profile)                => ipcRenderer.invoke('save-profile', profile),
  deleteProfile:       (id)                     => ipcRenderer.invoke('delete-profile', id),
  importProfileFile:   ()                       => ipcRenderer.invoke('import-profile-file'),
  exportProfileFile:   (id, version)            => ipcRenderer.invoke('export-profile-file', id, version),
  parseText:           (text, profileRef, ver)  => ipcRenderer.invoke('parse-text', text, profileRef, ver),
  parsePdfWithProfile: (filePath, profileId)    => ipcRenderer.invoke('parse-pdf-with-profile', filePath, profileId),
  generateQrDataUrl:   (text)                   => ipcRenderer.invoke('generate-qr-dataurl', text),
  // ── Device store (local cache) ─────────────────────────────────────────────
  getAuditLog:               ()                => ipcRenderer.invoke('get-audit-log'),
  getCachedDeviceDetails:    ()                => ipcRenderer.invoke('get-cached-device-details'),
  saveCachedDeviceDetails:   (details)         => ipcRenderer.invoke('save-cached-device-details', details),
  getCachedDeviceStatus:     ()                => ipcRenderer.invoke('get-cached-device-status'),
  saveCachedDeviceStatus:    (status)          => ipcRenderer.invoke('save-cached-device-status', status),
  getFiscalisations:         ()                => ipcRenderer.invoke('get-fiscalisations'),
  addFiscalisation:          (record)          => ipcRenderer.invoke('add-fiscalisation', record),
  // ── Auto-updater ─────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate:   () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),

  // ── Status indicator ────────────────────────────────────────────────────────
  getStatus: () => ipcRenderer.invoke('get-status'),
  setStatus: (status, queueCount) => ipcRenderer.invoke('set-status', status, queueCount),
  setDeviceInfo: (deviceInfo) => ipcRenderer.invoke('set-device-info', deviceInfo),
});

