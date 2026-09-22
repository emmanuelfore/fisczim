import { checkStorageHealth, ensurePersistentStorage } from "@/lib/offline-db";

export interface BootStage {
  key: string;
  label: string;
  targetPct: number;
}

export interface BootResult {
  offline: boolean;
  storageHealthy: boolean;
  serverReachable: boolean;
  error: string | null;
}

export const BOOT_STAGES: BootStage[] = [
  { key: "modules", label: "Loading modules…", targetPct: 10 },
  { key: "database", label: "Checking local database…", targetPct: 30 },
  { key: "settings", label: "Loading user settings…", targetPct: 50 },
  { key: "network", label: "Checking internet connection…", targetPct: 60 },
  { key: "server", label: "Connecting to FiscalStack…", targetPct: 75 },
  { key: "sync", label: "Syncing data…", targetPct: 90 },
  { key: "workspace", label: "Preparing workspace…", targetPct: 100 },
];

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pingServer(): Promise<boolean> {
  // Offline-first: navigator.onLine === false means skip the network entirely.
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * Runs the real startup checks in order, reporting staged progress.
 * Never throws — failures are captured as offline/error so the UI can
 * offer [Continue Offline] / [Retry] instead of hanging on the splash.
 */
export async function runBootSequence(
  onStage: (stage: BootStage, result?: Partial<BootResult>) => void,
): Promise<BootResult> {
  const result: BootResult = {
    offline: false,
    storageHealthy: true,
    serverReachable: false,
    error: null,
  };

  // 1. Modules — let the bundle settle; keeps the bar moving deliberately.
  onStage(BOOT_STAGES[0]);
  await withTimeout(new Promise((r) => setTimeout(r, 250)), 800, undefined);

  // 2. Local database health (IndexedDB probe, self-heals if wedged).
  onStage(BOOT_STAGES[1]);
  try {
    const healthy = await withTimeout(checkStorageHealth(), 5000, false);
    result.storageHealthy = healthy;
    if (!healthy) {
      result.error =
        "Terminal storage is corrupted. Offline features may not work until repaired.";
    }
  } catch {
    result.storageHealthy = false;
    result.error = "Could not open the local database.";
  }

  // 3. User settings — persistent-storage grant + cached prefs read.
  onStage(BOOT_STAGES[2]);
  try {
    await withTimeout(ensurePersistentStorage(), 2000, false);
    // Touch cached settings so failures surface here, not later.
    try {
      localStorage.getItem("pos-settings");
    } catch {}
  } catch {
    // Non-fatal — settings fall back to defaults.
  }

  // 4. Internet connectivity.
  onStage(BOOT_STAGES[3]);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  result.offline = !online;
  onStage(BOOT_STAGES[3], { offline: result.offline });

  // 5. FiscalStack reachability.
  onStage(BOOT_STAGES[4]);
  const reachable = await pingServer();
  result.serverReachable = reachable;
  if (!reachable) {
    result.offline = true;
  }

  // 6. Sync warmup — intentionally non-blocking.
  // Heavy inventory/customer sync happens in the background AFTER the
  // workspace opens (see use-offline). Here we just yield a beat so the
  // bar eases 75→90 instead of jumping.
  onStage(BOOT_STAGES[5], { offline: result.offline });
  await withTimeout(new Promise((r) => setTimeout(r, 350)), 1000, undefined);

  // 7. Workspace ready.
  onStage(BOOT_STAGES[6], { offline: result.offline });

  return result;
}
