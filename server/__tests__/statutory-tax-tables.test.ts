import { describe, expect, test } from "vitest";
import {
  canonicalizeBrackets,
  rateAsFraction,
  rateAsPercent,
  selectBracket,
  validateBrackets,
  type TaxBracketRow,
} from "../../shared/statutory/brackets";
import { ZIMBABWE_STATUTORY_DEFAULTS, ZIMRA_USD_PAYE_2025, isTaxTableStale } from "../../shared/statutory/zimbabwe";
import { ZimbabwePayrollEngine } from "../../shared/payroll-engine";

// The table the demo seeder used to write, and which sat active in production
// from June to September 2026: a gap at 100→101, fractional rates, and constants
// that under-tax every band above $1,000.
const LEGACY_DEMO_TABLE: TaxBracketRow[] = [
  { min: 0, max: 100, rate: 0, deduction: 0 },
  { min: 101, max: 500, rate: 0.2, deduction: 20.2 },
  { min: 501, max: 1000, rate: 0.25, deduction: 45.2 },
  { min: 1001, max: 5000, rate: 0.3, deduction: 95.2 },
  { min: 5001, max: null, rate: 0.4, deduction: 595.2 },
];

const PAYE_ONLY = {
  ...ZIMBABWE_STATUTORY_DEFAULTS,
  nssaRateEmployee: 0,
  nssaRateEmployer: 0,
  nssaCeilingLimit: 0,
};

function payeAt(taxable: number, brackets: TaxBracketRow[] = ZIMRA_USD_PAYE_2025.brackets) {
  return ZimbabwePayrollEngine.calculateEmployeeLine({
    baseSalary: taxable,
    elements: [],
    pensionEmployeeRate: 0,
    pensionEmployerRate: 0,
    necRate: 0,
    necEmployerRate: 0,
    necFixedAmount: 0,
    usdPercentage: 100,
    zigPercentage: 0,
    exchangeRate: 1,
    taxConfig: { brackets },
    statutoryConfig: PAYE_ONLY,
  });
}

describe("canonical ZIMRA table", () => {
  test("the published 2025 monthly table validates as-is", () => {
    expect(validateBrackets(ZIMRA_USD_PAYE_2025.brackets)).toEqual([]);
  });

  test("reproduces the ZIMRA worked examples", () => {
    expect(payeAt(100).payeRaw).toBe(0);            // tax-free band
    expect(payeAt(300).payeRaw).toBe(40);           // 300 × 20% − 20
    expect(payeAt(1000).payeRaw).toBe(215);         // 1000 × 25% − 35
    expect(payeAt(3000).payeRaw).toBe(865);         // 3000 × 35% − 185
    expect(payeAt(4000).payeRaw).toBe(1265);        // 4000 × 40% − 335
    expect(payeAt(3000).taxableIncome).toBe(3000);
  });
});

describe("band walk fails closed", () => {
  test("an income in a band gap falls to the next band instead of paying nothing", () => {
    const gapped: TaxBracketRow[] = [
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 200, max: null, rate: 30, deduction: 10 },
    ];
    // 150 sits in the 100→200 hole: the old walk matched no band and returned 0.
    expect(payeAt(150, gapped).payeRaw).toBe(35);
  });

  test("an income above every finite bound uses the top band, never zero", () => {
    const closedTable: TaxBracketRow[] = [
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 100, max: 3000, rate: 35, deduction: 185 },
    ];
    const bracket = selectBracket(99999, closedTable);
    expect(bracket!.rate).toBe(35);
    expect(payeAt(99999, closedTable).payeRaw).toBeGreaterThan(0);
  });
});

describe("bracket validation", () => {
  test("rejects the table the demo seeder wrote", () => {
    const errors = validateBrackets(LEGACY_DEMO_TABLE);
    expect(errors.join(" ")).toMatch(/gap or overlap at 100/);
    expect(errors.join(" ")).toMatch(/gap or overlap at 500/);
  });

  test("requires exactly one open-ended band", () => {
    expect(validateBrackets([{ min: 0, max: 500, rate: 20, deduction: 20 }]).join(" "))
      .toMatch(/Exactly one band must have no upper bound/);

    expect(validateBrackets([
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 100, max: null, rate: 30, deduction: 20 },
      { min: 100, max: null, rate: 40, deduction: 335 },
    ]).join(" ")).toMatch(/Exactly one band must have no upper bound/);
  });

  test("rejects a table whose tax falls as income rises", () => {
    const bad: TaxBracketRow[] = [
      { min: 0, max: 1000, rate: 30, deduction: 85 },
      { min: 1000, max: null, rate: 35, deduction: 9000 },
    ];
    expect(validateBrackets(bad).join(" ")).toMatch(/Tax drops at the \$1000 boundary/);
  });

  test("a rate below 1% is expressible as a percent and rejected as a fraction mix", () => {
    expect(rateAsPercent(0.2)).toBe(20);
    expect(rateAsPercent(20)).toBe(20);
    expect(rateAsFraction(20)).toBe(0.2);
    expect(rateAsFraction(0.2)).toBe(0.2);

    const mixed: TaxBracketRow[] = [
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 100, max: null, rate: 0.5, deduction: 20 },
      { min: 1000, max: 5000, rate: 30, deduction: 300 },
    ];
    expect(validateBrackets(mixed).join(" ")).toMatch(/Mixed rate units/);
  });

  test("canonicalization orders and converts a fractional table", () => {
    const bands = canonicalizeBrackets([
      { min: 100, max: 300, rate: 0.2, deduction: 20 },
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 300, max: undefined as any, rate: 0.25, deduction: 35 },
    ]);
    expect(bands.map((b) => b.rate)).toEqual([0, 20, 25]);
    expect(bands[0].min).toBe(0);
    expect(bands[2].max).toBeNull();
  });

  test("an empty or unsorted submission is refused", () => {
    expect(validateBrackets([]).join(" ")).toMatch(/At least one tax band/);
    expect(validateBrackets([{ min: -1, max: null, rate: 20, deduction: 0 }]).join(" "))
      .toMatch(/lower bound/);
  });
});

describe("tax table expiry", () => {
  test("a table older than the period's year is flagged stale", () => {
    const during2026 = new Date("2026-11-03T00:00:00");
    expect(isTaxTableStale(ZIMRA_USD_PAYE_2025.taxYear, during2026)).toBe(true);
    expect(isTaxTableStale(2026, during2026)).toBe(false);
  });
});
