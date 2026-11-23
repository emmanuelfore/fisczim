/**
 * Zimbabwe statutory reference data — the only place these numbers are written
 * down in this codebase. Everything else (seeding, the demo company script, the
 * payroll run inputs, the HR tax tab) reads from here.
 *
 * Source of the PAYE table: ZIMRA "USD Jan-Dec 2025 Tax Tables", PAYE monthly
 * column. Income Tax Act [Chapter 11:06] Second Schedule supplies the structure;
 * the National Assembly's annual Finance Act sets the figures.
 */

import type { TaxBracketRow } from "./brackets.js";
export {
  VERIFIED_ZW_2026_STATUTORY_RULES,
  STATUTORY_RULE_CODES_2026,
  payPeriodsPerYear,
} from "./statutory-config.js";
export type {
  StatutoryCategory,
  StatutoryResponsibleParty,
  StatutoryCalculationType,
  StatutoryCeilingPeriod,
  StatutoryRuleSeed,
} from "./statutory-config.js";

export interface StatutoryTaxTable {
  countryCode: string;
  currency: string;
  payFrequency: string;
  taxYear: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceReference: string;
  brackets: TaxBracketRow[];
}

/**
 * ZIMRA USD monthly PAYE for 2025, retained for historical/replayed periods.
 * Current 2026 payroll must use ZIMRA_USD_PAYE_2026 below; the tax tables are
 * effective-dated and the payroll run loads the table matching its frequency.
 */
export const ZIMRA_USD_PAYE_2025: StatutoryTaxTable = {
  countryCode: "ZW",
  currency: "USD",
  payFrequency: "MONTHLY",
  taxYear: 2025,
  effectiveFrom: "2025-01-01",
  effectiveTo: null,
  sourceReference: "ZIMRA USD Jan-Dec 2025 Tax Tables — PAYE monthly table",
  brackets: [
    { min: 0, max: 100, rate: 0, deduction: 0 },
    { min: 100, max: 300, rate: 20, deduction: 20 },
    { min: 300, max: 1000, rate: 25, deduction: 35 },
    { min: 1000, max: 2000, rate: 30, deduction: 85 },
    { min: 2000, max: 3000, rate: 35, deduction: 185 },
    { min: 3000, max: null, rate: 40, deduction: 335 },
  ],
};

/**
 * ZIMRA USD monthly PAYE, 1 January – 31 December 2026. The bands are unchanged
 * from 2025, but this is the verified 2026 publication and must be the table
 * selected for 2026 payroll periods. Non-monthly tables are not derived by
 * dividing these bands; add the published frequency table when needed.
 */
export const ZIMRA_USD_PAYE_2026: StatutoryTaxTable = {
  countryCode: "ZW",
  currency: "USD",
  payFrequency: "MONTHLY",
  taxYear: 2026,
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  sourceReference: "ZIMRA 2026 USD PAYE tax tables — monthly column (verified 23 Nov 2026)",
  brackets: [
    { min: 0, max: 100, rate: 0, deduction: 0 },
    { min: 100, max: 300, rate: 20, deduction: 20 },
    { min: 300, max: 1000, rate: 25, deduction: 35 },
    { min: 1000, max: 2000, rate: 30, deduction: 85 },
    { min: 2000, max: 3000, rate: 35, deduction: 185 },
    { min: 3000, max: null, rate: 40, deduction: 335 },
  ],
};

/**
 * Legacy engine constants kept for backwards compatibility with older runs.
 * New tenants are seeded from VERIFIED_ZW_2026_STATUTORY_RULES instead.
 */
export const ZIMBABWE_STATUTORY_DEFAULTS = {
  aidsLevyRate: 0.03, // 3% of PAYE
  zimdefRate: 0.01, // 1% of gross, employer only
  standardsLevyRate: 0.005, // 0.5% of gross, employer only
  taxFreeBonusThreshold: 400, // USD 400 per employee per year
  nssaRateEmployee: 0.045,
  nssaRateEmployer: 0.045,
  medicalAidCreditMonthly: 75,
  blindPersonCreditAnnual: 900,
  elderlyPersonCreditAnnual: 900,
  disabledPersonCreditAnnual: 900,
  medicalCreditRate: 0.5,
  maxTaxDeductiblePensionAnnual: 54000,
  hoursPerDay: 8,
  workingDaysPerMonth: 22,
  overtimeMultiplierStandard: 1.5,
  overtimeMultiplierSunday: 2.0,
} as const;

/**
 * Statutory rule rows. NSSA's insurable-earnings ceiling lives here rather than
 * in the engine defaults because a payroll run reads it from the tenant's
 * NSSA_POBS rule, and a missing ceiling must keep meaning "no ceiling applied".
 */
export const ZIMBABWE_STATUTORY_RULE_SEED = {
  nssaCeilingLimitUsd: 700,
  aidsLevy: {
    ruleCode: "AIDS_LEVY",
    name: "AIDS Levy",
    employeeRate: "0.030000",
    employerRate: "0.000000",
    calculationBasis: "PAYE",
    effectiveFrom: "2023-01-01",
  },
  nssaPobs: {
    ruleCode: "NSSA_POBS",
    name: "NSSA POBS",
    employeeRate: "0.045000",
    employerRate: "0.045000",
    ceilingAmount: "700.00",
    calculationBasis: "TAXABLE_INCOME",
    effectiveFrom: "2023-01-01",
  },
} as const;

/**
 * True when the table predates the tax year the period falls in, i.e. ZIMRA has
 * almost certainly published a newer table that nobody has loaded yet.
 */
export function isTaxTableStale(taxYear: number, onOrCovering: Date = new Date()): boolean {
  return taxYear < onOrCovering.getFullYear();
}
