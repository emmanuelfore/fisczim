import { db } from "../server/db.js";
import { invoices } from "../shared/schema.js";
import { eq, desc } from "drizzle-orm";

async function run() {
  const allInvoices = await db.select().from(invoices).where(eq(invoices.companyId, 86)).orderBy(desc(invoices.createdAt)).limit(10);
  console.log(allInvoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    createdAt: inv.createdAt
  })));
  process.exit(0);
}
run();
