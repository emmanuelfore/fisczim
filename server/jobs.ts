import { storage } from "./storage.js";
import { type RecurringInvoice, type InsertJobLog } from "../shared/schema.js";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { ZimraDevice } from "./zimra.js";
import { getZimraLogger } from "./lib/fiscalization.js";

// In-memory scheduler status: lets the API surface schedules and outcomes
export interface JobSchedulerEntry {
  name: string;
  description: string;
  schedule: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: 'running' | 'completed' | 'failed' | null;
  lastRunDurationMs: number | null;
  lastRunSummary: any | null;
}

const schedulerEntries: JobSchedulerEntry[] = [
  {
    name: 'fiscal_day_closure',
    description: 'Closes open ZIMRA fiscal days for all companies at Zimbabwe midnight (00:05 CAT).',
    schedule: 'Daily at 00:05 CAT (22:05 UTC)',
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunDurationMs: null,
    lastRunSummary: null
  },
  {
    name: 'recurring_invoices',
    description: 'Generates invoices from due recurring invoice templates.',
    schedule: 'Every hour',
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunDurationMs: null,
    lastRunSummary: null
  }
];

export function getJobsStatus(): JobSchedulerEntry[] {
  return schedulerEntries.map((e) => ({ ...e }));
}

function summarizeResult(jobName: string, result: any): any {
  if (jobName === 'fiscal_day_closure' && result && Array.isArray(result.companies)) {
    return {
      totalCompanies: result.totalCompanies,
      successfulClosures: result.successfulClosures,
      failedClosures: result.failedClosures,
      alreadyClosed: result.alreadyClosed,
      closeFailed: result.closeFailed,
      failedCompanies: result.companies
        .filter((c: any) => c.status === 'close_failed' || c.status === 'error')
        .map((c: any) => ({
          companyId: c.companyId,
          companyName: c.companyName,
          status: c.status,
          fiscalDayNo: c.fiscalDayNo,
          error: c.error
        }))
    };
  }
  return result;
}

// Helper function to log job execution
async function logJobExecution(jobName: string, companyId: number | null, jobFn: () => Promise<any>, metadata?: any) {
  const startTime = new Date();
  const schedulerEntry = schedulerEntries.find((e) => e.name === jobName);
  if (schedulerEntry) schedulerEntry.lastRunStatus = 'running';

  const jobLog = await storage.createJobLog({
    jobName,
    status: 'started',
    companyId: companyId || undefined,
    metadata
  });

  try {
    const result = await jobFn();
    const completedAt = new Date();
    const duration = completedAt.getTime() - startTime.getTime();

    if (schedulerEntry) {
      schedulerEntry.lastRunAt = completedAt.toISOString();
      schedulerEntry.lastRunStatus = 'completed';
      schedulerEntry.lastRunDurationMs = duration;
      schedulerEntry.lastRunSummary = summarizeResult(jobName, result);
    }

    await storage.updateJobLog(jobLog.id, {
      status: 'completed',
      completedAt,
      duration,
      resultData: result
    });

    return result;
  } catch (error: any) {
    const completedAt = new Date();
    const duration = completedAt.getTime() - startTime.getTime();

    if (schedulerEntry) {
      schedulerEntry.lastRunAt = completedAt.toISOString();
      schedulerEntry.lastRunStatus = 'failed';
      schedulerEntry.lastRunDurationMs = duration;
      schedulerEntry.lastRunSummary = { error: error.message };
    }

    await storage.updateJobLog(jobLog.id, {
      status: 'failed',
      completedAt,
      duration,
      errorData: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });

    throw error;
  }
}

export async function processRecurringInvoices() {
    return logJobExecution('recurring_invoices', null, async () => {
        console.log("[Job] Checking for due recurring invoices...");
        const dueInvoices = await storage.getDueRecurringInvoices();
        console.log(`[Job] Found ${dueInvoices.length} due invoices.`);

        const results = [];
        for (const template of dueInvoices) {
            const result = await generateInvoiceFromTemplate(template);
            results.push(result);
        }

        return {
            invoicesProcessed: results.length,
            templates: dueInvoices.map(t => ({ id: t.id, name: t.description }))
        };
    });
}

