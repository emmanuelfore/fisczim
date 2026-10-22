import type { TaxType } from "../../shared/schema.js";
import type { ZimraConfigResponse, ZimraTax } from "../zimra.js";

/**
 * Deterministic ZIMRA tax mapping.
 *
 * The old submission path resolved taxIDs with a long heuristic cascade
 * ("match by percent", "match by name", "first match wins") which silently
 * picked the WRONG tax when a company has duplicate rates or ambiguous live
 * taxes (e.g. two 15.5% types, or Exempt + Zero Rated both at 0%). ZIMRA then
 * recomputes against the actual tax ID and marks the receipt Red.
 *
 * This module builds one authoritative mapping per company (local tax type
 * -> live ZIMRA tax ID) and resolves every line deterministically, surfacing
 * actionable issues BEFORE a receipt is submitted so invalid tax never reaches
 * FDMS.
 */

export type TaxIssueSeverity = "error" | "warning";

export interface TaxConfigIssue {
  code: string;
  severity: TaxIssueSeverity;
  message: string;
}

export interface LocalTaxMapping {
  taxTypeId: number;
  code: string;
  name: string;
  rate: number;
  zimraTaxId: string | null;
  resolvedTaxId: number | null;
  resolvedTaxName: string | null;
  status: "ok" | "healed" | "mismatch" | "missing" | "ambiguous" | "unmapped" | "no-live";
}

export interface CompanyTaxMapping {
  liveAvailable: boolean;
  liveTaxes: ZimraTax[];
  byTaxTypeId: Map<number, { taxID: number; rate: number; status: LocalTaxMapping["status"] }>;
  byRate: Map<number, { taxID: number; exempt: boolean; name: string }[]>;
  localTaxes: LocalTaxMapping[];
  issues: TaxConfigIssue[];
}

export function getLiveTaxes(config?: ZimraConfigResponse | null): ZimraTax[] {
  return ((config?.applicableTaxes || config?.taxLevels || []) as ZimraTax[]) || [];
}

const roundRate = (value: number) => Math.round(value * 100) / 100;

