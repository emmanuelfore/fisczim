/**
 * FiscalStack Payroll Seeding — Zimbabwe Statutory Defaults
 *
 * Seeds:
 *  1. ZIMRA PAYE tax tables (USD & ZiG brackets) per Finance Act 2024/2025
 *     — taxTablesConfig is a GLOBAL table (no companyId) shared across all tenants
 *  2. NEC (National Employment Council) sector presets for common industries
 *     — necSectorsConfig with companyId = NULL are global presets visible to all tenants
 *
 * Call `seedGlobalPayrollDefaults()` once at app startup or initial platform setup.
 * It is fully idempotent — safe to call multiple times.
 *
 * Sources:
 *  - ZIMRA Finance Act Chapter 23:06 — Second Schedule (PAYE)
 *  - NSSA Act Chapter 17:04 — Contribution Rates
 *  - Various NEC Collective Bargaining Agreements (CBA) 2024
 */

import { db } from "../db.js";
import { taxTablesConfig, necSectorsConfig } from "../../shared/schema.js";
import { eq, and, isNull } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// ZIMRA PAYE Tax Bracket Definitions (monthly tables, USD)
// ─────────────────────────────────────────────────────────────────────────────
// ZIMRA official USD monthly table for 2025/2026 (per ZIMRA published tax tables):
// the 40% band now starts at US$3,000 with a deduction constant of 335.
const USD_PAYE_BRACKETS_2025 = [
  { min: 0,    max: 100,    rate: 0,    deduction: 0 },
  { min: 100,  max: 300,    rate: 20,   deduction: 20 },
  { min: 300,  max: 1000,   rate: 25,   deduction: 35 },
  { min: 1000, max: 2000,   rate: 30,   deduction: 85 },
  { min: 2000, max: 3000,   rate: 35,   deduction: 185 },
  { min: 3000, max: null,   rate: 40,   deduction: 335 },
];

// Monthly ZiG (Zimbabwe Gold) brackets — Finance Act 2024
// Effective from 1 April 2024 (ZiG introduction at ~13.56 ZiG/USD)
const ZIG_PAYE_BRACKETS_2024 = [
  { min: 0,     max: 1356,  rate: 0,    deduction: 0 },
  { min: 1356,  max: 4068,  rate: 20,   deduction: 271.2 },
  { min: 4068,  max: 13560, rate: 25,   deduction: 474.6 },
  { min: 13560, max: 27120, rate: 30,   deduction: 1152.6 },
  { min: 27120, max: 67800, rate: 35,   deduction: 2509.6 },
  { min: 67800, max: null,  rate: 40,   deduction: 5899.6 },
];

