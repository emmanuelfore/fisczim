import { db } from "../server/db.js";
import { invoices } from "../shared/schema.js";
import { eq, desc, gte } from "drizzle-orm";

async function run() {
  const date = new Date();
  date.setHours(0,0,0,0);
  const todayInvoices = await db.select().from(invoices)
    .where(gte(invoices.createdAt, date))
    .orderBy(desc(invoices.createdAt));
    
  console.log("Today Invoices:", todayInvoices.map(i => i.invoiceNumber));
  process.exit(0);
}
run();
