/**
 * Config Manager - Handles fiscal configuration (equivalent to config.ini)
 * Manages device counters, fiscal day status, and ZIMRA settings
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FiscalConfig, DeviceStatus } = require('./dataModels');

class ConfigManager {
    constructor(userDataPath) {
        this.configPath = path.join(userDataPath, 'fiscal-config.json');
        this.config = new FiscalConfig();
        this.loadConfig();
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const loaded = JSON.parse(data);
                this.config = { ...this.config, ...loaded };
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    /**
     * Save configuration to file
     */
    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to save config:', error);
            return false;
        }
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        return this.saveConfig();
    }

    /**
     * Get device status
     */
    getDeviceStatus() {
        return new DeviceStatus({
            deviceId: this.config.deviceId,
            deviceModelName: this.config.deviceModelName,
            deviceModelVersion: this.config.deviceModelVersion,
            fiscalDayStatus: this.config.fiscalDayStatus,
            fiscalDayNo: this.config.fiscalDayNo,
            fiscalDate: this.config.fiscalDate,
            receiptCounter: this.config.receiptCounter,
            receiptGlobalNo: this.config.receiptGlobalNo,
            previousReceiptHash: this.config.previousReceiptHash
        });
    }

    /**
     * Increment receipt counter
     */
    incrementReceiptCounter() {
        this.config.receiptCounter++;
        this.config.receiptGlobalNo++;
        return this.saveConfig();
    }

    /**
     * Update receipt hash for fiscal day continuity
     */
    updateReceiptHash(receiptData) {
        const hash = crypto.createHash('sha256').update(JSON.stringify(receiptData)).digest('base64');
        this.config.previousReceiptHash = hash;
        return this.saveConfig();
    }

    /**
     * Open fiscal day
     */
    openFiscalDay() {
        this.config.fiscalDayStatus = 'FiscalDayOpen';
        this.config.fiscalDayNo++;
        this.config.fiscalDate = new Date().toISOString();
        this.config.receiptCounter = 0;
        return this.saveConfig();
    }

    /**
     * Close fiscal day
     */
    closeFiscalDay() {
        this.config.fiscalDayStatus = 'FiscalDayClosed';
        return this.saveConfig();
    }

    /**
     * Check if fiscal day is open
     */
    isFiscalDayOpen() {
        return this.config.fiscalDayStatus === 'FiscalDayOpen';
    }

    /**
     * Reset device counters (admin function)
     */
    resetCounters() {
        this.config.receiptCounter = 0;
        this.config.receiptGlobalNo = 0;
        this.config.fiscalDayNo = 0;
        this.config.previousReceiptHash = '';
        return this.saveConfig();
    }

    /**
     * Set TIN
     */
    setTIN(tin) {
        this.config.tin = tin;
        return this.saveConfig();
    }

    /**
     * Set currency
     */
    setCurrency(currency) {
        this.config.currency = currency;
        return this.saveConfig();
    }

    /**
     * Set device ID
     */
    setDeviceId(deviceId) {
        this.config.deviceId = deviceId;
        return this.saveConfig();
    }

    /**
     * Set ZIMRA server URLs
     */
    setZimraServers(zimraServer, verificationServer) {
        this.config.zimraServer = zimraServer;
        this.config.verificationServer = verificationServer;
        return this.saveConfig();
    }

    /**
     * Set VAT rates
     */
    setVatRates(vatA, vatB, vatC, vatD, vatE, vatF) {
        this.config.vatA = vatA || '0.155';
        this.config.vatB = vatB || '0';
        this.config.vatC = vatC || '0';
        this.config.vatD = vatD || '0';
        this.config.vatE = vatE || '0';
        this.config.vatF = vatF || '0';
        return this.saveConfig();
    }

    /**
     * Get VAT rate by type
     */
    getVatRate(type) {
        switch(type.toUpperCase()) {
            case 'A': return this.config.vatA;
            case 'B': return this.config.vatB;
            case 'C': return this.config.vatC;
            case 'D': return this.config.vatD;
            case 'E': return this.config.vatE;
            case 'F': return this.config.vatF;
            default: return this.config.vatA;
        }
    }
}

module.exports = ConfigManager;