async function generateInvoiceFromTemplate(template: RecurringInvoice) {
    console.log(`[Job] Generating invoice for template ID: ${template.id}`);

    try {
        const nextRunDate = calculateNextRunDate(template.nextRunDate, template.frequency);

        // Create the invoice
        const invoiceData = {
            companyId: template.companyId,
            customerId: template.customerId,
            issueDate: new Date(),
            dueDate: addDays(new Date(), 14), // Default 14 day due date
            currency: template.currency,
            exchangeRate: "1.00", // Default
            taxInclusive: template.taxInclusive,
            subtotal: "0", // Will be recalculated by storage/backend logic if it had items
            taxAmount: "0",
            total: "0",
            status: "draft",
            notes: `Automatically generated from recurring schedule. ${template.description || ""}`,
            transactionType: "FiscalInvoice",
            items: (template.items as any[]).map(item => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity.toString(),
                unitPrice: item.unitPrice.toString(),
                taxRate: item.taxRate.toString(),
                lineTotal: (Number(item.quantity) * Number(item.unitPrice)).toString()
            }))
        };

        // Calculate totals for the new invoice
        let subtotalValue = 0;
        let taxValue = 0;
        invoiceData.items.forEach(item => {
            const lineTotal = Number(item.lineTotal);
            if (template.taxInclusive) {
                const tax = lineTotal - (lineTotal / (1 + (Number(item.taxRate) / 100)));
                subtotalValue += (lineTotal - tax);
                taxValue += tax;
            } else {
                subtotalValue += lineTotal;
                taxValue += (lineTotal * (Number(item.taxRate) / 100));
            }
        });

        invoiceData.subtotal = subtotalValue.toFixed(2);
        invoiceData.taxAmount = taxValue.toFixed(2);
        invoiceData.total = (subtotalValue + taxValue).toFixed(2);

        // Create the invoice
        await storage.createInvoice(invoiceData as any);

        // Update template run dates
        await storage.updateRecurringInvoice(template.id, {
            lastRunDate: new Date(),
            nextRunDate: nextRunDate
        });

        console.log(`[Job] Successfully generated invoice for template ${template.id}. Next run: ${nextRunDate}`);
    } catch (error) {
        console.error(`[Job] Failed to generate invoice for template ${template.id}:`, error);
    }
}

function calculateNextRunDate(currentDate: Date, frequency: string): Date {
    switch (frequency.toLowerCase()) {
        case "weekly":
            return addWeeks(currentDate, 1);
        case "monthly":
            return addMonths(currentDate, 1);
        case "quarterly":
            return addMonths(currentDate, 3);
        case "yearly":
            return addYears(currentDate, 1);
        default:
            return addMonths(currentDate, 1);
    }
}

// Start the worker on an interval (e.g., every hour)
export function startRecurringInvoiceWorker() {
    console.log("[Job] Starting Recurring Invoice Worker...");
    // Initial run
    processRecurringInvoices();
    const recurringEntry = schedulerEntries.find((e) => e.name === 'recurring_invoices');
    if (recurringEntry) recurringEntry.nextRunAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    // Run every hour
    setInterval(() => {
        processRecurringInvoices();
        if (recurringEntry) recurringEntry.nextRunAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    }, 1000 * 60 * 60);
}

/**
 * Midnight Job: Close Fiscal Days for all active companies
 */
