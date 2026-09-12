import 'dotenv/config';
import { db } from './server/db';
import { invoices } from './shared/schema';
import { eq, or, ilike } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  const failed = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      fdmsStatus: invoices.fdmsStatus,
      validationStatus: invoices.validationStatus
  }).from(invoices)
  .where(
      eq(invoices.companyId, companyId)
  );

  const actuallyFailed = failed.filter(f => 
      f.fdmsStatus?.toLowerCase() === 'failed' || 
      f.validationStatus?.toLowerCase() === 'invalid'
  );

  console.log(`Total invoices for 57: ${failed.length}`);
  console.log(`Failed invoices for 57: ${actuallyFailed.length}`);
  console.log(actuallyFailed);

  process.exit(0);
}
run().catch(console.error);
