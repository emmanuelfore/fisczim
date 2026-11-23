/**
 * Quarterly statutory rate review reminder job.
 *
 * The job is intentionally global (not per company): it records one durable
 * `job_logs` row per quarter so admins can see that the review is due and the
 * scheduler can avoid logging duplicate reminders on repeated invocations.
 */

import { storage } from "../storage.js";
import {
  getStatutoryReviewSchedule,
  isStatutoryReviewDue,
} from "../../shared/statutory/review-schedule.js";

export const STATUTORY_REVIEW_JOB_NAME = "statutory_rate_review_reminder";

const hararePeriodFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Harare",
  year: "numeric",
  month: "2-digit",
});

function reviewPeriodKey(now: Date): string {
  const [year, month] = hararePeriodFormatter.format(now).split("-").map(Number);
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

export interface StatutoryReviewResult {
  skipped: boolean;
  reason?: "not_due" | "already_logged";
  periodKey: string;
  schedule: ReturnType<typeof getStatutoryReviewSchedule>;
  logId?: number;
}

/**
 * Exportable so tests can call it directly with a fixed `now`; the cron wrapper
 * only supplies the current time.
 */
export async function runStatutoryRateReviewReminder(
  now: Date = new Date(),
): Promise<StatutoryReviewResult> {
  const schedule = getStatutoryReviewSchedule(now);
  const periodKey = reviewPeriodKey(now);

  if (!isStatutoryReviewDue(now)) {
    return { skipped: true, reason: "not_due", periodKey, schedule };
  }

  try {
    const existingLogs = await storage.getJobLogs({
      jobName: STATUTORY_REVIEW_JOB_NAME,
      limit: 100,
    });
    const alreadyLogged = existingLogs.some((log) => {
      const metadata = log.metadata as { periodKey?: string } | null | undefined;
      return metadata?.periodKey === periodKey && log.status === "completed";
    });
    if (alreadyLogged) {
      return { skipped: true, reason: "already_logged", periodKey, schedule };
    }

    const startedAt = new Date(now.getTime());
    const started = await storage.createJobLog({
      jobName: STATUTORY_REVIEW_JOB_NAME,
      status: "started",
      metadata: { periodKey, timeZone: schedule.timeZone },
    });

    const message =
      `[StatutoryReview] ${periodKey} statutory rate review is due. ` +
      `Verify ZIMRA PAYE bands, NSSA quarterly insurable-earnings ceiling, ` +
      `APWCS industry premium schedule, ZIMDEF and NEC obligations before ` +
      `the next payroll run.`;
    console.warn(message);

    await storage.updateJobLog(started.id, {
      status: "completed",
      completedAt: new Date(now.getTime()),
      duration: 0,
      resultData: {
        periodKey,
        message,
        nextRunUtc: schedule.nextRunUtc,
        nextRunLocal: schedule.nextRunLocal,
      },
    });

    return { skipped: false, periodKey, schedule, logId: started.id };
  } catch (error: any) {
    console.error("[StatutoryReview] Failed to record reminder:", error?.message ?? error);
    return { skipped: false, periodKey, schedule };
  }
}
