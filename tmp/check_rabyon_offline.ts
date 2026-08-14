import "dotenv/config";
import { db } from "../server/db";
import { invoices, fiscalizationJobs } from "../shared/schema";
import { eq, and, desc } from "drizzle-orm";

async function run() {
  console.log("Querying failed offline invoices for company 91...");
  try {
      const failedJobs = await db.select()
          .from(fiscalizationJobs)
          .innerJoin(invoices, eq(invoices.id, fiscalizationJobs.invoiceId))
          .where(and(eq(invoices.companyId, 91), eq(fiscalizationJobs.status, "failed")))
          .orderBy(desc(fiscalizationJobs.updatedAt))
          .limit(10);
          
      console.log("=== FAILED FISCALIZATION JOBS ===");
      console.log(JSON.stringify(failedJobs, null, 2));
      
      const offlineUnsynced = await db.select({
              id: invoices.id,
              invoiceNumber: invoices.invoiceNumber,
              fdmsStatus: invoices.fdmsStatus,
              total: invoices.total,
              syncError: invoices.syncError,
              createdAt: invoices.createdAt,
          })
          .from(invoices)
          .where(and(eq(invoices.companyId, 91), eq(invoices.fdmsStatus, "failed")))
          .orderBy(desc(invoices.createdAt))
          .limit(10);
          
      console.log("=== FAILED INVOICES ===");
      console.log(JSON.stringify(offlineUnsynced, null, 2));
  } catch (e) {
      console.error(e);
  }
  process.exit(0);
}
run();
