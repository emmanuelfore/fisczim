import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'pos-offline';
const DB_VERSION = 9;

interface PendingSale {
    id: string;
    companyId: number;
    branchId?: number | null;
    invoiceData: any;
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed';
    error?: string;
    attempts: number;
}

interface PendingShiftAction {
    id: string;
    companyId: number;
    branchId?: number | null;
    type: 'open' | 'close';
    data: any;
    status: 'pending' | 'syncing' | 'failed';
    createdAt: string;
}

interface OfflineHold {
    id: string;
    companyId: number;
    branchId?: number | null;
    cartData: any;
    customerId: string;
    holdName: string;
    createdAt: string;
}

let dbInstance: IDBPDatabase | null = null;
let isDbBroken = false;

/**
 * Returns true if IndexedDB failed to initialize (e.g. "Internal error opening backing store").
 * This allows the UI to show a "Reset Storage" button in Electron.
 */
export function isStorageBroken() {
    return isDbBroken;
}

export async function getDb(): Promise<IDBPDatabase> {
    if (dbInstance) return dbInstance;

    try {
        dbInstance = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion) {
            console.log(`[DB] Upgrading from ${oldVersion} to ${newVersion}`);

            const stores = [
                'products', 'customers', 'currencies', 'taxConfig',
                'companySettings', 'shifts', 'metadata', 'user_cache',
                'companies_list', 'zimraConfig', 'fiscalSequence'
            ];

            stores.forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            });

            // Sales History (for offline reprinting and viewing)
            if (!db.objectStoreNames.contains('salesHistory')) {
                const store = db.createObjectStore('salesHistory', { keyPath: 'id' });
                store.createIndex('byCompany', 'companyId');
                store.createIndex('byDate', 'issueDate');
            }

            // Pending sales queue
            if (!db.objectStoreNames.contains('pendingSales')) {
                const store = db.createObjectStore('pendingSales', { keyPath: 'id' });
                store.createIndex('byCompany', 'companyId');
                store.createIndex('byStatus', 'status');
            }

            // Pending shifts queue
            if (!db.objectStoreNames.contains('pendingShifts')) {
                const store = db.createObjectStore('pendingShifts', { keyPath: 'id' });
                store.createIndex('byCompany', 'companyId');
                store.createIndex('byStatus', 'status');
            }

            // Holds store
            if (!db.objectStoreNames.contains('holds')) {
                const store = db.createObjectStore('holds', { keyPath: 'id' });
                store.createIndex('byCompany', 'companyId');
            }

            // Offline Credentials
            if (!db.objectStoreNames.contains('offline_credentials')) {
                db.createObjectStore('offline_credentials', { keyPath: 'email' });
            }

            // Pending Customers
            if (!db.objectStoreNames.contains('pendingCustomers')) {
                const store = db.createObjectStore('pendingCustomers', { keyPath: 'id' });
                store.createIndex('byCompany', 'companyId');
                store.createIndex('byStatus', 'status');
            }
        },
        blocked() {
            console.warn('[DB] Upgrade blocked by older version open in another tab. Please close all tabs.');
        },
        blocking() {
            console.warn('[DB] New version available, closing this connection to allow upgrade.');
            dbInstance?.close();
            dbInstance = null;
        }
    });

    return dbInstance;
    } catch (err: any) {
        console.error('[DB] Critical IndexedDB error:', err);
        isDbBroken = true;
        
        // Return a mock object to prevent the entire app from crashing.
        // Callers will get 'undefined' for reads and 'nothing' for writes.
        return {
            get: async () => undefined,
            put: async () => undefined,
            add: async () => undefined,
            delete: async () => undefined,
            clear: async () => undefined,
            getAll: async () => [],
            getAllFromIndex: async () => [],
            count: async () => 0,
            transaction: () => ({
                objectStore: () => ({
                    get: async () => undefined,
                    put: async () => undefined,
                    add: async () => undefined,
                    delete: async () => undefined,
                    index: () => ({
                        get: async () => undefined,
                        getAll: async () => [],
                    }),
                }),
                done: Promise.resolve(),
                abort: () => {},
            }),
            close: () => {},
            objectStoreNames: { 
                contains: () => true,
                item: () => null,
                length: 0
            },
        } as unknown as IDBPDatabase;
    }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function setLastCacheTime(companyId: number, timestamp: number): Promise<void> {
    const db = await getDb();
    await db.put('metadata', timestamp, `lastCache-${companyId}`);
}

