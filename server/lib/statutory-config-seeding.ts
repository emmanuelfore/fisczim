/**
 * Tenant statutory configuration seeding.
 *
 * Called inside company creation so every new Zimbabwe company receives the
 * verified 2026 USD PAYE bands and statutory rule definitions. The seed is
 * idempotent: existing tenant rows are never edited or deactivated.
 *
 * APWCS is intentionally seeded without a rate. The employer must configure an
 * NSSA industrial code and an effective-dated premium rate from the gazette.
 */

import { db } from "../db.js";
import {
  payrollTaxTables,
  payrollTaxBrackets,
  payrollStatutoryRules,
  companies,
} from "../../shared/schema.js";
import { and, eq } from "drizzle-orm";
import { canonicalizeBrackets } from "../../shared/statutory/brackets.js";
import {
  ZIMRA_USD_PAYE_2026,
  VERIFIED_ZW_2026_STATUTORY_RULES,
} from "../../shared/statutory/zimbabwe.js";

type DatabaseLike = typeof db | any;

function decimalOrNull(value: number | null, places = 6): string | null {
  return value === null || value === undefined ? null : Number(value).toFixed(places);
}

function isZimbabwe(country: string | null | undefined): boolean {
  const normalized = String(country || "Zimbabwe").toLowerCase();
  return normalized === "zimbabwe" || normalized === "zw";
}

/** Seed effective-dated statutory settings for a newly created company. */
export async function seedCompanyStatutoryConfig(
  companyId: number,
  database: DatabaseLike = db,
): Promise<void> {
  const [company] = await database
    .select({ country: companies.country })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company || !isZimbabwe(company.country)) return;

  await ensureCompanyTaxTable(companyId, database);

  for (const seed of VERIFIED_ZW_2026_STATUTORY_RULES) {
    await ensureCompanyRule(companyId, seed, database);
  }
}

async function ensureCompanyTaxTable(companyId: number, database: DatabaseLike): Promise<void> {
  const table = ZIMRA_USD_PAYE_2026;
  const [existing] = await database
    .select({ id: payrollTaxTables.id })
    .from(payrollTaxTables)
    .where(and(
      eq(payrollTaxTables.companyId, companyId),
      eq(payrollTaxTables.countryCode, table.countryCode),
      eq(payrollTaxTables.currency, table.currency),
      eq(payrollTaxTables.payFrequency, table.payFrequency),
      eq(payrollTaxTables.taxYear, table.taxYear),
    ))
    .limit(1);

  if (existing) return;

  const bands = canonicalizeBrackets(table.brackets);
  const [created] = await database.insert(payrollTaxTables).values({
    companyId,
    countryCode: table.countryCode,
    currency: table.currency,
    taxYear: table.taxYear,
    payFrequency: table.payFrequency,
    effectiveFrom: table.effectiveFrom,
    effectiveTo: table.effectiveTo,
    sourceReference: table.sourceReference,
    isActive: true,
  }).returning();

  await database.insert(payrollTaxBrackets).values(bands.map((band, index) => ({
    taxTableId: created.id,
    bracketOrder: index + 1,
    minIncome: band.min.toFixed(2),
    maxIncome: band.max === null ? null : band.max.toFixed(2),
    rate: band.rate.toFixed(6),
    deduction: band.deduction.toFixed(2),
  })));
}

async function ensureCompanyRule(
  companyId: number,
  seed: (typeof VERIFIED_ZW_2026_STATUTORY_RULES)[number],
  database: DatabaseLike,
): Promise<void> {
  const [existing] = await database
    .select({ id: payrollStatutoryRules.id })
    .from(payrollStatutoryRules)
    .where(and(
      eq(payrollStatutoryRules.companyId, companyId),
      eq(payrollStatutoryRules.ruleCode, seed.ruleCode),
    ))
    .limit(1);

  if (existing) return;

  await database.insert(payrollStatutoryRules).values({
    companyId,
    countryCode: "ZW",
    ruleCode: seed.ruleCode,
    name: seed.name,
    currency: seed.currency,
    payFrequency: "MONTHLY",
    employeeRate: decimalOrNull(seed.employeeRate),
    employerRate: decimalOrNull(seed.employerRate),
    ceilingAmount: decimalOrNull(seed.ceilingAmount, 2),
    calculationBasis: seed.calculationBasis,
    calculationType: seed.calculationType,
    category: seed.category,
    responsibleParty: seed.responsibleParty,
    statutoryAuthority: seed.statutoryAuthority,
    sourceReference: seed.sourceReference,
    isCapped: seed.isCapped,
    ceilingPeriod: seed.ceilingPeriod,
    annualAmount: decimalOrNull(seed.annualAmount, 2),
    requiresIndustryRate: seed.requiresIndustryRate,
    effectiveFrom: seed.effectiveFrom,
    effectiveTo: null,
    version: 1,
    isActive: true,
    isSystemLocked: false,
    metadata: { notes: seed.notes ?? null },
  });
}

/** Used by the manual "reseed sample documents" endpoint for older tenants. */
export async function backfillCompanyStatutoryConfig(companyId: number): Promise<void> {
  await seedCompanyStatutoryConfig(companyId, db);
}
