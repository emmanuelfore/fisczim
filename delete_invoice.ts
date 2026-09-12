import { db } from "./server/db";
import { invoices, invoiceItems, payments, paymentAllocations, zimraLogs, validationErrors } from "./shared/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const invoiceNum = "INV-857282";
  
  // Find invoice
  const [invoice] = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNum));
  if (!invoice) {
    console.log("Invoice not found.");
    process.exit(0);
  }
  
  console.log("Found invoice:", invoice.id);
  
  const paymentList = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id));
  const paymentIds = paymentList.map(p => p.id);
  
  if (paymentIds.length > 0) {
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, paymentIds));
    console.log("Deleted linked payment allocations.");
    await db.delete(payments).where(eq(payments.invoiceId, invoice.id));
    console.log("Deleted linked payments.");
  }
  
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
  console.log("Deleted linked invoice items.");
  
  await db.delete(zimraLogs).where(eq(zimraLogs.invoiceId, invoice.id));
  console.log("Deleted linked zimra logs.");
  
  await db.delete(validationErrors).where(eq(validationErrors.invoiceId, invoice.id));
  console.log("Deleted linked validation errors.");
  
  await db.delete(invoices).where(eq(invoices.id, invoice.id));
  console.log("Deleted invoice!");
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
