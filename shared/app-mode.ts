export type AppMode = "pos" | "restaurant" | "bus_ticketing";

export const APP_MODES: Array<{ key: AppMode; label: string; description: string }> = [
  { key: "pos", label: "Retail POS", description: "Sales, inventory, customers, invoices, and POS reports." },
  { key: "restaurant", label: "Restaurant", description: "Tables, kitchen display, live orders, and restaurant POS." },
  { key: "bus_ticketing", label: "Bus Ticketing", description: "Fleet, routes, conductors, trips, ticketing, and cash-up reports." },
];

export function normalizeAppMode(raw: unknown): AppMode {
  return raw === "restaurant" || raw === "bus_ticketing" || raw === "pos" ? raw : "pos";
}

/**
 * Legacy companies can have `busSettings.enabled` without an explicit app mode.
 * Workspace selection is based only on App Mode plus that legacy flag — never
 * on feature-module visibility, which is a separate per-company allowlist.
 */
export function resolveWorkspaceMode(raw: unknown, busEnabled?: boolean): AppMode {
  if (busEnabled) return "bus_ticketing";
  return normalizeAppMode(raw);
}

export function isBusWorkspace(raw: unknown, busEnabled?: boolean): boolean {
  return resolveWorkspaceMode(raw, busEnabled) === "bus_ticketing";
}
