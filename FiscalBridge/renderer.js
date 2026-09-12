/**
 * FiscalBridge Renderer Process
 * Handles UI logic, file monitoring, and API integration
 */

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.fiscalBridgeAPI;

// State management
let currentStep = 1;
let config = {};
let isMonitoring = false;
let receiptStats = {
    processed: 0,
    todayTotal: 0,
    lastReset: new Date().toDateString()
};

// Receipt parser instance
let receiptParser = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    if (!isElectron) {
        console.error('Not running in Electron environment');
        return;
    }

    await loadConfig();
    initializeUI();
    setupEventListeners();
});

/**
 * Load configuration from Electron main process
 */
async function loadConfig() {
    try {
        config = await window.fiscalBridgeAPI.getConfig();
        if (config.apiEndpoint) {
            config.apiEndpoint = config.apiEndpoint.replace(/\/api\/?$/, '');
        }
        
        // Check if setup is complete
        if (config.setupComplete) {
            showDashboard();
        } else {
            showWizard();
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showWizard();
    }
}

/**
 * Save configuration to Electron main process
 */
async function saveConfig() {
    try {
        await window.fiscalBridgeAPI.saveConfig(config);
    } catch (error) {
        console.error('Failed to save config:', error);
        showNotification('Failed to save configuration', 'error');
    }
}

/**
 * Initialize UI based on current state
 */
function initializeUI() {
    // Load printers
    loadPrinters();
    
    // Load currency config if exists
    loadCurrencyConfig();
    
    // Initialize receipt parser with current config
    receiptParser = new ReceiptParser(config);
    
    // Update company name display
    updateCompanyNameDisplay();
}

function updateCompanyNameDisplay() {
    const headerEl = document.getElementById('headerCompanyName');
    if (headerEl) {
        headerEl.textContent = config.companyName || '';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Wizard navigation
    document.getElementById('nextStep').addEventListener('click', nextStep);
    document.getElementById('prevStep').addEventListener('click', prevStep);
    document.getElementById('finishSetup').addEventListener('click', finishSetup);

    // Folder browsing
    document.getElementById('browseSource').addEventListener('click', async () => {
        const folderPath = await window.fiscalBridgeAPI.browseFolder();
        if (folderPath) {
            document.getElementById('sourceFolder').value = folderPath;
        }
    });

    document.getElementById('browseTarget').addEventListener('click', async () => {
        const folderPath = await window.fiscalBridgeAPI.browseFolder();
        if (folderPath) {
            document.getElementById('targetFolder').value = folderPath;
        }
    });

    // File browsing (logo)
    document.getElementById('browseLogo').addEventListener('click', async () => {
        const filePath = await window.fiscalBridgeAPI.browseFile([
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }
        ]);
        if (filePath) {
            document.getElementById('logoFile').value = filePath;
        }
    });
    
    // Currency management
    document.getElementById('addCurrency').addEventListener('click', addCurrency);
    
    // Printer management
    document.getElementById('testPrint').addEventListener('click', testPrint);
    
    // Dashboard controls
    document.getElementById('startMonitoring').addEventListener('click', startMonitoring);
    document.getElementById('stopMonitoring').addEventListener('click', stopMonitoring);
    document.getElementById('openSettings').addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('generateZReport').addEventListener('click', generateZReport);
    document.getElementById('getDeviceStatus').addEventListener('click', handleGetDeviceStatus);
    document.getElementById('getCardDetails').addEventListener('click', handleGetCardDetails);
    document.getElementById('viewUnprocessed').addEventListener('click', handleViewUnprocessed);
    document.getElementById('openFiscalDay').addEventListener('click', handleOpenFiscalDay);
    document.getElementById('closeFiscalDay').addEventListener('click', handleCloseFiscalDay);
    document.getElementById('resetCounters').addEventListener('click', handleResetCounters);
    document.getElementById('viewLogs').addEventListener('click', viewLogs);
    
    // File monitoring events
    if (isElectron) {
        window.fiscalBridgeAPI.onReceiptFileAdded(handleReceiptFile);
    }
}

/**
 * Show wizard for initial setup
 */
function showWizard() {
    document.getElementById('setupWizard').style.display = 'block';
    document.getElementById('mainDashboard').style.display = 'none';
    currentStep = 1;
    updateWizardUI();
}

/**
 * Show dashboard after setup
 */
function showDashboard() {
    document.getElementById('setupWizard').style.display = 'none';
    document.getElementById('mainDashboard').style.display = 'block';
    updateDashboardStats();
}

/**
 * Wizard navigation
 */
function nextStep() {
    if (currentStep < 5) {
        saveWizardStepData();
        currentStep++;
        updateWizardUI();
    }
}

function prevStep() {
    if (currentStep > 1) {
        saveWizardStepData();
        currentStep--;
        updateWizardUI();
    }
}

function updateWizardUI() {
    // Update step visibility
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
        if (parseInt(step.dataset.step) === currentStep) {
            step.classList.add('active');
        }
    });
    
    // Update buttons
    document.getElementById('prevStep').disabled = currentStep === 1;
    document.getElementById('nextStep').style.display = currentStep === 4 ? 'none' : 'block';
    document.getElementById('finishSetup').style.display = currentStep === 5 ? 'block' : 'none';
}

