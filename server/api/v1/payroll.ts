import { Router } from "express";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { db } from "../../db.js";
import { 
  branches, employees, employeeContracts, departments, positions, 
  necSectorsConfig, taxTablesConfig, payrollRuns, payrollRunEmployees,
  payrollAllowances, payrollDeductions, payrollRecurringItems, leaveRequests, leaveBalances,
  employeeLoans, loanInstallments, tenantIntegrationCredentials,
  paymentBatches, paymentBatchDetails, accounts, journalEntryDrafts,
  journalEntryDraftLines, companyUsers, auditLogs, payrollAttendanceImports,
  employeeDocuments, payslipDocuments, payrollIntegrationEvents, payrollPayGrades,
  payrollEarningTypes, payrollDeductionTypes, payrollStatutoryRules,
  payrollStatutoryReports, payrollReportExports, payrollReportValidationIssues,
  payrollStatutoryDeadlines, payrollImportBatches, payrollImportRows, companies
} from "../../../shared/schema.js";
import { eq, and, desc, asc, ne, sql, gte, lte, inArray } from "drizzle-orm";
import { ZimbabwePayrollEngine, type TaxBracket, type PayrollElementInput } from "../../../shared/payroll-engine.js";
import { reportService } from "../../services/reportService.js";
import { logAction } from "../../audit.js";
import crypto from "crypto";
import { userHasPermission } from "../../lib/permissions.js";

const router = Router({ mergeParams: true });

// --- CRYPTOGRAPHY SECURITY VAULT UTILITIES ---
const ENCRYPTION_KEY = process.env.PAYROLL_SECRET_KEY || "fs-payroll-default-key-32-bytes!!";
const CIPHER_ALGORITHM = "aes-256-gcm";

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv) as crypto.CipherGCM;
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decrypt(text: string): string {
  const parts = text.split(":");
  if (parts.length !== 3) throw new Error("Invalid cipher format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  
  const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Helper to resolve company context from session/API headers
function getTargetCompanyId(req: any): number {
  if (req.company?.id) return req.company.id;
  if (req.params.companyId) return parseInt(req.params.companyId, 10);
  throw new Error("Missing company context");
}

const PAYROLL_READ_ROLES = new Set(["owner", "admin", "finance_director", "hr_manager", "payroll_clerk"]);
const PAYROLL_WRITE_ROLES = new Set(["owner", "admin", "finance_director", "hr_manager", "payroll_clerk"]);
const PAYROLL_APPROVAL_ROLES = new Set(["owner", "admin", "finance_director"]);

async function resolvePayrollRole(req: any, companyId: number): Promise<string | null> {
  if (req.user?.isSuperAdmin) return "owner";
  const userId = req.user?.id;
  if (!userId) return null;
  const [membership] = await db.select({ role: companyUsers.role })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)))
    .limit(1);
  return membership?.role || null;
}

router.use(async (req: any, res, next) => {
  try {
    const companyId = getTargetCompanyId(req);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "User not authenticated" });
    }
    const hasRead = req.user?.isSuperAdmin || await userHasPermission(userId, companyId, "payroll.view", false);
    const role = await resolvePayrollRole(req, companyId);
    const isLegacyAllowed = role && PAYROLL_READ_ROLES.has(role);

    if (!hasRead && !isLegacyAllowed) {
      return res.status(403).json({ error: "FORBIDDEN", message: "You do not have payroll access for this company" });
    }
    req.payrollRole = role;
    next();
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

async function requirePayrollWrite(req: any, res: any, next: any) {
  try {
    const companyId = getTargetCompanyId(req);
    const userId = req.user?.id;
    const hasWrite = req.user?.isSuperAdmin || await userHasPermission(userId, companyId, "payroll.write", false);
    const isLegacyAllowed = PAYROLL_WRITE_ROLES.has(req.payrollRole);

    if (!hasWrite && !isLegacyAllowed) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Payroll write permission required" });
    }
    next();
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
}

async function requirePayrollApproval(req: any, res: any, next: any) {
  try {
    const companyId = getTargetCompanyId(req);
    const userId = req.user?.id;
    const hasApprove = req.user?.isSuperAdmin || await userHasPermission(userId, companyId, "payroll.approve", false);
    const isLegacyAllowed = PAYROLL_APPROVAL_ROLES.has(req.payrollRole);

    if (!hasApprove && !isLegacyAllowed) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Payroll approval permission required" });
    }
    next();
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
}

async function auditPayroll(req: any, action: string, entityType: string, entityId?: string | number, details?: Record<string, unknown>) {
  await logAction(
    getTargetCompanyId(req),
    req.user?.id || "system",
    action,
    entityType,
    entityId == null ? undefined : String(entityId),
    details,
    req.ip
  );
}

function buildPayrollSnapshot(payload: Record<string, unknown>) {
  const normalized = JSON.stringify(payload);
  const snapshotHash = crypto.createHash("sha256").update(normalized).digest("hex");
  return { ...payload, snapshotHash, snapshotVersion: 1 };
}

function hashPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function toMoney(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function moneyString(value: unknown): string {
  return toMoney(value).toFixed(2);
}

function monthStartIso(date = new Date()): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1)).toISOString().slice(0, 10);
}

function monthEndIso(date = new Date()): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0)).toISOString().slice(0, 10);
}

const IMPORT_TEMPLATES: Record<string, string[]> = {
  employees: [
    "employeeNumber", "firstName", "lastName", "nationalId", "email", "phone", "branchCode",
    "departmentCode", "positionTitle", "joiningDate", "nssaNumber", "zimraTaxNumber",
    "bankName", "bankBranch", "bankAccountNumber", "ecocashNumber", "baseSalary", "currency",
    "usdPercentage", "zigPercentage", "payFrequency", "payGradeCode", "necSectorCode"
  ],
  "pay-grades": ["code", "name", "currency", "payFrequency", "minSalary", "midpointSalary", "maxSalary", "effectiveFrom", "necSectorCode"],
  "earning-types": ["code", "name", "category", "taxTreatment", "taxablePercentage", "isPensionable", "isNssaApplicable", "isRecurring", "calculationMethod", "formula", "effectiveFrom"],
  "deduction-types": ["code", "name", "category", "timing", "contributionSide", "calculationMethod", "employeeRate", "employerRate", "maxAmount", "priorityOrder", "formula", "effectiveFrom"],
  "recurring-items": ["employeeNumber", "type", "name", "amount", "isTaxable", "isTaxDeductible", "startDate", "endDate"],
  "leave-balances": ["employeeNumber", "leaveType", "accruedDays", "usedDays", "pendingDays", "availableDays"],
  loans: ["employeeNumber", "principalAmount", "interestRate", "repaymentTermMonths", "monthlyRepaymentAmount", "status"],
};

type ImportType = keyof typeof IMPORT_TEMPLATES;
type ImportRow = Record<string, unknown>;

