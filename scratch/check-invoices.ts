import { db } from "../server/db.js";
import { invoices } from "../shared/schema.js";
import { eq, desc } from "drizzle-orm";

async function run() {
  const recentInvoices = await db.select().from(invoices).where(eq(invoices.companyId, 86)).orderBy(desc(invoices.createdAt)).limit(5);
  console.log(recentInvoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerName: inv.customerName,
    isPos: inv.isPos,
    status: inv.status,
    total: inv.total,
    transactionType: inv.transactionType
  })));
  process.exit(0);
}
run();