function saveWizardStepData() {
    switch(currentStep) {
        case 1:
            config.sourceFolder = document.getElementById('sourceFolder').value;
            config.targetFolder = document.getElementById('targetFolder').value;
            break;
        case 2:
            config.currencies = getCurrencies();
            break;
        case 3:
            config.productStartLine = document.getElementById('productStartLine').value;
            config.productEndLine = document.getElementById('productEndLine').value;
            config.itemDotCounter = document.getElementById('itemDotCounter').value;
            config.multiLineProduct = document.getElementById('multiLineProduct').value;
            config.vatA = document.getElementById('vatA').value;
            config.vatE = document.getElementById('vatE').value;
            break;
        case 4:
            config.printerName = document.getElementById('printerSelect').value;
            config.logoFile = document.getElementById('logoFile').value;
            break;
        case 5:
            config.companyName = document.getElementById('companyName').value;
            config.apiKey = document.getElementById('apiKey').value;
            config.apiEndpoint = document.getElementById('apiEndpoint').value;
            updateCompanyNameDisplay();
            break;
    }
}

async function finishSetup() {
    saveWizardStepData();
    config.setupComplete = true;
    await saveConfig();
    await window.fiscalBridgeAPI.saveCurrencyConfig(config.currencies);
    showDashboard();
}

/**
 * Currency management
 */
function addCurrency() {
    const currencyList = document.getElementById('currencyList');
    const newItem = document.createElement('div');
    newItem.className = 'currency-item';
    newItem.innerHTML = `
        <input type="text" placeholder="Keyword (e.g., USD)" class="currency-keyword">
        <input type="text" placeholder="Name (e.g., US Dollar)" class="currency-name">
        <button class="btn-remove" onclick="removeCurrency(this)">Remove</button>
    `;
    currencyList.appendChild(newItem);
}

function removeCurrency(button) {
    button.parentElement.remove();
}

function getCurrencies() {
    const currencies = [];
    document.querySelectorAll('.currency-item').forEach(item => {
        const keyword = item.querySelector('.currency-keyword').value;
        const name = item.querySelector('.currency-name').value;
        if (keyword && name) {
            currencies.push({ keyword, name });
        }
    });
    return currencies;
}

