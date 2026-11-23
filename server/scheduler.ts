import cron from 'node-cron';
import { lte } from 'drizzle-orm';
import { db } from './db.js';
import { reportService } from './services/reportService.js';
import { sweepOverdueTaskPenalties } from './lib/commissions.js';
import { storage } from './storage.js';
import { crmPublicLeadRateLimits } from '../shared/schema.js';
import { format, subMonths } from 'date-fns';
import { runStatutoryRateReviewReminder } from './lib/statutory-review.js';
import {
  STATUTORY_REVIEW_CRON,
  STATUTORY_REVIEW_START_UTC,
  STATUTORY_REVIEW_TIME_ZONE,
} from '../shared/statutory/review-schedule.js';
import fs from 'fs/promises';
import path from 'path';

export function initializeScheduler() {
  // Run on the 1st of every month at 02:00
  cron.schedule('0 2 1 * *', async () => {
    console.log('[Scheduler] Running monthly payroll report generation...');
    try {
      const companies = await storage.getAllCompanies();
      // Generate for the previous month
      const previousMonth = subMonths(new Date(), 1);
      const monthStr = format(previousMonth, 'yyyy-MM');

      for (const company of companies) {
        try {
          console.log(`[Scheduler] Generating report for company ${company.id} (${company.name}) for ${monthStr}`);
          const csvString = await reportService.generatePayrollReport(company.id, monthStr);
          
          const reportsDir = '/tmp/reports';
          await fs.mkdir(reportsDir, { recursive: true });
          const filePath = path.join(reportsDir, `payroll_report_${company.id}_${monthStr}.csv`);
          
          await fs.writeFile(filePath, csvString);
          console.log(`[Scheduler] Saved report to ${filePath}`);
        } catch (err: any) {
          console.error(`[Scheduler] Failed to generate report for company ${company.id}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Global error in monthly reporting job:', err);
    }
  });

  // CRM response-SLA penalties are applied on the hour, not on every task-list
  // read: a GET should never open hundreds of row-locking transactions.
  cron.schedule('7 * * * *', async () => {
    try {
      const applied = await sweepOverdueTaskPenalties();
      if (applied > 0) console.log(`[Scheduler] Applied ${applied} late-task penalty(ies)`);
    } catch (err: any) {
      console.error('[Scheduler] CRM late-task penalty sweep failed:', err?.message ?? err);
    }

    try {
      // Expired public-lead rate-limit windows are never read again; keep the
      // table from growing without bound between migrations.
      await db.delete(crmPublicLeadRateLimits)
        .where(lte(crmPublicLeadRateLimits.windowEnd, new Date(Date.now() - 24 * 60 * 60 * 1000)));
    } catch (err: any) {
      console.error('[Scheduler] Public lead rate-limit cleanup failed:', err?.message ?? err);
    }
  });

  // Quarterly statutory review: 09:00 Africa/Harare on 1 Jan/Apr/Jul/Oct,
  // starting 1 Jan 2027. node-cron fires from deployment time, so the job body
  // also guards against invocations before the configured start date.
  cron.schedule(
    STATUTORY_REVIEW_CRON,
    async () => {
      if (Date.now() < Date.parse(STATUTORY_REVIEW_START_UTC)) return;
      await runStatutoryRateReviewReminder();
    },
    {
      name: 'statutory_rate_review_reminder',
      timezone: STATUTORY_REVIEW_TIME_ZONE,
      noOverlap: true,
    },
  );

  console.log('[Scheduler] Initialized');
}
