const { EventEmitter } = require('events');
const https = require('https');
const http = require('http');
const { generateOfflineFiscalData } = require('./offlineSign');
const { enqueue, syncQueue, getQueueLength } = require('./enterpriseQueue');
const { getInstance: getStatusIndicator, ConnectionStatus } = require('./statusIndicator');

class OfflineManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.timer = null;
    this.intervalMs = config.intervalMs || 15000;
    this.statusIndicator = getStatusIndicator();
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  async checkConnectivity() {
    const url = this.config.healthUrl || this.config.apiEndpoint || '';
    if (!url) return false;
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      return await new Promise((resolve) => {
        const req = lib.request({ method: 'HEAD', hostname: u.hostname, port: u.port, path: '/', timeout: 5000 }, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      });
    } catch (e) {
      return false;
    }
  }

  signAndQueue(params) {
    const { receiptData, deviceId, privateKeyPem, previousReceiptHash } = params;
    const offline = generateOfflineFiscalData({ receiptData, previousReceiptHash, deviceId, privateKeyPem });
    const payload = {
      ...receiptData,
      offlineSignature: offline.signature,
      offlinePreviousHash: previousReceiptHash || null,
      offlineReceiptCounter: receiptData.receiptCounter,
      offlineGlobalReceiptCounter: receiptData.receiptGlobalNo,
      offlineFiscalDay: receiptData.fiscalDayNo,
      offlineDate: receiptData.receiptDate,
    };
    const len = enqueue({ payload });
    this.emit('queued', { length: len });
    return { ...offline, queueLength: len };
  }

  async syncNow() {
    const online = await this.checkConnectivity();
    const queueCount = getQueueLength();
    
    if (!online) {
      this.statusIndicator.setStatus(ConnectionStatus.Offline, queueCount);
      this.emit('offline');
      return { synced: 0, remaining: queueCount, online: false };
    }
    
    this.statusIndicator.setStatus(ConnectionStatus.Online, queueCount);
    this.emit('online');
    const result = await syncQueue(this.config);
    
    // Update status after sync based on remaining queue
    const remainingQueue = getQueueLength();
    if (remainingQueue > 0) {
      this.statusIndicator.setStatus(ConnectionStatus.Offline, remainingQueue);
    } else {
      this.statusIndicator.setStatus(ConnectionStatus.Online, 0);
    }
    
    this.emit('synced', result);
    return { ...result, online: true };
  }

  startAutoSync(intervalMs) {
    if (this.timer) clearInterval(this.timer);
    this.intervalMs = intervalMs || this.intervalMs;
    this.timer = setInterval(() => {
      this.syncNow().catch((e) => this.emit('error', e));
    }, this.intervalMs);
    // initial
    this.syncNow().catch((e) => this.emit('error', e));
  }

  stopAutoSync() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { OfflineManager };