export function buildCompanyTaxMapping(
  dbTaxTypes: TaxType[],
  zimraConfig?: ZimraConfigResponse | null,
): CompanyTaxMapping {
  const liveTaxes = getLiveTaxes(zimraConfig);
  const liveAvailable = liveTaxes.length > 0;
  const active = (dbTaxTypes || []).filter((t) => t.isActive !== false);
  const byTaxTypeId = new Map<number, { taxID: number; rate: number; status: LocalTaxMapping["status"] }>();
  const byRate = new Map<number, { taxID: number; exempt: boolean; name: string }[]>();
  const localTaxes: LocalTaxMapping[] = [];
  const issues: TaxConfigIssue[] = [];

  for (const live of liveTaxes) {
    const rate = roundRate(Number(live.taxPercent || 0));
    const exempt = String(live.taxName || "").toLowerCase().includes("exempt");
    const list = byRate.get(rate) || [];
    list.push({ taxID: live.taxID, exempt, name: String(live.taxName || "") });
    byRate.set(rate, list);
  }

  // Without live config (offline / network failure) we cannot verify anything:
  // trust explicit mappings, resolve nothing, and never block submission.
  if (!liveAvailable) {
    for (const t of active) {
      const explicitId = t.zimraTaxId ? parseInt(String(t.zimraTaxId)) : NaN;
      const resolvedTaxId = Number.isNaN(explicitId) ? null : explicitId;
      byTaxTypeId.set(t.id, { taxID: resolvedTaxId || 0, rate: Number(t.rate), status: resolvedTaxId ? "no-live" : "unmapped" });
      localTaxes.push({
        taxTypeId: t.id,
        code: t.code,
        name: t.name,
        rate: Number(t.rate),
        zimraTaxId: t.zimraTaxId || null,
        resolvedTaxId,
        resolvedTaxName: null,
        status: resolvedTaxId ? "no-live" : "unmapped",
      });
    }
    return { liveAvailable, liveTaxes, byTaxTypeId, byRate, localTaxes, issues };
  }

  for (const t of active) {
    const rate = Number(t.rate);
    const explicitId = t.zimraTaxId ? parseInt(String(t.zimraTaxId)) : NaN;
    let resolvedTaxId: number | null = null;
    let resolvedTaxName: string | null = null;
    let status: LocalTaxMapping["status"] = "unmapped";

    if (!Number.isNaN(explicitId)) {
      const live = liveTaxes.find((l) => l.taxID === explicitId);
      if (!live) {
        const healCandidates = (byRate.get(roundRate(rate)) || []).filter(
          (c) => c.taxID !== explicitId,
        );
        if (healCandidates.length === 1) {
          const heal = healCandidates[0];
          resolvedTaxId = heal.taxID;
          resolvedTaxName = heal.name;
          status = "healed";
          issues.push({
            code: "TAX_ID_HEALED",
            severity: "warning",
            message: `Tax type "${t.name}" (${rate}%) maps to ZIMRA tax ID ${explicitId} which is not on the device; using device tax ID ${heal.taxID} (${rate}%).`,
          });
        } else {
          status = "missing";
          resolvedTaxId = explicitId;
          issues.push({
            code: "TAX_LIVE_MISSING",
            severity: "error",
            message: `Tax type "${t.name}" (${rate}%) maps to ZIMRA tax ID ${explicitId} which is not on the device, and no other device tax uniquely matches ${rate}%.`,
          });
        }
      } else {
        resolvedTaxId = explicitId;
        resolvedTaxName = String(live.taxName || "");
        const livePercent = Number(live.taxPercent || 0);
        if (Math.abs(livePercent - rate) > 0.01) {
          // Stale mapping: the device's tax ID has a different percent than the
          // local rate. The live device is authoritative — resolve by rate to
          // the live tax that actually matches, so receipts never carry a
          // wrong tax ID. Only if the rate matches NO live tax do we block.
          const healCandidates = (byRate.get(roundRate(rate)) || []).filter(
            (c) => c.taxID !== explicitId,
          );
          if (healCandidates.length === 1) {
            const heal = healCandidates[0];
            resolvedTaxId = heal.taxID;
            resolvedTaxName = heal.name;
            status = "healed";
            issues.push({
              code: "TAX_ID_HEALED",
              severity: "warning",
              message: `Tax type "${t.name}" (${rate}%) maps to ZIMRA tax ID ${explicitId} (${livePercent}% on device); using device tax ID ${heal.taxID} (${rate}%). Update the ZIMRA tax ID in Tax Config to ${heal.taxID} to clear this.`,
            });
          } else {
            status = "mismatch";
            issues.push({
              code: "TAX_PERCENT_MISMATCH",
              severity: "error",
              message: `Tax type "${t.name}" (${rate}%) maps to ZIMRA tax ID ${explicitId} which is ${livePercent}% on the device, and no other device tax matches ${rate}%. Fix the ZIMRA tax ID or rate in Tax Config.`,
            });
          }
        } else {
          status = "ok";
        }
      }
    } else {
      const candidates = byRate.get(roundRate(rate)) || [];
      if (candidates.length === 1) {
        resolvedTaxId = candidates[0].taxID;
        resolvedTaxName = candidates[0].name;
        status = "ok";
      } else if (candidates.length > 1) {
        const isExempt = String(t.name).toLowerCase().includes("exempt");
        const match = candidates.filter((c) => c.exempt === isExempt);
        if (match.length === 1) {
          resolvedTaxId = match[0].taxID;
          resolvedTaxName = match[0].name;
          status = "ok";
        } else {
          resolvedTaxId = candidates[0].taxID;
          resolvedTaxName = candidates[0].name;
          status = "ambiguous";
          issues.push({
            code: "TAX_AMBIGUOUS",
            severity: "warning",
            message: `Rate ${rate}% matches multiple ZIMRA taxes (${candidates.map((c) => c.taxID).join(", ")}) for "${t.name}". Set a ZIMRA tax ID on this tax type to disambiguate.`,
          });
        }
      } else {
        status = "unmapped";
        issues.push({
          code: "TAX_RATE_UNMAPPED",
          severity: "error",
          message: `Tax type "${t.name}" (${rate}%) has no matching tax on the ZIMRA device.`,
        });
      }
    }

    byTaxTypeId.set(t.id, { taxID: resolvedTaxId || 0, rate, status });
    localTaxes.push({
      taxTypeId: t.id,
      code: t.code,
      name: t.name,
      rate,
      zimraTaxId: t.zimraTaxId || null,
      resolvedTaxId,
      resolvedTaxName,
      status,
    });
  }

  // Duplicate rates inside the local config resolving to DIFFERENT tax IDs
  // (e.g. two 15.5% types mapped to 515 and 517) — the historical root cause
  // of wrong tax submissions.
  const byRateLocal = new Map<number, LocalTaxMapping[]>();
  for (const lt of localTaxes) {
    const list = byRateLocal.get(lt.rate) || [];
    list.push(lt);
    byRateLocal.set(lt.rate, list);
  }
  for (const [rate, list] of byRateLocal) {
    if (list.length < 2) continue;
    const distinctIds = new Set(list.map((l) => l.resolvedTaxId).filter((v): v is number => v != null));
    if (distinctIds.size > 1) {
      issues.push({
        code: "TAX_DUP_RATE_CONFLICT",
        severity: "error",
        message: `Rate ${rate}% is used by multiple tax types mapping to different ZIMRA taxes (${[...distinctIds].join(", ")}): ${list.map((l) => `"${l.name}"`).join(", ")}. Assign the correct ZIMRA tax ID to each.`,
      });
    }
  }

  return { liveAvailable, liveTaxes, byTaxTypeId, byRate, localTaxes, issues };
}

