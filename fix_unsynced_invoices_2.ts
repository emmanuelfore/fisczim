import 'dotenv/config';
import { db } from './server/db';
import { invoices, invoiceItems } from './shared/schema';
import { eq, and } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  const standardTaxId = 182;
  const standardTaxRate = 15.5;

  const unsyncedInvoices = await db.select().from(invoices).where(
    and(
      eq(invoices.companyId, companyId),
      eq(invoices.syncedWithFdms, false)
    )
  );

  for (const inv of unsyncedInvoices) {
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    let newInvoiceTotal = 0;

    for (const item of items) {
      let lineTotal = parseFloat(item.unitPrice) * parseFloat(item.quantity);
      if (!inv.taxInclusive && standardTaxRate > 0) {
         lineTotal = lineTotal * (1 + standardTaxRate / 100);
      }
      
      // Also apply discount if any
      const disc = parseFloat(item.discountAmount || '0');
      lineTotal -= disc;

      await db.update(invoiceItems)
        .set({ 
          taxTypeId: standardTaxId, 
          taxRate: standardTaxRate.toString(),
          lineTotal: lineTotal.toFixed(2)
        })
        .where(eq(invoiceItems.id, item.id));

      newInvoiceTotal += lineTotal;
    }

    if (items.length > 0) {
      console.log(`Updated invoice ${inv.id} total to ${newInvoiceTotal.toFixed(2)}`);
      await db.update(invoices).set({ total: newInvoiceTotal.toFixed(2) }).where(eq(invoices.id, inv.id));
    }
  }

  process.exit(0);
}
run().catch(console.error);
