import 'dotenv/config';
import { db } from './server/db';
import { companies, invoices } from './shared/schema';
import { ilike, eq } from 'drizzle-orm';

async function run() {
  const rukanda = await db.select().from(companies).where(ilike(companies.name, '%rukanda%'));
  console.log("Rukanda Companies:", rukanda.map(c => ({ id: c.id, name: c.name })));

  if (rukanda.length > 0) {
    const cId = rukanda[0].id;
    const invs = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, fdmsStatus: invoices.fdmsStatus, customerName: invoices.customerName }).from(invoices).where(eq(invoices.companyId, cId));
    console.log(`Found ${invs.length} invoices for company ${cId}`);
    
    const failedInvs = invs.filter(i => i.fdmsStatus?.toLowerCase() === 'failed' || i.invoiceNumber.includes('862971'));
    console.log("Failed invoices:", failedInvs);
  }

  process.exit(0);
}
run().catch(console.error);