async function loadCurrencyConfig() {
    try {
        const result = await window.fiscalBridgeAPI.loadCurrencyConfig();
        if (result.success) {
            // Parse XML and populate currency list
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(result.content, 'text/xml');
            const currencyNodes = xmlDoc.querySelectorAll('currency');
            
            const currencyList = document.getElementById('currencyList');
            currencyList.innerHTML = '';
            
            currencyNodes.forEach(node => {
                const keyword = node.querySelector('keyword')?.textContent || '';
                const name = node.querySelector('Name')?.textContent || '';
                
                const newItem = document.createElement('div');
                newItem.className = 'currency-item';
                newItem.innerHTML = `
                    <input type="text" placeholder="Keyword (e.g., USD)" class="currency-keyword" value="${keyword}">
                    <input type="text" placeholder="Name (e.g., US Dollar)" class="currency-name" value="${name}">
                    <button class="btn-remove" onclick="removeCurrency(this)">Remove</button>
                `;
                currencyList.appendChild(newItem);
            });
        }
    } catch (error) {
        console.error('Failed to load currency config:', error);
    }
}

/**
 * Printer management
 */
async function loadPrinters() {
    try {
        const printers = await window.fiscalBridgeAPI.getPrinters();
        const select = document.getElementById('printerSelect');
        select.innerHTML = '<option value="">Select printer...</option>';
        
        printers.forEach(printer => {
            const option = document.createElement('option');
            option.value = printer.name;
            option.textContent = printer.name + (printer.isDefault ? ' (Default)' : '');
            select.appendChild(option);
        });
        
        // Select configured printer if exists
        if (config.printerName) {
            select.value = config.printerName;
        }
    } catch (error) {
        console.error('Failed to load printers:', error);
    }
}

async function testPrint() {
    const printerName = document.getElementById('printerSelect').value;
    if (!printerName) {
        showNotification('Please select a printer first', 'error');
        return;
    }
    
    const testHtml = `
        <html>
        <body style="font-family: monospace; text-align: center;">
            <h2>FiscalBridge Test Print</h2>
            <p>Printer: ${printerName}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <hr>
            <p>If you can read this, printing works!</p>
        </body>
        </html>
    `;
    
    try {
        await window.fiscalBridgeAPI.printReceipt(testHtml, printerName);
        showNotification('Test print sent successfully', 'success');
    } catch (error) {
        showNotification('Failed to print: ' + error, 'error');
    }
}



/**
 * File monitoring
 */
async function startMonitoring() {
    if (!config.sourceFolder || !config.targetFolder) {
        showNotification('Please configure source and target folders first', 'error');
        return;
    }
    
    try {
        const result = await window.fiscalBridgeAPI.startFolderWatch(config.sourceFolder, config.targetFolder);
        if (result.success) {
            isMonitoring = true;
            updateMonitoringUI();
            showNotification('Started monitoring ' + config.sourceFolder, 'success');
        } else {
            showNotification('Failed to start monitoring: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Failed to start monitoring: ' + error, 'error');
    }
}

async function stopMonitoring() {
    try {
        const result = await window.fiscalBridgeAPI.stopFolderWatch();
        if (result.success) {
            isMonitoring = false;
            updateMonitoringUI();
            showNotification('Stopped monitoring', 'success');
        }
    } catch (error) {
        showNotification('Failed to stop monitoring: ' + error, 'error');
    }
}

function updateMonitoringUI() {
    document.getElementById('startMonitoring').style.display = isMonitoring ? 'none' : 'block';
    document.getElementById('stopMonitoring').style.display = isMonitoring ? 'block' : 'none';
    document.getElementById('monitoringStatus').textContent = isMonitoring ? 'Active' : 'Idle';
    
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (isMonitoring) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    }
}

/**
 * Handle new receipt file
 */
