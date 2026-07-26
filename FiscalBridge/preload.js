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

  // File Operations
  readReceiptFile: (filePath) => ipcRenderer.invoke('read-receipt-file', filePath),
  moveReceiptFile: (sourcePath, targetPath) => 
    ipcRenderer.invoke('move-receipt-file', sourcePath, targetPath),

  // Currency Configuration
  saveCurrencyConfig: (currencies) => ipcRenderer.invoke('save-currency-config', currencies),
  loadCurrencyConfig: () => ipcRenderer.invoke('load-currency-config'),

  // License Management
  saveLicense: (licenseKey) => ipcRenderer.invoke('save-license', licenseKey),
  loadLicense: () => ipcRenderer.invoke('load-license'),

  // Printer Management
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (html, printerName) => ipcRenderer.invoke('print-receipt', html, printerName),

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
  setDeviceId: (deviceId) => ipcRenderer.invoke('set-device-id', deviceId),
  setZimraServers: (zimraServer, verificationServer) => 
    ipcRenderer.invoke('set-zimra-servers', zimraServer, verificationServer),
  setVatRates: (vatA, vatB, vatC, vatD, vatE, vatF) => 
    ipcRenderer.invoke('set-vat-rates', vatA, vatB, vatC, vatD, vatE, vatF),
  getVatRate: (type) => ipcRenderer.invoke('get-vat-rate', type),

  // Folder/File Browsing
  browseFolder: () => ipcRenderer.invoke('browse-folder'),
  browseFile: (filters) => ipcRenderer.invoke('browse-file', filters),
});
