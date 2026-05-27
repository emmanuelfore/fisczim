export type AppMode = "pos" | "restaurant" | "bus_ticketing";

export function normalizeAppMode(raw: unknown): AppMode {
  return raw === "restaurant" || raw === "bus_ticketing" || raw === "pos" ? raw : "pos";
}
