/**
 * Mobile pre-sale safety guards (AsyncStorage-backed twin of the web
 * client/src/lib/fiscal-guards.ts).
 *
 * Blocks sales that would produce receipts ZIMRA rejects on sync:
 * wrong device clock, stale (closed) fiscal day, insufficient cached stock.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./api";
import { getCachedZimraConfig } from "./fiscalStorage";

export const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const CLOCK_SAMPLE_TTL_MS = 15 * 60_000;
const LAST_RECEIPT_KEY = "pos:lastReceiptAt";
const CLOCK_OFFSET_KEY = "pos:serverClockOffset";
const CLOCK_SAMPLED_AT_KEY = "pos:serverClockSampledAt";
const PRODUCTS_KEY = (companyId: number) => `pos:cache:products:${companyId}`;

async function readNum(key: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function sampleServerClock(companyId: number): Promise<number | null> {
  try {
    const res = await apiFetch(`/api/companies/${companyId}/zimra/sequence`);
    if (!res.ok) return (await getClockSkew())?.offsetMs ?? null;
    const dateHeader = (res.headers as any)?.get?.("date");
    if (!dateHeader) return (await getClockSkew())?.offsetMs ?? null;
    const serverTime = new Date(dateHeader).getTime();
    if (!Number.isFinite(serverTime)) return (await getClockSkew())?.offsetMs ?? null;
    const offsetMs = serverTime - Date.now();
    try {
      await AsyncStorage.multiSet([
        [CLOCK_OFFSET_KEY, String(offsetMs)],
        [CLOCK_SAMPLED_AT_KEY, String(Date.now())],
      ]);
    } catch { /* ignore */ }
    return offsetMs;
  } catch {
    return (await getClockSkew())?.offsetMs ?? null;
  }
}

export async function getClockSkew(): Promise<{ offsetMs: number; ageMs: number } | null> {
  const offsetMs = await readNum(CLOCK_OFFSET_KEY);
  const sampledAt = await readNum(CLOCK_SAMPLED_AT_KEY);
  if (offsetMs === null || sampledAt === null) return null;
  const ageMs = Date.now() - sampledAt;
  if (ageMs > CLOCK_SAMPLE_TTL_MS) return null;
  return { offsetMs, ageMs };
}

export async function checkDeviceClock(): Promise<string | null> {
  const skew = await getClockSkew();
  if (skew && Math.abs(skew.offsetMs) > MAX_CLOCK_SKEW_MS) {
    const mins = Math.round(Math.abs(skew.offsetMs) / 60_000);
    const dir = skew.offsetMs > 0 ? "behind" : "ahead";
    return `Device clock is off by ~${mins} min (${dir} of server time). Fix the date/time in system settings before selling — receipts with the wrong time are rejected.`;
  }
  const lastAt = await readNum(LAST_RECEIPT_KEY);
  if (lastAt !== null && Date.now() < lastAt - 60_000) {
    return "Device clock appears to have gone backwards since the last receipt. Fix the date/time in system settings before selling.";
  }
  return null;
}

export async function recordReceiptTimestamp(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_RECEIPT_KEY, String(Date.now()));
  } catch { /* ignore */ }
}

export async function checkFiscalDayOpen(companyId: number): Promise<string | null> {
  try {
    const config: any = await getCachedZimraConfig(companyId);
    if (!config) return null;
    if (config.fiscalDayOpen === false) {
      return "The fiscal day is closed (stale day). Open a new fiscal day while online before selling — receipts stamped with a closed day are rejected.";
    }
    return null;
  } catch {
    return null;
  }
}

export interface StockShortfall {
  productId: number | string;
  name: string;
  available: number;
  requested: number;
}

async function readCachedProducts(companyId: number): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(PRODUCTS_KEY(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function checkStockAvailability(companyId: number, items: any[]): Promise<StockShortfall[]> {
  const cached = await readCachedProducts(companyId);
  if (cached.length === 0) return [];
  const shortfalls: StockShortfall[] = [];
  for (const item of items || []) {
    const product = cached.find((p: any) => p.id === item.productId || p.name === (item.name || item.description));
    if (product && typeof product.stockQuantity === "number") {
      const requested = Number(item.quantity) || 0;
      if (requested > product.stockQuantity) {
        shortfalls.push({
          productId: product.id ?? item.productId,
          name: product.name || item.name || item.description || "Item",
          available: product.stockQuantity,
          requested,
        });
      }
    }
  }
  return shortfalls;
}

/** Decrements cached stock after a locally completed sale (offline-safe). */
export async function adjustCachedStock(companyId: number, items: any[]): Promise<void> {
  try {
    const cached = await readCachedProducts(companyId);
    if (cached.length === 0) return;
    let modified = false;
    for (const item of items || []) {
      const product = cached.find((p: any) => p.id === item.productId || p.name === (item.name || item.description));
      if (product && typeof product.stockQuantity === "number") {
        product.stockQuantity -= Number(item.quantity) || 0;
        modified = true;
      }
    }
    if (modified) {
      await AsyncStorage.setItem(PRODUCTS_KEY(companyId), JSON.stringify(cached));
    }
  } catch (e) {
    console.warn("[Guards] Local stock decrement failed:", e);
  }
}

export interface GuardFailure {
  type: "clock" | "fiscalDay" | "stock";
  message: string;
}

export async function runPreSaleGuards(companyId: number, items: any[]): Promise<GuardFailure | null> {
  const clockErr = await checkDeviceClock();
  if (clockErr) return { type: "clock", message: clockErr };

  const dayErr = await checkFiscalDayOpen(companyId);
  if (dayErr) return { type: "fiscalDay", message: dayErr };

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
  return null;
}