function normalizeImportType(value: string): ImportType | null {
  const normalized = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(IMPORT_TEMPLATES, normalized) ? normalized as ImportType : null;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseBool(value: unknown, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["true", "yes", "y", "1"].includes(normalized);
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function textOrDefault(value: unknown, fallback: string): string {
  return textOrNull(value) ?? fallback;
}

function numberOrNull(value: unknown): number | null {
  const text = textOrNull(value);
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function dateOrNull(value: unknown): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function requireColumns(row: ImportRow, columns: string[]): string[] {
  return columns.filter((column) => textOrNull(row[column]) == null).map((column) => `${column} is required`);
}

function parseImportRows(body: any): ImportRow[] {
  if (Array.isArray(body?.rows)) return body.rows as ImportRow[];
  if (typeof body?.csv === "string") {
    return parse(body.csv, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as ImportRow[];
  }
  throw new Error("Provide rows[] or csv text");
}

async function findEmployeeByNumber(companyId: number, employeeNumber: unknown, tx: any = db) {
  const [employee] = await tx.select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.employeeNumber, String(employeeNumber ?? "").trim())))
    .limit(1);
  return employee;
}

function toCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return "";
  const columns = Object.keys(records[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(","), ...records.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}

function buildZimraElectronicPayload(report: any) {
  const reportData = report.reportData as any;
  return {
    schemaVersion: "FS-ZW-PAYROLL-1",
    reportType: report.reportType,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    currency: report.currency,
    version: report.version,
    snapshotHash: report.snapshotHash,
    employer: reportData.employer,
    totals: reportData.totals,
    employees: reportData.employees || [],
  };
}

function buildReportAuditManifest(reportType: string, runs: any[], lines: any[], taxTablesUsed: any[], statutoryRatesUsed: any[], validationSummary: any) {
  return {
    snapshotType: "ZIMBABWE_PAYROLL_STATUTORY_REPORT",
    reportType,
    generatedAt: new Date().toISOString(),
    payrollSnapshot: {
      runIds: runs.map((run) => run.id),
      runStatuses: runs.map((run) => ({
        id: run.id,
        status: run.status,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        approvedAt: run.approvedAt,
        lockedAt: run.lockedAt,
      })),
      employeeLineCount: lines.length,
      lineHashes: lines.map(({ line }) => ({
        payrollRunEmployeeId: line.id,
        employeeId: line.employeeId,
        snapshotHash: line.snapshotHash,
      })),
    },
    taxRulesUsed: taxTablesUsed,
    nssaRulesUsed: statutoryRatesUsed.map((rate) => ({
      nssaRateEmployee: rate.nssaRateEmployee,
      nssaRateEmployer: rate.nssaRateEmployer,
      nssaCeilingLimit: rate.nssaCeilingLimit,
    })),
    aidsLevyRatesUsed: statutoryRatesUsed.map((rate) => ({ aidsLevyRate: rate.aidsLevyRate })),
    validationSummary,
  };
}

function compareTotals(name: string, left: number, right: number, tolerance = 0.02) {
  const variance = Number((left - right).toFixed(2));
  return {
    name,
    left: Number(left.toFixed(2)),
    right: Number(right.toFixed(2)),
    variance,
    status: Math.abs(variance) <= tolerance ? "PASS" : "FAIL",
  };
}

function classifyRecurringDeduction(name: string): string {
  const normalized = name.toUpperCase();
  if (normalized.includes("PENSION")) return "PENSION";
  if (normalized.includes("GARNISHEE")) return "GARNISHEE";
  return "OTHER";
}

function classifyRecurringAllowance(name: string): string {
  const normalized = name.toUpperCase();
  if (normalized.includes("TRANSPORT")) return "TRANSPORT";
  if (normalized.includes("HOUSING")) return "HOUSING";
  if (normalized.includes("AIRTIME")) return "AIRTIME";
  if (normalized.includes("BONUS")) return "BONUS";
  if (normalized.includes("COMMISSION")) return "COMMISSION";
  if (normalized.includes("OVERTIME")) return "OVERTIME";
  return "OTHER";
}

async function loadActiveRecurringItems(tx: any, employeeId: number, periodStart: string, periodEnd: string) {
  return tx.select()
    .from(payrollRecurringItems)
    .where(and(
      eq(payrollRecurringItems.employeeId, employeeId),
      eq(payrollRecurringItems.isActive, true),
      sql`${payrollRecurringItems.startDate} <= ${periodEnd}`,
      sql`(${payrollRecurringItems.endDate} IS NULL OR ${payrollRecurringItems.endDate} >= ${periodStart})`
    ));
}

async function loadEffectiveTaxConfig(tx: any, currency: string, payFrequency: string, periodStart: string, periodEnd: string) {
  const [config] = await tx.select()
    .from(taxTablesConfig)
    .where(and(
      eq(taxTablesConfig.currency, currency),
      eq(taxTablesConfig.isActive, true),
      sql`${taxTablesConfig.effectiveFrom} <= ${periodEnd}`,
      sql`(${taxTablesConfig.effectiveTo} IS NULL OR ${taxTablesConfig.effectiveTo} >= ${periodStart})`
    ))
    .orderBy(desc(taxTablesConfig.effectiveFrom))
    .limit(1);

  if (!config) return null;
  return {
    ...config,
    payFrequency,
    effectivePeriod: { from: config.effectiveFrom, to: config.effectiveTo },
  };
}

// Load the effective payroll_statutory_rules for a company+period. Company
// specific rules override global (companyId IS NULL) ones; the latest
// effectiveFrom wins within the same scope. Returns ruleCode -> rule.
async function loadEffectiveStatutoryRules(tx: any, companyId: number, currency: string, payFrequency: string, periodStart: string, periodEnd: string) {
  const rules = await tx.select()
    .from(payrollStatutoryRules)
    .where(and(
      sql`(${payrollStatutoryRules.companyId} = ${companyId} OR ${payrollStatutoryRules.companyId} IS NULL)`,
      eq(payrollStatutoryRules.isActive, true),
      eq(payrollStatutoryRules.currency, currency),
      eq(payrollStatutoryRules.payFrequency, payFrequency),
      sql`${payrollStatutoryRules.effectiveFrom} <= ${periodEnd}`,
      sql`(${payrollStatutoryRules.effectiveTo} IS NULL OR ${payrollStatutoryRules.effectiveTo} >= ${periodStart})`
    ))
    .orderBy(
      sql`CASE WHEN ${payrollStatutoryRules.companyId} = ${companyId} THEN 0 ELSE 1 END`,
      desc(payrollStatutoryRules.effectiveFrom)
    );

  const byCode: Record<string, any> = {};
  for (const rule of rules) {
    const code = String(rule.ruleCode).toUpperCase();
    if (!byCode[code]) byCode[code] = rule;
  }
  return byCode;
}

function statutoryRate(rule: any, side: "employeeRate" | "employerRate", fallback: number): number {
  if (!rule) return fallback;
  const raw = rule[side] ?? rule.employeeRate ?? rule.employerRate;
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : fallback;
}

async function loadReportRuns(companyId: number, periodStart: string, periodEnd: string, currency?: string) {
  const conditions = [
    eq(payrollRuns.companyId, companyId),
    eq(payrollRuns.status, "LOCKED"),
    gte(payrollRuns.periodEnd, periodStart),
    lte(payrollRuns.periodEnd, periodEnd),
  ];
  if (currency) conditions.push(eq(payrollRuns.currency, currency));
  const runs = await db.select().from(payrollRuns).where(and(...conditions)).orderBy(asc(payrollRuns.periodEnd));
  const lines = [];
  for (const run of runs) {
    const runLines = await db.query.payrollRunEmployees.findMany({
      where: eq(payrollRunEmployees.payrollRunId, run.id),
      with: { employee: true, allowances: true, deductions: true },
    });
    for (const line of runLines) {
      lines.push({ run, line });
    }
  }
  return { runs, lines };
}

function summarizeValidation(issues: any[]) {
  return {
    errors: issues.filter((issue) => issue.severity === "ERROR").length,
    warnings: issues.filter((issue) => issue.severity === "WARNING").length,
    issueCount: issues.length,
    exportBlocked: issues.some((issue) => issue.severity === "ERROR"),
  };
}

async function validateStatutoryReport(company: any, reportType: string, runs: any[], lineRows: any[]) {
  const issues: any[] = [];
  const addIssue = (severity: "ERROR" | "WARNING", code: string, message: string, entityType?: string, entityId?: string | number, details: Record<string, unknown> = {}) => {
    issues.push({ severity, code, message, entityType, entityId: entityId == null ? undefined : String(entityId), details });
  };

  if (!company?.bpNumber && ["P2", "ITF16", "P6"].includes(reportType)) {
    addIssue("ERROR", "MISSING_EMPLOYER_BP_NUMBER", "Employer BP number is required for ZIMRA statutory returns", "company", company?.id);
  }
  if (runs.length === 0) {
    addIssue("ERROR", "NO_LOCKED_PAYROLL_RUNS", "No locked payroll runs were found for the selected report period");
  }
  for (const run of runs) {
    if (run.status !== "LOCKED") {
      addIssue("ERROR", "PAYROLL_NOT_FINALIZED", "Payroll run must be locked before statutory reporting", "payroll_runs", run.id);
    }
  }
  for (const { line } of lineRows) {
    const employee = line.employee;
    if (!employee?.nationalId) addIssue("ERROR", "MISSING_NATIONAL_ID", "Employee national ID/passport is missing", "employees", employee?.id);
    if (["P2", "P6", "ITF16"].includes(reportType) && !employee?.zimraTaxNumber) {
      addIssue("WARNING", "MISSING_TAX_NUMBER", "Employee ZIMRA tax number is missing", "employees", employee?.id);
    }
    if (["NSSA", "ITF16"].includes(reportType) && !employee?.nssaNumber) {
      addIssue("WARNING", "MISSING_NSSA_NUMBER", "Employee NSSA number is missing", "employees", employee?.id);
    }
    if (!employee?.joiningDate) addIssue("ERROR", "MISSING_START_DATE", "Employee start date is missing", "employees", employee?.id);
    const snapshot = (line.snapshotData as any) || {};
    if (toMoney(snapshot.taxableIncome) < 0) addIssue("ERROR", "NEGATIVE_TAXABLE_INCOME", "Taxable income cannot be negative", "payroll_run_employees", line.id);
    if (snapshot.payeRaw != null && Math.abs(toMoney(snapshot.payeRaw) - toMoney(line.paye)) > 0.02) {
      addIssue("ERROR", "PAYE_MISMATCH", "PAYE line amount does not match immutable payroll snapshot", "payroll_run_employees", line.id);
    }
    if (snapshot.aidsLevy != null && Math.abs(toMoney(snapshot.aidsLevy) - toMoney(line.aidsLevy)) > 0.02) {
      addIssue("ERROR", "AIDS_LEVY_MISMATCH", "AIDS levy line amount does not match immutable payroll snapshot", "payroll_run_employees", line.id);
    }
    if (snapshot.nssaEmployee != null && Math.abs(toMoney(snapshot.nssaEmployee) - toMoney(line.nssaEmployee)) > 0.02) {
      addIssue("ERROR", "NSSA_MISMATCH", "NSSA line amount does not match immutable payroll snapshot", "payroll_run_employees", line.id);
    }
  }
  return issues;
}

function buildStatutoryReportData(reportType: string, company: any, runs: any[], lineRows: any[], periodStart: string, periodEnd: string, currency: string) {
  const employeeRows = lineRows.map(({ run, line }) => {
    const employee = line.employee;
    const allowances = line.allowances || [];
    const deductions = line.deductions || [];
    const snapshot = (line.snapshotData as any) || {};
    const taxableAllowances = allowances.filter((item: any) => item.isTaxable).reduce((sum: number, item: any) => sum + toMoney(item.amount), 0);
    const nonTaxableAllowances = allowances.filter((item: any) => !item.isTaxable).reduce((sum: number, item: any) => sum + toMoney(item.amount), 0);
    const pensionDeductions = deductions.filter((item: any) => item.deductionType === "PENSION").reduce((sum: number, item: any) => sum + toMoney(item.amount), 0);
    return {
      payrollRunId: run.id,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      employeeId: employee?.id,
      employeeNumber: employee?.employeeNumber,
      employeeName: `${employee?.firstName || ""} ${employee?.lastName || ""}`.trim(),
      nationalId: employee?.nationalId,
      zimraTaxNumber: employee?.zimraTaxNumber,
      nssaNumber: employee?.nssaNumber,
      joiningDate: employee?.joiningDate,
      terminationDate: employee?.terminationDate,
      grossRemuneration: toMoney(line.grossSalary),
      taxableRemuneration: toMoney(snapshot.taxableIncome),
      taxableBenefits: taxableAllowances,
      nonTaxableAllowances,
      pensionDeductions,
      payeDeducted: toMoney(line.paye),
      aidsLevy: toMoney(line.aidsLevy),
      nssaEmployee: toMoney(line.nssaEmployee),
      nssaEmployer: toMoney(line.nssaEmployer),
      necEmployee: toMoney(line.necEmployee),
      necEmployer: toMoney(line.necEmployer),
      netPay: toMoney(line.netSalary),
      currency: run.currency,
    };
  });

  const totals = employeeRows.reduce((acc: any, row) => {
    acc.grossRemuneration += row.grossRemuneration;
    acc.taxableRemuneration += row.taxableRemuneration;
    acc.taxableBenefits += row.taxableBenefits;
    acc.pensionDeductions += row.pensionDeductions;
    acc.payeDeducted += row.payeDeducted;
    acc.aidsLevy += row.aidsLevy;
    acc.totalPayePayable += row.payeDeducted + row.aidsLevy;
    acc.nssaEmployee += row.nssaEmployee;
    acc.nssaEmployer += row.nssaEmployer;
    acc.nssaPayable += row.nssaEmployee + row.nssaEmployer;
    acc.necPayable += row.necEmployee + row.necEmployer;
    acc.netPay += row.netPay;
    return acc;
  }, {
    grossRemuneration: 0,
    taxableRemuneration: 0,
    taxableBenefits: 0,
    pensionDeductions: 0,
    payeDeducted: 0,
    aidsLevy: 0,
    totalPayePayable: 0,
    nssaEmployee: 0,
    nssaEmployer: 0,
    nssaPayable: 0,
    necPayable: 0,
    netPay: 0,
  });

  const roundedTotals = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number((value as number).toFixed(2))]));
  const common = {
    reportType,
    employer: {
      name: company?.name,
      tradingName: company?.tradingName,
      tin: company?.tin,
      bpNumber: company?.bpNumber,
      email: company?.email,
    },
    periodStart,
    periodEnd,
    currency,
    payrollRunIds: runs.map((run) => run.id),
    employeeCount: new Set(employeeRows.map((row) => row.employeeId)).size,
    totals: roundedTotals,
    employees: employeeRows,
  };

  if (reportType === "P2") {
    return {
      ...common,
      p2: {
        employerBpNumber: company?.bpNumber,
        employerName: company?.name,
        taxPeriod: `${periodStart} to ${periodEnd}`,
        paymentReference: `P2-${company?.id}-${periodEnd}`,
        submissionStatus: "NOT_SUBMITTED",
      },
    };
  }
  if (reportType === "P6") {
    return { ...common, certificateType: "EMPLOYEE_TAX_CERTIFICATE", fdsMarkingReady: true };
  }
  if (reportType === "ITF16") {
    return {
      ...common,
      reconciliation: {
        p2TotalsShouldEqualItf16: true,
        p6TotalsShouldEqualItf16: true,
        payrollRunsShouldEqualStatutoryReports: true,
      },
    };
  }
  if (reportType === "NSSA") {
    return { ...common, nssaSchedule: employeeRows.map((row) => ({ employeeName: row.employeeName, nssaNumber: row.nssaNumber, pensionableEarnings: row.taxableRemuneration, employeeContribution: row.nssaEmployee, employerContribution: row.nssaEmployer, total: row.nssaEmployee + row.nssaEmployer })) };
  }
  if (reportType === "NEC") {
    return { ...common, necSchedule: employeeRows.map((row) => ({ employeeName: row.employeeName, employeeContribution: row.necEmployee, employerContribution: row.necEmployer, total: row.necEmployee + row.necEmployer })) };
  }
  return common;
}

