import 'dotenv/config';
import { db } from './server/db';
import { invoices, invoiceItems, products, taxTypes } from './shared/schema';
import { eq, and } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  
  const unsyncedInvoices = await db.select().from(invoices).where(
    and(
      eq(invoices.companyId, companyId),
      eq(invoices.syncedWithFdms, false)
    )
  );

  console.log(`Found ${unsyncedInvoices.length} unsynced invoices for Company 57`);

  for (const inv of unsyncedInvoices) {
    console.log(`Fixing Invoice ${inv.id} (${inv.invoiceNumber})`);
    
    // Get items
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    
    let newInvoiceTotal = 0;

    for (const item of items) {
      // Find the product to get the new taxTypeId
      const p = await db.select().from(products).where(eq(products.id, item.productId));
      if (p.length > 0) {
        const prod = p[0];
        const newTaxId = prod.taxTypeId;
        
        let newTaxRate = 0;
        if (newTaxId) {
          const t = await db.select().from(taxTypes).where(eq(taxTypes.id, newTaxId));
          if (t.length > 0) {
            newTaxRate = parseFloat(t[0].rate);
          }
        }

        console.log(`Item ${item.id}: old tax rate ${item.taxRate}, new tax rate ${newTaxRate}, unitPrice ${item.unitPrice}`);

        let lineTotal = parseFloat(item.unitPrice) * parseFloat(item.quantity);
        if (!inv.taxInclusive && newTaxRate > 0) {
           lineTotal = lineTotal * (1 + newTaxRate / 100);
        }

        await db.update(invoiceItems)
          .set({ 
            taxTypeId: newTaxId, 
            taxRate: newTaxRate.toString(),
            lineTotal: lineTotal.toString() 
          })
          .where(eq(invoiceItems.id, item.id));

        newInvoiceTotal += lineTotal;
      }
    }

    // Update invoice total
    console.log(`Updating invoice ${inv.id} total from ${inv.total} to ${newInvoiceTotal}`);
    await db.update(invoices).set({ total: newInvoiceTotal.toString() }).where(eq(invoices.id, inv.id));
  }

  process.exit(0);
}
run().catch(console.error);
