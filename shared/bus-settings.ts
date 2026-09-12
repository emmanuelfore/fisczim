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

export const BUS_FEATURES: Array<{
  key: BusFeatureKey;
  label: string;
  description: string;
  group: "Conductor APK" | "Admin Web" | "Controls";
}> = [
  { key: "conductorAuth", label: "Conductor authentication", description: "PIN/password login and shift ownership.", group: "Conductor APK" },
  { key: "tripSelection", label: "Trip selection", description: "Route, departure, and assigned bus selection.", group: "Conductor APK" },
  { key: "ticketIssuing", label: "Ticket issuing", description: "Fast cash ticket flow for passengers.", group: "Conductor APK" },
  { key: "seatManagement", label: "Seat management", description: "Visual seat status and duplicate-sale prevention.", group: "Conductor APK" },
  { key: "ticketVerification", label: "Ticket verification code", description: "Simple numeric code on each ticket.", group: "Conductor APK" },
  { key: "offlineMode", label: "Offline operation", description: "Local sales storage and later sync.", group: "Controls" },
  { key: "cashTracking", label: "Cash tracking", description: "Expected cash, shortages, and overages.", group: "Conductor APK" },
  { key: "boardingManifest", label: "Boarding manifest", description: "Passenger list for audits and checks.", group: "Conductor APK" },
  { key: "fareMatrix", label: "Fare matrix", description: "Stop-to-stop fare configuration.", group: "Admin Web" },
  { key: "fleetManagement", label: "Fleet management", description: "Manage buses and seat capacity.", group: "Admin Web" },
  { key: "tripManagement", label: "Trip management", description: "Schedule and view bus trips.", group: "Admin Web" },
  { key: "conductorManagement", label: "Conductor management", description: "Manage conductor profiles and access.", group: "Admin Web" },
  { key: "reports", label: "Bus reports", description: "Daily, range, conductor, and cash-up reports.", group: "Admin Web" },
  { key: "unsyncedMonitoring", label: "Unsynced sales monitoring", description: "Track devices that have not synced.", group: "Controls" },
  { key: "deviceTracking", label: "Device tracking", description: "Prepare for registered-device enforcement.", group: "Controls" },
];

export const DEFAULT_BUS_SETTINGS: BusSettings = {
  enabled: false,
  features: BUS_FEATURES.reduce((acc, feature) => {
    acc[feature.key] = feature.key !== "deviceTracking";
    return acc;
  }, {} as Record<BusFeatureKey, boolean>),
};

export function normalizeBusSettings(raw: unknown): BusSettings {
  const source = raw && typeof raw === "object" ? raw as Partial<BusSettings> & { features?: Record<string, unknown> } : {};
  const features = { ...DEFAULT_BUS_SETTINGS.features };

  if (source.features && typeof source.features === "object") {
    for (const feature of BUS_FEATURES) {
      const value = source.features[feature.key];
      if (typeof value === "boolean") features[feature.key] = value;
    }
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
