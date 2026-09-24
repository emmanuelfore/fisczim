/**
 * Pre-sale safety guards for (offline-capable) POS checkout.
 *
 * Three silent killers of offline receipts:
 *  1. Wrong device clock  — receiptDate comes from the device. A clock that
 *     is minutes/hours off produces receipts ZIMRA rejects on sync.
 *  2. Stale fiscal day    — the cached day was closed elsewhere; receipts
 *     stamped with it are rejected on sync.
 *  3. Stale stock levels  — selling inventory that isn't there.
 */
import { apiFetch } from "./api";
import { getCachedZimraConfig, checkStockAvailability } from "./offline-db";

export const MAX_CLOCK_SKEW_MS = 5 * 60_000; // block fiscalized sales beyond ±5 min
const CLOCK_SAMPLE_TTL_MS = 15 * 60_000;
const LAST_RECEIPT_KEY = "pos_last_receipt_at";
const CLOCK_OFFSET_KEY = "pos_server_clock_offset";
const CLOCK_SAMPLED_AT_KEY = "pos_server_clock_sampled_at";

function readNum(key: string): number | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

/**
 * Samples the server clock from the Date header of a cheap authed request.
 * Call while online (mount, reconnect). Stored for offline skew checks.
 * Returns the offset (serverTime - deviceTime) in ms, or null on failure.
 */
export async function sampleServerClock(companyId: number): Promise<number | null> {
    try {
        const res = await apiFetch(`/api/companies/${companyId}/zimra/sequence`);
        if (!res.ok) return getClockSkew()?.offsetMs ?? null;
        const dateHeader = res.headers.get("date");
        if (!dateHeader) return getClockSkew()?.offsetMs ?? null;
        const serverTime = new Date(dateHeader).getTime();
        if (!Number.isFinite(serverTime)) return getClockSkew()?.offsetMs ?? null;
        const offsetMs = serverTime - Date.now();
        try {
            localStorage.setItem(CLOCK_OFFSET_KEY, String(offsetMs));
            localStorage.setItem(CLOCK_SAMPLED_AT_KEY, String(Date.now()));
        } catch { /* storage unavailable — memory only */ }
        return offsetMs;
    } catch {
        return getClockSkew()?.offsetMs ?? null;
    }
}

/** Last known server-vs-device clock offset, if sampled recently. */
export function getClockSkew(): { offsetMs: number; ageMs: number } | null {
    const offsetMs = readNum(CLOCK_OFFSET_KEY);
    const sampledAt = readNum(CLOCK_SAMPLED_AT_KEY);
    if (offsetMs === null || sampledAt === null) return null;
    const ageMs = Date.now() - sampledAt;
    if (ageMs > CLOCK_SAMPLE_TTL_MS) return null;
    return { offsetMs, ageMs };
}

/**
 * Validates the device clock before a fiscalized sale.
 * Returns an error message when the sale must be blocked, null when OK.
 */
export function checkDeviceClock(): string | null {
    const skew = getClockSkew();
    if (skew && Math.abs(skew.offsetMs) > MAX_CLOCK_SKEW_MS) {
        const mins = Math.round(Math.abs(skew.offsetMs) / 60_000);
        const dir = skew.offsetMs > 0 ? "behind" : "ahead";
        return `Device clock is off by ~${mins} min (${dir} of server time). Fix the date/time in system settings before selling — receipts with the wrong time are rejected.`;
    }
    // Offline monotonic check: the clock must never go backwards past the
    // last receipt this terminal issued (kills backdated duplicates).
    const lastAt = readNum(LAST_RECEIPT_KEY);
    if (lastAt !== null && Date.now() < lastAt - 60_000) {
        return "Device clock appears to have gone backwards since the last receipt. Fix the date/time in system settings before selling.";
    }
    return null;
}

/** Records a successful local signing so future clock checks have an anchor. */
export function recordReceiptTimestamp(): void {
    try {
        localStorage.setItem(LAST_RECEIPT_KEY, String(Date.now()));
    } catch { /* ignore */ }
}

/**
 * Blocks fiscalized sales when the cached fiscal context says the day is
 * closed (stale day). Returns an error message, or null when OK/unknown.
 * Unknown (no cache) is allowed — the online refresh normally fills it.
 */
export async function checkFiscalDayOpen(companyId: number): Promise<string | null> {
    try {
        const config = (await getCachedZimraConfig(companyId)) as any;
        if (!config) return null;
        if (config.fiscalDayOpen === false) {
            return "The fiscal day is closed (stale day). Open a new fiscal day while online before selling — receipts stamped with a closed day are rejected.";
        }
        return null;
    } catch {
        return null;
    }
}

export interface GuardFailure {
    type: "clock" | "fiscalDay" | "stock";
    message: string;
}

/**
 * Runs all pre-sale guards. Stock is checked against the local cache
 * (services / untracked items are skipped automatically).
 */
export async function runPreSaleGuards(
    companyId: number,
    items: any[],
    opts?: { checkStock?: boolean },
): Promise<GuardFailure | null> {
    const clockErr = checkDeviceClock();
    if (clockErr) return { type: "clock", message: clockErr };

    const dayErr = await checkFiscalDayOpen(companyId);
    if (dayErr) return { type: "fiscalDay", message: dayErr };

    if (opts?.checkStock !== false) {
        try {
            const shortfalls = await checkStockAvailability(companyId, items);
            if (shortfalls.length > 0) {
                const first = shortfalls[0];
                const extra = shortfalls.length > 1 ? ` (+${shortfalls.length - 1} more)` : "";
                return {
                    type: "stock",
                    message: `Insufficient stock: ${first.name} — ${first.requested} requested, ${first.available} available${extra}. Sync stock or reduce quantity.`,
                };
            }
        } catch (e) {
            console.warn("[Guards] Stock check failed, allowing sale:", e);
        }
    }
    return null;
}
