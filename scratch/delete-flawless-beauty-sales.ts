/**
 * delete-flawless-beauty-sales.ts
 * Deletes June & July 2026 invoices for Flawless Beauty WITHOUT reversing stock.
 * Run: npx tsx scratch/delete-flawless-beauty-sales.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql, inArray, ilike, and, eq } from "drizzle-orm";
import {
  companies,
  invoices,
  invoiceItems,
  payments,
  paymentAllocations,
  validationErrors,
  zimraLogs,
} from "../shared/schema.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  // 1. Find the company
  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(ilike(companies.name, "%flawless%beauty%"))
    .limit(1);

  if (!company) {
    console.error('❌  Company "Flawless Beauty" not found.');
    process.exit(1);
  }
  console.log(`✅  Found company: "${company.name}" (ID: ${company.id})`);

  // 2. Collect June & July 2026 invoice IDs
  const toDelete = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, issueDate: invoices.issueDate, total: invoices.total })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, company.id),
        sql`EXTRACT(MONTH FROM ${invoices.issueDate}) IN (6, 7)`,
        sql`EXTRACT(YEAR  FROM ${invoices.issueDate}) = 2026`
      )
    );

  if (toDelete.length === 0) {
    console.log("ℹ️  No June/July 2026 invoices found. Nothing to delete.");
    process.exit(0);
  }

  console.log(`\n📋  Invoices to delete (${toDelete.length} total):`);
  for (const inv of toDelete) {
    console.log(`   #${inv.invoiceNumber}  date=${inv.issueDate?.toISOString().slice(0,10)}  total=${inv.total}`);
  }

  const ids = toDelete.map((i) => i.id);
  const totalValue = toDelete.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
  console.log(`\n💰  Combined total: ${totalValue.toFixed(2)}`);
  console.log(`\n⚠️  Proceeding to delete — stock will NOT be reversed...\n`);

  // 3. Delete in a transaction
  await db.transaction(async (tx) => {
    // a. Delete invoice items (FK)
    const r1 = await tx.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, ids));
    console.log(`   ✔ Deleted invoice_items`);

    // b. Delete validation errors (FK)
    await tx.delete(validationErrors).where(inArray(validationErrors.invoiceId, ids));
    console.log(`   ✔ Deleted validation_errors`);

    // c. Delete payments (FK)
    await tx.delete(payments).where(inArray(payments.invoiceId, ids));
    console.log(`   ✔ Deleted payments`);

    // d. Delete payment allocations (FK) — if table exists
    try {
      await tx.delete(paymentAllocations).where(inArray(paymentAllocations.invoiceId, ids));
      console.log(`   ✔ Deleted payment_allocations`);
    } catch (e: any) {
      console.log(`   ⚠ payment_allocations skipped: ${e.message}`);
    }

    // e. Nullify zimra_logs invoice_id references (preserve audit trail)
    await tx.update(zimraLogs).set({ invoiceId: null }).where(inArray(zimraLogs.invoiceId, ids));
    console.log(`   ✔ Nullified zimra_logs references`);

    // f. Finally delete the invoices
    await tx.delete(invoices).where(inArray(invoices.id, ids));
    console.log(`   ✔ Deleted ${ids.length} invoices`);
  });

  console.log(`\n✅  Done! ${ids.length} June/July 2026 invoices deleted for "${company.name}". Stock NOT reversed.`);
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