// --- 1. SECURE VAULT CREDENTIALS ENDPOINTS ---
router.get("/credentials/:type", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const type = req.params.type;
    const [credential] = await db.select()
      .from(tenantIntegrationCredentials)
      .where(and(
        eq(tenantIntegrationCredentials.companyId, companyId),
        eq(tenantIntegrationCredentials.integrationType, type)
      ))
      .limit(1);

    if (!credential) {
      return res.json({ isConfigured: false });
    }
    res.json({ isConfigured: true, isActive: credential.isActive });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/credentials", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    integrationType: z.string(),
    credentialData: z.record(z.any()), // JSON configurations
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const encryptedData = encrypt(JSON.stringify(parsed.data.credentialData));
    
    const [credential] = await db.insert(tenantIntegrationCredentials)
      .values({
        companyId,
        integrationType: parsed.data.integrationType,
        credentialData: encryptedData,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [tenantIntegrationCredentials.companyId, tenantIntegrationCredentials.integrationType],
        set: { credentialData: encryptedData, updatedAt: new Date() }
      })
      .returning();

    await auditPayroll(req, "PAYROLL_CREDENTIALS_UPDATED", "tenant_integration_credentials", credential.id, {
      integrationType: parsed.data.integrationType,
    });
    res.json({ success: true, isConfigured: true });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 2. NEC SECTORS CONFIGURATION ENDPOINTS ---
router.get("/nec-sectors", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.select()
      .from(necSectorsConfig)
      .where(sql`${necSectorsConfig.companyId} = ${companyId} OR ${necSectorsConfig.companyId} IS NULL`)
      .orderBy(asc(necSectorsConfig.name));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/nec-sectors", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1),
    employeeRate: z.coerce.string(),
    employerRate: z.coerce.string(),
    fixedAmount: z.coerce.string().default("0.00"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const [result] = await db.insert(necSectorsConfig)
      .values({ ...parsed.data, companyId })
      .returning();
    await auditPayroll(req, "PAYROLL_NEC_SECTOR_CREATED", "nec_sectors_config", result.id, { code: result.code });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.put("/nec-sectors/:id", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const [result] = await db.update(necSectorsConfig)
      .set(req.body)
      .where(and(eq(necSectorsConfig.id, id), eq(necSectorsConfig.companyId, companyId)))
      .returning();
    if (!result) return res.status(404).json({ message: "NEC config not found" });
    await auditPayroll(req, "PAYROLL_NEC_SECTOR_UPDATED", "nec_sectors_config", result.id, { code: result.code });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 3. DEPARTMENTS & POSITIONS ENDPOINTS ---
router.get("/departments", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.select().from(departments).where(eq(departments.companyId, companyId));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/departments", requirePayrollWrite, async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const [dept] = await db.insert(departments).values({ ...req.body, companyId }).returning();
    await auditPayroll(req, "PAYROLL_DEPARTMENT_CREATED", "departments", dept.id, { name: dept.name });
    res.status(201).json(dept);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/positions", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.select().from(positions).where(eq(positions.companyId, companyId));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/positions", requirePayrollWrite, async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const [pos] = await db.insert(positions).values({ ...req.body, companyId }).returning();
    await auditPayroll(req, "PAYROLL_POSITION_CREATED", "positions", pos.id, { title: pos.title });
    res.status(201).json(pos);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/pay-grades", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const grades = await db.select()
      .from(payrollPayGrades)
      .where(eq(payrollPayGrades.companyId, companyId))
      .orderBy(asc(payrollPayGrades.code));
    res.json(grades);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/pay-grades", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    currency: z.string().default("USD"),
    payFrequency: z.string().default("MONTHLY"),
    minSalary: z.coerce.string().default("0.00"),
    midpointSalary: z.coerce.string().default("0.00"),
    maxSalary: z.coerce.string().default("0.00"),
    necSectorId: z.coerce.number().int().optional().nullable(),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const gradeData = {
      ...parsed.data,
      effectiveFrom: parsed.data.effectiveFrom || new Date().toISOString().slice(0, 10),
    };
    const [grade] = await db.insert(payrollPayGrades)
      .values({ ...gradeData, companyId, isActive: true })
      .onConflictDoUpdate({
        target: [payrollPayGrades.companyId, payrollPayGrades.code],
        set: { ...gradeData, updatedAt: new Date(), isActive: true },
      })
      .returning();

    await auditPayroll(req, "PAYROLL_PAY_GRADE_UPSERTED", "payroll_pay_grades", grade.id, {
      code: grade.code,
      effectiveFrom: grade.effectiveFrom,
    });
    res.status(201).json(grade);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 4. EMPLOYEE DIRECTORY & CONTRACTS ENDPOINTS ---
router.get("/employees", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const list = await db.query.employees.findMany({
      where: eq(employees.companyId, companyId),
      with: {
        department: true,
        position: true,
        contracts: {
          where: eq(employeeContracts.isActive, true)
        }
      },
      orderBy: [asc(employees.lastName), asc(employees.firstName)]
    });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/employees", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    employeeNumber: z.string().trim().min(1),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    nationalId: z.string().trim().min(1),
    nssaNumber: z.string().optional().nullable(),
    zimraTaxNumber: z.string().optional().nullable(),
    branchId: z.coerce.number().int(),
    departmentId: z.coerce.number().int().optional().nullable(),
    positionId: z.coerce.number().int().optional().nullable(),
    status: z.string().default("ACTIVE"),
    joiningDate: z.string().optional().nullable(),
    terminationDate: z.string().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankBranch: z.string().optional().nullable(),
    bankAccountNumber: z.string().optional().nullable(),
    ecocashNumber: z.string().optional().nullable(),
    emergencyContactName: z.string().optional().nullable(),
    emergencyContactPhone: z.string().optional().nullable(),
    contract: z.object({
      contractType: z.string().default("PERMANENT"),
      baseSalary: z.coerce.string(),
      currency: z.string().default("USD"),
      usdPercentage: z.coerce.string().default("100.00"),
      zigPercentage: z.coerce.string().default("0.00"),
      payFrequency: z.string().default("MONTHLY"),
      payGradeId: z.coerce.number().int().optional().nullable(),
      necSectorId: z.coerce.number().int().optional().nullable(),
    }).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });
  if (parsed.data.contract) {
    const usdPercentage = Number(parsed.data.contract.usdPercentage || 0);
    const zigPercentage = Number(parsed.data.contract.zigPercentage || 0);
    if (Math.abs((usdPercentage + zigPercentage) - 100) > 0.01) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "USD and ZiG salary split percentages must total 100.",
      });
    }
  }

  try {
    const companyId = getTargetCompanyId(req);
    const { contract, ...empData } = parsed.data;
    if (!empData.joiningDate) {
      empData.joiningDate = new Date().toISOString().slice(0, 10);
    }
    if (!empData.branchId) {
      empData.branchId = 1;
    }

    const result = await db.transaction(async (tx) => {
      // 1. Create employee
      const [emp] = await tx.insert(employees)
        .values({ ...empData, joiningDate: empData.joiningDate || new Date().toISOString().slice(0, 10), companyId })
        .returning();

      // 2. Create contract if provided
      let createdContract = null;
      if (contract) {
        [createdContract] = await tx.insert(employeeContracts)
          .values({
            employeeId: emp.id,
            contractType: contract.contractType,
            startDate: empData.joiningDate || new Date().toISOString().slice(0, 10),
            baseSalary: contract.baseSalary,
            currency: contract.currency,
            usdPercentage: contract.usdPercentage,
            zigPercentage: contract.zigPercentage,
            payFrequency: contract.payFrequency,
            payGradeId: contract.payGradeId,
            necSectorId: contract.necSectorId,
            isActive: true,
          })
          .returning();
      }

      // 3. Initialize default Leave balance
      await tx.insert(leaveBalances).values({
        employeeId: emp.id,
        leaveType: "ANNUAL",
        accruedDays: "0.00",
        usedDays: "0.00",
        pendingDays: "0.00",
        availableDays: "0.00",
      });

      return { emp, contract: createdContract };
    });

    await auditPayroll(req, "PAYROLL_EMPLOYEE_CREATED", "employees", result.emp.id, {
      employeeNumber: result.emp.employeeNumber,
      hasContract: !!result.contract,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/employees/export", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  try {
    const list = await db.query.employees.findMany({
      where: eq(employees.companyId, companyId),
      with: {
        department: true,
        position: true,
        contracts: { where: eq(employeeContracts.isActive, true) }
      },
      orderBy: [asc(employees.lastName), asc(employees.firstName)]
    });

    const headers = ["Employee Number", "First Name", "Last Name", "National ID", "Email", "Phone", "Status", "Department", "Position", "Base Salary", "Currency", "USD %", "ZiG %", "Bank Name", "Account Number", "Ecocash Number"];
    const rows = list.map(emp => {
      const contract = emp.contracts?.[0];
      return [
        emp.employeeNumber || "",
        emp.firstName,
        emp.lastName,
        emp.nationalId || "",
        emp.email || "",
        emp.phone || "",
        emp.status,
        emp.department?.name || "",
        emp.position?.title || "",
        contract?.baseSalary || "0",
        contract?.currency || "USD",
        contract?.usdPercentage || "100",
        contract?.zigPercentage || "0",
        emp.bankName || "",
        emp.bankAccountNumber || "",
        emp.ecocashNumber || ""
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });

    const csvStr = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=employees_export_${new Date().getTime()}.csv`);
    res.send(csvStr);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /employees/import - JSON array of employees (client parses the CSV with papaparse)
router.post("/employees/import", requirePayrollWrite, async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const { employees: importedEmployees } = req.body;

  if (!Array.isArray(importedEmployees) || importedEmployees.length === 0) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid or empty employees array" });
  }

  try {
    let importedCount = 0;
    await db.transaction(async (tx) => {
      for (const row of importedEmployees) {
        if (!row.firstName || !row.lastName) continue;

        const employeeNumber = row.employeeNumber || `EMP-${Math.floor(Math.random() * 10000)}`;
        const [existing] = await tx.select({ id: employees.id })
          .from(employees)
          .where(and(
            eq(employees.companyId, companyId),
            eq(employees.employeeNumber, employeeNumber)
          ))
          .limit(1);

        const empData = {
          companyId,
          branchId: row.branchId || 1,
          employeeNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          nationalId: row.nationalId || null,
          email: row.email || null,
          phone: row.phone || null,
          status: "ACTIVE",
          joiningDate: row.joiningDate || new Date().toISOString().slice(0, 10),
          bankName: row.bankName || null,
          bankAccountNumber: row.bankAccountNumber || null,
          ecocashNumber: row.ecocashNumber || null,
        };

        let newEmp = existing;
        if (!existing) {
          [newEmp] = await tx.insert(employees).values(empData).returning();
          await tx.insert(leaveBalances).values({
            employeeId: newEmp.id,
            leaveType: "ANNUAL",
            accruedDays: "0.00",
            usedDays: "0.00",
            pendingDays: "0.00",
            availableDays: "0.00",
          });
        }

        const [activeContract] = await tx.select({ id: employeeContracts.id })
          .from(employeeContracts)
          .where(and(
            eq(employeeContracts.employeeId, newEmp.id),
            eq(employeeContracts.isActive, true)
          ))
          .limit(1);

        const contractData = {
          employeeId: newEmp.id,
          contractType: "PERMANENT",
          startDate: row.joiningDate || new Date().toISOString().slice(0, 10),
          baseSalary: row.baseSalary ? String(row.baseSalary) : "0",
          currency: row.currency || "USD",
          usdPercentage: row.usdPercentage ? String(row.usdPercentage) : "100",
          zigPercentage: row.zigPercentage ? String(row.zigPercentage) : "0",
          isActive: true,
        };
        if (activeContract) {
          await tx.update(employeeContracts).set(contractData).where(eq(employeeContracts.id, activeContract.id));
        } else {
          await tx.insert(employeeContracts).values(contractData);
        }

        importedCount++;
      }
    });

    res.json({ success: true, count: importedCount, message: `Successfully imported ${importedCount} employees.` });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/employees/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.id, id), eq(employees.companyId, companyId)),
      with: {
        department: true,
        position: true,
        contracts: true,
        leaveBalances: true,
        loans: true
      }
    });
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    res.json(emp);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.put("/employees/:id", requirePayrollWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const [emp] = await db.update(employees)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(employees.id, id), eq(employees.companyId, companyId)))
      .returning();
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    await auditPayroll(req, "PAYROLL_EMPLOYEE_UPDATED", "employees", emp.id, {
      changedFields: Object.keys(req.body || {}),
    });
    res.json(emp);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/employees/:id/contract", requirePayrollWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const schema = z.object({
    contractType: z.string().default("PERMANENT"),
    startDate: z.string(),
    endDate: z.string().optional().nullable(),
    baseSalary: z.coerce.string(),
    currency: z.string().default("USD"),
    usdPercentage: z.coerce.string().default("100.00"),
    zigPercentage: z.coerce.string().default("0.00"),
    payGradeId: z.coerce.number().int().optional().nullable(),
    necSectorId: z.coerce.number().int().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    // Verify employee exists for company
    const [emp] = await db.select().from(employees).where(and(eq(employees.id, id), eq(employees.companyId, companyId))).limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const contract = await db.transaction(async (tx) => {
      // Deactivate other contracts
      await tx.update(employeeContracts)
        .set({ isActive: false })
        .where(eq(employeeContracts.employeeId, id));

      // Insert new active contract
      const [newContract] = await tx.insert(employeeContracts)
        .values({
          employeeId: id,
          ...parsed.data,
          isActive: true
        })
        .returning();
      return newContract;
    });

    await auditPayroll(req, "PAYROLL_EMPLOYEE_CONTRACT_CREATED", "employee_contracts", contract.id, {
      employeeId: id,
      startDate: contract.startDate,
      currency: contract.currency,
    });
    res.status(201).json(contract);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 4B. RECURRING PAY ITEMS ---
router.get("/employees/:id/recurring-items", async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const [emp] = await db.select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
      .limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const items = await db.select()
      .from(payrollRecurringItems)
      .where(eq(payrollRecurringItems.employeeId, employeeId))
      .orderBy(desc(payrollRecurringItems.isActive), asc(payrollRecurringItems.name));
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/employees/:id/recurring-items", requirePayrollWrite, async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const schema = z.object({
    type: z.enum(["ALLOWANCE", "DEDUCTION"]),
    name: z.string().trim().min(1),
    amount: z.coerce.string(),
    isTaxable: z.boolean().default(true),
    isTaxDeductible: z.boolean().default(false),
    startDate: z.string(),
    endDate: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const [emp] = await db.select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
      .limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const [item] = await db.insert(payrollRecurringItems)
      .values({ employeeId, ...parsed.data, isActive: true })
      .returning();

    await auditPayroll(req, "PAYROLL_RECURRING_ITEM_CREATED", "payroll_recurring_items", item.id, {
      employeeId,
      type: item.type,
      amount: item.amount,
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.put("/recurring-items/:id", requirePayrollWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const schema = z.object({
    name: z.string().trim().min(1).optional(),
    amount: z.coerce.string().optional(),
    isTaxable: z.boolean().optional(),
    isTaxDeductible: z.boolean().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const [existing] = await db.select({ itemId: payrollRecurringItems.id, employeeId: payrollRecurringItems.employeeId })
      .from(payrollRecurringItems)
      .innerJoin(employees, eq(payrollRecurringItems.employeeId, employees.id))
      .where(and(eq(payrollRecurringItems.id, id), eq(employees.companyId, companyId)))
      .limit(1);
    if (!existing) return res.status(404).json({ message: "Recurring payroll item not found" });

    const [item] = await db.update(payrollRecurringItems)
      .set(parsed.data)
      .where(eq(payrollRecurringItems.id, id))
      .returning();

    await auditPayroll(req, "PAYROLL_RECURRING_ITEM_UPDATED", "payroll_recurring_items", item.id, {
      employeeId: existing.employeeId,
      changedFields: Object.keys(parsed.data),
    });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 5. LEAVE REQUESTS & ACCRUALS ENDPOINTS ---
router.get("/leave/requests", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.query.leaveRequests.findMany({
      where: eq(leaveRequests.companyId, companyId),
      with: { employee: true },
      orderBy: [desc(leaveRequests.createdAt)]
    });
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/leave/requests", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    employeeId: z.coerce.number().int(),
    leaveType: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    totalDays: z.coerce.number().int(),
    reason: z.string().optional().nullable(),
    encashmentDays: z.coerce.number().int().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const [request] = await db.insert(leaveRequests)
      .values({
        ...parsed.data,
        companyId,
        status: "PENDING"
      })
      .returning();
    await auditPayroll(req, "PAYROLL_LEAVE_REQUEST_CREATED", "leave_requests", request.id, {
      employeeId: request.employeeId,
      leaveType: request.leaveType,
      totalDays: request.totalDays,
    });
    res.status(201).json(request);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/leave/requests/:id/approve", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const userId = (req as any).user?.id;
  const schema = z.object({
    approve: z.boolean(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const [request] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, companyId))).limit(1);
    if (!request) return res.status(404).json({ message: "Leave request not found" });

    const status = parsed.data.approve ? "APPROVED" : "REJECTED";

    const result = await db.transaction(async (tx) => {
      // 1. Update status
      const [updated] = await tx.update(leaveRequests)
        .set({
          status,
          approvedBy: userId || null,
          approvedAt: new Date()
        })
        .where(eq(leaveRequests.id, id))
        .returning();

      // 2. Adjust leave balances if approved
      if (status === "APPROVED") {
        const [balance] = await tx.select().from(leaveBalances)
          .where(and(
            eq(leaveBalances.employeeId, request.employeeId),
            eq(leaveBalances.leaveType, request.leaveType)
          ))
          .limit(1);

        if (balance) {
          const used = parseFloat(balance.usedDays) + request.totalDays;
          const available = parseFloat(balance.accruedDays) - used;
          await tx.update(leaveBalances)
            .set({
              usedDays: used.toFixed(2),
              availableDays: available.toFixed(2),
            })
            .where(eq(leaveBalances.id, balance.id));
        }
      }
      return updated;
    });

    await auditPayroll(req, status === "APPROVED" ? "PAYROLL_LEAVE_APPROVED" : "PAYROLL_LEAVE_REJECTED", "leave_requests", result.id, {
      employeeId: result.employeeId,
      leaveType: result.leaveType,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 6. LOANS & advances ENDPOINTS ---
router.get("/loans", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.query.employeeLoans.findMany({
      where: eq(employeeLoans.companyId, companyId),
      with: { employee: true, installments: true },
      orderBy: [desc(employeeLoans.createdAt)]
    });
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/loans", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    employeeId: z.coerce.number().int(),
    principalAmount: z.coerce.string(),
    interestRate: z.coerce.string().default("0.00"),
    repaymentTermMonths: z.coerce.number().int(),
    monthlyRepaymentAmount: z.coerce.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const monthlyRepaymentAmount = parsed.data.monthlyRepaymentAmount
      ? parsed.data.monthlyRepaymentAmount
      : (parseFloat(parsed.data.principalAmount) / Math.max(1, parsed.data.repaymentTermMonths)).toFixed(2);
    const [loan] = await db.insert(employeeLoans)
      .values({
        ...parsed.data,
        monthlyRepaymentAmount,
        companyId,
        remainingBalance: parsed.data.principalAmount,
        status: "PENDING"
      })
      .returning();
    await auditPayroll(req, "PAYROLL_LOAN_CREATED", "employee_loans", loan.id, {
      employeeId: loan.employeeId,
      principalAmount: loan.principalAmount,
    });
    res.status(201).json(loan);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/loans/:id/approve", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const userId = (req as any).user?.id;
  try {
    const [loan] = await db.select().from(employeeLoans).where(and(eq(employeeLoans.id, id), eq(employeeLoans.companyId, companyId))).limit(1);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const [updated] = await db.update(employeeLoans)
      .set({
        status: "ACTIVE",
        disbursedDate: new Date().toISOString().slice(0, 10),
        approvedBy: userId || null
      })
      .where(eq(employeeLoans.id, id))
      .returning();

    await auditPayroll(req, "PAYROLL_LOAN_APPROVED", "employee_loans", updated.id, {
      employeeId: updated.employeeId,
      principalAmount: updated.principalAmount,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 7. STATUTORY CONFIGURATION ENDPOINTS ---
router.get("/tax-config", async (req, res) => {
  try {
    const results = await db.select()
      .from(taxTablesConfig)
      .orderBy(desc(taxTablesConfig.effectiveFrom));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/tax-config", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    currency: z.string().default("USD"),
    effectiveFrom: z.string(),
    effectiveTo: z.string().optional().nullable(),
    brackets: z.array(z.object({
      min: z.number(),
      max: z.number().nullable(),
      rate: z.number(),
      deduction: z.number(),
    })),
    nssaRateEmployee: z.coerce.string().default("0.0450"),
    nssaRateEmployer: z.coerce.string().default("0.0450"),
    nssaCeilingLimit: z.coerce.string(),
    aidsLevyRate: z.coerce.string().default("0.0300"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    // Deactivate previous active configurations for currency
    await db.update(taxTablesConfig)
      .set({ isActive: false })
      .where(eq(taxTablesConfig.currency, parsed.data.currency));

    const [config] = await db.insert(taxTablesConfig)
      .values({ ...parsed.data, isActive: true })
      .returning();
    await auditPayroll(req, "PAYROLL_TAX_CONFIG_CREATED", "tax_tables_config", config.id, {
      currency: config.currency,
      effectiveFrom: config.effectiveFrom,
    });
    res.status(201).json(config);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/statutory-rules", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const rules = await db.select()
      .from(payrollStatutoryRules)
      .where(sql`${payrollStatutoryRules.companyId} = ${companyId} OR ${payrollStatutoryRules.companyId} IS NULL`)
      .orderBy(asc(payrollStatutoryRules.ruleCode), desc(payrollStatutoryRules.effectiveFrom));
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/statutory-rules", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    ruleCode: z.string().trim().min(1),
    name: z.string().trim().min(1),
    currency: z.string().default("USD"),
    payFrequency: z.string().default("MONTHLY"),
    // UI-friendly shape: a single rate + ruleType; mapped to employee/employer below
    ruleType: z.string().optional().nullable(),
    rate: z.coerce.string().optional().nullable(),
    employeeRate: z.coerce.string().optional(),
    employerRate: z.coerce.string().optional(),
    ceilingAmount: z.coerce.string().optional().nullable(),
    floorAmount: z.coerce.string().optional().nullable(),
    calculationBasis: z.string().default("TAXABLE_INCOME"),
    formula: z.string().optional().nullable(),
    metadata: z.record(z.any()).default({}),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const rate = parsed.data.rate ?? parsed.data.employeeRate ?? "0.000000";
    const ruleData = {
      ruleCode: parsed.data.ruleCode,
      name: parsed.data.name,
      currency: parsed.data.currency,
      payFrequency: parsed.data.payFrequency,
      employeeRate: parsed.data.employeeRate ?? rate,
      employerRate: parsed.data.employerRate ?? rate,
      ceilingAmount: parsed.data.ceilingAmount,
      floorAmount: parsed.data.floorAmount,
      calculationBasis: parsed.data.calculationBasis,
      formula: parsed.data.formula ?? (parsed.data.ruleType || null),
      metadata: parsed.data.metadata,
      effectiveFrom: parsed.data.effectiveFrom || new Date().toISOString().slice(0, 10),
      effectiveTo: parsed.data.effectiveTo,
    };
    const [rule] = await db.insert(payrollStatutoryRules)
      .values({ ...ruleData, companyId, countryCode: "ZW", isActive: true })
      .returning();
    await auditPayroll(req, "PAYROLL_STATUTORY_RULE_CREATED", "payroll_statutory_rules", rule.id, {
      ruleCode: rule.ruleCode,
      effectiveFrom: rule.effectiveFrom,
    });
    res.status(201).json(rule);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/earning-types", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const rows = await db.select()
      .from(payrollEarningTypes)
      .where(sql`${payrollEarningTypes.companyId} = ${companyId} OR ${payrollEarningTypes.companyId} IS NULL`)
      .orderBy(asc(payrollEarningTypes.code));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/earning-types", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    category: z.string().default("ALLOWANCE"),
    taxTreatment: z.enum(["TAXABLE", "NON_TAXABLE", "PARTIAL"]).default("TAXABLE"),
    taxablePercentage: z.coerce.string().default("100.00"),
    isPensionable: z.boolean().default(false),
    isNssaApplicable: z.boolean().default(false),
    isRecurring: z.boolean().default(false),
    calculationMethod: z.string().default("FIXED"),
    formula: z.string().optional().nullable(),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const [row] = await db.insert(payrollEarningTypes)
      .values({
        ...parsed.data,
        effectiveFrom: parsed.data.effectiveFrom || new Date().toISOString().slice(0, 10),
        companyId,
        countryCode: "ZW",
        isActive: true,
      })
      .returning();
    await auditPayroll(req, "PAYROLL_EARNING_TYPE_CREATED", "payroll_earning_types", row.id, { code: row.code });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.patch("/earning-types/:id", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const schema = z.object({
    code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    category: z.string().optional(),
    taxTreatment: z.enum(["TAXABLE", "NON_TAXABLE", "PARTIAL"]).optional(),
    taxablePercentage: z.coerce.string().optional(),
    isPensionable: z.boolean().optional(),
    isNssaApplicable: z.boolean().optional(),
    isRecurring: z.boolean().optional(),
    calculationMethod: z.string().optional(),
    formula: z.string().optional().nullable(),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const [existing] = await db.select()
      .from(payrollEarningTypes)
      .where(and(
        eq(payrollEarningTypes.id, id),
        sql`${payrollEarningTypes.companyId} = ${companyId} OR ${payrollEarningTypes.companyId} IS NULL`
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ message: "Earning type not found" });

    const [row] = await db.update(payrollEarningTypes)
      .set({ ...parsed.data, effectiveFrom: parsed.data.effectiveFrom || undefined })
      .where(eq(payrollEarningTypes.id, id))
      .returning();
    await auditPayroll(req, "PAYROLL_EARNING_TYPE_UPDATED", "payroll_earning_types", row.id, { code: row.code });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/deduction-types", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const rows = await db.select()
      .from(payrollDeductionTypes)
      .where(sql`${payrollDeductionTypes.companyId} = ${companyId} OR ${payrollDeductionTypes.companyId} IS NULL`)
      .orderBy(asc(payrollDeductionTypes.priorityOrder), asc(payrollDeductionTypes.code));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/deduction-types", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    category: z.string().default("COMPANY"),
    timing: z.enum(["PRE_TAX", "POST_TAX", "STATUTORY"]).default("POST_TAX"),
    contributionSide: z.enum(["EMPLOYEE", "EMPLOYER", "BOTH"]).default("EMPLOYEE"),
    calculationMethod: z.string().default("FIXED"),
    formula: z.string().optional().nullable(),
    employeeRate: z.coerce.string().default("0.000000"),
    employerRate: z.coerce.string().default("0.000000"),
    maxAmount: z.coerce.string().optional().nullable(),
    priorityOrder: z.coerce.number().int().default(100),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    const [row] = await db.insert(payrollDeductionTypes)
      .values({
        ...parsed.data,
        effectiveFrom: parsed.data.effectiveFrom || new Date().toISOString().slice(0, 10),
        companyId,
        countryCode: "ZW",
        isActive: true,
      })
      .returning();
    await auditPayroll(req, "PAYROLL_DEDUCTION_TYPE_CREATED", "payroll_deduction_types", row.id, { code: row.code });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 8. PAYROLL RUNS & engine COMPUTATIONS ---
router.get("/runs", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.companyId, companyId))
      .orderBy(desc(payrollRuns.periodEnd));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// GET /runs/:id/worksheet - Grid calculations worksheet
// POST /runs - Initiate draft run
router.post("/runs", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    periodStart: z.string(),
    periodEnd: z.string(),
    payFrequency: z.string().default("MONTHLY"),
    currency: z.string().default("USD"),
    exchangeRate: z.coerce.string().default("1.000000"),
    branchId: z.coerce.number().int().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });

  try {
    const companyId = getTargetCompanyId(req);
    
    // Fetch active employees with active contracts matching company and branch
    const employeeConditions = [
      eq(employees.companyId, companyId),
      eq(employees.status, "ACTIVE")
    ];
    if (parsed.data.branchId) {
      employeeConditions.push(eq(employees.branchId, parsed.data.branchId));
    }
    
    const activeEmployees = await db.query.employees.findMany({
      where: and(...employeeConditions),
      with: {
        contracts: {
          where: eq(employeeContracts.isActive, true)
        }
      }
    });

    if (activeEmployees.length === 0) {
      return res.status(400).json({ message: "No active employees found with active contracts" });
    }

    const run = await db.transaction(async (tx) => {
      // 1. Create run header
      const [newRun] = await tx.insert(payrollRuns)
        .values({
          companyId,
          branchId: parsed.data.branchId || null,
          periodStart: parsed.data.periodStart,
          periodEnd: parsed.data.periodEnd,
          payFrequency: parsed.data.payFrequency,
          currency: parsed.data.currency,
          exchangeRate: parsed.data.exchangeRate,
          status: "DRAFT"
        })
        .returning();

      // 2. Fetch active tax configurations
      const taxConfig = await loadEffectiveTaxConfig(tx, parsed.data.currency, parsed.data.payFrequency, parsed.data.periodStart, parsed.data.periodEnd);

      if (!taxConfig) {
        throw new Error(`Effective tax configuration not found for ${parsed.data.currency} ${parsed.data.payFrequency} covering ${parsed.data.periodStart} to ${parsed.data.periodEnd}`);
      }

      // 2b. Load effective statutory rule overrides (ZIMDEF, STANDARDS_LEVY,
      // APWCS, PENSION, NSSA_POBS, AIDS_LEVY) for the run period.
      const statutoryRules = await loadEffectiveStatutoryRules(tx, companyId, parsed.data.currency, parsed.data.payFrequency, parsed.data.periodStart, parsed.data.periodEnd);

      // 3. For each employee, fetch contract details and perform payroll calculations
      for (const emp of activeEmployees) {
        const contract = emp.contracts[0];
        if (!contract) continue; // Skip if no active contract

        // Fetch selected NEC rates if available
        let necRate = "0.0000";
        let necEmployerRate = "0.0000";
        let necFixedAmount = "0.00";
        if (contract.necSectorId) {
          const [nec] = await tx.select().from(necSectorsConfig).where(eq(necSectorsConfig.id, contract.necSectorId)).limit(1);
          if (nec) {
            necRate = nec.employeeRate;
            necEmployerRate = nec.employerRate;
            necFixedAmount = nec.fixedAmount;
          }
        }

        // Fetch recurring allowances/deductions active in the run period.
        const recurringItems = await loadActiveRecurringItems(tx, emp.id, parsed.data.periodStart, parsed.data.periodEnd);

        // Fetch outstanding loan repayment defaults
        const [activeLoan] = await tx.select()
          .from(employeeLoans)
          .where(and(
            eq(employeeLoans.employeeId, emp.id),
            eq(employeeLoans.status, "ACTIVE")
          ))
          .limit(1);
        
        const loanDeduction = activeLoan ? Math.min(parseFloat(activeLoan.remainingBalance), parseFloat(activeLoan.monthlyRepaymentAmount)) : 0;

        // Feed recurring items and the loan repayment into the engine so gross,
        // taxable income, PAYE and net pay all reflect them. (Previously the
        // engine received elements: [] and the recurring amounts only appeared
        // as side rows on the payslip without affecting the calculation.)
        const elements: PayrollElementInput[] = [
          ...recurringItems
            .filter((item: any) => item.type === "ALLOWANCE")
            .map((item: any) => ({
              type: "EARNING" as const,
              name: item.name,
              calculationMethod: "FIXED" as const,
              amount: toMoney(item.amount),
              isTaxable: !!item.isTaxable,
              isRecurring: true,
            })),
          ...recurringItems
            .filter((item: any) => item.type === "DEDUCTION")
            .map((item: any) => ({
              type: "DEDUCTION" as const,
              name: item.name,
              calculationMethod: "FIXED" as const,
              amount: toMoney(item.amount),
              isTaxDeductible: !!item.isTaxDeductible,
              isRecurring: true,
            })),
        ];
        if (loanDeduction > 0) {
          elements.push({
            type: "DEDUCTION",
            name: "Loan repayment",
            calculationMethod: "FIXED",
            amount: loanDeduction,
            isTaxDeductible: false,
            isRecurring: true,
          });
        }

        // Statutory rule overrides for this employee's run line.
        const pensionRule = statutoryRules["PENSION"];
        const pensionEmployeeRate = pensionRule ? statutoryRate(pensionRule, "employeeRate", 0) : 0;
        const pensionEmployerRate = pensionRule ? statutoryRate(pensionRule, "employerRate", 0) : 0;

        // Perform calculation
        const calcs = ZimbabwePayrollEngine.calculateEmployeeLine({
          baseSalary: parseFloat(contract.baseSalary),
          payFrequency: parsed.data.payFrequency as "MONTHLY" | "WEEKLY" | "FORTNIGHTLY" | "DAILY",
          pensionEmployeeRate,
          pensionEmployerRate,
          apwcsRate: statutoryRules["APWCS"] ? statutoryRate(statutoryRules["APWCS"], "employerRate", 0.005) : undefined,
          necRate: parseFloat(necRate),
          necEmployerRate: parseFloat(necEmployerRate),
          necFixedAmount: parseFloat(necFixedAmount),
          usdPercentage: parseFloat(contract.usdPercentage),
          zigPercentage: parseFloat(contract.zigPercentage),
          exchangeRate: parseFloat(parsed.data.exchangeRate),
          elements,
          taxConfig: {
            brackets: taxConfig.brackets as TaxBracket[],
          },
          statutoryConfig: {
            aidsLevyRate: statutoryRules["AIDS_LEVY"] ? statutoryRate(statutoryRules["AIDS_LEVY"], "employeeRate", 0.03) : parseFloat(taxConfig.aidsLevyRate),
            nssaRateEmployee: statutoryRules["NSSA_POBS"] ? statutoryRate(statutoryRules["NSSA_POBS"], "employeeRate", 0.045) : parseFloat(taxConfig.nssaRateEmployee),
            nssaRateEmployer: statutoryRules["NSSA_POBS"] ? statutoryRate(statutoryRules["NSSA_POBS"], "employerRate", 0.045) : parseFloat(taxConfig.nssaRateEmployer),
            nssaCeilingLimit: statutoryRules["NSSA_POBS"]?.ceilingAmount ? Number(statutoryRules["NSSA_POBS"].ceilingAmount) : parseFloat(taxConfig.nssaCeilingLimit),
            zimdefRate: statutoryRules["ZIMDEF"] ? statutoryRate(statutoryRules["ZIMDEF"], "employerRate", 0.01) : 0.01,
            standardsLevyRate: (statutoryRules["STANDARDS_LEVY"] || statutoryRules["STANDARDS"]) ? statutoryRate(statutoryRules["STANDARDS_LEVY"] || statutoryRules["STANDARDS"], "employerRate", 0.005) : 0.005,
            taxFreeBonusThreshold: 400,
            medicalAidCreditMonthly: 75,
            blindPersonCreditAnnual: 900,
            elderlyPersonCreditAnnual: 900,
            maxTaxDeductiblePensionAnnual: 54000,
            hoursPerDay: 8,
            workingDaysPerMonth: 22,
            overtimeMultiplierStandard: 1.5,
            overtimeMultiplierSunday: 2.0
          }
        });

        const processedEarnings = calcs.processedEarnings;
        const processedDeductions = calcs.processedDeductions;
        const taxableAllowances = processedEarnings
          .filter((e) => e.isTaxable)
          .reduce((sum: number, e) => sum + e.amount, 0);
        const nontaxableAllowances = processedEarnings
          .filter((e) => !e.isTaxable)
          .reduce((sum: number, e) => sum + e.amount, 0);
        const recurringDeductionTotal = processedDeductions
          .reduce((sum: number, d) => sum + d.amount, 0);
        const taxDeductibleDeductions = processedDeductions
          .filter((d) => d.isTaxDeductible)
          .reduce((sum: number, d) => sum + d.amount, 0);

        // Insert employee payroll run line
        const [runEmployeeLine] = await tx.insert(payrollRunEmployees)
          .values({
            payrollRunId: newRun.id,
            employeeId: emp.id,
            basicSalary: calcs.basicSalary.toFixed(2),
            grossSalary: calcs.grossSalary.toFixed(2),
            netSalary: calcs.netSalary.toFixed(2),
            paye: calcs.payeRaw.toFixed(2),
            aidsLevy: calcs.aidsLevy.toFixed(2),
            nssaEmployee: calcs.nssaEmployee.toFixed(2),
            nssaEmployer: calcs.nssaEmployer.toFixed(2),
            necEmployee: calcs.necEmployee.toFixed(2),
            necEmployer: calcs.necEmployer.toFixed(2),
            usdPercentage: calcs.usdPercentage.toFixed(2),
            zigPercentage: calcs.zigPercentage.toFixed(2),
            netSalaryUsd: calcs.netSalaryUsd.toFixed(2),
            netSalaryZig: calcs.netSalaryZig.toFixed(2),
            payeUsd: calcs.payeUsd.toFixed(2),
            payeZig: calcs.payeZig.toFixed(2),
            nssaEmployeeUsd: calcs.nssaEmployeeUsd.toFixed(2),
            nssaEmployeeZig: calcs.nssaEmployeeZig.toFixed(2),
            totalAllowances: calcs.totalAllowances.toFixed(2),
            totalDeductions: calcs.totalDeductions.toFixed(2),
            snapshotData: buildPayrollSnapshot({
              ...calcs,
              taxConfigId: taxConfig.id,
              contractId: contract.id,
              calculationBasis: "INITIAL_RUN",
              loanId: activeLoan?.id || null,
              loanDeduction,
              recurringItemIds: recurringItems.map((item: any) => item.id),
              taxableAllowances,
              nontaxableAllowances,
              recurringDeductionTotal,
              taxDeductibleDeductions,
              pensionEmployeeRate,
              pensionEmployerRate,
              statutoryRatesUsed: {
                aidsLevyRate: calcs.aidsLevy > 0 ? statutoryRules["AIDS_LEVY"]?.employeeRate ?? taxConfig.aidsLevyRate : taxConfig.aidsLevyRate,
                nssaRateEmployee: statutoryRules["NSSA_POBS"]?.employeeRate ?? taxConfig.nssaRateEmployee,
                nssaRateEmployer: statutoryRules["NSSA_POBS"]?.employerRate ?? taxConfig.nssaRateEmployer,
                nssaCeilingLimit: statutoryRules["NSSA_POBS"]?.ceilingAmount ?? taxConfig.nssaCeilingLimit,
                zimdefRate: statutoryRules["ZIMDEF"]?.employerRate ?? "0.010000",
                standardsLevyRate: (statutoryRules["STANDARDS_LEVY"] || statutoryRules["STANDARDS"])?.employerRate ?? "0.005000",
                apwcsRate: statutoryRules["APWCS"]?.employerRate ?? null,
                pensionEmployeeRate,
                pensionEmployerRate,
              },
            })
          })
          .returning();

        if (processedEarnings.length > 0) {
          await tx.insert(payrollAllowances).values(processedEarnings.map((e) => ({
            payrollRunEmployeeId: runEmployeeLine.id,
            name: e.name,
            amount: e.amount.toFixed(2),
            isTaxable: !!e.isTaxable,
            isCash: true,
            allowanceType: classifyRecurringAllowance(e.name),
          })));
        }

        const statutoryDeductions = [
          { name: "PAYE", amount: calcs.payeRaw, isTaxDeductible: false, deductionType: "PAYE" },
          { name: "AIDS Levy", amount: calcs.aidsLevy, isTaxDeductible: false, deductionType: "AIDS_LEVY" },
          { name: "NSSA Employee", amount: calcs.nssaEmployee, isTaxDeductible: true, deductionType: "NSSA" },
          { name: "NEC Employee", amount: calcs.necEmployee, isTaxDeductible: false, deductionType: "NEC" },
          { name: "Pension Employee", amount: calcs.pensionEmployee, isTaxDeductible: true, deductionType: "PENSION" },
        ].filter((item) => item.amount > 0);

        const employeeDeductions = processedDeductions.map((d) => ({
          payrollRunEmployeeId: runEmployeeLine.id,
          name: d.name,
          amount: d.amount.toFixed(2),
          isTaxDeductible: !!d.isTaxDeductible,
          deductionType: d.name === "Loan repayment" ? "LOAN_REPAYMENT" : classifyRecurringDeduction(d.name),
        }));

        const deductionLines = [
          ...statutoryDeductions.map((item) => ({
            payrollRunEmployeeId: runEmployeeLine.id,
            name: item.name,
            amount: item.amount.toFixed(2),
            isTaxDeductible: item.isTaxDeductible,
            deductionType: item.deductionType,
          })),
          ...employeeDeductions,
        ];
        if (deductionLines.length > 0) {
          await tx.insert(payrollDeductions).values(deductionLines);
        }
      }

      // 4. Update run metrics totals
      const lines = await tx.select().from(payrollRunEmployees).where(eq(payrollRunEmployees.payrollRunId, newRun.id));
      let totalBasic = 0;
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      for (const line of lines) {
        totalBasic += parseFloat(line.basicSalary);
        totalGross += parseFloat(line.grossSalary);
        totalDeductions += parseFloat(line.totalDeductions);
        totalNet += parseFloat(line.netSalary);
      }

      const [updatedRun] = await tx.update(payrollRuns)
        .set({
          totalBasic: totalBasic.toFixed(2),
          totalGross: totalGross.toFixed(2),
          totalDeductions: totalDeductions.toFixed(2),
          totalNet: totalNet.toFixed(2),
        })
        .where(eq(payrollRuns.id, newRun.id))
        .returning();

      return updatedRun;
    });

    await auditPayroll(req, "PAYROLL_RUN_CREATED", "payroll_runs", run.id, {
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      currency: run.currency,
      totalNet: run.totalNet,
    });
    res.status(201).json(run);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// PUT /runs/:id/adjustments - Update allowances, overtime, adjustments
// GET /runs/:id/variances - Prior month comparison variances
// POST /runs/:id/submit-for-approval - Move a DRAFT run into the approval queue
router.post("/runs/:id/submit-for-approval", requirePayrollWrite, async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);
    if (!run) return res.status(404).json({ message: "Payroll run not found" });
    if (run.status === "LOCKED") return res.status(422).json({ message: "Locked payroll runs cannot be resubmitted" });
    if (run.status === "APPROVED") return res.status(422).json({ message: "Payroll run is already approved" });

    const [updated] = await db.update(payrollRuns)
      .set({ status: "PENDING_APPROVAL", updatedAt: new Date() })
      .where(eq(payrollRuns.id, runId))
      .returning();

    await auditPayroll(req, "PAYROLL_RUN_SUBMITTED", "payroll_runs", runId, {
      periodStart: updated.periodStart,
      periodEnd: updated.periodEnd,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /runs/:id/approve - Formal approval before locking and accounting postings
router.post("/runs/:id/approve", requirePayrollApproval, async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const userId = (req as any).user?.id;
  try {
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);
    if (!run) return res.status(404).json({ message: "Payroll run not found" });
    if (run.status === "LOCKED") return res.status(422).json({ message: "Locked payroll runs cannot be approved again" });

    const [updated] = await db.update(payrollRuns)
      .set({
        status: "APPROVED",
        approvedBy: userId || null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payrollRuns.id, runId))
      .returning();

    await auditPayroll(req, "PAYROLL_RUN_APPROVED", "payroll_runs", runId, {
      periodStart: updated.periodStart,
      periodEnd: updated.periodEnd,
      totalNet: updated.totalNet,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /runs/:id/lock - Commit run and generate double entry journals
router.post("/runs/:id/lock", requirePayrollApproval, async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const userId = (req as any).user?.id;
  try {
    const run = await db.query.payrollRuns.findFirst({
      where: and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId))
    });
    if (!run) return res.status(404).json({ message: "Payroll run not found" });
    if (run.status === "LOCKED") return res.status(422).json({ message: "Payroll run is already locked" });
    if (run.status !== "APPROVED") return res.status(422).json({ message: "Approve payroll before locking" });

    // Fetch employee lines
    const lines = await db.select().from(payrollRunEmployees).where(eq(payrollRunEmployees.payrollRunId, runId));

    await db.transaction(async (tx) => {
      // 1. Post to double-entry general ledger
      // A. Create Draft Journal Entry
      const [draft] = await tx.insert(journalEntryDrafts).values({
        companyId,
        entryDate: new Date(),
        description: `Payroll Journal - Period Ending ${run.periodEnd}`,
        referenceType: "PAYROLL",
        referenceId: runId.toString(),
        status: "PENDING_APPROVAL",
        createdBy: userId || null
      }).returning();

      // B. Retrieve default accounts (fallback if mapping is not configured)
      const accountsList = await tx.select().from(accounts).where(eq(accounts.companyId, companyId));
      const getAccount = (type: string, code: string) => {
        return accountsList.find(a => a.code === code) || accountsList.find(a => a.type === type) || accountsList[0];
      };

      // Aggregate values
      let totalBasic = 0, totalPaye = 0, totalNssaEmployee = 0, totalNssaEmployer = 0, totalNecEmployee = 0, totalNet = 0;
      let totalNetUsd = 0, totalNetZig = 0;

      for (const line of lines) {
        totalBasic += parseFloat(line.basicSalary);
        totalPaye += parseFloat(line.paye) + parseFloat(line.aidsLevy);
        totalNssaEmployee += parseFloat(line.nssaEmployee);
        totalNssaEmployer += parseFloat(line.nssaEmployer);
        totalNecEmployee += parseFloat(line.necEmployee);
        totalNet += parseFloat(line.netSalary);
        totalNetUsd += parseFloat(line.netSalaryUsd);
        totalNetZig += parseFloat(line.netSalaryZig);

        // Update outstanding loan balances and record installments
        const loanId = (line.snapshotData as any).loanId;
        const loanDeduction = (line.snapshotData as any).loanDeduction;
        if (loanId && loanDeduction > 0) {
          const [loan] = await tx.select().from(employeeLoans).where(eq(employeeLoans.id, loanId)).limit(1);
          if (loan) {
            const nextBal = Math.max(0, parseFloat(loan.remainingBalance) - loanDeduction);
            const status = nextBal === 0 ? "COMPLETED" : "ACTIVE";
            
            // Deduct loan balance
            await tx.update(employeeLoans)
              .set({ remainingBalance: nextBal.toFixed(2), status })
              .where(eq(employeeLoans.id, loanId));

            // Create loan installment record
            await tx.insert(loanInstallments).values({
              loanId,
              payrollRunEmployeeId: line.id,
              amountPaid: loanDeduction.toFixed(2),
              principalPaid: loanDeduction.toFixed(2),
              interestPaid: "0.00",
              remainingBalanceAfter: nextBal.toFixed(2)
            });
          }
        }
      }

      const basicSalariesAcc = getAccount("EXPENSE", "6000");
      const netSalariesAcc = getAccount("LIABILITY", "2000");
      const payeAcc = getAccount("LIABILITY", "2100");
      const nssaAcc = getAccount("LIABILITY", "2110");
      
      const journalLines = [
        { draftId: draft.id, accountId: basicSalariesAcc.id, type: "DEBIT", amount: totalBasic.toFixed(2), currency: run.currency },
        { draftId: draft.id, accountId: netSalariesAcc.id, type: "CREDIT", amount: totalNet.toFixed(2), currency: run.currency },
        { draftId: draft.id, accountId: payeAcc.id, type: "CREDIT", amount: totalPaye.toFixed(2), currency: run.currency },
        { draftId: draft.id, accountId: nssaAcc.id, type: "CREDIT", amount: (totalNssaEmployee + totalNssaEmployer).toFixed(2), currency: run.currency },
      ];
      await tx.insert(journalEntryDraftLines).values(journalLines);

      // 2. Lock Payroll Run
      await tx.update(payrollRuns)
        .set({ 
          status: "LOCKED",
          lockedBy: userId || null,
          lockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payrollRuns.id, runId));
    });

    await auditPayroll(req, "PAYROLL_RUN_LOCKED", "payroll_runs", runId, {
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      totalNet: run.totalNet,
    });
    res.json({ success: true, status: "LOCKED" });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /runs/:id/rollback - Rollback a locked run, creating offsetting journals
// --- 9. BANK TRANSFER CSV EXPORTS & ECOCASH BULK PAYOUTS ---

router.post("/runs/:id/export/ecocash", async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const run = await db.query.payrollRuns.findFirst({
      where: and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId))
    });
    if (!run) return res.status(404).json({ message: "Payroll run not found" });

    // Retrieve and decrypt EcoCash Merchant API credentials
    const [cred] = await db.select()
      .from(tenantIntegrationCredentials)
      .where(and(
        eq(tenantIntegrationCredentials.companyId, companyId),
        eq(tenantIntegrationCredentials.integrationType, "ECOCASH_BULK_PAYOUT")
      ))
      .limit(1);

    if (!cred) {
      return res.status(400).json({ message: "EcoCash integration credentials not configured" });
    }

    const credsObj = JSON.parse(decrypt(cred.credentialData));
    const merchantCode = credsObj.merchantCode;
    const merchantPin = credsObj.pin;

    // Fetch employee lines with ecocash mobile wallets
    const lines = await db.query.payrollRunEmployees.findMany({
      where: eq(payrollRunEmployees.payrollRunId, runId),
      with: { employee: true }
    });

    const ecocashPayments = lines
      .filter(l => l.employee.ecocashNumber)
      .map(l => ({
        subscriberNumber: l.employee.ecocashNumber,
        amount: parseFloat(l.netSalaryUsd), // Payout ratio partition
        reference: `PAY-${l.id}`,
        narrative: `Salary Period End ${run.periodEnd}`
      }));

    if (ecocashPayments.length === 0) {
      return res.status(400).json({ message: "No employees in this run have EcoCash wallet numbers registered" });
    }

    // Mock EcoCash API request transmission
    const batchRequest = {
      originator: { merchantCode, pin: merchantPin },
      batchName: `SALARY_RUN_${runId}`,
      currency: "USD",
      transactions: ecocashPayments
    };

    console.log("[ECOCASH GATEWAY] Transmitting Bulk Payout request:", JSON.stringify(batchRequest, null, 2));

    // Create payment batch record
    const [batch] = await db.insert(paymentBatches)
      .values({
        companyId,
        name: `EcoCash Salary Batch - Run #${runId}`,
        paymentMethod: "ECOCASH",
        currency: "USD",
        totalAmount: ecocashPayments.reduce((sum, p) => sum + p.amount, 0).toFixed(2),
        status: "TRANSMITTED",
        exportedAt: new Date()
      })
      .returning();

    await db.insert(payrollIntegrationEvents).values({
      companyId,
      integrationType: "ECOCASH",
      entityType: "payment_batches",
      entityId: String(batch.id),
      direction: "OUTBOUND",
      status: "TRANSMITTED",
      requestPayload: batchRequest,
      responsePayload: { transactionsSent: ecocashPayments.length },
    });

    // Insert payment batch lines
    for (const l of lines.filter(l => l.employee.ecocashNumber)) {
      await db.insert(paymentBatchDetails)
        .values({
          batchId: batch.id,
          payrollRunEmployeeId: l.id,
          amount: l.netSalaryUsd,
          status: "SUCCESS"
        });
        
      // Mark payslip as paid
      await db.update(payrollRunEmployees)
        .set({ isPaid: true, paidAt: new Date(), paymentReference: `ECOCASH-BATCH-${batch.id}` })
        .where(eq(payrollRunEmployees.id, l.id));
    }

    await auditPayroll(req, "PAYROLL_ECOCASH_BATCH_TRANSMITTED", "payment_batches", batch.id, {
      payrollRunId: runId,
      transactionsSent: ecocashPayments.length,
    });
    res.json({ success: true, batchId: batch.id, status: "TRANSMITTED", transactionsSent: ecocashPayments.length });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- 10. EXTENSION-READY ATTENDANCE, DOCUMENTS, PAYSLIPS & REPORTS ---
router.get("/attendance/imports", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.select().from(payrollAttendanceImports)
      .where(eq(payrollAttendanceImports.companyId, companyId))
      .orderBy(desc(payrollAttendanceImports.createdAt));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/attendance/imports", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    source: z.string().default("MANUAL"),
    provider: z.string().optional().nullable(),
    periodStart: z.string(),
    periodEnd: z.string(),
    branchId: z.coerce.number().int().optional().nullable(),
    rowCount: z.coerce.number().int().default(0),
    summaryData: z.record(z.any()).default({}),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });
  try {
    const companyId = getTargetCompanyId(req);
    const [record] = await db.insert(payrollAttendanceImports)
      .values({ ...parsed.data, companyId, importedBy: (req as any).user?.id || null })
      .returning();
    await auditPayroll(req, "PAYROLL_ATTENDANCE_IMPORT_CREATED", "payroll_attendance_imports", record.id, {
      source: record.source,
      provider: record.provider,
      rowCount: record.rowCount,
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/employees/:id/documents", async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const docs = await db.select().from(employeeDocuments)
      .where(and(eq(employeeDocuments.companyId, companyId), eq(employeeDocuments.employeeId, employeeId)))
      .orderBy(desc(employeeDocuments.createdAt));
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/employees/:id/documents", requirePayrollWrite, async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const schema = z.object({
    documentType: z.string(),
    fileName: z.string(),
    fileUrl: z.string(),
    mimeType: z.string().optional().nullable(),
    fileHash: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.errors });
  try {
    const companyId = getTargetCompanyId(req);
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.id, employeeId)))
      .limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const [doc] = await db.insert(employeeDocuments)
      .values({ ...parsed.data, companyId, employeeId, uploadedBy: (req as any).user?.id || null })
      .returning();
    await auditPayroll(req, "PAYROLL_EMPLOYEE_DOCUMENT_ADDED", "employee_documents", doc.id, {
      employeeId,
      documentType: doc.documentType,
    });
    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});
























