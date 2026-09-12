import 'dotenv/config';
import { db } from './server/db';
import { taxTypes } from './shared/schema';
import { eq } from 'drizzle-orm';

async function run() {
  const companyTaxes = await db.select().from(taxTypes).where(eq(taxTypes.companyId, 57));
  console.log("Company Taxes:", JSON.stringify(companyTaxes, null, 2));
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
