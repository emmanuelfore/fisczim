import { db } from './server/db.js';
import { invoices } from './shared/schema.js';
import { desc, sql } from 'drizzle-orm';

async function main() {
  try {
    console.log("Checking failed invoices for today (2026-08-03)...");
    
    const recentInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      fiscalStatus: invoices.fiscalStatus,
      zimraError: invoices.zimraError,
      createdAt: invoices.createdAt
    }).from(invoices)
      .where(sql`DATE(created_at) = CURRENT_DATE OR DATE(created_at) = CURRENT_DATE - 1`)
      .orderBy(desc(invoices.createdAt))
      .limit(20);
      
    console.log("Recent Invoices:", JSON.stringify(recentInvoices, null, 2));

  } catch (error) {
    console.error("Error:", error);
  }
  process.exit(0);
}
main();
