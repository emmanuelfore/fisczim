import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'pos-offline';
const DB_VERSION = 10;

interface PendingSale {
    id: string;
    companyId: number;
    branchId?: number | null;
    invoiceData: any;
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed' | 'dead';
    error?: string;
    attempts: number;
    /** Server rejections (HTTP 4xx/5xx with a response). Network outages don't count. */
    serverAttempts: number;
    /** Next eligible sync time (ISO) — exponential backoff for failed sales. */
    retryAt?: string | null;
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
let dbOpenPromise: Promise<IDBPDatabase> | null = null;
let isDbBroken = false;
let storageHealth: 'unknown' | 'healthy' | 'repaired' | 'broken' = 'unknown';
let persistRequested = false;
const healthListeners = new Set<(health: typeof storageHealth) => void>();

function setHealth(h: typeof storageHealth) {
    storageHealth = h;
    if (h === 'broken') isDbBroken = true;
    if (h === 'healthy' || h === 'repaired') isDbBroken = false;
    for (const cb of healthListeners) {
        try { cb(h); } catch {}
    }
}

export function onStorageHealthChange(cb: (health: typeof storageHealth) => void) {
    healthListeners.add(cb);
    return () => { healthListeners.delete(cb); };
}

export function getStorageHealth() {
    return storageHealth;
}

/** Flush + close IndexedDB before Electron quits — prevents LevelDB corruption. */
export function closeDb(): void {
    try { dbInstance?.close(); } catch {}
    dbInstance = null;
    dbOpenPromise = null;
}

try {
    const api: any = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (api?.onAppClosing) {
        api.onAppClosing(() => closeDb());
    }
} catch {}
if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => closeDb());
}

/**
 * Returns true if IndexedDB failed to initialize (e.g. "Internal error opening backing store").
 * Kept synchronous for existing callers — prefer `await checkStorageHealth()` on boot
 * because this flag is only set AFTER a failed open attempt.
 */
export function isStorageBroken() {
    return isDbBroken;
}

/** Ask the browser/Electron not to evict our origin storage. Best-effort. */
export async function ensurePersistentStorage(): Promise<boolean> {
    if (persistRequested) return true;
    persistRequested = true;
    try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.storage?.persist) {
            await nav.storage.persist();
            return true;
        }
    } catch {}
    return false;
}

function deleteIdbDatabase(): Promise<void> {
    return new Promise((resolve) => {
        try {
            if (typeof indexedDB === 'undefined') return resolve();
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
            // Safety: never hang boot longer than 3s on a wedged delete
            setTimeout(() => resolve(), 3000);
        } catch {
            resolve();
        }
    });
}

function openDbOnce(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, DB_VERSION, {
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

            // Product Serials (for serial-tracked items offline)
            if (!db.objectStoreNames.contains('productSerials')) {
                db.createObjectStore('productSerials');
            }
        },
        blocked() {
            console.warn('[DB] Upgrade blocked by older version open in another tab. Please close all tabs.');
        },
        blocking() {
            console.warn('[DB] New version available, closing this connection to allow upgrade.');
            try { dbInstance?.close(); } catch {}
            dbInstance = null;
            dbOpenPromise = null;
        },
        terminated() {
            console.warn('[DB] Connection terminated — will reopen on next access.');
            dbInstance = null;
            dbOpenPromise = null;
        },
    });
}

