/**
 * Per-company module visibility settings.
 *
 * Existing companies store a simple `{ moduleKey: boolean }` map in
 * `companies.featureSettings`. Business modules default on unless explicitly
 * switched off. Restaurant and Bus are workspace-specific: when a company has
 * never chosen them they stay hidden until App Mode (or the bus settings) opts
 * in, and an explicit `false` always hides them.
 */
export const FEATURE_MODULE_KEYS = [
  "procurement",
  "freight",
  "crm",
  "vehicles",
  "inventory",
  "manufacturing",
  "finance",
  "fixedAssets",
  "hr",
  "tax",
  "restaurant",
  "bus",
] as const;

export type FeatureModuleKey = (typeof FEATURE_MODULE_KEYS)[number];

export type FeatureSettings = Record<string, unknown>;

export interface FeatureModuleContext {
  appMode?: string | null;
  busEnabled?: boolean;
}

function defaultEnabled(key: FeatureModuleKey, context?: FeatureModuleContext): boolean {
  if (key === "restaurant") return context?.appMode === "restaurant";
  if (key === "bus") return Boolean(context?.busEnabled) || context?.appMode === "bus_ticketing";
  return true;
}

export function isFeatureModuleEnabled(
  settings: FeatureSettings | null | undefined,
  key: FeatureModuleKey,
  context?: FeatureModuleContext,
): boolean {
  const explicit = settings?.[key];
  if (typeof explicit === "boolean") return explicit;
  return defaultEnabled(key, context);
}

export function countEnabledFeatureModules(
  settings: FeatureSettings | null | undefined,
  context?: FeatureModuleContext,
): number {
  return FEATURE_MODULE_KEYS.filter((key) => isFeatureModuleEnabled(settings, key, context)).length;
}
