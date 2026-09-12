import { db } from "../server/db.js";
import { invoices } from "../shared/schema.js";
import { eq, desc, like } from "drizzle-orm";

async function run() {
  const revInvoices = await db.select().from(invoices).where(like(invoices.invoiceNumber, 'REV%'));
  console.log(revInvoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    companyId: inv.companyId
  })));
  process.exit(0);
}
run();
