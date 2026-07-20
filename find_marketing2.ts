import 'dotenv/config';
import { db } from './server/db';
import { invoices } from './shared/schema';
import { inArray } from 'drizzle-orm';

async function run() {
  const invNumbers = ['INV-862971', 'INV-862970', 'INV-862969', 'INV-862968', 'INV-862967'];
  
  const invs = await db.select({
      id: invoices.id, 
      invoiceNumber: invoices.invoiceNumber, 
      fdmsStatus: invoices.fdmsStatus, 
      validationStatus: invoices.validationStatus,
      syncedWithFdms: invoices.syncedWithFdms,
      status: invoices.status
  }).from(invoices)
  .where(inArray(invoices.invoiceNumber, invNumbers));
  
  console.log("Invoices details:");
  console.log(invs);
  process.exit(0);
}
run().catch(console.error);
