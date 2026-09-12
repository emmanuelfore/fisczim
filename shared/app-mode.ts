export type AppMode = "pos" | "restaurant" | "bus_ticketing";

export const APP_MODES: Array<{ key: AppMode; label: string; description: string }> = [
  { key: "pos", label: "Retail POS", description: "Sales, inventory, customers, invoices, and POS reports." },
  { key: "restaurant", label: "Restaurant", description: "Tables, kitchen display, live orders, and restaurant POS." },
  { key: "bus_ticketing", label: "Bus Ticketing", description: "Fleet, routes, conductors, trips, ticketing, and cash-up reports." },
];

export function normalizeAppMode(raw: unknown): AppMode {
  return raw === "restaurant" || raw === "bus_ticketing" || raw === "pos" ? raw : "pos";
}