async function handleReceiptFile(data) {
    showProcessingModal('Processing receipt...');
    
    try {
        // Read receipt file
        const fileResult = await window.fiscalBridgeAPI.readReceiptFile(data.filePath);
        if (!fileResult.success) {
            throw new Error('Failed to read receipt file');
        }
        
        // Parse receipt
        const currencies = config.currencies || [];
        receiptParser = new ReceiptParser(config);
        const invoiceData = receiptParser.parseReceipt(fileResult.content, currencies);
        
        // Fiscalize via Fiskaztech API
        const fiscalizeResult = await fiscalizeInvoice(invoiceData);
        
        if (fiscalizeResult.success) {
            // Move processed file
            const moveResult = await window.fiscalBridgeAPI.moveReceiptFile(
                data.filePath, 
                data.targetFolder
            );
            
            if (moveResult.success) {
                // Update stats
                receiptStats.processed++;
                receiptStats.todayTotal += parseFloat(invoiceData.invoiceAmount) || 0;
                updateDashboardStats();
                
                // Add to activity log
                addActivityItem(invoiceData.invoiceNumber, 'Processed successfully');
                
                showNotification('Receipt processed: ' + invoiceData.invoiceNumber, 'success');
                
                // Print receipt if configured
                if (config.printerName) {
                    await printFiscalReceipt(invoiceData, fiscalizeResult.data);
                }
            }
        } else {
            throw new Error(fiscalizeResult.error || 'Fiscalization failed');
        }
    } catch (error) {
        console.error('Error processing receipt:', error);
        addActivityItem('Error', error.message);
        showNotification('Failed to process receipt: ' + error.message, 'error');
    } finally {
        hideProcessingModal();
    }
}

/**
 * Get Card Details (Device Information)
 */