// ─────────────────────────────────────────────────────────────────────────────
// NEC (National Employment Council) Sector Presets
// Based on collective bargaining agreements as of 2024
// companyId = NULL → global preset visible to all tenants
// ─────────────────────────────────────────────────────────────────────────────
const NEC_SECTOR_PRESETS = [
  {
    name: "NEC Commercial Sector",
    code: "NEC-COMM",
    employeeRate: "0.0100",  // 1.0% employee levy
    employerRate: "0.0100",  // 1.0% employer levy
    fixedAmount: "0.00",
  },
  {
    name: "NEC Agriculture",
    code: "NEC-AGRI",
    employeeRate: "0.0100",
    employerRate: "0.0100",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Mining Industry",
    code: "NEC-MINE",
    employeeRate: "0.0050",
    employerRate: "0.0050",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Motor Industry",
    code: "NEC-MOTO",
    employeeRate: "0.0100",
    employerRate: "0.0100",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Construction",
    code: "NEC-CONS",
    employeeRate: "0.0100",
    employerRate: "0.0100",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Hotel & Catering",
    code: "NEC-HOSP",
    employeeRate: "0.0100",
    employerRate: "0.0150",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Financial Institutions",
    code: "NEC-FINC",
    employeeRate: "0.0075",
    employerRate: "0.0075",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Health Services",
    code: "NEC-HLTH",
    employeeRate: "0.0100",
    employerRate: "0.0100",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Domestic Workers",
    code: "NEC-DOME",
    employeeRate: "0.0000",
    employerRate: "0.0000",
    fixedAmount: "2.00",  // Fixed $2 USD per month per CBA 2024
  },
  {
    name: "NEC Transport",
    code: "NEC-TRNS",
    employeeRate: "0.0100",
    employerRate: "0.0100",
    fixedAmount: "0.00",
  },
  {
    name: "NEC Communications",
    code: "NEC-COMM2",
    employeeRate: "0.0075",
    employerRate: "0.0075",
    fixedAmount: "0.00",
  },
  {
    name: "No NEC (Exempt / Not Applicable)",
    code: "NEC-NONE",
    employeeRate: "0.0000",
    employerRate: "0.0000",
    fixedAmount: "0.00",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds global Zimbabwe payroll statutory defaults.
 * - taxTablesConfig is a GLOBAL table — seeded once for the entire platform.
 * - necSectorsConfig global presets use companyId = NULL.
 *
 * Fully idempotent — safe to call multiple times without creating duplicates.
 */
export async function seedGlobalPayrollDefaults(): Promise<void> {
  console.log("[PAYROLL-SEED] Seeding global Zimbabwe statutory defaults...");

  // 1. NEC sector presets (global, companyId = NULL)
  for (const preset of NEC_SECTOR_PRESETS) {
    try {
      const [existing] = await db
        .select({ id: necSectorsConfig.id })
        .from(necSectorsConfig)
        .where(
          and(
            eq(necSectorsConfig.code, preset.code),
            isNull(necSectorsConfig.companyId)
          )
        )
        .limit(1);

      if (!existing) {
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
      } else {
        console.log(`[PAYROLL-SEED] NEC preset exists: ${preset.code}`);
      }
    } catch (err: any) {
      console.error(`[PAYROLL-SEED] Failed to seed NEC ${preset.code}:`, err.message);
    }
  }

  // 2. USD PAYE tax table (global) — current ZIMRA 2025/2026 structure.
  //    Ensures every tenant (fresh DB or existing prod with the stale 2024
  //    table) ends up on an active table that covers the current tax year.
  await ensureActiveTaxTableFrom(
    "USD",
    "2025-01-01",
    USD_PAYE_BRACKETS_2025,
    "700.00"   // NSSA ceiling limit USD
  );

  // 3. ZiG PAYE tax table (global)
  await upsertGlobalTaxTable(
    "ZIG",
    "2024-04-01",
    null,
    ZIG_PAYE_BRACKETS_2024,
    "9492.00"  // NSSA ceiling limit ZiG (700 USD × 13.56)
  );

  console.log("[PAYROLL-SEED] Global payroll defaults seeding complete.");
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures a global tax table exists for `currency` whose effectiveFrom is at
 * or after `yearStart`. If only a stale (older) table is active, it is marked
 * inactive and the current-year table is inserted — the effective loader picks
 * the newest active table, so payroll runs are always computed on the latest
 * statutory bands.
 */
async function ensureActiveTaxTableFrom(
  currency: string,
  yearStart: string,
  brackets: { min: number; max: number | null; rate: number; deduction: number }[],
  nssaCeilingLimit: string
): Promise<void> {
  try {
    const [current] = await db
      .select({ id: taxTablesConfig.id })
      .from(taxTablesConfig)
      .where(
        and(
          eq(taxTablesConfig.currency, currency),
          eq(taxTablesConfig.isActive, true)
        )
      )
      .limit(1);

    if (current) {
      const effectiveFrom = new Date(
        (await db.select({ effectiveFrom: taxTablesConfig.effectiveFrom })
          .from(taxTablesConfig)
          .where(eq(taxTablesConfig.id, current.id))
          .limit(1))[0]?.effectiveFrom || yearStart
      );
      if (effectiveFrom.getTime() >= new Date(yearStart).getTime()) {
        console.log(`[PAYROLL-SEED] Active ${currency} tax table covers ${yearStart}+; no update needed.`);
        return;
      }
      await db.update(taxTablesConfig)
        .set({ isActive: false })
        .where(eq(taxTablesConfig.currency, currency));
      console.log(`[PAYROLL-SEED] Superseded stale ${currency} tax table (effectiveFrom < ${yearStart}).`);
    }

    await db.insert(taxTablesConfig).values({
      currency,
      effectiveFrom: yearStart,
      effectiveTo: null,
      brackets: brackets as any,
      isActive: true,
    });
    console.log(`[PAYROLL-SEED] Global ${currency} tax table created (${yearStart}+).`);
  } catch (err: any) {
    console.error(`[PAYROLL-SEED] Failed to seed ${currency} tax table:`, err.message);
  }
}

async function upsertGlobalTaxTable(
  currency: string,
  effectiveFrom: string,
  effectiveTo: string | null,
  brackets: { min: number; max: number | null; rate: number; deduction: number }[],
  nssaCeilingLimit: string
): Promise<void> {
  try {
    // taxTablesConfig has no companyId column — it is a global table
    const [existing] = await db
      .select({ id: taxTablesConfig.id })
      .from(taxTablesConfig)
      .where(
        and(
          eq(taxTablesConfig.currency, currency),
          eq(taxTablesConfig.isActive, true)
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(taxTablesConfig).values({
        currency,
        effectiveFrom,
        effectiveTo,
        brackets: brackets as any,
        isActive: true,
      });
      console.log(`[PAYROLL-SEED] Global tax table created: ${currency}`);
    } else {
      console.log(`[PAYROLL-SEED] Global tax table exists: ${currency}`);
    }
  } catch (err: any) {
    console.error(`[PAYROLL-SEED] Failed to seed tax table (${currency}):`, err.message);
  }
}
