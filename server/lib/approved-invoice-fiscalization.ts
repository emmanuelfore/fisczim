import { and, eq } from "drizzle-orm";
import { fiscalizationJobs } from "../../shared/schema.js";
import { db } from "../db.js";
import { logAction } from "../audit.js";
import { FiscalDeviceBusyError, processInvoiceFiscalization } from "./fiscalization.js";

const FISCAL_SYNC_BUDGET_MS = 8_000;
const JOB_LEASE_MS = 5 * 60 * 1000;
const MAX_FISCAL_ATTEMPTS = 5;
const RETRY_BASE_MS = 5_000;

/**
 * Queue an approved invoice for fiscalization and make a bounded attempt to
 * process it immediately. Fiscal-device outages must never fail the approval
 * itself: the job stays retryable and the worker will pick it up.
 */
export async function enqueueApprovedInvoiceFiscalization(
  invoiceId: number,
  companyId: number,
  userId?: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: fiscalizationJobs.id })
    .from(fiscalizationJobs)
    .where(eq(fiscalizationJobs.invoiceId, invoiceId))
    .limit(1);

  if (!existing) {
    await db.insert(fiscalizationJobs).values({
      invoiceId,
      status: "pending",
      nextAttemptAt: new Date(),
    });
  }

  const now = new Date();
  const [claimed] = await db
    .update(fiscalizationJobs)
    .set({
      status: "processing",
      leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
      updatedAt: now,
    })
    .where(and(
      eq(fiscalizationJobs.invoiceId, invoiceId),
      eq(fiscalizationJobs.status, "pending"),
    ))
    .returning({ id: fiscalizationJobs.id });

  // The background worker owns the job now. Do not process it twice.
  if (!claimed?.id) return;

  const work = processInvoiceFiscalization(invoiceId, companyId, userId, false, undefined, false);
  // Always observe the promise so a late failure cannot become an unhandled
  // rejection after the approval response has already been returned.
  work.catch(() => {});

  const outcome = await Promise.race([
    work.then(() => ({ kind: "done" as const })).catch((error: unknown) => ({ kind: "error" as const, error })),
    new Promise<{ kind: "timeout" }>((resolve) =>
      setTimeout(() => resolve({ kind: "timeout" }), FISCAL_SYNC_BUDGET_MS),
    ),
  ]);

  if (outcome.kind === "done") {
    await db
      .update(fiscalizationJobs)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date(), lastErrorMessage: null })
      .where(eq(fiscalizationJobs.id, claimed.id));
    return;
  }

  const [job] = await db
    .select({ attemptCount: fiscalizationJobs.attemptCount })
    .from(fiscalizationJobs)
    .where(eq(fiscalizationJobs.id, claimed.id))
    .limit(1);
  const attemptCount = Number(job?.attemptCount || 0) + 1;
  const message = outcome.kind === "timeout"
    ? `Fiscalization exceeded ${FISCAL_SYNC_BUDGET_MS}ms; queued for retry`
    : outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
  const retryable = outcome.kind === "timeout" || outcome.error instanceof FiscalDeviceBusyError || attemptCount < MAX_FISCAL_ATTEMPTS;

  await db
    .update(fiscalizationJobs)
    .set({
      status: retryable ? "pending" : "failed",
      lastErrorMessage: message,
      attemptCount,
      nextAttemptAt: retryable
        ? new Date(Date.now() + RETRY_BASE_MS * Math.pow(2, Math.min(attemptCount - 1, 4)))
        : new Date(),
      completedAt: retryable ? null : new Date(),
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(fiscalizationJobs.id, claimed.id));

  await logAction(companyId, userId || "system", "INVOICE_FISCALIZATION_QUEUED", "invoice", String(invoiceId), {
    invoiceId,
    retryable,
    attemptCount,
    reason: message,
  });
}
