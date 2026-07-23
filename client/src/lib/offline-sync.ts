import {
    getPendingSales,
    updatePendingSaleStatus,
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
import { supabase } from './supabase';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'complete';

export interface SyncResult {
    total: number;
    synced: number;
    failed: number;
    errors: Array<{ saleId?: string; shiftId?: string; error: string }>;
}

/**
 * Ensure we have a fresh, valid auth token before syncing.
 * Forces a token refresh so we don't use a stale/expired JWT.
 * Returns the access token string, or null if unavailable.
 */
async function getFreshToken(): Promise<string | null> {
    try {
        // Force a refresh to get a guaranteed-fresh token
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) return refreshed.session.access_token;

        // Refresh failed (e.g. refresh token expired) — try existing session
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token ?? null;
    } catch (err) {
        console.warn('[Sync] Token refresh failed:', err);
        return null;
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
    const toSync = pending.filter(s => s.status === 'pending' || s.status === 'failed');

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

    // Process sequentially to preserve fiscal sequence ordering
    for (const sale of toSync) {
        try {
            await updatePendingSaleStatus(sale.id, 'syncing');

            // Build correct URL including companyId substitution
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

            const syncedInvoice = await res.json().catch(() => null);

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
        } catch (error: any) {
            const errorMsg = error.message || 'Sync failed';
            await updatePendingSaleStatus(sale.id, 'failed', errorMsg);
            result.failed++;
            result.errors.push({ saleId: sale.id, error: errorMsg });
            onProgress?.(result.synced, result.total);

            // If this is a network error, stop trying — we're still offline
            if (!getIsOnline()) {
                break;
            }
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