export interface LineTaxResolution {
  taxID: number | null;
  issue: TaxConfigIssue | null;
}

/**
 * Resolve the ZIMRA tax ID for one receipt line, deterministically:
 * 1. Item's tax type -> its mapped live tax (verified against live percent).
 * 2. Rate -> unique live tax for that rate.
 * 3. Rate -> name-disambiguated (Exempt vs Zero Rated) using the description.
 * 4. Nothing found -> null (caller falls back to heuristic and warns).
 */
export function resolveLineTaxID(
  mapping: CompanyTaxMapping,
  opts: {
    taxTypeId?: number | null;
    rate: number;
    description?: string | null;
    forceNonVat?: boolean;
  },
): LineTaxResolution {
  const { taxTypeId, rate, description = "", forceNonVat = false } = opts;
  const rounded = roundRate(Number(rate) || 0);

  if (forceNonVat) {
    const nonVat = mapping.liveTaxes.find(
      (t) => Math.abs(t.taxPercent || 0) < 0.01 && String(t.taxName || "").toLowerCase().includes("non-vat"),
    );
    const anyZero = mapping.liveTaxes.find((t) => Math.abs(t.taxPercent || 0) < 0.01);
    const taxID = nonVat?.taxID ?? anyZero?.taxID;
    if (taxID) return { taxID, issue: null };
    return {
      taxID: null,
      issue: { code: "TAX_NONVAT_MISSING", severity: "error", message: "No Non-VAT 0% tax is configured on the ZIMRA device." },
    };
  }

  const mapped = taxTypeId ? mapping.byTaxTypeId.get(taxTypeId) : null;
  if (mapped && mapped.taxID) {
    if (mapped.status === "ok" || mapped.status === "no-live" || mapped.status === "healed") {
      return { taxID: mapped.taxID, issue: null };
    }
    // If the local mapping is 'missing', 'mismatch', or 'ambiguous',
    // we intentionally ignore it here and fall through to resolve
    // the tax ID dynamically from the live ZIMRA config based on the rate.
  }

  const candidates = mapping.byRate.get(rounded) || [];
  if (candidates.length === 1) return { taxID: candidates[0].taxID, issue: null };

  if (candidates.length > 1) {
    const isExempt = String(description || "").toLowerCase().includes("exempt");
    const match = candidates.filter((c) => c.exempt === isExempt);
    if (match.length === 1) return { taxID: match[0].taxID, issue: null };
    return {
      taxID: candidates[0].taxID,
      issue: {
        code: "TAX_AMBIGUOUS_RATE",
        severity: "error",
        message: `Rate ${rate}% matches multiple ZIMRA taxes (${candidates.map((c) => c.taxID).join(", ")}) and the item has no tax type. Assign a tax type to this product or its category.`,
      },
    };
  }

  return {
    taxID: null,
    issue: {
      code: "TAX_RATE_UNKNOWN",
      severity: "warning",
      message: `Rate ${rate}% is not configured on the ZIMRA device.`,
    },
  };
}
