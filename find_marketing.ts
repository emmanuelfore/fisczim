import 'dotenv/config';
import { db } from './server/db';
import { companies, invoices } from './shared/schema';
import { ilike, inArray } from 'drizzle-orm';

async function run() {
  const invNumbers = ['INV-862971', 'INV-862970', 'INV-862969', 'INV-862968', 'INV-862967'];
  
  const invs = await db.select({
      id: invoices.id, 
      invoiceNumber: invoices.invoiceNumber, 
      fdmsStatus: invoices.fdmsStatus, 
      companyId: invoices.companyId 
  }).from(invoices)
  .where(inArray(invoices.invoiceNumber, invNumbers));
  
  console.log("Invoices found by number:");
  console.log(invs);

  if (invs.length > 0) {
      const cIds = [...new Set(invs.map(i => i.companyId))];
      const comps = await db.select({id: companies.id, name: companies.name}).from(companies).where(inArray(companies.id, cIds));
      console.log("Companies:", comps);
  }

  process.exit(0);
}
run().catch(console.error);