export async function closeAllFiscalDays() {
    return logJobExecution('fiscal_day_closure', null, async () => {
        console.log("[Job] Starting midnight fiscal day closure sweep...");
        
        const allCompanies = await storage.getAllCompanies();
        const zimraCompanies = allCompanies.filter(c => c.fdmsDeviceId && c.zimraPrivateKey && c.zimraCertificate);
        
        console.log(`[Job] Found ${zimraCompanies.length} companies with ZIMRA integration.`);
        
        const results = {
            totalCompanies: zimraCompanies.length,
            successfulClosures: 0,
            failedClosures: 0,
            alreadyClosed: 0,
            closeFailed: 0,
            companies: [] as any[]
        };
        
        for (const company of zimraCompanies) {
            const companyResult = {
                companyId: company.id,
                companyName: company.name,
                status: 'unknown',
                fiscalDayNo: null as number | null,
                error: null as string | null
            };
            
            try {
                // Initialize Device
                const device = new ZimraDevice({
                    deviceId: company.fdmsDeviceId!,
                    deviceSerialNo: company.fdmsDeviceSerialNo || "UNKNOWN",
                    activationKey: company.fdmsApiKey || "",
                    privateKey: company.zimraPrivateKey!,
                    certificate: company.zimraCertificate!,
                    baseUrl: company.zimraEnvironment === 'production' ? 'https://fdmsapi.zimra.co.zw' : 'https://fdmsapitest.zimra.co.zw'
                }, getZimraLogger(company.id));

                // 1. Check Status
                console.log(`[Job] Checking ZIMRA status for ${company.name}...`);
                const status = await device.getStatus();
                companyResult.fiscalDayNo = status.lastFiscalDayNo || null;
                
                if (status.fiscalDayStatus === 'FiscalDayOpened') {
                    const fiscalDayNo = status.lastFiscalDayNo!;
                    
                    // 2. Calculate Counters
                    const counters = await storage.calculateFiscalCounters(company.id, fiscalDayNo);
                    
                    // 3. Format Date for ZIMRA
                    const formatHarareDateOnly = (date: Date) => {
                        const parts = new Intl.DateTimeFormat('en-GB', {
                            timeZone: 'Africa/Harare',
                            year: 'numeric', month: '2-digit', day: '2-digit'
                        }).formatToParts(date);
                        const p = (t: string) => parts.find(x => x.type === t)?.value;
                        return `${p('year')}-${p('month')}-${p('day')}`;
                    };
                    let fiscalDayDate = formatHarareDateOnly(new Date());
                    if (company.fiscalDayOpenedAt) {
                        fiscalDayDate = formatHarareDateOnly(new Date(company.fiscalDayOpenedAt));
                    }

                    console.log(`[Job] Closing Fiscal Day ${fiscalDayNo} for ${company.name} at ${fiscalDayDate}`);
                    
                    let lastError = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            await device.closeDay(
                                fiscalDayNo,
                                fiscalDayDate,
                                company.dailyReceiptCount || status.lastReceiptCounter || 0,
                                counters
                            );
                            lastError = null;
                            break;
                        } catch (err) {
                            lastError = err;
                            if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
                        }
                    }

                    if (lastError) {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: true,
                            lastFiscalDayStatus: 'FiscalDayCloseFailed'
                        });
                        console.warn(`[Job] Close day attempts failed for ${company.name}; daily receipt counters preserved.`);
                        companyResult.status = 'close_failed';
                        companyResult.error = (lastError as Error).message;
                        results.closeFailed++;
                        continue;
                    }

                    // 4. Verify closure asynchronously
                    console.log(`[Job] Verifying closure status for ${company.name}...`);
                    await new Promise(r => setTimeout(r, 4000));
                    const verifyStatus = await device.getStatus() as any;

                    if (verifyStatus.fiscalDayStatus === 'FiscalDayCloseFailed') {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: true,
                            lastFiscalDayStatus: 'FiscalDayCloseFailed'
                        });
                        console.warn(`[Job] Close day failed verification for ${company.name}; daily receipt counters preserved.`);
                        companyResult.status = 'close_failed';
                        results.closeFailed++;
                    } else {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: false,
                            lastFiscalDayStatus: 'FiscalDayClosed',
                            dailyReceiptCount: 0 // Explicitly reset on success
                        });
                        console.log(`[Job] Successfully closed day for ${company.name}`);
                        companyResult.status = 'success';
                        results.successfulClosures++;
                    }
                } else {
                    console.log(`[Job] Day for ${company.name} is already ${status.fiscalDayStatus}.`);
                    if (company.fiscalDayOpen) {
                        const isCloseFailed = status.fiscalDayStatus === 'FiscalDayCloseFailed';
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: isCloseFailed,
                            lastFiscalDayStatus: status.fiscalDayStatus
                        });
                        companyResult.status = isCloseFailed ? 'close_failed' : 'already_closed';
                        if (isCloseFailed) results.closeFailed++;
                        else results.alreadyClosed++;
                    } else {
                        companyResult.status = 'already_closed';
                        results.alreadyClosed++;
                    }
                }
            } catch (err) {
                console.error(`[Job] Failed to process ${company.name}:`, err);
                companyResult.status = 'error';
                companyResult.error = (err as Error).message;
                results.failedClosures++;
            }
            
            results.companies.push(companyResult);
        }
        
        console.log("[Job] Fiscal day closure sweep completed.");
        return results;
    });
}

export function startFiscalDayClosingWorker() {
    console.log("[Job] Starting Fiscal Day Closing Worker (Targeting Zimbabwe Midnight CAT/UTC+2)");
    
    const scheduleNext = () => {
        const now = new Date();
        
        // Calculate milliseconds to next CAT midnight (UTC 22:00)
        // Note: Zimbabwe is CAT which is UTC+2, no DST.
        const target = new Date(now);
        target.setUTCHours(22, 5, 0, 0); // 22:05 UTC is 00:05 CAT (5 min past midnight for safety)
        
        // If we already passed 22:05 UTC today, target 22:05 UTC tomorrow
        if (target.getTime() <= now.getTime()) {
            target.setUTCDate(target.getUTCDate() + 1);
        }
        
        const delay = target.getTime() - now.getTime();
        
        // Log scheduling info
        const hours = Math.floor(delay / (1000 * 60 * 60));
        const mins = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
        console.log(`[Job] Next Zimbabwe midnight closure scheduled in ${hours}h ${mins}m (Target: ${target.toISOString()})`);
        const closureEntry = schedulerEntries.find((e) => e.name === 'fiscal_day_closure');
        if (closureEntry) closureEntry.nextRunAt = target.toISOString();

        setTimeout(async () => {
            try {
                await closeAllFiscalDays();
            } catch (err) {
                console.error("[Job] Error in scheduled fiscal closure:", err);
            } finally {
                scheduleNext();
            }
        }, delay);
    };

    scheduleNext();
}
