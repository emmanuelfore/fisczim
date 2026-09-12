/**
 * Mobile Offline Fiscal Storage
 * Mirrors client/src/lib/offline-db.ts but uses AsyncStorage instead of IndexedDB.
 * Stores ZIMRA config, fiscal sequence, and fiscal-signed offline invoices.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./api";

const KEYS = {
  zimraConfig: "zimraConfig",
  fiscalSequence: "fiscalSequence",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: any) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ─── ZIMRA Config Cache ──────────────────────────────────────────────────────

/** Cache ZIMRA config (private key, device IDs, QR URL) from server */
export async function cacheZimraConfig(companyId: number, config: any): Promise<void> {
  await writeJson(`${KEYS.zimraConfig}:${companyId}`, config);
}

/** Get cached ZIMRA config */
export async function getCachedZimraConfig(companyId: number): Promise<any | null> {
  return readJson<any | null>(`${KEYS.zimraConfig}:${companyId}`, null);
}

// ─── Fiscal Sequence Cache ───────────────────────────────────────────────────

/** Cache the fiscal sequence (lastReceiptGlobalNo, dailyReceiptCount, lastFiscalHash) */
export async function cacheFiscalSequence(companyId: number, sequence: any): Promise<void> {
  await writeJson(`${KEYS.fiscalSequence}:${companyId}`, sequence);
}

/** Get the cached fiscal sequence */
export async function getCachedFiscalSequence(companyId: number): Promise<any | null> {
  return readJson<any | null>(`${KEYS.fiscalSequence}:${companyId}`, null);
}

/**
 * Atomically increments the cached fiscal sequence and returns the new values.
 * Returns null if no sequence is cached.
 */
export async function incrementCachedFiscalSequence(companyId: number): Promise<{
  globalNo: number;
  dailyCount: number;
} | null> {
  const seq = await getCachedFiscalSequence(companyId);
  if (!seq) return null;
  const newSeq = {
    ...seq,
    lastReceiptGlobalNo: (seq.lastReceiptGlobalNo || 0) + 1,
    dailyReceiptCount: (seq.dailyReceiptCount || 0) + 1,
  };
  await cacheFiscalSequence(companyId, newSeq);
  return {
    globalNo: newSeq.lastReceiptGlobalNo,
    dailyCount: newSeq.dailyReceiptCount,
  };
}

/** Update fiscal hash after a successful offline signing */
export async function updateFiscalHash(companyId: number, hash: string): Promise<void> {
  const seq = await getCachedFiscalSequence(companyId);
  if (!seq) return;
  await cacheFiscalSequence(companyId, { ...seq, lastFiscalHash: hash });
}

/** Refresh the offline fiscal sequence cache from the server's authoritative counters. */
export async function refreshCachedFiscalSequence(companyId: number): Promise<any | undefined> {
  try {
    const res = await apiFetch(`/api/companies/${companyId}/zimra/sequence`);
    if (res.ok) {
      const seq = await res.json();
      if (seq && typeof seq.lastReceiptGlobalNo === "number") {
        const existing = (await getCachedFiscalSequence(companyId)) || {};
        const merged = { ...existing, ...seq };
        await cacheFiscalSequence(companyId, merged);
        return merged;
      }
    }
  } catch (e) {
    console.warn("[FiscalStorage] Failed to refresh fiscal sequence from server:", e);
  }
  return getCachedFiscalSequence(companyId);
}

/**
 * Refresh the full offline fiscal cache (private key, QR URL, device IDs, counters).
 * Must be called while online so offline sales can sign receipts and print fiscal fields.
 */
export async function refreshOfflineFiscalCache(companyId: number): Promise<{
  config: any | null;
  sequence: any | null;
}> {
  try {
    const res = await apiFetch(`/api/companies/${companyId}/fiscal-context`);
    if (res.ok) {
      const ctx = await res.json();
      let config: any | null = null;
      let sequence: any | null = null;

      if (ctx?.zimraPrivateKey) {
        config = {
          fdmsDeviceId: ctx.fdmsDeviceId,
          fdmsDeviceSerialNo: ctx.fdmsDeviceSerialNo,
          zimraPrivateKey: ctx.zimraPrivateKey,
          zimraCertificate: ctx.zimraCertificate,
          qrUrl: ctx.qrUrl,
          currentFiscalDayNo: ctx.currentFiscalDayNo,
          zimraEnvironment: ctx.zimraEnvironment,
        };
        await cacheZimraConfig(companyId, config);
      }

      if (typeof ctx?.lastReceiptGlobalNo === "number") {
        sequence = {
          lastReceiptGlobalNo: ctx.lastReceiptGlobalNo || 0,
          dailyReceiptCount: ctx.dailyReceiptCount || 0,
          lastFiscalHash: ctx.lastFiscalHash || null,
          currentFiscalDayNo: ctx.currentFiscalDayNo || 0,
        };
        await cacheFiscalSequence(companyId, sequence);
      }

      return {
        config: config || (await getCachedZimraConfig(companyId)),
        sequence: sequence || (await getCachedFiscalSequence(companyId)),
      };
    }
  } catch (e) {
    console.warn("[FiscalStorage] Failed to refresh offline fiscal cache:", e);
  }

  return {
    config: await getCachedZimraConfig(companyId),
    sequence: await getCachedFiscalSequence(companyId),
  };
}

/** Merge cached ZIMRA device fields into company for receipt printing (offline-safe). */
export async function mergeCompanyWithCachedZimraConfig(company: any, companyId: number): Promise<any> {
  const config = await getCachedZimraConfig(companyId);
  if (!config) return company;
  return {
    ...company,
    fdmsDeviceId: company?.fdmsDeviceId || company?.deviceId || config.fdmsDeviceId,
    fdmsDeviceSerialNo: company?.fdmsDeviceSerialNo || company?.deviceSerialNo || config.fdmsDeviceSerialNo,
    deviceId: company?.deviceId || config.fdmsDeviceId,
    deviceSerialNo: company?.deviceSerialNo || config.fdmsDeviceSerialNo,
    qrUrl: company?.qrUrl || config.qrUrl,
    currentFiscalDayNo: company?.currentFiscalDayNo || config.currentFiscalDayNo,
  };
}

/** True when we have enough cached data to sign receipts offline. */
export async function hasOfflineFiscalCapability(companyId: number): Promise<boolean> {
  const config = await getCachedZimraConfig(companyId);
  const sequence = await getCachedFiscalSequence(companyId);
  return Boolean(config?.zimraPrivateKey && sequence);
}
