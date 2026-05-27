export type BusFeatureKey =
  | "conductorAuth"
  | "tripSelection"
  | "ticketIssuing"
  | "seatManagement"
  | "ticketVerification"
  | "offlineMode"
  | "cashTracking"
  | "boardingManifest"
  | "fareMatrix"
  | "fleetManagement"
  | "tripManagement"
  | "conductorManagement"
  | "reports"
  | "unsyncedMonitoring"
  | "deviceTracking";

export type BusSettings = {
  enabled: boolean;
  features: Record<BusFeatureKey, boolean>;
};

const FEATURE_KEYS: BusFeatureKey[] = [
  "conductorAuth",
  "tripSelection",
  "ticketIssuing",
  "seatManagement",
  "ticketVerification",
  "offlineMode",
  "cashTracking",
  "boardingManifest",
  "fareMatrix",
  "fleetManagement",
  "tripManagement",
  "conductorManagement",
  "reports",
  "unsyncedMonitoring",
  "deviceTracking",
];

export const DEFAULT_BUS_SETTINGS: BusSettings = {
  enabled: false,
  features: FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = key !== "deviceTracking";
    return acc;
  }, {} as Record<BusFeatureKey, boolean>),
};

export function normalizeBusSettings(raw: unknown): BusSettings {
  const source = raw && typeof raw === "object" ? raw as Partial<BusSettings> & { features?: Record<string, unknown> } : {};
  const features = { ...DEFAULT_BUS_SETTINGS.features };

  if (source.features && typeof source.features === "object") {
    FEATURE_KEYS.forEach((key) => {
      const value = source.features?.[key];
      if (typeof value === "boolean") features[key] = value;
    });
  }

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_BUS_SETTINGS.enabled,
    features,
  };
}

export function isBusFeatureEnabled(raw: unknown, key: BusFeatureKey): boolean {
  const settings = normalizeBusSettings(raw);
  return settings.enabled && settings.features[key];
}