export async function getLastCacheTime(companyId: number): Promise<number | undefined> {
    const db = await getDb();
    return db.get('metadata', `lastCache-${companyId}`);
}

// ─── User Cache ─────────────────────────────────────────────────────────────

export async function cacheUser(user: any): Promise<void> {
    const db = await getDb();
    await db.put('user_cache', user, 'current_user');
}

export async function getCachedUser(): Promise<any | undefined> {
    const db = await getDb();
    return db.get('user_cache', 'current_user');
}

export async function clearCachedUser(): Promise<void> {
    const db = await getDb();
    await db.delete('user_cache', 'current_user');
    // Note: We intentionally do NOT clear 'offline_credentials' or 'companies_list' here.
    // This allows cashiers to log back into the POS terminal even if
    // the internet drops after they've explicitly logged out, and ensures
    // selectedCompanyId can be restored on next offline login.
}

// ─── Offline Credentials ────────────────────────────────────────────────────

// Simple hashing for local offline verification. NOT meant for production backend storage,
// but sufficient for preventing plain-text storage of local caching.
async function hashPassword(password: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function saveOfflineCredentials(email: string, password: string, user: any): Promise<void> {
    const db = await getDb();
    // Fallback for crypto.randomUUID() which is not available in older WebViews (Android < 7 and some Android 7)
    const salt = (typeof crypto.randomUUID === 'function') 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    const hash = await hashPassword(password, salt);
    let pinHash = undefined;
    let pinSalt = undefined;

    // If the user has a PIN in their profile, securely hash it as well
    if (user?.pin) {
        pinSalt = (typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
        pinHash = await hashPassword(user.pin, pinSalt);
    }
    
    await db.put('offline_credentials', {
        email: email.toLowerCase(),
        hash,
        salt,
        pinHash,
        pinSalt,
        user,
        lastOnlineLogin: new Date().toISOString()
    });
}

export async function verifyOfflineCredentials(email: string, password: string): Promise<any | null> {
    const db = await getDb();
    const record = await db.get('offline_credentials', email.toLowerCase());
    
    if (!record) return null;
    
    const computedHash = await hashPassword(password, record.salt);
    if (computedHash === record.hash) {
        return record.user;
    }
    
    return null;
}

export async function verifyOfflinePinCredentials(email: string, pin: string): Promise<any | null> {
    const db = await getDb();
    const record = await db.get('offline_credentials', email.toLowerCase());
    
    if (!record || !record.pinHash || !record.pinSalt) return null;
    
    const computedHash = await hashPassword(pin, record.pinSalt);
    if (computedHash === record.pinHash) {
        return record.user;
    }
    
    return null;
}

export async function getOfflineUsers(): Promise<any[]> {
    const db = await getDb();
    const allRecords = await db.getAll('offline_credentials');
    return allRecords.map(r => r.user);
}

// ─── Companies List ──────────────────────────────────────────────────────────

export async function cacheCompaniesList(companies: any[]): Promise<void> {
    const db = await getDb();
    await db.put('companies_list', companies, 'current_list');
}

export async function getCachedCompaniesList(): Promise<any[] | undefined> {
    const db = await getDb();
    return db.get('companies_list', 'current_list');
}

// ─── Products ───────────────────────────────────────────────────────────────

export async function cacheProducts(companyId: number, products: any[]): Promise<void> {
    const db = await getDb();
    await db.put('products', products, companyId);
}

export async function getCachedProducts(companyId: number): Promise<any[] | undefined> {
    const db = await getDb();
    // Try numeric key first, then string key (handles legacy data stored with string companyId)
    const result = await db.get('products', companyId);
    if (result) return result;
    return db.get('products', String(companyId));
}

// ─── Customers ──────────────────────────────────────────────────────────────

export async function cacheCustomers(companyId: number, customers: any[]): Promise<void> {
    const db = await getDb();
    await db.put('customers', customers, companyId);
}

export async function getCachedCustomers(companyId: number): Promise<any[] | undefined> {
    const db = await getDb();
    const result = await db.get('customers', companyId);
    if (result) return result;
    return db.get('customers', String(companyId));
}

// ─── Currencies ─────────────────────────────────────────────────────────────

export async function cacheCurrencies(companyId: number, currencies: any[]): Promise<void> {
    const db = await getDb();
    await db.put('currencies', currencies, companyId);
}

export async function getCachedCurrencies(companyId: number): Promise<any[] | undefined> {
    const db = await getDb();
    const result = await db.get('currencies', companyId);
    if (result) return result;
    return db.get('currencies', String(companyId));
}

// ─── Tax Config ─────────────────────────────────────────────────────────────

export async function cacheTaxConfig(companyId: number, taxConfig: any): Promise<void> {
    const db = await getDb();
    await db.put('taxConfig', taxConfig, companyId);
}

export async function getCachedTaxConfig(companyId: number): Promise<any | undefined> {
    const db = await getDb();
    const result = await db.get('taxConfig', companyId);
    if (result) return result;
    return db.get('taxConfig', String(companyId));
}

// ─── Company Settings ───────────────────────────────────────────────────────

export async function cacheCompanySettings(companyId: number, company: any): Promise<void> {
    const db = await getDb();
    await db.put('companySettings', company, companyId);
}

export async function getCachedCompanySettings(companyId: number): Promise<any | undefined> {
    const db = await getDb();
    const result = await db.get('companySettings', companyId);
    if (result) return result;
    return db.get('companySettings', String(companyId));
}

// ─── Zimra Config ───────────────────────────────────────────────────────────

export async function cacheZimraConfig(companyId: number, config: any): Promise<void> {
    const db = await getDb();
    await db.put('zimraConfig', config, companyId);
}

export async function getCachedZimraConfig(companyId: number): Promise<any | undefined> {
    const db = await getDb();
    const result = await db.get('zimraConfig', companyId);
    if (result) return result;
    return db.get('zimraConfig', String(companyId));
}

// ─── Fiscal Sequence ────────────────────────────────────────────────────────

export async function cacheFiscalSequence(companyId: number, sequence: any): Promise<void> {
    const db = await getDb();
    await db.put('fiscalSequence', sequence, companyId);
}

export async function getCachedFiscalSequence(companyId: number): Promise<any | undefined> {
    const db = await getDb();
    const result = await db.get('fiscalSequence', companyId);
    if (result) return result;
    return db.get('fiscalSequence', String(companyId));
}

// ─── Shifts ─────────────────────────────────────────────────────────────────

export async function cacheShift(companyId: number, shift: any): Promise<void> {
    const db = await getDb();
    await db.put('shifts', shift, companyId);
}

export async function getCachedShift(companyId: number): Promise<any | undefined> {
    const db = await getDb();
    const result = await db.get('shifts', companyId);
    if (result) return result;
    return db.get('shifts', String(companyId));
}

// ─── Pending Shifts ─────────────────────────────────────────────────────────

export async function addPendingShiftAction(companyId: number, type: 'open' | 'close', data: any, branchId?: number | null): Promise<string> {
    const db = await getDb();
    const id = `shift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const action: PendingShiftAction = {
        id,
        companyId,
        branchId,
        type,
        data,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    await db.put('pendingShifts', action);
    return id;
}

export async function getPendingShifts(companyId: number): Promise<PendingShiftAction[]> {
    const db = await getDb();
    return db.getAllFromIndex('pendingShifts', 'byCompany', companyId);
}

export async function updatePendingShiftStatus(id: string, status: PendingShiftAction['status']): Promise<void> {
    const db = await getDb();
    const action = await db.get('pendingShifts', id);
    if (action) {
        action.status = status;
        await db.put('pendingShifts', action);
    }
}

export async function removePendingShift(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('pendingShifts', id);
}

// ─── Holds ──────────────────────────────────────────────────────────────────

export async function addOfflineHold(companyId: number, cartData: any, customerId: string, holdName: string, branchId?: number | null): Promise<string> {
    const db = await getDb();
    const id = `hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hold: OfflineHold = {
        id,
        companyId,
        branchId,
        cartData,
        customerId,
        holdName,
        createdAt: new Date().toISOString(),
    };
    await db.put('holds', hold);
    return id;
}

export async function getOfflineHolds(companyId: number): Promise<OfflineHold[]> {
    const db = await getDb();
    return db.getAllFromIndex('holds', 'byCompany', companyId);
}

export async function removeOfflineHold(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('holds', id);
}

// ─── Pending Sales ──────────────────────────────────────────────────────────

export async function addPendingSale(companyId: number, invoiceData: any, branchId?: number | null): Promise<string> {
    const db = await getDb();
    const id = invoiceData?.idempotencyKey || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sale: PendingSale = {
        id,
        companyId,
        branchId,
        invoiceData,
        createdAt: new Date().toISOString(),
        status: 'pending',
        attempts: 0,
    };
    await db.put('pendingSales', sale);
    return id;
}

export async function getPendingSales(companyId: number): Promise<PendingSale[]> {
    const db = await getDb();
    const all = await db.getAllFromIndex('pendingSales', 'byCompany', companyId);
    return all;
}

export async function getAllPendingSalesByStatus(status: PendingSale['status']): Promise<PendingSale[]> {
    const db = await getDb();
    return db.getAllFromIndex('pendingSales', 'byStatus', status);
}

export async function updatePendingSaleStatus(
    id: string,
    status: PendingSale['status'],
    error?: string
): Promise<void> {
    const db = await getDb();
    const sale = await db.get('pendingSales', id);
    if (sale) {
        sale.status = status;
        sale.attempts = (sale.attempts || 0) + 1;
        if (error) sale.error = error;
        await db.put('pendingSales', sale);
    }
}

export async function removePendingSale(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('pendingSales', id);
}

export async function getPendingSalesCount(companyId: number): Promise<number> {
    const sales = await getPendingSales(companyId);
    return sales.filter(s => s.status === 'pending' || s.status === 'failed').length;
}

export async function getPendingShiftsCount(companyId: number): Promise<number> {
    const shifts = await getPendingShifts(companyId);
    return shifts.filter(s => s.status === 'pending' || s.status === 'failed').length;
}

// ─── Sales History ──────────────────────────────────────────────────────────

export async function addSalesHistory(companyId: number, invoices: any[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('salesHistory', 'readwrite');
    for (const inv of invoices) {
        // Ensure companyId is present on the invoice for indexing
        if (!inv.companyId) inv.companyId = companyId;
        await tx.store.put(inv);
    }
    await tx.done;
}

export async function getSalesHistory(companyId: number): Promise<any[]> {
    const db = await getDb();
    return db.getAllFromIndex('salesHistory', 'byCompany', companyId);
}

export async function getSaleHistoryById(id: number | string): Promise<any | undefined> {
    const db = await getDb();
    return db.get('salesHistory', id);
}

export async function generateOfflineReport(companyId: number, dateStr: string): Promise<any> {
    const db = await getDb();
    // In our DB, we index by 'companyId'. We will filter the results by 'issueDate' starting with dateStr
    const allSales = await db.getAllFromIndex('salesHistory', 'byCompany', companyId);
    const todaySales = allSales.filter(sale => sale.issueDate?.startsWith(dateStr));
    
    // Also grab any pending sales that match this date
    const pendingSales = await db.getAllFromIndex('pendingSales', 'byCompany', companyId);
    const todayPending = pendingSales
        .filter(ps => ps.timestamp && new Date(ps.timestamp).toISOString().startsWith(dateStr))
        .map(ps => ps.payload);

    // Merge them. Note that pendingSales might already exist in salesHistory (if they were cached), 
    // but to avoid duplicates we'll track by internal ID or receiptNumber
    const saleMap = new Map();
    todaySales.forEach(s => saleMap.set(s.id || s.receiptNumber, s));
    todayPending.forEach(s => saleMap.set(s.id || s.receiptNumber || Math.random(), s));

    const uniqueSales = Array.from(saleMap.values());

    let totalAmount = 0;
    const currency = uniqueSales[0]?.currency || "USD";
    const paymentMethodsMap: Record<string, { count: number, total: number }> = {};
    const cashiersMap: Record<string, { count: number, total: number, name: string }> = {};
    const itemsMap: Record<string, { quantity: number, total: number, name: string }> = {};
    const taxesMap: Record<string, { net: number, tax: number }> = {};

    uniqueSales.forEach(sale => {
        const saleTotal = Number(sale.totalAmount || sale.total || 0);
        totalAmount += saleTotal;

        // Payment Method
        const method = sale.paymentMethod || "CASH";
        if (!paymentMethodsMap[method]) paymentMethodsMap[method] = { count: 0, total: 0 };
        paymentMethodsMap[method].count++;
        paymentMethodsMap[method].total += saleTotal;

        // Cashier
        const cashierName = sale.cashierName || "Offline Cashier";
        const cashierId = sale.cashierId || "offline";
        if (!cashiersMap[cashierId]) cashiersMap[cashierId] = { count: 0, total: 0, name: cashierName };
        cashiersMap[cashierId].count++;
        cashiersMap[cashierId].total += saleTotal;

        // Items
        if (sale.items && Array.isArray(sale.items)) {
            sale.items.forEach((item: any) => {
                const pId = item.productId || item.name;
                if (!itemsMap[pId]) itemsMap[pId] = { quantity: 0, total: 0, name: item.name };
                itemsMap[pId].quantity += Number(item.quantity || 1);
                itemsMap[pId].total += Number(item.total || 0);

                // Taxes
                const taxRate = Number(item.taxRate || 0);
                if (!taxesMap[taxRate]) taxesMap[taxRate] = { net: 0, tax: 0 };
                const itemTotal = Number(item.total || 0);
                const taxAmt = Number(item.taxAmount || 0);
                taxesMap[taxRate].net += (itemTotal - taxAmt);
                taxesMap[taxRate].tax += taxAmt;
            });
        }
    });

    return {
        salesCount: uniqueSales.length,
        totalAmount,
        currency,
        cashiers: Object.entries(cashiersMap).map(([id, val]) => ({ cashierId: id, ...val, currency })),
        paymentMethods: Object.entries(paymentMethodsMap).map(([method, val]) => ({ method, ...val, currency })),
        items: Object.entries(itemsMap).map(([id, val]) => ({ productId: id, ...val, currency })),
        taxes: Object.entries(taxesMap).map(([rate, val]) => ({ taxRate: rate, ...val }))
    };
}

// ─── Pending Customers ───────────────────────────────────────────────────────

export async function addPendingCustomer(customer: any): Promise<void> {
    const db = await getDb();
    await db.put('pendingCustomers', {
        ...customer,
        status: 'pending',
        timestamp: new Date().toISOString()
    });
}

export async function getPendingCustomers(companyId: number): Promise<any[]> {
    const db = await getDb();
    return db.getAllFromIndex('pendingCustomers', 'byCompany', companyId);
}

export async function removePendingCustomer(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('pendingCustomers', id);
}

// ─── Local Stock Adjustments ─────────────────────────────────────────────────

export async function adjustProductStock(companyId: number, items: any[], isReturn = false): Promise<void> {
    const db = await getDb();
    const cachedProducts = await getCachedProducts(companyId);
    if (!cachedProducts || cachedProducts.length === 0) return;

    let modified = false;
    const tx = db.transaction('products', 'readwrite');

    for (const item of items) {
        // Search by ID or Name
        const product = cachedProducts.find((p: any) => p.id === item.productId || p.name === item.name);
        if (product && typeof product.stockQuantity === 'number') {
            const qty = Number(item.quantity) || 1;
            if (isReturn) {
                product.stockQuantity += qty;
            } else {
                product.stockQuantity -= qty;
            }
            // Put updated product back into cache
            await tx.store.put({ companyId, data: cachedProducts });
            modified = true;
        }
    }
    
    await tx.done;
}

export type { PendingSale, PendingShiftAction, OfflineHold };
