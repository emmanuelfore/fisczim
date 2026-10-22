const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fiscalPrinter", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  startWatch: () => ipcRenderer.invoke("start-watch"),
  processFile: (filePath) => ipcRenderer.invoke("process-file", filePath),
  onLog: (cb) => ipcRenderer.on("log", (_e, line) => cb(line)),
  onJobDone: (cb) => ipcRenderer.on("job-done", (_e, data) => cb(data)),
});
