import 'dotenv/config';
import { db } from './server/db';
import { invoices } from './shared/schema';
import { eq, and, or } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  
  const failedInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      fdmsStatus: invoices.fdmsStatus,
      validationStatus: invoices.validationStatus,
      syncedWithFdms: invoices.syncedWithFdms
  }).from(invoices).where(
    and(
      eq(invoices.companyId, companyId),
      eq(invoices.syncedWithFdms, false)
    )
  );

  console.log(`Found ${failedInvoices.length} unsynced/failed invoices for Company 57`);
  console.log(failedInvoices);

  process.exit(0);
}
run().catch(console.error);