async function getCardDetails() {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/device-details`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get Device Status
 */
async function getDeviceStatus() {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/device-status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Fiscalize invoice via Fiskaztech API (TransactM)
 */
async function fiscalizeInvoice(invoiceData) {
    try {
        // Convert parsed invoice data to Fiskaztech API format
        const apiData = {
            items: invoiceData.items.map(item => ({
                name: item.itemName1,
                quantity: parseFloat(item.quantity),
                unitPrice: parseFloat(item.price),
                taxType: item.taxable === 'Exem' ? 'EXEMPT' : 'STANDARD',
                taxInclusive: invoiceData.taxable === 'Incl'
            })),
            currency: invoiceData.currency || 'USD',
            paymentMethod: 'CASH',
            buyer: {
                registeredName: invoiceData.customerName,
                tin: invoiceData.customerTIN,
                vatNumber: invoiceData.customerVATNumber,
                email: invoiceData.customerEmail,
                phone: invoiceData.customerTelephoneNumber
            },
            invoiceNumber: invoiceData.invoiceNumber,
            transactionType: invoiceData.invoiceFlag === '02' ? 'CreditNote' : 'FiscalInvoice'
        };
        
        const response = await fetch(`${config.apiEndpoint}/api/zimra/transact`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            },
            body: JSON.stringify(apiData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Print fiscal receipt with QR code
 */
async function printFiscalReceipt(invoiceData, fiscalizeResult) {
    const qrCode = fiscalizeResult.qrCode || '';
    const receiptHtml = `
        <html>
        <body style="font-family: monospace; width: 80mm; margin: 0; padding: 10px;">
            <div style="text-align: center; margin-bottom: 10px;">
                <h2 style="margin: 0;">FISCAL RECEIPT</h2>
                <p style="margin: 5px 0;">${invoiceData.invoiceNumber}</p>
                <p style="margin: 5px 0;">${new Date().toLocaleString()}</p>
            </div>
            <hr style="border: 1px dashed #000;">
            ${invoiceData.items.map(item => `
                <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                    <span>${item.itemName1}</span>
                    <span>${item.quantity} x ${item.price}</span>
                </div>
                <div style="text-align: right; margin: 2px 0;">
                    <span>${item.amount}</span>
                </div>
            `).join('')}
            <hr style="border: 1px dashed #000;">
            <div style="display: flex; justify-content: space-between; margin: 10px 0;">
                <strong>Total:</strong>
                <strong>${invoiceData.invoiceAmount}</strong>
            </div>
            <div style="text-align: center; margin: 20px 0;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrCode)}" alt="QR Code" style="width: 100px; height: 100px;">
                <p style="font-size: 10px; margin: 5px 0;">${fiscalizeResult.fiscalCode || ''}</p>
            </div>
        </body>
        </html>
    `;
    
    try {
        await window.fiscalBridgeAPI.printReceipt(receiptHtml, config.printerName);
    } catch (error) {
        console.error('Failed to print receipt:', error);
    }
}

/**
 * Z-Report generation (Unified Z-Report for open/close)
 */
async function generateZReport() {
    showProcessingModal('Generating Z-Report...');
    
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/day/z-report`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Z-Report generated successfully', 'success');
            // Print Z-Report if configured
            if (config.printerName && result.data) {
                await printZReport(result.data);
            }
        } else {
            showNotification('Failed to generate Z-Report: ' + (result.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Failed to generate Z-Report: ' + error.message, 'error');
    } finally {
        hideProcessingModal();
    }
}

/**
 * Get Transaction by invoice number
 */
async function getTransaction(invoiceNumber) {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/transactions/${invoiceNumber}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get Unprocessed Transaction Summary
 */
async function getUnprocessedSummary() {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/transactions/unprocessed/summary`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get Unprocessed Transactions
 */
async function getUnprocessedTransactions() {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/transactions/unprocessed`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Clear Unprocessed Transactions
 */
async function clearUnprocessedTransactions() {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/transactions/unprocessed`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get Unprocessed Transactions By Date
 */
async function getUnprocessedByDate(date) {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/transactions/unprocessed/by-date?date=${date}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Clear Unprocessed Transactions By Date
 */
async function clearUnprocessedByDate(date) {
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/transactions/unprocessed/by-date?date=${date}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            return { success: true, data: result };
        } else {
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Reset Device Counters
 */
async function resetDeviceCounters() {
    showProcessingModal('Resetting device counters...');
    
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/config/reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Device counters reset successfully', 'success');
            return { success: true, data: result };
        } else {
            showNotification('Failed to reset counters: ' + (result.message || 'Unknown error'), 'error');
            return { success: false, error: result.message || 'API error' };
        }
    } catch (error) {
        showNotification('Failed to reset counters: ' + error.message, 'error');
        return { success: false, error: error.message };
    } finally {
        hideProcessingModal();
    }
}

async function printZReport(zReportData) {
    const reportHtml = `
        <html>
        <body style="font-family: monospace; width: 80mm; margin: 0; padding: 10px;">
            <h2 style="text-align: center;">Z-REPORT</h2>
            <p style="text-align: center;">${new Date().toLocaleString()}</p>
            <hr style="border: 1px dashed #000;">
            <div style="margin: 10px 0;">
                <p><strong>Receipts Processed:</strong> ${receiptStats.processed}</p>
                <p><strong>Total Amount:</strong> ${receiptStats.todayTotal.toFixed(2)}</p>
            </div>
            <hr style="border: 1px dashed #000;">
            <p style="text-align: center; font-size: 10px;">FiscalBridge Z-Report</p>
        </body>
        </html>
    `;
    
    try {
        await window.fiscalBridgeAPI.printReceipt(reportHtml, config.printerName);
    } catch (error) {
        console.error('Failed to print Z-Report:', error);
    }
}

/**
 * Dashboard management
 */
function updateDashboardStats() {
    document.getElementById('receiptsProcessed').textContent = receiptStats.processed;
    document.getElementById('todayTotal').textContent = '$' + receiptStats.todayTotal.toFixed(2);
    
    // Reset daily stats if new day
    if (receiptStats.lastReset !== new Date().toDateString()) {
        receiptStats.processed = 0;
        receiptStats.todayTotal = 0;
        receiptStats.lastReset = new Date().toDateString();
    }
}

function addActivityItem(invoiceNumber, message) {
    const activityList = document.getElementById('activityList');
    const time = new Date().toLocaleTimeString();
    
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
        <span class="activity-time">${time}</span>
        <span class="activity-message">${invoiceNumber}: ${message}</span>
    `;
    
    // Remove placeholder if exists
    const placeholder = activityList.querySelector('.activity-item');
    if (placeholder && placeholder.textContent.includes('No recent activity')) {
        activityList.innerHTML = '';
    }
    
    activityList.insertBefore(item, activityList.firstChild);
    
    // Keep only last 20 items
    while (activityList.children.length > 20) {
        activityList.removeChild(activityList.lastChild);
    }
}

/**
 * Settings modal
 */
function openSettings() {
    const wizardSteps = document.querySelector('.wizard-steps');
    const settingsContent = document.getElementById('settingsContent');
    
    // Transplant wizard steps to settings to keep event listeners and avoid duplicate IDs
    if (wizardSteps && wizardSteps.children.length > 0) {
        while (wizardSteps.firstChild) {
            settingsContent.appendChild(wizardSteps.firstChild);
        }
    }

    // Populate current config
    if (config.sourceFolder) document.getElementById('sourceFolder').value = config.sourceFolder;
    if (config.targetFolder) document.getElementById('targetFolder').value = config.targetFolder;
    
    if (config.productStartLine) document.getElementById('productStartLine').value = config.productStartLine;
    if (config.productEndLine) document.getElementById('productEndLine').value = config.productEndLine;
    if (config.itemDotCounter) document.getElementById('itemDotCounter').value = config.itemDotCounter;
    if (config.multiLineProduct) document.getElementById('multiLineProduct').value = config.multiLineProduct;
    if (config.vatA) document.getElementById('vatA').value = config.vatA;
    if (config.vatE) document.getElementById('vatE').value = config.vatE;

    if (config.printerName) document.getElementById('printerSelect').value = config.printerName;
    if (config.logoFile) document.getElementById('logoFile').value = config.logoFile;

    if (config.companyName) document.getElementById('companyName').value = config.companyName;
    if (config.apiEndpoint) document.getElementById('apiEndpoint').value = config.apiEndpoint;
    if (config.apiKey) document.getElementById('apiKey').value = config.apiKey;

    // Show all steps
    settingsContent.querySelectorAll('.wizard-step').forEach(step => {
        step.style.display = 'block';
    });

    document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

async function saveSettings() {
    // Save settings back to config
    config.sourceFolder = document.getElementById('sourceFolder').value;
    config.targetFolder = document.getElementById('targetFolder').value;
    
    config.productStartLine = document.getElementById('productStartLine').value;
    config.productEndLine = document.getElementById('productEndLine').value;
    config.itemDotCounter = document.getElementById('itemDotCounter').value;
    config.multiLineProduct = document.getElementById('multiLineProduct').value;
    config.vatA = document.getElementById('vatA').value;
    config.vatE = document.getElementById('vatE').value;

    config.printerName = document.getElementById('printerSelect').value;
    config.logoFile = document.getElementById('logoFile').value;

    config.companyName = document.getElementById('companyName').value;
    config.apiEndpoint = document.getElementById('apiEndpoint').value.replace(/\/api\/?$/, '');
    config.apiKey = document.getElementById('apiKey').value;
    
    config.currencies = getCurrencies();
    
    await saveConfig();
    await window.fiscalBridgeAPI.saveCurrencyConfig(config.currencies);
    
    updateCompanyNameDisplay();
    
    showNotification('Settings saved successfully', 'success');
    closeSettings();
}

/**
 * Modal management
 */
function showProcessingModal(message) {
    document.getElementById('processingMessage').textContent = message;
    document.getElementById('processingModal').style.display = 'flex';
}

function hideProcessingModal() {
    document.getElementById('processingModal').style.display = 'none';
}

/**
 * Notifications
 */
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    const modal = document.getElementById('notificationModal');
    const title = document.getElementById('notificationTitle');
    const msg = document.getElementById('notificationMessage');
    
    if (modal && title && msg) {
        title.textContent = type === 'error' ? 'Error' : (type === 'success' ? 'Success' : 'Notification');
        title.style.color = type === 'error' ? '#e53e3e' : (type === 'success' ? '#38a169' : '#333');
        msg.textContent = message;
        modal.style.display = 'flex';
    } else {
        alert(message);
    }
}

/**
 * Handle Get Device Status
 */
async function handleGetDeviceStatus() {
    showProcessingModal('Getting device status...');
    
    try {
        const result = await getDeviceStatus();
        if (result.success) {
            showNotification('Device Status: ' + JSON.stringify(result.data, null, 2), 'success');
            addActivityItem('Device Status', 'Retrieved successfully');
        } else {
            showNotification('Failed to get device status: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Failed to get device status: ' + error.message, 'error');
    } finally {
        hideProcessingModal();
    }
}

/**
 * Handle Get Card Details
 */
async function handleGetCardDetails() {
    showProcessingModal('Getting card details...');
    
    try {
        const result = await getCardDetails();
        if (result.success) {
            showNotification('Card Details: ' + JSON.stringify(result.data, null, 2), 'success');
            addActivityItem('Card Details', 'Retrieved successfully');
        } else {
            showNotification('Failed to get card details: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Failed to get card details: ' + error.message, 'error');
    } finally {
        hideProcessingModal();
    }
}

/**
 * Handle View Unprocessed Transactions
 */
async function handleViewUnprocessed() {
    showProcessingModal('Getting unprocessed transactions...');
    
    try {
        const result = await getUnprocessedTransactions();
        if (result.success) {
            showNotification('Unprocessed Transactions: ' + JSON.stringify(result.data, null, 2), 'success');
            addActivityItem('Unprocessed', 'Retrieved successfully');
        } else {
            showNotification('Failed to get unprocessed: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Failed to get unprocessed: ' + error.message, 'error');
    } finally {
        hideProcessingModal();
    }
}

/**
 * Handle Reset Counters
 */
async function handleResetCounters() {
    if (!confirm('Are you sure you want to reset device counters? This action cannot be undone.')) {
        return;
    }
    
    await resetDeviceCounters();
}

/**
 * Handle Open Fiscal Day
 */
async function handleOpenFiscalDay() {
    showProcessingModal('Opening fiscal day...');
    
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/z-report?action=open`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Update local state too
            await window.fiscalBridgeAPI.openFiscalDay();
            showNotification('Fiscal day opened successfully', 'success');
            addActivityItem('Fiscal Day', 'Opened successfully');
            updateFiscalDayStatus();
        } else {
            showNotification('Failed to open fiscal day: ' + (result.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Failed to open fiscal day: ' + error.message, 'error');
    } finally {
        hideProcessingModal();
    }
}

/**
 * Handle Close Fiscal Day
 */
async function handleCloseFiscalDay() {
    if (!confirm('Are you sure you want to close the fiscal day? This will finalize all transactions for the current fiscal day.')) {
        return;
    }
    
    showProcessingModal('Closing fiscal day...');
    
    try {
        const response = await fetch(`${config.apiEndpoint}/api/zimra/z-report?action=close`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            }
        });
        
        const result = await response.json();

        if (response.ok) {
            // Update local state too
            await window.fiscalBridgeAPI.closeFiscalDay();
            showNotification('Fiscal day closed successfully', 'success');
            addActivityItem('Fiscal Day', 'Closed successfully');
            updateFiscalDayStatus();
        } else {
            showNotification('Failed to close fiscal day: ' + (result.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Failed to close fiscal day: ' + error.message, 'error');
    } finally {
        hideProcessingModal();
    }
}

/**
 * Update fiscal day status display
 */
async function updateFiscalDayStatus() {
    try {
        const isOpen = await window.fiscalBridgeAPI.isFiscalDayOpen();
        const statusText = document.getElementById('monitoringStatus');
        statusText.textContent = isOpen ? 'Fiscal Day Open' : 'Fiscal Day Closed';
    } catch (error) {
        console.error('Failed to update fiscal day status:', error);
    }
}

/**
 * View logs (placeholder)
 */
function viewLogs() {
    showNotification('Log viewer not implemented yet', 'info');
}

// Load ReceiptParser class if not available
if (typeof ReceiptParser === 'undefined') {
    // In production, this would be loaded from a separate file
    // For now, we'll assume it's available globally
}
