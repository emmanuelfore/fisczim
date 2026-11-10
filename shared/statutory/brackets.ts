/**
 * One shape and one unit rule for tax brackets, shared by the payroll engine,
 * the API write paths and the HR tax tab.
 *
 * A bracket set is a ZIMRA-style monthly table: PAYE = income x rate − deduction,
 * where each band's deduction constant makes it continuous with the band below.
 *
 * Rates are canonical PERCENT — ZIMRA publishes "20%", so the stored value is 20.
 * Rows written before this rule used fractions (0.2); they still read correctly,
 * but a set that mixes both conventions is rejected rather than half-applied.
 */

export interface TaxBracketRow {
  min: number;
  max: number | null;
  rate: number;
  deduction: number;
}

/** Single unit rule: resolve any stored rate to a fraction of 1. */
export function rateAsFraction(rate: number | string | null | undefined): number {
  const r = Number(rate ?? 0);
  if (!Number.isFinite(r)) return 0;
  return r >= 1 ? r / 100 : r;
}

/** Express a rate in the canonical percent unit, tolerating a fraction input. */
export function rateAsPercent(rate: number | string): number {
  const r = Number(rate ?? 0);
  if (!Number.isFinite(r)) return NaN;
  return r > 0 && r < 1 ? r * 100 : r;
}

/**
 * Upper-bound walk, sorted lowest band first. Falls back to the top band when
 * income clears every finite bound, so a table that does not cover an income
 * taxes it at the highest rate instead of silently returning zero.
 */
export function selectBracket(income: number, brackets: TaxBracketRow[]): TaxBracketRow | null {
  if (!brackets?.length) return null;
  const ordered = [...brackets].sort(
    (a, b) => (a.max === null ? Infinity : Number(a.max)) - (b.max === null ? Infinity : Number(b.max)),
  );
  for (const bracket of ordered) {
    const max = bracket.max === null ? Infinity : Number(bracket.max);
    if (income <= max) return bracket;
  }
  return ordered[ordered.length - 1];
}

/** Normalise a submitted table into canonical, ordered, percent-valued bands. */
export function canonicalizeBrackets(brackets: TaxBracketRow[]): TaxBracketRow[] {
  return [...brackets]
    .map((b) => ({
      min: Number(b.min ?? 0),
      max: b.max === null || b.max === undefined ? null : Number(b.max),
      rate: rateAsPercent(b.rate),
      deduction: Number(b.deduction ?? 0),
    }))
    .sort((a, b) => (a.max === null ? Infinity : a.max) - (b.max === null ? Infinity : b.max));
}

/**
 * Rejects a table that would mis-tax: gaps between bands, overlapping bands,
 * mixed rate units, more or less than one open-ended top band, or a boundary
 * where the tax payable drops as income rises.
 */
export function validateBrackets(input: TaxBracketRow[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(input) || input.length === 0) {
    return ["At least one tax band is required."];
  }

  const rows = input.map((b) => ({
    min: Number(b.min ?? 0),
    max: b.max === null || b.max === undefined ? null : Number(b.max),
    rawRate: Number(b.rate ?? 0),
    rate: rateAsPercent(b.rate),
    deduction: Number(b.deduction ?? 0),
  }));

  for (const r of rows) {
    if (!Number.isFinite(r.min) || r.min < 0) errors.push(`Band lower bound "${r.min}" must be a number ≥ 0.`);
    if (r.max !== null && (!Number.isFinite(r.max) || r.max <= 0)) errors.push(`Band upper bound "${r.max}" must be a positive number or empty.`);
    if (!Number.isFinite(r.rate) || r.rate < 0 || r.rate > 100) errors.push(`Band rate "${b_rate(r)}" must be between 0 and 100 (use 20 for 20%).`);
    if (!Number.isFinite(r.deduction) || r.deduction < 0) errors.push(`Band deduction constant "${r.deduction}" must be a number ≥ 0.`);
  }
  if (errors.length) return errors;

  const fractional = rows.filter((r) => r.rawRate > 0 && r.rawRate < 1).length;
  const percent = rows.filter((r) => r.rawRate >= 1).length;
  if (fractional > 0 && percent > 0) {
    errors.push("Mixed rate units: every band must use percent (20 for 20%), not fractions like 0.2.");
  }

  const openEnded = rows.filter((r) => r.max === null);
  if (openEnded.length !== 1) {
    errors.push(`Exactly one band must have no upper bound so every income is covered; found ${openEnded.length}.`);
  }

  const ordered = [...rows].sort((a, b) => (a.max === null ? Infinity : a.max) - (b.max === null ? Infinity : b.max));
  if (ordered[0].min !== 0) {
    errors.push(`The lowest band must start at 0, not ${ordered[0].min}.`);
  }
  for (let i = 1; i < ordered.length; i++) {
    const previousMax = ordered[i - 1].max;
    if (previousMax !== null && ordered[i].min !== previousMax) {
      errors.push(
        `Band gap or overlap at ${previousMax}: the band above ends at ${previousMax} but the next starts at ${ordered[i].min}. Bands must be contiguous.`,
      );
    }
  }

  // A deduction constant must not make tax fall as gross rises across a boundary.
  for (let i = 1; i < ordered.length; i++) {
    const boundary = ordered[i - 1].max;
    if (boundary === null) continue;
    const atBoundary = boundary * rateAsFraction(ordered[i - 1].rate) - ordered[i - 1].deduction;
    const justAbove = boundary * rateAsFraction(ordered[i].rate) - ordered[i].deduction;
    if (justAbove + 0.005 < atBoundary) {
      errors.push(
        `Tax drops at the $${boundary} boundary (from ${atBoundary.toFixed(2)} to ${justAbove.toFixed(2)}); the deduction constant for the band above is wrong.`,
      );
    }
  }

  return errors;
}

function b_rate(r: { rawRate: number; rate: number }): string {
  return String(Number.isFinite(r.rate) ? r.rate : r.rawRate);
}
