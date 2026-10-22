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
  { key: "modules", label: "Loading modules...", targetPct: 35 },
  { key: "settings", label: "Loading user settings...", targetPct: 70 },
  { key: "network", label: "Checking connection...", targetPct: 90 },
  { key: "workspace", label: "Preparing workspace...", targetPct: 100 },
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

/**
 * Runs only non-blocking shell startup checks.
 * POS-owned IndexedDB opens inside the POS/offline flow, not during global boot.
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

  // 1. Modules: let the bundle settle without making startup feel stuck.
  onStage(BOOT_STAGES[0]);
  await withTimeout(new Promise((r) => setTimeout(r, 120)), 250, undefined);

  // 2. Cached settings only; no persistent-storage prompt and no IndexedDB open.
  onStage(BOOT_STAGES[1]);
  try {
    localStorage.getItem("pos-settings");
  } catch {
    // Non-fatal — settings fall back to defaults.
  }

  // 3. Browser connection state only; do not block startup on server health.
  onStage(BOOT_STAGES[2]);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  result.offline = !online;
  result.serverReachable = online;
  onStage(BOOT_STAGES[2], { offline: result.offline });

  // 4. Workspace ready.
  onStage(BOOT_STAGES[3], { offline: result.offline });

  return result;
}
