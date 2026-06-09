import { z } from "zod";

export type DualLogoLayout = "side_by_side" | "primary_secondary" | "stacked";

export const partnershipSettingsSchema = z.object({
  dualLogoEnabled: z.boolean().default(true),
  dualLogoLayout: z.enum(["side_by_side", "primary_secondary", "stacked"]).default("side_by_side"),
  defaultPartnerId: z.number().nullable().optional(),
  showPartnerOnPosReceipt: z.boolean().default(true),
  partnershipFootnote: z.string().optional(),
});

export type PartnershipSettings = z.infer<typeof partnershipSettingsSchema>;

export const DEFAULT_PARTNERSHIP_SETTINGS: PartnershipSettings = {
  dualLogoEnabled: true,
  dualLogoLayout: "side_by_side",
  defaultPartnerId: null,
  showPartnerOnPosReceipt: true,
  partnershipFootnote: "Revenue sharing arrangement. Fiscal receipt issued by the seller named above.",
};

export function normalizePartnershipSettings(raw: unknown): PartnershipSettings {
  const parsed = partnershipSettingsSchema.safeParse(raw);
  if (parsed.success) return { ...DEFAULT_PARTNERSHIP_SETTINGS, ...parsed.data };
  return { ...DEFAULT_PARTNERSHIP_SETTINGS };
}

export type PartnerSnapshot = {
  id: number;
  name: string;
  tradingName?: string | null;
  logoUrl?: string | null;
  tin?: string | null;
  vatNumber?: string | null;
  displayLabel?: string | null;
  revenueSharePercent: number;
};

export function computeRevenueSplit(total: number, sharePercent: number) {
  const pct = Math.min(100, Math.max(0, Number(sharePercent) || 0));
  const partnerShare = Math.round((total * pct) / 100 * 100) / 100;
  const issuerShare = Math.round((total - partnerShare) * 100) / 100;
  return { partnerShareAmount: partnerShare, issuerShareAmount: issuerShare, revenueSharePercent: pct };
}
