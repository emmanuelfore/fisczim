import { db, pool } from "../db.js";
import { fiscalizationJobs, invoices } from "../../shared/schema.js";
import { eq, and, lte, asc, or, isNull, lt } from "drizzle-orm";
import { processInvoiceFiscalization, FiscalDeviceBusyError } from "../lib/fiscalization.js";

const WORKER_INTERVAL_MS = 10000; // 10 seconds
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 10;

// Hard ceiling on a single invoice. The loop is serial, so one wedged ZIMRA
// call used to stall every queued receipt behind it indefinitely.
const JOB_TIMEOUT_MS = Number(process.env.FISCAL_JOB_TIMEOUT_MS || 90000);
const LEASE_MS = 5 * 60 * 1000; // claim lease written on every claim
const STALE_PROCESSING_MS = 10 * 60 * 1000; // reclaim a claim older than this
const BUSY_RETRY_MS = 15000; // device busy → retry soon, without burning attempts

// Self-healing sweep: POS sales that were never submitted at all because their
// job row never existed (lost insert, or predates durable jobs).
const SWEEP_EVERY_TICKS = 6; // ~1 minute
const SWEEP_BATCH = 200;
const SWEEP_MAX_AGE_DAYS = 7; // only recent sales auto-submit; older ones are reported
const SWEEP_REPORT_EVERY_MS = 60 * 60 * 1000;

let tickCount = 0;
let lastSweepReportAt = 0;
let tickInProgress = false;

type JobRow = typeof fiscalizationJobs.$inferSelect;

/** Receipt already carries a fiscal code → nothing left to submit. */
async function invoiceAlreadyFiscalized(invoiceId: number): Promise<boolean> {
  const [row] = await db
    .select({ fiscalCode: invoices.fiscalCode })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));
  return !!row?.fiscalCode;
}

async function markJobCompleted(jobId: number, note?: string) {
  await db
    .update(fiscalizationJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      ...(note ? { lastErrorMessage: note } : {}),
    })
    .where(eq(fiscalizationJobs.id, jobId));
}

/** Claim is a compare-and-set so two loops can never process one job. */
async function claimJob(jobId: number): Promise<boolean> {
  const now = new Date();
  const res = await db
    .update(fiscalizationJobs)
    .set({
      status: "processing",
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      updatedAt: now,
    })
    .where(and(eq(fiscalizationJobs.id, jobId), eq(fiscalizationJobs.status, "pending")))
    .returning({ id: fiscalizationJobs.id });
  return (res as any)?.length > 0;
}

/**
 * Reclaim claims abandoned by a dead or wedged loop. Checkout also parks a job
 * in `processing` while its own request is in flight, but it writes a lease —
 * so a live claim is left alone and only expired/absent leases are reclaimed.
 */
async function recoverStaleClaims(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MS);
  const res = await db
    .update(fiscalizationJobs)
    .set({ status: "pending", nextAttemptAt: now, updatedAt: now })
    .where(
      and(
        eq(fiscalizationJobs.status, "processing"),
        lte(fiscalizationJobs.updatedAt, cutoff),
        or(isNull(fiscalizationJobs.leaseUntil), lt(fiscalizationJobs.leaseUntil, now)),
      ),
    )
    .returning({ id: fiscalizationJobs.id });
  const n = (res as any)?.length || 0;
  if (n > 0) {
    console.warn(`[FiscalWorker] Recovered ${n} stale claim(s) stuck in processing.`);
  }
}

/**
 * Queue POS sales that were never submitted: VAT-registered companies, not yet
 * fiscalized, not cancelled, and with no job row whatsoever. Recent sales are
 * queued automatically; older history is only reported so nobody silently
 * floods ZIMRA with months-old receipts.
 */
async function sweepOrphanedInvoices(): Promise<void> {
  try {
    const inserted = await pool.query(
      `INSERT INTO fiscalization_jobs (invoice_id, status, next_attempt_at)
       SELECT i.id, 'pending', NOW()
         FROM invoices i
         JOIN companies c ON c.id = i.company_id
        WHERE i.is_pos = true
          AND i.fiscal_code IS NULL
          AND c.vat_registered = true
          AND COALESCE(i.status, '') <> 'cancelled'
          AND i.created_at >= NOW() - ($1 || ' days')::interval
          AND NOT EXISTS (SELECT 1 FROM fiscalization_jobs j WHERE j.invoice_id = i.id)
        ORDER BY i.created_at ASC
        LIMIT $2
        RETURNING id`,
      [String(SWEEP_MAX_AGE_DAYS), SWEEP_BATCH],
    );
    if (inserted.rowCount && inserted.rowCount > 0) {
      console.warn(`[FiscalWorker] Sweep queued ${inserted.rowCount} never-submitted sale(s).`);
    }

    if (Date.now() - lastSweepReportAt > SWEEP_REPORT_EVERY_MS) {
      lastSweepReportAt = Date.now();
      const old = await pool.query(
        `SELECT i.company_id AS cid, c.name, count(*)::int AS n, min(i.created_at)::date AS oldest
           FROM invoices i
           JOIN companies c ON c.id = i.company_id
          WHERE i.is_pos = true
            AND i.fiscal_code IS NULL
            AND c.vat_registered = true
            AND COALESCE(i.status, '') <> 'cancelled'
            AND i.created_at < NOW() - ($1 || ' days')::interval
            AND NOT EXISTS (SELECT 1 FROM fiscalization_jobs j WHERE j.invoice_id = i.id)
          GROUP BY 1,2 ORDER BY n DESC LIMIT 10`,
        [String(SWEEP_MAX_AGE_DAYS)],
      );
      if (old.rowCount && old.rowCount > 0) {
        console.warn(
          `[FiscalWorker] Unfiscalized sales older than ${SWEEP_MAX_AGE_DAYS} days with no job row — not auto-submitted, review manually: ${JSON.stringify(old.rows)}`,
        );
      }
    }
  } catch (err: any) {
    console.error("[FiscalWorker] Orphan sweep failed:", err?.message || err);
  }
}