function mockDb(): IDBPDatabase {
    // Returned only when storage is truly unusable (private mode / quota / wedged LevelDB).
    // Login-critical reads fall back to localStorage / Electron vault below, so auth still works.
    // Callers will get 'undefined' for reads and 'nothing' for writes.
    return {
        get: async () => undefined,
        put: async () => undefined,
        add: async () => undefined,
        delete: async () => undefined,
        clear: async () => undefined,
        getAll: async () => [],
        getAllFromIndex: async () => [],
        getAllKeys: async () => [],
        count: async () => 0,
        transaction: () => ({
            objectStore: () => ({
                get: async () => undefined,
                put: async () => undefined,
                add: async () => undefined,
                delete: async () => undefined,
                getAll: async () => [],
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

export async function getDb(): Promise<IDBPDatabase> {
    if (dbInstance) return dbInstance;
    if (dbOpenPromise) return dbOpenPromise;

    void ensurePersistentStorage();

    dbOpenPromise = (async () => {
        // Attempt 1: normal open
        try {
            dbInstance = await openDbOnce();
            setHealth(storageHealth === 'unknown' ? 'healthy' : storageHealth);
            return dbInstance;
        } catch (err: any) {
            console.error('[DB] IndexedDB open failed (attempt 1):', err?.message || err);
        }

        // Attempt 2: self-heal — delete the (possibly half-upgraded / corrupt LevelDB) and reopen.
        // This is what makes the "corrupted" banner effectively never appear: a wedged
        // backing store is wiped and recreated silently. Login-critical data survives
        // via the localStorage mirror + Electron native vault (see below).
        try {
            try { dbInstance?.close(); } catch {}
            dbInstance = null;
            await deleteIdbDatabase();
            dbInstance = await openDbOnce();
            console.warn('[DB] Storage self-healed via delete+recreate.');
            setHealth('repaired');
            return dbInstance;
        } catch (err: any) {
            console.error('[DB] Critical IndexedDB error (unrecoverable):', err?.message || err);
            setHealth('broken');
            return mockDb();
        }
    })();

    try {
        return await dbOpenPromise;
    } catch {
        setHealth('broken');
        return mockDb();
    }
}

/** Async health probe: open + read/write round-trip. Repairs silently when possible. */
export async function checkStorageHealth(): Promise<boolean> {
    try {
        const db = await getDb();
        if (isDbBroken) return false;
        const probeKey = '__health_probe';
        await db.put('metadata', Date.now(), probeKey);
        await db.get('metadata', probeKey);
        await db.delete('metadata', probeKey).catch(() => {});
        setHealth(storageHealth === 'repaired' ? 'repaired' : 'healthy');
        return true;
    } catch {
        return false;
    }
}

/** Manual repair: close, delete, reopen, re-probe. Returns true when usable. */
export async function repairStorage(): Promise<boolean> {
    try { dbInstance?.close(); } catch {}
    dbInstance = null;
    dbOpenPromise = null;
    setHealth('unknown');
    await deleteIdbDatabase();
    const ok = await checkStorageHealth();
    if (!ok) setHealth('broken');
    return ok;
}

// ─── localStorage mirror (login-critical fallback) ───────────────────────────
// IndexedDB can be wedged while localStorage still works (and vice versa).
// Offline login MUST survive either one failing, on Electron + Android WebView
// + private-mode browsers. So credentials + cached user are mirrored here.
const LS_PREFIX = 'pos-offline-mirror:';

function lsGet<T>(key: string): T | undefined {
    try {
        if (typeof localStorage === 'undefined') return undefined;
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (!raw) return undefined;
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
}

function lsSet(key: string, value: any): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
        // Quota / private mode — ignore, IDB is primary
    }
}

function lsDel(key: string): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(LS_PREFIX + key);
    } catch {}
}

function lsList(prefix: string): any[] {
    try {
        if (typeof localStorage === 'undefined') return [];
        const out: any[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(LS_PREFIX + prefix)) {
                const v = lsGet<any>(k.slice(LS_PREFIX.length));
                if (v !== undefined) out.push(v);
            }
        }
        return out;
    } catch {
        return [];
    }
}

// ─── Electron native vault fallback ──────────────────────────────────────────
// Main-process encrypted file (safeStorage) survives even a full
// `clear-storage` / IndexedDB wipe. Renderer calls are fire-and-forget safe.
async function vaultSaveCredential(record: any): Promise<void> {
    try {
        const api: any = (window as any)?.electronAPI;
        if (api?.saveOfflineCredential) await api.saveOfflineCredential(record);
    } catch {}
}

async function vaultVerify(email: string, password: string): Promise<any | null> {
    try {
        const api: any = (window as any)?.electronAPI;
        if (api?.verifyOfflineCredential) {
            const user = await api.verifyOfflineCredential(email, password);
            return user || null;
        }
    } catch {}
    return null;
}

async function vaultVerifyPin(email: string, pin: string): Promise<any | null> {
    try {
        const api: any = (window as any)?.electronAPI;
        if (api?.verifyOfflinePin) {
            const user = await api.verifyOfflinePin(email, pin);
            return user || null;
        }
    } catch {}
    return null;
}

async function vaultUsers(): Promise<any[]> {
    try {
        const api: any = (window as any)?.electronAPI;
        if (api?.getOfflineUsers) {
            const users = await api.getOfflineUsers();
            if (Array.isArray(users)) return users;
        }
    } catch {}
    return [];
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
    try {
        const db = await getDb();
        await db.put('user_cache', user, 'current_user');
    } catch {}
    lsSet('user_cache:current_user', user);
}

export async function getCachedUser(): Promise<any | undefined> {
    try {
        const db = await getDb();
        const cached = await db.get('user_cache', 'current_user');
        if (cached) return cached;
    } catch {}
    return lsGet<any>('user_cache:current_user');
}

export async function clearCachedUser(): Promise<void> {
    try {
        const db = await getDb();
        await db.delete('user_cache', 'current_user');
    } catch {}
    lsDel('user_cache:current_user');
    // Note: We intentionally do NOT clear 'offline_credentials' or 'companies_list' here.
    // This allows cashiers to log back into the POS terminal even if
    // the internet drops after they've explicitly logged out, and ensures
    // selectedCompanyId can be restored on next offline login.
}

// ─── Offline Credentials ────────────────────────────────────────────────────

// Simple hashing for local offline verification. NOT meant for production backend storage,
// but sufficient for preventing plain-text storage of local caching.
async function hashPassword(password: string, salt: string): Promise<string> {
    // crypto.subtle requires a secure context — missing on http LAN, file://, old WebViews.
    // Fall back to a deterministic salted iterative hash so offline login still works there.
    try {
        const subtle: SubtleCrypto | undefined = (globalThis as any)?.crypto?.subtle;
        if (subtle) {
            const encoder = new TextEncoder();
            const data = encoder.encode(password + salt);
            const hashBuffer = await subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch {}
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    const str = `${salt}::${password}::${salt.length}`;
    for (let round = 0; round < 8; round++) {
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i) + round;
            h1 = Math.imul(h1 ^ c, 16777619);
            h2 = Math.imul(h2 ^ (c + (h1 & 0xff)), 16777619);
        }
    }
    return `fb-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function newSalt(): string {
    try {
        const c: any = (globalThis as any)?.crypto;
        if (c?.randomUUID) return c.randomUUID();
        if (c?.getRandomValues) {
            const b = new Uint8Array(16);
            c.getRandomValues(b);
            return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
        }
    } catch {}
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function readCredentialRecord(email: string): Promise<any | undefined> {
    const key = email.toLowerCase();
    try {
        const db = await getDb();
        const rec = await db.get('offline_credentials', key);
        if (rec) return rec;
    } catch {}
    // Fallback: localStorage mirror survives IndexedDB wipes/corruption
    return lsGet<any>(`offline_cred:${key}`);
}

export async function saveOfflineCredentials(email: string, password: string, user: any): Promise<void> {
    const key = email.toLowerCase();
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    let pinHash = undefined;
    let pinSalt = undefined;

    // Cache PIN from any known shape so PIN login works offline on terminals
    const pinValue: any = user?.pin ?? user?.cashierPin ?? user?.offlinePin ?? user?.user_metadata?.pin;
    if (pinValue !== undefined && pinValue !== null && String(pinValue).length >= 4) {
        pinSalt = newSalt();
        pinHash = await hashPassword(String(pinValue), pinSalt);
    }

    const record = {
        email: key,
        hash,
        salt,
        pinHash,
        pinSalt,
        user,
        lastOnlineLogin: new Date().toISOString()
    };

    // Preserve existing PIN hash when the fresh user object has no PIN (e.g. /api/user omits it)
    try {
        const prev = await readCredentialRecord(key);
        if ((!pinHash || !pinSalt) && prev?.pinHash && prev?.pinSalt) {
            (record as any).pinHash = prev.pinHash;
            (record as any).pinSalt = prev.pinSalt;
        }
    } catch {}

    try {
        const db = await getDb();
        await db.put('offline_credentials', record);
    } catch {}
    lsSet(`offline_cred:${key}`, record);
    await vaultSaveCredential({ ...record }).catch(() => {});
}

export async function verifyOfflineCredentials(email: string, password: string): Promise<any | null> {
    const key = email.toLowerCase();
    const record = await readCredentialRecord(key);
    if (record?.hash && record?.salt) {
        try {
            const computedHash = await hashPassword(password, record.salt);
            if (computedHash === record.hash) return record.user;
        } catch {}
    }
    // Last resort: Electron native encrypted vault (survives clear-storage)
    try {
        const vaultUser = await vaultVerify(email, password);
        if (vaultUser) return vaultUser;
    } catch {}
    return null;
}

export async function verifyOfflinePinCredentials(email: string, pin: string): Promise<any | null> {
    const record = await readCredentialRecord(email.toLowerCase());
    if (record?.pinHash && record?.pinSalt) {
        try {
            const computedHash = await hashPassword(String(pin), record.pinSalt);
            if (computedHash === record.pinHash) return record.user;
        } catch {}
    }
    try {
        const vaultUser = await vaultVerifyPin(email, String(pin));
        if (vaultUser) return vaultUser;
    } catch {}
    return null;
}

export async function getOfflineUsers(): Promise<any[]> {
    const seen = new Map<string, any>();
    try {
        const db = await getDb();
        const allRecords = await db.getAll('offline_credentials');
        for (const r of allRecords || []) {
            if (r?.user?.email) seen.set(String(r.user.email).toLowerCase(), r.user);
            else if (r?.email && r?.user) seen.set(String(r.email).toLowerCase(), r.user);
        }
    } catch {}
    for (const r of lsList('offline_cred:')) {
        const email = String(r?.user?.email || r?.email || '').toLowerCase();
        if (email && !seen.has(email) && r?.user) seen.set(email, r.user);
    }
    for (const u of await vaultUsers()) {
        const email = String((u as any)?.email || '').toLowerCase();
        if (email && !seen.has(email)) seen.set(email, u);
    }
    return Array.from(seen.values());
}

// ─── Companies List ──────────────────────────────────────────────────────────

export async function cacheCompaniesList(companies: any[], userId?: string | number | null): Promise<void> {
    const db = await getDb();
    // Company memberships are user-specific. Never let one user's offline
    // company list become another user's selected company after a relogin.
    const key = userId ? `user:${userId}` : 'current_list';
    await db.put('companies_list', companies, key);
}

export async function getCachedCompaniesList(userId?: string | number | null): Promise<any[] | undefined> {
    const db = await getDb();
    const key = userId ? `user:${userId}` : 'current_list';
    return db.get('companies_list', key);
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
        serverAttempts: 0,
        retryAt: null,
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

/** Replace the queued payload (used when a sale is re-issued with fresh fiscal numbers). */
export async function updatePendingSalePayload(id: string, invoiceData: any): Promise<void> {
    const db = await getDb();
    const sale = await db.get('pendingSales', id);
    if (sale) {
        sale.invoiceData = invoiceData;
        await db.put('pendingSales', sale);
    }
}

/**
 * Record a server-side rejection with exponential backoff. After
 * MAX_SERVER_ATTEMPTS consecutive rejections the sale is quarantined as
 * 'dead' — auto-sync skips it until a manager retries or discards it.
 */
export const MAX_SERVER_ATTEMPTS = 5;

export function computeBackoffRetryAt(serverAttempts: number): string {
    const minutes = Math.pow(2, Math.min(serverAttempts, 6));
    return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function recordPendingSaleServerFailure(id: string, error: string): Promise<PendingSale | undefined> {
    const db = await getDb();
    const sale = (await db.get('pendingSales', id)) as PendingSale | undefined;
    if (!sale) return undefined;
    sale.serverAttempts = (sale.serverAttempts || 0) + 1;
    sale.attempts = (sale.attempts || 0) + 1;
    sale.error = error;
    if (sale.serverAttempts >= MAX_SERVER_ATTEMPTS) {
        sale.status = 'dead';
        sale.retryAt = null;
    } else {
        sale.status = 'failed';
        sale.retryAt = computeBackoffRetryAt(sale.serverAttempts);
    }
    await db.put('pendingSales', sale);
    return sale;
}

/** Manager action: requeue a dead/failed sale for the next sync run. */
export async function resetPendingSaleRetry(id: string): Promise<void> {
    const db = await getDb();
    const sale = await db.get('pendingSales', id);
    if (sale) {
        sale.status = 'pending';
        sale.serverAttempts = 0;
        sale.retryAt = null;
        delete sale.error;
        await db.put('pendingSales', sale);
    }
}

export async function removePendingSale(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('pendingSales', id);
}

export async function getPendingSalesCount(companyId: number): Promise<number> {
    const sales = await getPendingSales(companyId);
    return sales.filter(s => s.status === 'pending' || s.status === 'failed' || s.status === 'dead').length;
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

// ─── Product Serials ────────────────────────────────────────────────────────

export async function cacheProductSerials(companyId: number, serials: any[]): Promise<void> {
    const db = await getDb();
    await db.put('productSerials', serials, companyId);
}

export async function getCachedProductSerials(companyId: number): Promise<any[] | undefined> {
    const db = await getDb();
    const result = await db.get('productSerials', companyId);
    if (result) return result;
    return db.get('productSerials', String(companyId));
}

// ─── Local Stock Adjustments ─────────────────────────────────────────────────

export async function adjustProductStock(companyId: number, items: any[], isReturn = false): Promise<void> {
    const db = await getDb();
    const cachedProducts = await getCachedProducts(companyId);
    if (!cachedProducts || cachedProducts.length === 0) return;

    let modified = false;
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
            modified = true;
        }
    }

    // Single write-back of the products array (same shape as cacheProducts).
    if (modified) {
        await db.put('products', cachedProducts, companyId);
    }
}

export interface StockShortfall {
    productId: number | string;
    name: string;
    available: number;
    requested: number;
}

/**
 * Checks requested quantities against the locally cached stock levels.
 * Items without a numeric stockQuantity (services, untracked goods) are
 * skipped. Returns the list of shortfalls — empty means the sale can proceed.
 */
export async function checkStockAvailability(companyId: number, items: any[]): Promise<StockShortfall[]> {
    const cachedProducts = await getCachedProducts(companyId);
    if (!cachedProducts || cachedProducts.length === 0) return [];
    const shortfalls: StockShortfall[] = [];
    for (const item of items) {
        const product = cachedProducts.find((p: any) => p.id === item.productId || p.name === (item.name || item.description));
        if (product && typeof product.stockQuantity === 'number') {
            const requested = Number(item.quantity) || 0;
            if (requested > product.stockQuantity) {
                shortfalls.push({
                    productId: product.id ?? item.productId,
                    name: product.name || item.name || item.description || 'Item',
                    available: product.stockQuantity,
                    requested,
                });
            }
        }
    }
    return shortfalls;
}

export type { PendingSale, PendingShiftAction, OfflineHold };
