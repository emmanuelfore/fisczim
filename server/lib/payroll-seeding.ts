/**
 * FiscalStack Payroll Seeding — Zimbabwe Statutory Defaults
 *
 * Seeds reference data that is law, not tenant configuration:
 *  1. The ZIMRA PAYE table, written into payroll_tax_tables + payroll_tax_brackets
 *     — the single source of tax truth the payroll engine reads.
 *  2. Global (companyId = NULL) statutory rules for the AIDS levy and NSSA POBS, so
 *     a fresh install can run payroll. A tenant's own rules always take precedence.
 *  3. NEC sector presets (companyId = NULL) visible to all tenants.
 *
 * Every figure comes from shared/statutory/zimbabwe.ts. Nothing is typed twice.
 *
 * Call `seedGlobalPayrollDefaults()` at app startup. It is idempotent and never
 * deactivates an existing table — a table a platform admin configured by hand
 * always wins over this seed.
 *
 * Sources:
 *  - ZIMRA "USD Jan-Dec 2025 Tax Tables" (PAYE), Income Tax Act [Chapter 11:06]
 *  - NSSA Act Chapter 17:04 — contribution rates and insurable-earnings ceiling
 *  - Various NEC Collective Bargaining Agreements (CBA) 2024
 */

import { db } from "../db.js";
import { necSectorsConfig, payrollTaxTables, payrollTaxBrackets, payrollStatutoryRules } from "../../shared/schema.js";
import { eq, and, isNull } from "drizzle-orm";
import { canonicalizeBrackets } from "../../shared/statutory/brackets.js";
import { ZIMRA_USD_PAYE_2025, ZIMBABWE_STATUTORY_RULE_SEED, type StatutoryTaxTable } from "../../shared/statutory/zimbabwe.js";

