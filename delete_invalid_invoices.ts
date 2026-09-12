import 'dotenv/config';
import { db } from './server/db';
import { invoices, invoiceItems, validationErrors, zimraLogs } from './shared/schema';
import { eq, or, ilike, and } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  
  const failedInvoices = await db.select({ id: invoices.id }).from(invoices).where(
    and(
      eq(invoices.companyId, companyId),
      or(
        ilike(invoices.fdmsStatus, 'failed'),
        ilike(invoices.validationStatus, 'invalid')
      )
    )
  );

  console.log(`Found ${failedInvoices.length} failed/invalid invoices for Company 57 to delete`);

  for (const inv of failedInvoices) {
    console.log(`Deleting invoice ${inv.id}`);
    
    // Delete validation errors
    await db.delete(validationErrors).where(eq(validationErrors.invoiceId, inv.id));
    
    // Delete zimra logs
    await db.delete(zimraLogs).where(eq(zimraLogs.invoiceId, inv.id));
    
    // Delete invoice items
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    
    // Delete invoice
    await db.delete(invoices).where(eq(invoices.id, inv.id));
  }

  console.log("Deletion complete.");
  process.exit(0);
}
run().catch(console.error);
