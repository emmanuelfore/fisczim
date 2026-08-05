import { db } from '../server/db.js';
import { companies, payrollStatutoryRules } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';

async function runDataMigration() {
  console.log('Starting data migration to backfill statutory rules for existing companies...');
  
  const allCompanies = await db.select().from(companies);
  console.log(`Found ${allCompanies.length} companies.`);

  for (const company of allCompanies) {
    // Check AIDS_LEVY
    const [aids] = await db.select().from(payrollStatutoryRules)
      .where(and(
        eq(payrollStatutoryRules.companyId, company.id),
        eq(payrollStatutoryRules.ruleCode, 'AIDS_LEVY')
      )).limit(1);

    if (!aids) {
      await db.insert(payrollStatutoryRules).values({
        companyId: company.id,
        ruleCode: 'AIDS_LEVY',
        name: 'AIDS Levy (Migrated)',
        currency: 'USD',
        payFrequency: 'MONTHLY',
        employeeRate: '0.0300',
        employerRate: '0.0000',
        calculationBasis: 'PAYE',
        isActive: true,
        isSystemLocked: true,
        effectiveFrom: '2023-01-01'
      });
      console.log(`Migrated AIDS_LEVY for company ${company.id}`);
    }

    // Check NSSA_POBS
    const [nssa] = await db.select().from(payrollStatutoryRules)
      .where(and(
        eq(payrollStatutoryRules.companyId, company.id),
        eq(payrollStatutoryRules.ruleCode, 'NSSA_POBS')
      )).limit(1);

    if (!nssa) {
      await db.insert(payrollStatutoryRules).values({
        companyId: company.id,
        ruleCode: 'NSSA_POBS',
        name: 'NSSA POBS (Migrated)',
        currency: 'USD',
        payFrequency: 'MONTHLY',
        employeeRate: '0.0450',
        employerRate: '0.0450',
        ceilingAmount: '700.00',
        calculationBasis: 'TAXABLE_INCOME',
        isActive: true,
        isSystemLocked: true,
        effectiveFrom: '2023-01-01'
      });
      console.log(`Migrated NSSA_POBS for company ${company.id}`);
    }
  }

  console.log('Data migration complete.');
  process.exit(0);
}

runDataMigration().catch(console.error);
