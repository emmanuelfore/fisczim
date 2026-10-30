/**
 * statusIndicator.js - Connection status tracking and visual feedback
 * 
 * Tracks connection status (Online/Offline/Error) and provides
 * status information for UI display. Mirrors the C# StatusIndicator.cs
 * functionality adapted for Electron.
 */

const { EventEmitter } = require('events');

// Connection status enum (mirrors C# ConnectionStatus)
const ConnectionStatus = {
  Unknown: 'unknown',
  Online: 'online',
  Offline: 'offline',
  Error: 'error'
};

class StatusIndicator extends EventEmitter {
  constructor() {
    super();
    this.currentStatus = ConnectionStatus.Unknown;
    this.queueCount = 0;
    this.lastChecked = null;
    this.deviceInfo = {
      companyName: null,
      deviceId: null,
      fiscalDay: null,
      tin: null
    };
  }

  /**
   * Update the current connection status
   */
  setStatus(status, queueCount = 0) {
    const oldStatus = this.currentStatus;
    this.currentStatus = status;
    this.queueCount = queueCount;
    this.lastChecked = new Date().toISOString();

    if (oldStatus !== status) {
      this.emit('statusChanged', { status, queueCount, oldStatus });
    }
    
    this.emit('statusUpdated', { status, queueCount, timestamp: this.lastChecked });
  }

  /**
   * Update device information for tooltips
   */
  setDeviceInfo(deviceInfo) {
    this.deviceInfo = { ...this.deviceInfo, ...deviceInfo };
    this.emit('deviceInfoUpdated', this.deviceInfo);
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.currentStatus;
  }

  /**
   * Get queue count
   */
  getQueueCount() {
    return this.queueCount;
  }

  /**
   * Get status color for UI (CSS color values)
   */
  getStatusColor() {
    switch (this.currentStatus) {
      case ConnectionStatus.Online:
        return '#32D25A'; // Green (matches C# 50, 210, 90)
      case ConnectionStatus.Offline:
        return '#FFB900'; // Orange (matches C# 255, 185, 0)
      case ConnectionStatus.Error:
        return '#DC3232'; // Red (matches C# 220, 50, 50)
      default:
        return '#C0C0C0'; // Silver
    }
  }

  /**
   * Get status label
   */
  getStatusLabel() {
    switch (this.currentStatus) {
      case ConnectionStatus.Online:
        return 'Online';
      case ConnectionStatus.Offline:
        return `Offline (${this.queueCount} queued)`;
      case ConnectionStatus.Error:
        return 'Config Error';
      default:
        return 'Checking…';
    }
  }

  /**
   * Get tooltip text (mirrors C# GetTooltip)
   */
  getTooltip() {
    const company = this.deviceInfo.companyName || 'FiscalStack';
    const devId = this.deviceInfo.deviceId || 'N/A';
    const day = this.deviceInfo.fiscalDay || '1';
    const tin = this.deviceInfo.tin || '';
    
    const statusStr = this.getStatusLabel();
    let tooltip = `${company} [${statusStr}]\nDev: ${devId} | Day: ${day}`;
    
    // Add TIN if available
    if (tin && tooltip.length < 50) {
      tooltip += ` | TIN: ${tin}`;
    }
    
    // Truncate if too long
    if (tooltip.length > 63) {
      tooltip = tooltip.substring(0, 60) + '...';
    }
    
    return tooltip;
  }

  /**
   * Get full status object for UI
   */
  getStatusObject() {
    return {
      status: this.currentStatus,
      label: this.getStatusLabel(),
      color: this.getStatusColor(),
      queueCount: this.queueCount,
      tooltip: this.getTooltip(),
      lastChecked: this.lastChecked,
      deviceInfo: this.deviceInfo
    };
  }

  /**
   * Check if currently online
   */
  isOnline() {
    return this.currentStatus === ConnectionStatus.Online;
  }

  /**
   * Check if currently offline
   */
  isOffline() {
    return this.currentStatus === ConnectionStatus.Offline;
  }

  /**
   * Check if in error state
   */
  isError() {
    return this.currentStatus === ConnectionStatus.Error;
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new StatusIndicator();
  }
  return instance;
}

module.exports = {
  StatusIndicator,
  ConnectionStatus,
  getInstance
};