// ─────────────────────────────────────────────────────────────────────────────
// NEC (National Employment Council) Sector Presets
// Based on collective bargaining agreements as of 2024
// companyId = NULL → global preset visible to all tenants
// ─────────────────────────────────────────────────────────────────────────────
const NEC_SECTOR_PRESETS = [
  { name: "NEC Commercial Sector", code: "NEC-COMM", employeeRate: "0.0100", employerRate: "0.0100", fixedAmount: "0.00" },
  { name: "NEC Agriculture", code: "NEC-AGRI", employeeRate: "0.0100", employerRate: "0.0100", fixedAmount: "0.00" },
  { name: "NEC Mining Industry", code: "NEC-MINE", employeeRate: "0.0050", employerRate: "0.0050", fixedAmount: "0.00" },
  { name: "NEC Motor Industry", code: "NEC-MOTO", employeeRate: "0.0100", employerRate: "0.0100", fixedAmount: "0.00" },
  { name: "NEC Construction", code: "NEC-CONS", employeeRate: "0.0100", employerRate: "0.0100", fixedAmount: "0.00" },
  { name: "NEC Hotel & Catering", code: "NEC-HOSP", employeeRate: "0.0100", employerRate: "0.0150", fixedAmount: "0.00" },
  { name: "NEC Financial Institutions", code: "NEC-FINC", employeeRate: "0.0075", employerRate: "0.0075", fixedAmount: "0.00" },
  { name: "NEC Health Services", code: "NEC-HLTH", employeeRate: "0.0100", employerRate: "0.0100", fixedAmount: "0.00" },
  // Domestic workers are levied per month rather than as a percentage, per CBA 2024.
  { name: "NEC Domestic Workers", code: "NEC-DOME", employeeRate: "0.0000", employerRate: "0.0000", fixedAmount: "2.00" },
  { name: "NEC Transport", code: "NEC-TRNS", employeeRate: "0.0100", employerRate: "0.0100", fixedAmount: "0.00" },
  { name: "NEC Communications", code: "NEC-COMM2", employeeRate: "0.0075", employerRate: "0.0075", fixedAmount: "0.00" },
  { name: "No NEC (Exempt / Not Applicable)", code: "NEC-NONE", employeeRate: "0.0000", employerRate: "0.0000", fixedAmount: "0.00" },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function seedGlobalPayrollDefaults(): Promise<void> {
  console.log("[PAYROLL-SEED] Seeding global Zimbabwe statutory defaults...");

  for (const preset of NEC_SECTOR_PRESETS) {
    try {
      await ensureNecPreset(preset);
    } catch (err: any) {
      console.error(`[PAYROLL-SEED] Failed to seed NEC ${preset.code}:`, err.message);
    }
  }

  try {
    await ensureGlobalTaxTable(ZIMRA_USD_PAYE_2025);
  } catch (err: any) {
    console.error("[PAYROLL-SEED] Failed to seed the ZIMRA PAYE table:", err.message);
  }

  try {
    await ensureGlobalStatutoryRules();
  } catch (err: any) {
    console.error("[PAYROLL-SEED] Failed to seed global statutory rules:", err.message);
  }

  console.log("[PAYROLL-SEED] Global payroll defaults seeding complete.");
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function ensureNecPreset(preset: (typeof NEC_SECTOR_PRESETS)[number]) {
  const [existing] = await db
    .select({ id: necSectorsConfig.id })
    .from(necSectorsConfig)
    .where(and(eq(necSectorsConfig.code, preset.code), isNull(necSectorsConfig.companyId)))
    .limit(1);

  if (existing) {
    console.log(`[PAYROLL-SEED] NEC preset exists: ${preset.code}`);
    return;
  }

  await db.insert(necSectorsConfig).values({
    companyId: null,
    name: preset.name,
    code: preset.code,
    employeeRate: preset.employeeRate,
    employerRate: preset.employerRate,
    fixedAmount: preset.fixedAmount,
    isActive: true,
  });
  console.log(`[PAYROLL-SEED] NEC preset created: ${preset.code}`);
}

/**
 * Insert the statutory table only when nothing already covers its scope. An
 * existing table is left alone and no other table is deactivated to make room —
 * the previous seeder flipped every row of a currency off on restart, which
 * silently changed the bands applied to all tenants.
 */
async function ensureGlobalTaxTable(table: StatutoryTaxTable): Promise<void> {
  const [existing] = await db
    .select({ id: payrollTaxTables.id })
    .from(payrollTaxTables)
    .where(and(
      eq(payrollTaxTables.countryCode, table.countryCode),
      eq(payrollTaxTables.currency, table.currency),
      eq(payrollTaxTables.payFrequency, table.payFrequency),
      eq(payrollTaxTables.taxYear, table.taxYear),
    ))
    .limit(1);

  if (existing) {
    console.log(`[PAYROLL-SEED] ${table.currency} ${table.taxYear} tax table exists (#${existing.id}); left untouched.`);
    return;
  }

  const bands = canonicalizeBrackets(table.brackets);
  await db.transaction(async (tx) => {
    const [created] = await tx.insert(payrollTaxTables).values({
      companyId: null,
      countryCode: table.countryCode,
      currency: table.currency,
      taxYear: table.taxYear,
      payFrequency: table.payFrequency,
      effectiveFrom: table.effectiveFrom,
      effectiveTo: table.effectiveTo,
      sourceReference: table.sourceReference,
      isActive: true,
    }).returning();

    await tx.insert(payrollTaxBrackets).values(bands.map((band, index) => ({
      taxTableId: created.id,
      bracketOrder: index + 1,
      minIncome: band.min.toFixed(2),
      maxIncome: band.max === null ? null : band.max.toFixed(2),
      rate: band.rate.toFixed(6),
      deduction: band.deduction.toFixed(2),
    })));

    console.log(`[PAYROLL-SEED] ${table.currency} ${table.taxYear} tax table created (#${created.id}, ${bands.length} bands).`);
  });
}

async function ensureGlobalStatutoryRules() {
  const seeds = [ZIMBABWE_STATUTORY_RULE_SEED.aidsLevy, ZIMBABWE_STATUTORY_RULE_SEED.nssaPobs];

  for (const seed of seeds) {
    const [existing] = await db
      .select({ id: payrollStatutoryRules.id })
      .from(payrollStatutoryRules)
      .where(and(
        eq(payrollStatutoryRules.ruleCode, seed.ruleCode),
        isNull(payrollStatutoryRules.companyId),
      ))
      .limit(1);

    if (existing) {
      console.log(`[PAYROLL-SEED] Global rule exists: ${seed.ruleCode}`);
      continue;
    }

    await db.insert(payrollStatutoryRules).values({
      companyId: null,
      countryCode: "ZW",
      ruleCode: seed.ruleCode,
      name: seed.name,
      currency: "USD",
      payFrequency: "MONTHLY",
      employeeRate: seed.employeeRate,
      employerRate: seed.employerRate,
      ceilingAmount: "ceilingAmount" in seed ? seed.ceilingAmount : null,
      calculationBasis: seed.calculationBasis,
      isActive: true,
      isSystemLocked: true,
      effectiveFrom: seed.effectiveFrom,
    });
    console.log(`[PAYROLL-SEED] Global rule created: ${seed.ruleCode}`);
  }
}
