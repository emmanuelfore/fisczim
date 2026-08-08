import { db } from "../server/db.js";
import {
  companies,
  invoices,
  invoiceItems,
  payments,
  validationErrors,
  fiscalizationJobs,
  zimraLogs,
  products,
} from "../shared/schema.js";
import { ilike, or, eq, inArray } from "drizzle-orm";

async function main() {
  // 1. Find company
  const rows = await db
    .select({ id: companies.id, name: companies.name, tradingName: companies.tradingName })
    .from(companies)
    .where(
      or(
        ilike(companies.name, "%excellent touch%"),
        ilike(companies.tradingName, "%excellent touch%")
      )
    );

  if (rows.length === 0) {
    console.log("❌ No company found matching 'Excellent Touch'");
    process.exit(1);
  }

  console.log("Found companies:", JSON.stringify(rows, null, 2));

  const companyId = rows[0].id;
  console.log(`\n🏢 Clearing data for: ${rows[0].name} (ID: ${companyId})`);

  // 2. Gather invoice IDs
  const companyInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.companyId, companyId));
  const invoiceIds = companyInvoices.map((inv) => inv.id);
  console.log(`📄 Found ${invoiceIds.length} invoices`);

  // 3. Delete child records first
  if (invoiceIds.length > 0) {
    const delVE = await db.delete(validationErrors).where(inArray(validationErrors.invoiceId, invoiceIds));
    console.log(`  ✅ Deleted validation_errors`);

    const delP = await db.delete(payments).where(inArray(payments.invoiceId, invoiceIds));
    console.log(`  ✅ Deleted payments`);

    const delII = await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds));
    console.log(`  ✅ Deleted invoice_items`);

    const delFJ = await db.delete(fiscalizationJobs).where(inArray(fiscalizationJobs.invoiceId, invoiceIds));
    console.log(`  ✅ Deleted fiscalization_jobs`);
  }

  // 4. Delete ZIMRA logs for company
  await db.delete(zimraLogs).where(eq(zimraLogs.companyId, companyId));
  console.log(`  ✅ Deleted zimra_logs`);

  // 5. Delete invoices
  await db.delete(invoices).where(eq(invoices.companyId, companyId));
  console.log(`  ✅ Deleted invoices`);

  // 6. Reset stock levels
  await db.update(products).set({ stockLevel: "0.00" }).where(eq(products.companyId, companyId));
  console.log(`  ✅ Reset product stock levels`);

  // 7. Reset company fiscal counters
  await db.update(companies).set({
    lastReceiptGlobalNo: 0,
    dailyReceiptCount: 0,
    fiscalDayOpen: false,
    currentFiscalDayNo: 0,
    fiscalDayOpenedAt: null,
    lastReceiptAt: null,
    lastFiscalHash: null,
  }).where(eq(companies.id, companyId));
  console.log(`  ✅ Reset fiscal counters`);

  console.log(`\n🎉 All invoice data cleared for company "${rows[0].name}"`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