async function handleFailure(job: JobRow, error: any): Promise<void> {
  const message = String(error?.message || error);
  console.error(`[FiscalWorker] Job ${job.id} failed: ${message}`);

  // Device busy is contention, not a bad receipt: retry soon without burning
  // an attempt so one slow company cannot exhaust its own queue.
  if (error instanceof FiscalDeviceBusyError) {
    await db
      .update(fiscalizationJobs)
      .set({
        status: "pending",
        lastErrorMessage: message,
        nextAttemptAt: new Date(Date.now() + BUSY_RETRY_MS),
        updatedAt: new Date(),
      })
      .where(eq(fiscalizationJobs.id, job.id));
    return;
  }

  // A late submission may have landed while this attempt was in flight; never
  // overwrite a fiscalized receipt with a failure.
  if (await invoiceAlreadyFiscalized(job.invoiceId)) {
    await markJobCompleted(job.id, message);
    return;
  }

  const nextAttemptCount = job.attemptCount + 1;
  if (nextAttemptCount >= MAX_ATTEMPTS) {
    await db
      .update(fiscalizationJobs)
      .set({
        status: "failed",
        lastErrorMessage: message,
        completedAt: new Date(),
        updatedAt: new Date(),
        attemptCount: nextAttemptCount,
      })
      .where(eq(fiscalizationJobs.id, job.id));

    if (!(await invoiceAlreadyFiscalized(job.invoiceId))) {
      await db
        .update(invoices)
        .set({
          fdmsStatus: "Failed",
          validationStatus: "invalid",
          lastValidationAttempt: new Date(),
        })
        .where(eq(invoices.id, job.invoiceId));
    }
  } else {
    await db
      .update(fiscalizationJobs)
      .set({
        status: "pending",
        lastErrorMessage: message,
        attemptCount: nextAttemptCount,
        nextAttemptAt: new Date(Date.now() + Math.pow(2, nextAttemptCount) * 5000),
        updatedAt: new Date(),
      })
      .where(eq(fiscalizationJobs.id, job.id));
  }
}

async function processJob(
  job: JobRow,
  invoice: { id: number; companyId: number; createdBy: any },
): Promise<void> {
  if (!(await claimJob(job.id))) return; // already claimed elsewhere
  console.log(`[FiscalWorker] Processing job ${job.id} for invoice ${job.invoiceId}`);

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), JOB_TIMEOUT_MS);
  });

  const work = processInvoiceFiscalization(
    invoice.id,
    invoice.companyId,
    invoice.createdBy || undefined,
    false,
    undefined,
    true,
  );
  // Never leave the real work unobserved: after a timeout it may still finish
  // and fiscalize the invoice, which the next attempt sees as already done.
  work.catch(() => {});
  const outcome = await Promise.race([work.then(() => ({ timedOut: false as const })), timeout]);
  if (timer) clearTimeout(timer);

  if (outcome.timedOut) {
    console.error(`[FiscalWorker] Job ${job.id} exceeded ${JOB_TIMEOUT_MS}ms — releasing for retry.`);
    await db
      .update(fiscalizationJobs)
      .set({
        status: "pending",
        lastErrorMessage: `Timed out after ${JOB_TIMEOUT_MS}ms`,
        nextAttemptAt: new Date(Date.now() + BUSY_RETRY_MS),
        updatedAt: new Date(),
      })
      .where(eq(fiscalizationJobs.id, job.id));
    return;
  }

  await markJobCompleted(job.id);
  console.log(`[FiscalWorker] Job ${job.id} completed successfully.`);
}

async function tick() {
  tickCount++;
  await recoverStaleClaims();
  if (tickCount % SWEEP_EVERY_TICKS === 1) {
    await sweepOrphanedInvoices();
  }

  const now = new Date();
  const jobsToProcess = await db
    .select()
    .from(fiscalizationJobs)
    .where(
      and(
        eq(fiscalizationJobs.status, "pending"),
        lte(fiscalizationJobs.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(fiscalizationJobs.createdAt))
    .limit(BATCH_SIZE);

  for (const job of jobsToProcess) {
    const [invoice] = await db
      .select({
        id: invoices.id,
        companyId: invoices.companyId,
        createdBy: invoices.createdBy,
        fiscalCode: invoices.fiscalCode,
      })
      .from(invoices)
      .where(eq(invoices.id, job.invoiceId));

    if (!invoice) {
      await handleFailure(job, new Error(`Invoice ${job.invoiceId} not found`));
      continue;
    }
    if (invoice.fiscalCode) {
      await markJobCompleted(job.id);
      continue;
    }

    try {
      await processJob(job, invoice);
    } catch (error) {
      await handleFailure(job, error);
    }
  }
}

export function startFiscalizationWorker() {
  console.log("[FiscalWorker] Starting durable fiscalization worker...");

  setInterval(() => {
    // A tick can outlast the interval, and a slow tick must never overlap
    // itself — two concurrent loops would fight over the device lock.
    if (tickInProgress) return;
    tickInProgress = true;
    tick()
      .catch((err) => {
        console.error("[FiscalWorker] Uncaught error in worker loop:", err);
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, WORKER_INTERVAL_MS);
}
