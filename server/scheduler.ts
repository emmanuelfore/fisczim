import cron from 'node-cron';
import { reportService } from './services/reportService.js';
import { storage } from './storage.js';
import { format, subMonths } from 'date-fns';
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

  console.log('[Scheduler] Initialized');
}
