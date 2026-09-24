import {
    getPendingSales,
    updatePendingSaleStatus,
    updatePendingSalePayload,
    recordPendingSaleServerFailure,
    removePendingSale,
    getPendingShifts,
    updatePendingShiftStatus,
    removePendingShift,
    type PendingSale,
    type PendingShiftAction,
    getPendingCustomers,
    removePendingCustomer,
} from './offline-db';
import { apiFetch } from './api';
import { buildUrl, api } from '@shared/routes';
import { getIsOnline } from './online-state';
import { auth } from './auth';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'complete';

export interface SyncResult {
    total: number;
    synced: number;
    failed: number;
    errors: Array<{ saleId?: string; shiftId?: string; error: string }>;
}

/**
 * Ensure we have a fresh, valid auth token before syncing.
 * Only rotates when the access token is expired or expiring within 5
 * minutes — every sync used to force a rotation, and overlapping rotations
 * (intervals, retries, multiple tabs) invalidated each other and logged
 * the user out every few minutes.
 * Returns the access token string, or null if unavailable.
 */
async function getFreshToken(): Promise<string | null> {
    try {
        const expiresIn = auth.getAccessTokenExpiresIn();
        if (expiresIn < 300) {
            const refreshed = await auth.refreshTokens();
            if (refreshed?.accessToken) return refreshed.accessToken;
            // Refresh failed — fall through to the existing token; the
            // request layer will retry/refresh on 401. Never log out here.
        }
        const token = auth.getAccessToken() || localStorage.getItem('access_token');
        return token ?? null;
    } catch (err) {
        console.warn('[Sync] Token refresh failed:', err);
        return auth.getAccessToken() || localStorage.getItem('access_token');
    }
}

/**
 * Sync all pending offline shifts.
 * Shifts must be synced before sales to ensure valid shift context.
 */
export async function syncPendingShifts(companyId: number): Promise<{ success: boolean; errors: string[] }> {
    return syncPendingShiftsWithToken(companyId, apiFetch as any);
}

async function syncPendingShiftsWithToken(
    companyId: number,
    fetchFn: (url: string, init?: RequestInit) => Promise<Response>
): Promise<{ success: boolean; errors: string[] }> {
    const pending = await getPendingShifts(companyId);
    const toSync = pending
        .filter(s => s.status === 'pending' || s.status === 'failed')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (toSync.length === 0) return { success: true, errors: [] };

    const errors: string[] = [];
    const syncedShiftIds = new Map<string, number>();

    for (const action of toSync) {
        try {
            await updatePendingShiftStatus(action.id, 'syncing');

            let url = '';
            let body = {};
            const headers: Record<string, string> = {};
            if (action.branchId) headers['X-Branch-ID'] = String(action.branchId);

            if (action.type === 'open') {
                url = "/api/pos/shifts/open";
                body = { companyId: action.companyId, openingBalance: action.data.openingBalance };
            } else {
                let serverShiftId = action.data.shiftId;
                if (!Number.isFinite(Number(serverShiftId))) {
                    serverShiftId = syncedShiftIds.get(String(serverShiftId));
                }
                if (!serverShiftId) {
                    const currentShiftRes = await fetchFn(`/api/pos/shifts/current?companyId=${action.companyId}`, {
                        method: 'GET',
                        headers,
                    });
                    if (currentShiftRes.ok) {
                        const currentShift = await currentShiftRes.json();
                        serverShiftId = currentShift?.id;
                    }
                }
                if (!serverShiftId) {
                    throw new Error('Could not match offline shift close to a synced shift.');
                }
                url = `/api/pos/shifts/${serverShiftId}/close`;
                body = { closingBalance: action.data.closingBalance };
            }

            const res = await fetchFn(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(err.message || `HTTP ${res.status}`);
            }

            const payload = await res.json().catch(() => null);
            if (action.type === 'open' && payload?.id) {
                syncedShiftIds.set(action.id, Number(payload.id));
            }

            await removePendingShift(action.id);
        } catch (error: any) {
            const errorMsg = error.message || 'Shift sync failed';
            await updatePendingShiftStatus(action.id, 'failed');
            errors.push(errorMsg);
            if (!getIsOnline()) break;
        }
    }

    return { success: errors.length === 0, errors };
}

