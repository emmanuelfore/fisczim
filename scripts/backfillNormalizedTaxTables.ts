/**
 * Move the tax tables that payroll actually applies out of the legacy JSONB
 * table (tax_tables_config) and into payroll_tax_tables + payroll_tax_brackets,
 * which is now the only store the payroll engine reads.
 *
 * Insert-only: no row of tax_tables_config is updated or deleted, so the legacy
 * history stays queryable while nothing reads it any more.
 *
 *   npx tsx scripts/backfillNormalizedTaxTables.ts        # active tables only
 *   npx tsx scripts/backfillNormalizedTaxTables.ts --all  # every historical row
 *
 * Re-running is safe; a scope already present is skipped.
 */
import 'dotenv/config';
import { db } from '../server/db.js';
import { taxTablesConfig, payrollTaxTables, payrollTaxBrackets } from '../shared/schema.js';
import { and, desc, eq } from 'drizzle-orm';
import { canonicalizeBrackets, validateBrackets } from '../shared/statutory/brackets.js';

const carryAllHistory = process.argv.includes('--all');
const DEFAULT_COUNTRY = 'ZW';

type LegacyBracket = { min: number; max: number | null; rate: number; deduction: number };

async function backfill() {
  console.log(`[BACKFILL] ${carryAllHistory ? 'Carrying every' : 'Carrying active'} tax_tables_config row into the normalized tables...`);

  const rows = await db.select().from(taxTablesConfig).orderBy(desc(taxTablesConfig.effectiveFrom));
  const targets = carryAllHistory ? rows : rows.filter((row: any) => row.isActive);

  let created = 0;
  let skipped = 0;
  let rejected = 0;

  for (const row of targets) {
    const effectiveFrom = String(row.effectiveFrom).slice(0, 10);
    const effectiveTo = row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : null;
    const brackets = (row.brackets ?? []) as LegacyBracket[];

    const [already] = await db
      .select({ id: payrollTaxTables.id })
      .from(payrollTaxTables)
      .where(and(
        eq(payrollTaxTables.countryCode, DEFAULT_COUNTRY),
        eq(payrollTaxTables.currency, row.currency),
        eq(payrollTaxTables.effectiveFrom, effectiveFrom),
      ))
      .limit(1);

    if (already) {
      console.log(`[BACKFILL] Skipping ${row.currency} #${row.id} — already present as table #${already.id}.`);
      skipped++;
      continue;
    }

    // Legacy rows were written before bracket validation existed. A table with
    // band gaps or mixed rate units is reported, not promoted into the truth.
    const errors = validateBrackets(brackets);
    if (errors.length) {
      console.warn(`[BACKFILL] NOT carried: ${row.currency} #${row.id} (${effectiveFrom})`);
      for (const error of errors) console.warn(`           ${error}`);
      rejected++;
      continue;
    }

    const bands = canonicalizeBrackets(brackets);
    const taxYear = new Date(`${effectiveFrom}T00:00:00`).getFullYear();

    await db.transaction(async (tx) => {
      const [table] = await tx.insert(payrollTaxTables).values({
        companyId: null,
        countryCode: DEFAULT_COUNTRY,
        currency: row.currency,
        taxYear,
        payFrequency: 'MONTHLY',
        effectiveFrom,
        effectiveTo,
        version: 1,
        sourceReference: `Migrated from tax_tables_config #${row.id}`,
        isActive: row.isActive,
      }).returning();

      await tx.insert(payrollTaxBrackets).values(bands.map((band, index) => ({
        taxTableId: table.id,
        bracketOrder: index + 1,
        minIncome: band.min.toFixed(2),
        maxIncome: band.max === null ? null : band.max.toFixed(2),
        rate: band.rate.toFixed(6),
        deduction: band.deduction.toFixed(2),
      })));

      console.log(`[BACKFILL] ${row.currency} ${taxYear} #${row.id} -> payroll_tax_tables #${table.id} (${bands.length} bands, active=${row.isActive}).`);
    });
    created++;
  }

  console.log(`[BACKFILL] Done. ${targets.length} considered: ${created} created, ${skipped} already present, ${rejected} rejected.`);
  if (rejected && !carryAllHistory) {
    console.log('[BACKFILL] Re-run with --all to see every rejected historical row.');
  }
  process.exit(0);
}

backfill().catch((err) => {
  console.error('[BACKFILL] Failed:', err);
  process.exit(1);
});