router.get("/report/csv", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const month = typeof req.query.month === "string" ? req.query.month : monthStartIso().slice(0, 7);
    const csvData = await reportService.generatePayrollReport(companyId, month);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payroll_report_${month}.csv"`);
    res.send(csvData);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/report/payslip/:employeeId", async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId, 10);
    const period = typeof req.query.period === "string" ? req.query.period : monthStartIso().slice(0, 7);
    const pdfData = await reportService.generatePayslip(employeeId, period);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip_${employeeId}_${period}.pdf"`);
    res.send(Buffer.from(pdfData));
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});



// Get detailed payslips for a specific payroll run
router.get("/runs/:runId/payslips", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const runId = parseInt(req.params.runId);
    
    // Verify run belongs to company
    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ error: "NOT_FOUND" });

    // Join with employees
    const records = await db.select({
      runData: payrollRunEmployees,
      employee: employees,
    })
      .from(payrollRunEmployees)
      .innerJoin(employees, eq(payrollRunEmployees.employeeId, employees.id))
      .where(eq(payrollRunEmployees.payrollRunId, runId))
      .orderBy(employees.firstName);

    res.json({ run, payslips: records });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// Download Bank Export CSV
router.get("/runs/:runId/bank-export", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const runId = parseInt(req.params.runId);
    
    // Verify run and get company details
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ error: "NOT_FOUND", message: "Company not found" });

    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ error: "NOT_FOUND", message: "Run not found" });

    const records = await db.select({
      runData: payrollRunEmployees,
      employee: employees,
    })
      .from(payrollRunEmployees)
      .innerJoin(employees, eq(payrollRunEmployees.employeeId, employees.id))
      .where(eq(payrollRunEmployees.payrollRunId, runId))
      .orderBy(employees.firstName);

    // Get formatting config from company metadata, or fallback to default
    const formatConfig = company.payrollBankExportFormat || {
      columns: [
        { label: "Account Name", field: "employee.lastName" },
        { label: "Account Number", field: "employee.bankAccountNumber" },
        { label: "Bank Name", field: "employee.bankName" },
        { label: "Branch Code", field: "employee.bankBranch" },
        { label: "Amount", field: "runData.netSalary" },
        { label: "Reference", field: "static", value: `SALARY ${run.periodStart}` }
      ]
    };

    let csvContent = "";
    
    // Add headers
    // @ts-ignore
    csvContent += formatConfig.columns.map((c: any) => `"${c.label}"`).join(",") + "\n";

    // Add rows
    records.forEach(({ runData, employee }) => {
      // @ts-ignore
      const row = formatConfig.columns.map((col: any) => {
        let val = "";
        if (col.field === 'employee.lastName') val = `${employee.firstName} ${employee.lastName}`;
        else if (col.field === 'employee.bankAccountNumber') val = employee.bankAccountNumber || "";
        else if (col.field === 'employee.bankName') val = employee.bankName || "";
        else if (col.field === 'employee.bankBranch') val = employee.bankBranch || "";
        else if (col.field === 'runData.netSalary') val = runData.netSalary || "0.00";
        else if (col.field === 'static') val = col.value;
        return `"${val}"`;
      });
      csvContent += row.join(",") + "\n";
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bank_export_run_${runId}.csv"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// --- ZIMRA STATUTORY EXPORTS ---

// ITF16: Annual income-tax return per employee (CSV download)
router.get("/exports/itf16", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const taxYear = req.query.taxYear ? String(req.query.taxYear) : String(new Date().getFullYear());

  try {
    const startDate = `${taxYear}-01-01`;
    const endDate = `${taxYear}-12-31`;

    const runs = await db.select({ id: payrollRuns.id }).from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        gte(payrollRuns.periodStart, startDate),
        lte(payrollRuns.periodEnd, endDate)
      ));

    if (runs.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=ITF16_${taxYear}.csv`);
      return res.send("Employee ID,Surname,First Name,Tax Year,Period Employed (months),Total Gross Income,Total Taxable Income,Total PAYE,Total AIDS Levy,Total Medical Aid Credits,Total Net PAYE Payable\n");
    }

    const runIds = runs.map(r => r.id);
    const lines = await db.query.payrollRunEmployees.findMany({
      where: inArray(payrollRunEmployees.payrollRunId, runIds),
      with: { employee: true }
    });

    const agg: Record<number, any> = {};
    for (const line of lines) {
      const eid = line.employeeId;
      if (!agg[eid]) {
        agg[eid] = { emp: line.employee, months: 0, gross: 0, taxable: 0, paye: 0, aids: 0, medical: 0, netPaye: 0 };
      }
      agg[eid].months++;
      agg[eid].gross += parseFloat(line.grossSalary);
      agg[eid].taxable += parseFloat(line.basicSalary) + parseFloat(line.totalAllowances);
      agg[eid].paye += parseFloat(line.paye);
      agg[eid].aids += parseFloat(line.aidsLevy);
      agg[eid].netPaye += parseFloat(line.paye) + parseFloat(line.aidsLevy);
    }

    let csv = "Employee ID,Surname,First Name,Tax Year,Period Employed (months),Total Gross Income,Total Taxable Income,Total PAYE,Total AIDS Levy,Total Medical Aid Credits,Total Net PAYE Payable\n";
    for (const [eid, data] of Object.entries(agg)) {
      csv += `${data.emp.nationalId || eid},${data.emp.lastName || ''},${data.emp.firstName || ''},${taxYear},${data.months},${data.gross.toFixed(2)},${data.taxable.toFixed(2)},${data.paye.toFixed(2)},${data.aids.toFixed(2)},0.00,${data.netPaye.toFixed(2)}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ITF16_${taxYear}.csv`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// P2: Monthly PAYE remittance summary
router.get("/exports/p2", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const month = req.query.month ? String(req.query.month) : new Date().toISOString().slice(0, 7);

  try {
    const periodStart = `${month}-01`;
    const periodEnd = `${month}-31`;

    const runs = await db.query.payrollRuns.findMany({
      where: and(
        eq(payrollRuns.companyId, companyId),
        gte(payrollRuns.periodStart, periodStart),
        lte(payrollRuns.periodStart, periodEnd)
      )
    });

    let totalGross = 0;
    let totalPaye = 0;
    let totalAids = 0;
    let count = 0;

    for (const run of runs) {
      totalGross += parseFloat(run.totalGross || "0");
      const lines = await db.select({ paye: payrollRunEmployees.paye, aids: payrollRunEmployees.aidsLevy })
        .from(payrollRunEmployees)
        .where(eq(payrollRunEmployees.payrollRunId, run.id));
      count += lines.length;
      for (const line of lines) {
        totalPaye += parseFloat(line.paye);
        totalAids += parseFloat(line.aids);
      }
    }

    res.json({
      month,
      employeeCount: count,
      totalGross: totalGross.toFixed(2),
      totalPaye: totalPaye.toFixed(2),
      totalAids: totalAids.toFixed(2),
      totalRemittable: (totalPaye + totalAids).toFixed(2),
    });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// ZIMDEF + Standards Levy: monthly employer levy summary
router.get("/exports/zimdef", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const month = req.query.month ? String(req.query.month) : new Date().toISOString().slice(0, 7);

  try {
    const periodStart = `${month}-01`;
    const periodEnd = `${month}-31`;

    const runs = await db.query.payrollRuns.findMany({
      where: and(
        eq(payrollRuns.companyId, companyId),
        gte(payrollRuns.periodStart, periodStart),
        lte(payrollRuns.periodStart, periodEnd)
      )
    });

    let totalGross = 0;
    for (const run of runs) {
      totalGross += parseFloat(run.totalGross || "0");
    }

    const zimdef = totalGross * 0.01;
    const standards = totalGross * 0.005;

    res.json({
      month,
      totalGrossWageBill: totalGross.toFixed(2),
      zimdefAmount: zimdef.toFixed(2),
      standardsLevyAmount: standards.toFixed(2),
      totalDue: (zimdef + standards).toFixed(2),
    });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