/**
 * Sync all pending offline sales for a given company.
 * Iterates through the queue, POSTs each to the existing invoice endpoint,
 * and updates status accordingly. Uses a sequential approach to avoid
 * race conditions with fiscalization sequence numbers.
 */
export async function syncPendingSales(
    companyId: number,
    onProgress?: (synced: number, total: number) => void
): Promise<SyncResult> {
    // Get a fresh token upfront — avoids mid-refresh race conditions
    const token = await getFreshToken();
    if (!token) {
        return {
            total: 0,
            synced: 0,
            failed: 1,
            errors: [{ error: 'No valid auth session — please log in again to sync' }],
        };
    }

    // Helper: fetch with the pre-fetched token to avoid getSession() race
    const authFetch = (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('Content-Type', 'application/json');
        return fetch(url, { ...init, headers });
    };

    // 1. Sync shifts first
    const shiftResult = await syncPendingShiftsWithToken(companyId, authFetch);

    // 1.5 Sync customers and get ID map
    const customerIdMap = await syncPendingCustomersWithToken(companyId, authFetch);

    // 2. Sync sales
    const pending = await getPendingSales(companyId);
    const now = Date.now();
    const toSync = pending
        // Dead-letter is quarantined for manager review; backoff skips sales
        // that aren't due yet. FIFO order preserves the fiscal chain.
        .filter(s => (s.status === 'pending' || s.status === 'failed')
            && (!s.retryAt || new Date(s.retryAt).getTime() <= now))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (toSync.length === 0) {
        return {
            total: 0,
            synced: 0,
            failed: shiftResult.errors.length,
            errors: shiftResult.errors.map(e => ({ error: e }))
        };
    }

    const result: SyncResult = {
        total: toSync.length,
        synced: 0,
        failed: 0,
        errors: shiftResult.errors.map(e => ({ error: e })),
    };

    // POST one sale. Returns the synced invoice, or throws with the message.
    const postSale = async (sale: PendingSale): Promise<any> => {
        const url = buildUrl(api.invoices.create.path, { companyId });
        const res = await authFetch(url, {
            method: 'POST',
            headers: { 'Idempotency-Key': sale.id },
            body: JSON.stringify({
                ...sale.invoiceData,
                isOfflineSync: true // Mark as synced offline sale to bypass shift validation
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(err.message || `HTTP ${res.status}`);
        }
        return res.json().catch(() => null);
    };

    const recordSynced = async (sale: PendingSale, syncedInvoice: any) => {
        // Sale synced successfully — remove from queue
        await removePendingSale(sale.id);
        result.synced++;
        onProgress?.(result.synced, result.total);

        if (syncedInvoice) {
            try {
                const { addSalesHistory } = await import('./offline-db');
                // Add items back if missing from response
                if (!syncedInvoice.items || syncedInvoice.items.length === 0) {
                    syncedInvoice.items = sale.invoiceData.items;
                }
                await addSalesHistory(companyId, [syncedInvoice]);
            } catch (e) {
                console.error('Failed to add synced sale to history', e);
            }
        }
    };

    // True when the server rejected our claimed fiscal numbers — another
    // terminal (or a race) moved the chain. Fixable by re-issuing locally.
    const isSequenceMismatch = (msg: string): boolean =>
        /not the next in sequence|previous hash|outdated or skipped|RCPT012/i.test(msg || '');

    // Re-signs a queued sale against the live chain and updates it in place.
    // Returns true when the sale now carries fresh numbers.
    const reissueWithFreshNumbers = async (sale: PendingSale): Promise<boolean> => {
        try {
            const { processOfflineFiscalization } = await import('./offline-fiscal');
            const fiscalData = await processOfflineFiscalization(
                companyId,
                sale.invoiceData,
                sale.invoiceData?.currency || 'USD',
                sale.invoiceData?.taxInclusive ?? true,
                { tryRefresh: true, isOnlineSale: true },
            );
            if (!fiscalData) return false;
            const newPayload = {
                ...sale.invoiceData,
                _localSigned: true,
                fiscalSignature: fiscalData.fiscalSignature,
                receiptDeviceSignature: fiscalData.receiptDeviceSignature,
                verificationCode: fiscalData.verificationCode,
                receiptGlobalNo: fiscalData.receiptGlobalNo,
                receiptCounter: fiscalData.receiptCounter,
                fiscalDayNo: fiscalData.fiscalDayNo,
                qrCodeData: fiscalData.qrCodeData,
                offlinePreviousHash: fiscalData.offlinePreviousHash,
                offlineDate: fiscalData.offlineDate,
            };
            await updatePendingSalePayload(sale.id, newPayload);
            sale.invoiceData = newPayload;
            return true;
        } catch (e) {
            console.warn('[Sync] Re-issue failed:', (e as any)?.message);
            return false;
        }
    };

    // Process sequentially to preserve fiscal sequence ordering
    for (const sale of toSync) {
        try {
            await updatePendingSaleStatus(sale.id, 'syncing');
            const syncedInvoice = await postSale(sale);
            await recordSynced(sale, syncedInvoice);
        } catch (error: any) {
            const errorMsg = error.message || 'Sync failed';

            // Network dropped mid-run — park the sale as pending, stop trying.
            if (!getIsOnline()) {
                await updatePendingSaleStatus(sale.id, 'pending', errorMsg);
                break;
            }

            // Stale fiscal numbers: re-issue once with fresh numbers and retry
            // immediately instead of poisoning the queue.
            if (isSequenceMismatch(errorMsg) && !(sale as any)._reissued) {
                (sale as any)._reissued = true;
                console.warn(`[Sync] Sale ${sale.id} claimed stale numbers — re-issuing with fresh numbers.`);
                try {
                    const reissued = await reissueWithFreshNumbers(sale);
                    if (reissued) {
                        await updatePendingSaleStatus(sale.id, 'syncing');
                        const syncedInvoice = await postSale(sale);
                        await recordSynced(sale, syncedInvoice);
                        continue;
                    }
                } catch (retryError: any) {
                    const retryMsg = retryError.message || 'Re-issue sync failed';
                    if (!getIsOnline()) {
                        await updatePendingSaleStatus(sale.id, 'pending', retryMsg);
                        break;
                    }
                    const updated = await recordPendingSaleServerFailure(sale.id, retryMsg);
                    result.failed++;
                    result.errors.push({ saleId: sale.id, error: `${retryMsg}${updated?.status === 'dead' ? ' (quarantined — needs manager review)' : ''}` });
                    onProgress?.(result.synced, result.total);
                    continue;
                }
            }

            // Ordinary server rejection: backoff, quarantine after N attempts.
            const updated = await recordPendingSaleServerFailure(sale.id, errorMsg);
            result.failed++;
            result.errors.push({ saleId: sale.id, error: `${errorMsg}${updated?.status === 'dead' ? ' (quarantined — needs manager review)' : ''}` });
            onProgress?.(result.synced, result.total);
        }
    }

    return result;
}

/**
 * Sync offline created customers. Returns a map of tempId -> realId
 */
async function syncPendingCustomersWithToken(
    companyId: number,
    authFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<Record<string, number>> {
    const pendingCustomers = await getPendingCustomers(companyId);
    const idMap: Record<string, number> = {};

    for (const customer of pendingCustomers) {
        try {
            // Drop temp id before sending
            const { id: tempId, status, timestamp, ...payload } = customer;
            const url = buildUrl(api.customers.create.path, { companyId });
            const res = await authFetch(url, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const createdCustomer = await res.json();
                idMap[tempId] = createdCustomer.id;
                await removePendingCustomer(tempId);
            } else {
                console.warn('[Sync] Failed to sync customer:', tempId);
            }
        } catch (e) {
            console.error('[Sync] Customer sync error:', e);
        }
    }
    return idMap;
}
