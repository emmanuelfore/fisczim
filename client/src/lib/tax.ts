// Single source of truth for resolving a product/line's tax type from the
// tax config (useTaxConfig data). The authority tax ID (ZIMRA taxID /
// LEKAKU taxID) always comes from the matched config entry — never guessed.
//
// Resolution order:
//   1. Explicit taxTypeId (canonical link set at product creation/edit).
//   2. Legacy rate match for rows created before taxTypeId existed, with
//      zero-rate vs exempt disambiguation.
export type FiscalProvider = "ZIMRA" | "LEKAKU";

export interface TaxResolvable {
  taxTypeId?: number | string | null;
  taxRate?: string | number | null;
  name?: string | null;
  description?: string | null;
}

function rateOf(value: string | number | null | undefined): number {
  return parseFloat(String(value ?? "0")) || 0;
}

function nameMentionsExempt(item: TaxResolvable): boolean {
  return (
    (item.name || "").toLowerCase().includes("exempt") ||
    (item.description || "").toLowerCase().includes("exempt")
  );
}

function matchesZeroRateDisambiguation(t: any, item: TaxResolvable): boolean {
  if (nameMentionsExempt(item)) {
    const zimraTaxId = t.zimraTaxId?.toString();
    return (
      zimraTaxId == "1" ||
      t.zimraCode === "C" ||
      t.zimraCode === "E" ||
      (t.name || "").toLowerCase().includes("exempt")
    );
  }
  const zimraTaxId = t.zimraTaxId?.toString();
  return (
    zimraTaxId == "2" ||
    t.zimraCode === "D" ||
    (t.name || "").toLowerCase().includes("zero")
  );
}

export function resolveTaxType(
  item: TaxResolvable,
  taxTypes: any[] | undefined | null,
): any | undefined {
  if (!taxTypes || taxTypes.length === 0) return undefined;

  // 1. Canonical: explicit link into the tax config.
  if (item.taxTypeId !== undefined && item.taxTypeId !== null) {
    const byId = taxTypes.find((t: any) => t.id === item.taxTypeId);
    if (byId) return byId;
  }

  // 2. Legacy rows without taxTypeId: match the snapshot rate.
  const rate = rateOf(item.taxRate);
  return taxTypes.find((t: any) => {
    if (rateOf(t.rate) !== rate) return false;
    if (rate === 0) return matchesZeroRateDisambiguation(t, item);
    return true;
  });
}

export function isExemptTaxType(taxType: any | undefined | null): boolean {
  if (!taxType) return false;
  return (
    taxType.zimraTaxId == 1 ||
    taxType.zimraTaxId == "1" ||
    taxType.zimraCode === "C" ||
    taxType.zimraCode === "E" ||
    taxType.lekakuTaxType === "Exempt" ||
    (taxType.name || "").toLowerCase().includes("exempt")
  );
}

export function isZeroRatedTaxType(
  taxType: any | undefined | null,
  fallbackRate?: string | number | null,
): boolean {
  if (!taxType) return false;
  if (isExemptTaxType(taxType)) return false;
  return (
    taxType.zimraTaxId == 2 ||
    taxType.zimraTaxId == "2" ||
    taxType.zimraCode === "D" ||
    taxType.lekakuTaxType === "NonVAT" ||
    (taxType.name || "").toLowerCase().includes("zero rated") ||
    rateOf(fallbackRate) === 0
  );
}

// Authority tax ID for fiscal submission, taken from the tax config entry.
// Returns undefined when the entry has no mapping — callers must surface
// that as a config error instead of guessing an ID.
export function getAuthorityTaxId(
  taxType: any | undefined | null,
  provider: FiscalProvider,
): number | undefined {
  if (!taxType) return undefined;
  const raw =
    provider === "LEKAKU" ? taxType.lekakuTaxId : taxType.zimraTaxId;
  const parsed = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
