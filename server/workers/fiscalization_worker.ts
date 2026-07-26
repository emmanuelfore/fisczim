import { db } from "../db.js";
import { fiscalizationJobs, invoices } from "../../shared/schema.js";
import { eq, and, lte, asc } from "drizzle-orm";
import { processInvoiceFiscalization } from "../lib/fiscalization.js";

const WORKER_INTERVAL_MS = 10000; // 10 seconds
const MAX_ATTEMPTS = 5;

export function startFiscalizationWorker() {
  console.log("[FiscalWorker] Starting durable fiscalization worker...");
  
  setInterval(async () => {
    try {
      // Find pending jobs
      const now = new Date();
      const jobsToProcess = await db
        .select()
        .from(fiscalizationJobs)
        .where(
          and(
            eq(fiscalizationJobs.status, "pending"),
            lte(fiscalizationJobs.nextAttemptAt, now)
          )
        )
        .orderBy(asc(fiscalizationJobs.createdAt))
        .limit(10);

      for (const job of jobsToProcess) {
        // Claim job
        await db
          .update(fiscalizationJobs)
          .set({ status: "processing" })
          .where(eq(fiscalizationJobs.id, job.id));

        console.log(`[FiscalWorker] Processing job ${job.id} for invoice ${job.invoiceId}`);

        try {
          // Fetch invoice to get companyId and createdBy
          const [invoice] = await db
            .select()
            .from(invoices)
            .where(eq(invoices.id, job.invoiceId));

          if (!invoice) {
            throw new Error(`Invoice ${job.invoiceId} not found`);
          }

          // Process fiscalization
          await processInvoiceFiscalization(
            invoice.id,
            invoice.companyId,
            invoice.createdBy || undefined,
            false,
            undefined,
            true
          );

          // Mark job completed
          await db
            .update(fiscalizationJobs)
            .set({ 
              status: "completed", 
              completedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(fiscalizationJobs.id, job.id));
            
          console.log(`[FiscalWorker] Job ${job.id} completed successfully.`);
        } catch (error: any) {
          console.error(`[FiscalWorker] Job ${job.id} failed:`, error);
          
          const nextAttemptCount = job.attemptCount + 1;
          if (nextAttemptCount >= MAX_ATTEMPTS) {
            await db
              .update(fiscalizationJobs)
              .set({ 
                status: "failed", 
                lastErrorMessage: String(error.message || error),
                completedAt: new Date(),
                updatedAt: new Date(),
                attemptCount: nextAttemptCount
              })
              .where(eq(fiscalizationJobs.id, job.id));
              
            // Also mark invoice as failed
            await db.update(invoices).set({
              fdmsStatus: "Failed",
              validationStatus: "invalid",
              lastValidationAttempt: new Date()
            }).where(eq(invoices.id, job.invoiceId));
          } else {
            // Exponential backoff
            const delay = Math.pow(2, nextAttemptCount) * 5000;
            const nextAttemptAt = new Date(Date.now() + delay);
            await db
              .update(fiscalizationJobs)
              .set({ 
                status: "pending", 
                lastErrorMessage: String(error.message || error),
                attemptCount: nextAttemptCount,
                nextAttemptAt,
                updatedAt: new Date()
              })
              .where(eq(fiscalizationJobs.id, job.id));
          }
        }
      }
    } catch (err) {
      console.error("[FiscalWorker] Uncaught error in worker loop:", err);
    }
  }, WORKER_INTERVAL_MS);
}
