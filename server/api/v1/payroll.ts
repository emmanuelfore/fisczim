import { Router } from "express";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { db } from "../../db.js";
import { 
  branches, employees, employeeContracts, departments, positions, 
  necSectorsConfig, payrollTaxTables, payrollTaxBrackets, payrollRuns, payrollRunEmployees,
  payrollAllowances, payrollDeductions, payrollRecurringItems, leaveRequests, leaveBalances,
  employeeLoans, loanInstallments, tenantIntegrationCredentials,
  accounts, companyUsers, auditLogs, payrollAttendanceImports,
  employeeDocuments, payslipDocuments, payrollPayGrades,
  payrollEarningTypes, payrollDeductionTypes, payrollStatutoryRules,
  payrollStatutoryReports, payrollReportExports, payrollReportValidationIssues,
  payrollStatutoryDeadlines, payrollImportBatches, payrollImportRows, companies,
  employeeSalaryChanges, payrollRemittances,
  users,
  employeeSalaryHistory, employeeEmploymentHistory,
  employeeIncomeHistory, employeeDeductionHistory, payrollCompanySettings
} from "../../../shared/schema.js";
import { eq, and, desc, asc, ne, sql, gte, lte, inArray, ilike, isNotNull } from "drizzle-orm";
import { taxYearTotalsByEmployee, taxTableLabels, labelForSnapshot } from "../../lib/payslip-evidence.js";
import { ZimbabwePayrollEngine, type TaxBracket, type PayrollElementInput } from "../../../shared/payroll-engine.js";
import { validateBrackets, canonicalizeBrackets } from "../../../shared/statutory/brackets.js";
import { ZIMBABWE_STATUTORY_DEFAULTS, isTaxTableStale } from "../../../shared/statutory/zimbabwe.js";
import { jurisdictionForCountry, jurisdictionLevies, missingRequiredRules, supportsCurrency, STATUTORY_RULE_CODES, type PayrollJurisdiction } from "../../../shared/statutory/jurisdictions.js";
import {
  EMPLOYEE_DOCUMENT_TYPES,
  isKnownDocumentType,
  documentExpiryState,
  staffFileStatus,
  EXPIRY_TRACKED_TYPES,
  nextStaffNumber,
} from "../../../shared/staff-file.js";
import { displayCurrency } from "../../../shared/currency.js";
import { computeProration, blendSalary, prorateAmount } from "../../../shared/proration.js";
import { reportService } from "../../services/reportService.js";
import { storage } from "../../storage.js";
import {
  buildPayrollJournal,
  reversePayrollJournal,
  PAYROLL_JOURNAL_ACCOUNT_KEYS,
  type PayrollJournalAccountKey,
} from "../../lib/payroll-journal.js";
import { logAction } from "../../audit.js";
import { sendPayslipEmail } from "../../email.js";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import multer from "multer";
import { userHasPermission } from "../../lib/permissions.js";
import sopRouter from "./payroll-sop.js";

const router = Router({ mergeParams: true });

// --- CRYPTOGRAPHY SECURITY VAULT UTILITIES ---
const CIPHER_ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const rawKey = process.env.PAYROLL_SECRET_KEY || process.env.SUPABASE_JWT_SECRET;
  if (!rawKey) {
    throw new Error("PAYROLL_SECRET_KEY must be configured before storing payroll integration credentials");
  }
  return crypto.createHash("sha256").update(rawKey).digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv) as crypto.CipherGCM;
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

// Helper to resolve company context from session/API headers
export function getTargetCompanyId(req: any): number {
  if (req.company?.id) return req.company.id;
  if (req.params.companyId) return parseInt(req.params.companyId, 10);
  throw new Error("Missing company context");
}

export const PAYROLL_READ_ROLES = new Set(["owner", "admin", "finance_director", "hr_manager", "payroll_clerk"]);
export const PAYROLL_WRITE_ROLES = new Set(["owner", "admin", "finance_director", "hr_manager", "payroll_clerk"]);
export const PAYROLL_APPROVAL_ROLES = new Set(["owner", "admin", "finance_director"]);

export async function resolvePayrollRole(req: any, companyId: number): Promise<string | null> {
  if (req.user?.isSuperAdmin) return "owner";
  const userId = req.user?.id;
  if (!userId) return null;
  const [membership] = await db.select({ role: companyUsers.role })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)))
    .limit(1);
  return membership?.role || null;
}

// --- EMPLOYEE SELF-SERVICE (registered BEFORE the payroll.view permission
// gate so employees without HR roles can access their own data) ---

// GET /self-service - the authenticated user's own HR data (matched by email)
router.get("/self-service", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const userEmail = (req.user?.email || "").toLowerCase();
    if (!userEmail) return res.status(401).json({ error: "UNAUTHORIZED", message: "No user email on session" });

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.companyId, companyId), ilike(employees.email, userEmail)))
      .limit(1);
    if (!emp) return res.status(404).json({ error: "NOT_FOUND", message: "No employee record linked to this account" });

    const balances = await db.select().from(leaveBalances)
      .where(eq(leaveBalances.employeeId, emp.id));
    const requests = await db.select().from(leaveRequests)
      .where(eq(leaveRequests.employeeId, emp.id))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(20);

    const since = new Date();
    since.setFullYear(since.getFullYear() - 2);
    const payslips = await db.query.payrollRunEmployees.findMany({
      where: and(
        eq(payrollRunEmployees.employeeId, emp.id),
        sql`${payrollRunEmployees.createdAt} >= ${since.toISOString()}`
      ),
      with: { payrollRun: true },
      orderBy: [desc(payrollRunEmployees.createdAt)],
      limit: 100,
    });

    res.json({
      employee: emp,
      leaveBalances: balances,
      leaveRequests: requests,
      payslips: payslips
        .filter((p) => p.payrollRun && p.payrollRun.companyId === companyId && p.payrollRun.status === "LOCKED")
        .map((p) => ({
          runId: p.payrollRun.id,
          periodStart: p.payrollRun.periodStart,
          periodEnd: p.payrollRun.periodEnd,
          currency: p.payrollRun.currency,
          grossSalary: p.grossSalary,
          paye: p.paye,
          aidsLevy: p.aidsLevy,
          nssaEmployee: p.nssaEmployee,
          totalDeductions: p.totalDeductions,
          netSalary: p.netSalary,
        })),
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /self-service/leave - employee submits their own leave request
router.post("/self-service/leave", async (req, res) => {
  const schema = z.object({
    leaveType: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const userEmail = (req.user?.email || "").toLowerCase();
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.companyId, companyId), ilike(employees.email, userEmail)))
      .limit(1);
    if (!emp) return res.status(404).json({ error: "NOT_FOUND", message: "No employee record linked to this account" });

    const start = new Date(parsed.data.startDate);
    const end = new Date(parsed.data.endDate);
    const workingDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

    const [balance] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.leaveType, parsed.data.leaveType)))
      .limit(1);
    if (balance && parseFloat(balance.availableDays) < workingDays) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `Insufficient leave balance (${balance.availableDays} days available for ${parsed.data.leaveType})`,
      });
    }

    // Labour Act: Paternity leave is 3 working days
    if (parsed.data.leaveType === "PATERNITY" && workingDays > 3) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Paternity leave is limited to 3 working days per the Zimbabwe Labour Act",
      });
    }

    // Labour Act: Maternity leave is 98 consecutive days minimum
    if (parsed.data.leaveType === "MATERNITY" && workingDays < 98) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Maternity leave must be at least 98 consecutive days per the Zimbabwe Labour Act",
      });
    }

    const [request] = await db.insert(leaveRequests).values({
      companyId,
      employeeId: emp.id,
      leaveType: parsed.data.leaveType,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      totalDays: workingDays,
      reason: parsed.data.reason,
      status: "PENDING",
    }).returning();

    await auditPayroll(req, "PAYROLL_LEAVE_REQUESTED", "leave_requests", request.id, {
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
      days: workingDays,
    });
    res.status(201).json(request);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// DELETE /self-service/leave/:id - employee cancels their own pending leave request
router.delete("/self-service/leave/:id", async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  try {
    const companyId = getTargetCompanyId(req);
    const userEmail = (req.user?.email || "").toLowerCase();
    
    // verify ownership
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.companyId, companyId), ilike(employees.email, userEmail)))
      .limit(1);
    if (!emp) return res.status(404).json({ error: "NOT_FOUND", message: "No employee record linked to this account" });

    const [request] = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.employeeId, emp.id)))
      .limit(1);

    if (!request) return res.status(404).json({ error: "NOT_FOUND", message: "Request not found" });
    if (request.status !== "PENDING") {
      return res.status(400).json({ error: "STATE_ERROR", message: "Only PENDING requests can be cancelled" });
    }

    await db.delete(leaveRequests).where(eq(leaveRequests.id, requestId));
    await auditPayroll(req, "PAYROLL_LEAVE_CANCELLED", "leave_requests", requestId, {
      leaveType: request.leaveType,
    });

    res.json({ success: true });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// PUT /self-service/profile - employee updates their own contact details
router.put("/self-service/profile", async (req, res) => {
  const schema = z.object({
    email: z.string().email().optional(),
    phone: z.string().optional().nullable(),
    emergencyContactName: z.string().optional().nullable(),
    emergencyContactPhone: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const userEmail = (req.user?.email || "").toLowerCase();
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.companyId, companyId), ilike(employees.email, userEmail)))
      .limit(1);
    if (!emp) return res.status(404).json({ error: "NOT_FOUND", message: "No employee record linked to this account" });

    const updates: Record<string, unknown> = {};
    if (parsed.data.email) updates.email = parsed.data.email;
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
    if (parsed.data.emergencyContactName !== undefined) updates.emergencyContactName = parsed.data.emergencyContactName;
    if (parsed.data.emergencyContactPhone !== undefined) updates.emergencyContactPhone = parsed.data.emergencyContactPhone;

    const [updated] = await db.update(employees)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(employees.id, emp.id))
      .returning();

    await auditPayroll(req, "PAYROLL_SELF_SERVICE_PROFILE_UPDATED", "employees", emp.id, {
      changedFields: Object.keys(updates),
    });
    res.json(updated);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// GET /self-service/payslip/:runId - employee downloads their own payslip PDF
// (matches employee by login email, run must be LOCKED and contain the employee)
router.get("/self-service/payslip/:runId", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const runId = parseInt(req.params.runId, 10);
    const userEmail = (req.user?.email || "").toLowerCase();
    if (!userEmail) return res.status(401).json({ error: "UNAUTHORIZED", message: "No user email on session" });
    if (!Number.isInteger(runId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid run id" });

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.companyId, companyId), ilike(employees.email, userEmail)))
      .limit(1);
    if (!emp) return res.status(404).json({ error: "NOT_FOUND", message: "No employee record linked to this account" });

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);
    if (!run) return res.status(404).json({ error: "NOT_FOUND", message: "Payroll run not found" });
    if (run.status !== "LOCKED") {
      return res.status(403).json({ error: "FORBIDDEN", message: "Payslips are available after the run is locked" });
    }

    const [line] = await db.select().from(payrollRunEmployees)
      .where(and(eq(payrollRunEmployees.payrollRunId, runId), eq(payrollRunEmployees.employeeId, emp.id)))
      .limit(1);
    if (!line) return res.status(404).json({ error: "NOT_FOUND", message: "No payslip for this employee in that run" });

    const pdfData = await reportService.generatePayslip(companyId, emp.id, run.periodStart.slice(0, 7), runId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="payslip_${run.periodStart.slice(0, 7)}.pdf"`);
    res.send(Buffer.from(pdfData));
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// --- PROCEDURES (registered BEFORE the payroll.view gate) ---
//
// A read-and-sign procedure is aimed at the whole staff, not at the people who can see
// payroll figures. Behind the gate below, an employee without payroll.view could never
// list their own outstanding sign-offs or sign one, so the control would only ever work
// for managers. The router carries its own guards: membership of the company for the
// reader paths, payroll.view/write/approve for everything else.
router.use("/sop", sopRouter);

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
    respondPayrollError(res, err);
  }
});

export async function requirePayrollWrite(req: any, res: any, next: any) {
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
    respondPayrollError(res, err);
  }
}

export async function requirePayrollApproval(req: any, res: any, next: any) {
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
    respondPayrollError(res, err);
  }
}

export async function auditPayroll(req: any, action: string, entityType: string, entityId?: string | number, details?: Record<string, unknown>) {
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

/** pg returns decimal columns as strings; NaN would silently poison a filing. */
export function toNumber(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toMoney(value: unknown): number {
  return toNumber(value);
}

function moneyString(value: unknown): string {
  return toMoney(value).toFixed(2);
}

/** A failure this router can describe to the client. Anything else is a 500. */
class PayrollHttpError extends Error {
  constructor(public status: number, message: string, public code: string = "PAYROLL_REQUEST_FAILED") {
    super(message);
  }
}

/**
 * Payslip lines the calculator owns. They are derived from gross pay, so a
 * clerk cannot key them and an edit to the payslip has to recompute them.
 */
const ENGINE_DEDUCTION_TYPES = new Set(["PAYE", "AIDS_LEVY", "NSSA", "NEC", "PENSION"]);

/**
 * A rejected form has to say which field and why. The raw zod issue list is
 * still sent for a client that wants to mark the inputs, but the message is what
 * a clerk reads in a toast.
 */
export function respondValidationErrors(res: any, issues: any[]): void {
  const describe = (issue: any) => `${(issue?.path || []).join(".") || "value"}: ${issue?.message}`;
  const named = (issues || []).slice(0, 3).map(describe).join("; ");
  const more = (issues || []).length > 3 ? ` (+${issues.length - 3} more)` : "";
  res.status(400).json({
    error: "VALIDATION_ERROR",
    message: `Check the form - ${named}${more}`,
    details: issues,
  });
}

/**
 * Failures with a name are the tenant's to fix; the ledger refusing a posting,
 * a duplicate key or a missing parent row is not a server crash, and a client
 * cannot branch on a 500 that carries a SQL message.
 */
export function respondPayrollError(res: any, err: any): void {
  if (err instanceof PayrollHttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  const message = String(err?.message || "Unexpected error");
  if (/not found for company|out of balance|at least two lines/i.test(message)) {
    res.status(422).json({ error: "PAYROLL_JOURNAL_REJECTED", message });
    return;
  }
  switch (err?.code) {
    case "23505": // unique_violation - e.g. two live rules for one period
      res.status(409).json({ error: "DUPLICATE_RECORD", message: "That record already exists for this period. Adjust the existing one or choose different dates." });
      return;
    case "23503": // foreign_key_violation - e.g. an employee id from another tenant
      res.status(422).json({ error: "RELATED_RECORD_MISSING", message: "The record references something that is not in this company. Reload the list and try again." });
      return;
    case "23502": // not_null_violation
      res.status(400).json({ error: "VALIDATION_ERROR", message: `A required field is missing${err?.column ? `: ${err.column}` : ""}.` });
      return;
    default:
      res.status(500).json({ error: "INTERNAL_ERROR", message });
  }
}

/**
 * snapshotData is jsonb, but rows written before the column was normalised can
 * arrive as a JSON string. Anything that will not parse reads as empty, so the
 * caller sees a missing statutory amount instead of a crash.
 */
function runSnapshot(value: unknown): Record<string, any> {
  if (value && typeof value === "object") return value as Record<string, any>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Which country's payroll rules a tenant's configuration belongs to. Read from
 * the company row rather than the deployment, because one instance can host
 * tenants from both markets.
 */
async function payrollJurisdiction(companyId: number): Promise<PayrollJurisdiction> {
  const [company] = await db.select({ country: companies.country }).from(companies).where(eq(companies.id, companyId));
  return jurisdictionForCountry(company?.country);
}

/**
 * A filing return is only valid where the levy behind it exists. Serving a
 * Zimbabwe-format return to a tenant whose payroll never charged the levy would
 * hand it a document to submit with figures no authority is owed, so the request
 * is refused by name instead.
 */
function respondsLevyNotCharged(
  res: any,
  jurisdiction: PayrollJurisdiction,
  label: string,
  ruleCodes: string[],
): boolean {
  if (ruleCodes.some((code) => jurisdictionLevies(jurisdiction, code))) return false;
  res.status(422).json({
    error: "REPORT_NOT_APPLICABLE",
    message: `${label} is not a ${jurisdiction.name} return - ${jurisdiction.name} payroll does not charge ${ruleCodes.join(" or ")}.`,
  });
  return true;
}

/** One rounding rule for money: to the cent, from a float sum. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Stored amounts are decimal(15,2), so adding them in cents is exact. Chaining
 * parseFloat over thousands of payslip lines drifts by rounding, and those sums
 * end up on ZIMRA returns and on the locked run's totals.
 */
function sumMoney(values: Iterable<unknown>): number {
  let cents = 0;
  for (const value of values) cents += Math.round(toMoney(value) * 100);
  return cents / 100;
}

/** The cents half of sumMoney, for per-employee accumulators that can't be a flat map. */
function centsOf(value: unknown): number {
  return Math.round(toMoney(value) * 100);
}

function centsToMoney(cents: number): number {
  return cents / 100;
}

function monthStartIso(date = new Date()): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1)).toISOString().slice(0, 10);
}

function monthEndIso(date = new Date()): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Real calendar bounds for a "yyyy-MM" selector. `${month}-31` is not a date in
 * February or in the 30-day months, so binding it makes the query fail outright.
 */
function monthBoundsIso(month: string): { start: string; end: string } {
  const start = `${month}-01`;
  const end = monthEndIso(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));
  return { start, end };
}

function requestedMonth(value: unknown): string | null {
  if (value == null || value === "") return new Date().toISOString().slice(0, 7);
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

export function todayLocalIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Calendar-safe "today plus n", still in the company's own timezone. */
export function addDaysIso(fromIso: string, days: number): string {
  const date = new Date(`${fromIso}T00:00:00`);
  date.setDate(date.getDate() + (Number.isFinite(days) ? days : 0));
  return todayLocalIso(date);
}

/** What the dashboard shows first: a blocker, then a warning, then a cleared check. */
function severityRank(severity: string): number {
  return severity === "BLOCK" ? 0 : severity === "WARN" ? 1 : 2;
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
  const variance = centsToMoney(centsOf(left) - centsOf(right));
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

async function loadActiveRecurringItems(tx: any, employeeId: number, periodStart: string, periodEnd: string, options?: { basis?: "CALENDAR_DAYS" | "WORKING_DAYS" | "PAYABLE_DAYS" | "HOURS_WORKED"; prorate?: boolean; joinDate?: string | null; terminationDate?: string | null }) {
  const rows = await tx.select()
    .from(payrollRecurringItems)
    .where(and(
      eq(payrollRecurringItems.employeeId, employeeId),
      eq(payrollRecurringItems.isActive, true),
      sql`${payrollRecurringItems.startDate} <= ${periodEnd}`,
      sql`(${payrollRecurringItems.endDate} IS NULL OR ${payrollRecurringItems.endDate} >= ${periodStart})`
    ));

  // An allowance/deduction that starts or ends inside the period (e.g. an
  // allowance effective from the 20th) is paid pro-rata for the days it ran,
  // on the same proration basis as the rest of the run. The employee's own
  // employment window is also honored so mid-period joiners/leavers only get
  // the item for the days they were actually employed.
  if (!options?.prorate) return rows;
  return rows.map((item: any) => {
    const fullAmount = toMoney(item.amount);
    const prorated = prorateAmount(fullAmount, item.startDate, item.endDate, periodStart, periodEnd, {
      basis: options.basis,
    }, { joinDate: options.joinDate, terminationDate: options.terminationDate });
    return { ...item, amount: prorated.toFixed(2), fullAmount, prorated: prorated !== fullAmount };
  });
}

// payroll_tax_tables + payroll_tax_brackets are the single source of tax truth.
// The legacy JSONB table (tax_tables_config) is no longer read by any code path.
async function loadTaxBrackets(tx: any, taxTableId: number): Promise<TaxBracket[]> {
  const rows = await tx.select()
    .from(payrollTaxBrackets)
    .where(eq(payrollTaxBrackets.taxTableId, taxTableId))
    .orderBy(asc(payrollTaxBrackets.bracketOrder));

  return rows.map((row: any) => ({
    min: Number(row.minIncome),
    max: row.maxIncome === null || row.maxIncome === undefined ? null : Number(row.maxIncome),
    rate: Number(row.rate),
    deduction: Number(row.deduction),
  }));
}

async function loadEffectiveTaxConfig(tx: any, currency: string, payFrequency: string, periodStart: string, periodEnd: string) {
  const [table] = await tx.select()
    .from(payrollTaxTables)
    .where(and(
      eq(payrollTaxTables.currency, currency),
      eq(payrollTaxTables.isActive, true),
      sql`${payrollTaxTables.effectiveFrom} <= ${periodEnd}`,
      sql`(${payrollTaxTables.effectiveTo} IS NULL OR ${payrollTaxTables.effectiveTo} >= ${periodStart})`
    ))
    .orderBy(desc(payrollTaxTables.effectiveFrom), desc(payrollTaxTables.version))
    .limit(1);

  if (!table) return null;

  const brackets = await loadTaxBrackets(tx, table.id);
  if (!brackets.length) {
    throw new Error(`Tax table ${table.id} for ${currency} has no bands. Refusing to run payroll on an empty tax table.`);
  }

  return {
    id: table.id,
    currency: table.currency,
    countryCode: table.countryCode,
    taxYear: table.taxYear,
    sourceReference: table.sourceReference,
    effectiveFrom: table.effectiveFrom,
    effectiveTo: table.effectiveTo,
    isActive: table.isActive,
    payFrequency,
    effectivePeriod: { from: table.effectiveFrom, to: table.effectiveTo },
    stale: isTaxTableStale(Number(table.taxYear)),
    brackets,
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

// ── Effective-period validation (never overwrite; never overlap) ───────────
// A record's [effectiveFrom, effectiveTo) period must be internally valid.
function assertValidPeriod(effectiveFrom: string | Date, effectiveTo?: string | Date | null): string | null {
  if (!effectiveFrom) return "effectiveFrom is required";
  const from = new Date(String(effectiveFrom));
  if (Number.isNaN(from.getTime())) return "effectiveFrom must be a valid date";
  if (effectiveTo) {
    const to = new Date(String(effectiveTo));
    if (Number.isNaN(to.getTime())) return "effectiveTo must be a valid date";
    if (to < from) return "effectiveTo must be on or after effectiveFrom";
  }
  return null;
}

// Day-before helper: effective periods are closed on the last day they apply
// (inclusive), so the next version starts on the following day.
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// For a jurisdiction/currency/frequency there can only be one applicable table
// per period. Returns an error string when the new period overlaps an existing
// record (excluding excludeId).
async function assertTaxConfigNoOverlap(tx: any, currency: string, countryCode: string, payFrequency: string, effectiveFrom: string, effectiveTo: string | null | undefined, excludeId?: number): Promise<string | null> {
  const existing = await tx.select({ id: payrollTaxTables.id, effectiveFrom: payrollTaxTables.effectiveFrom, effectiveTo: payrollTaxTables.effectiveTo })
    .from(payrollTaxTables)
    .where(and(
      eq(payrollTaxTables.currency, currency),
      eq(payrollTaxTables.countryCode, countryCode),
      eq(payrollTaxTables.payFrequency, payFrequency),
      excludeId ? ne(payrollTaxTables.id, excludeId) : undefined
    ));

  const newFrom = new Date(`${effectiveFrom}T00:00:00`).getTime();
  const newTo = effectiveTo ? new Date(`${effectiveTo}T00:00:00`).getTime() : Infinity;

  for (const row of existing) {
    const rowFrom = new Date(`${row.effectiveFrom}T00:00:00`).getTime();
    const rowTo = row.effectiveTo ? new Date(`${row.effectiveTo}T00:00:00`).getTime() : Infinity;
    // Overlap if the two closed periods share at least one day.
    const overlaps = newFrom <= rowTo && rowFrom <= newTo;
    if (overlaps) {
      const newLabel = `${effectiveFrom}${effectiveTo ? ` → ${effectiveTo}` : " → open"}`;
      const oldLabel = `${row.effectiveFrom}${row.effectiveTo ? ` → ${row.effectiveTo}` : " → open"}`;
      return `Overlapping tax configuration: the period ${newLabel} overlaps an existing ${currency} ${countryCode} configuration (${oldLabel}). Close the previous period or adjust the dates.`;
    }
  }
  return null;
}

// When a new table starts on a later date, close the current open-ended table
// for the same scope so at most one table is applicable at any time.
async function closeOpenTaxConfig(tx: any, currency: string, countryCode: string, payFrequency: string, effectiveFrom: string) {
  await tx.update(payrollTaxTables)
    .set({ effectiveTo: addDays(effectiveFrom, -1), isActive: false })
    .where(and(
      eq(payrollTaxTables.currency, currency),
      eq(payrollTaxTables.countryCode, countryCode),
      eq(payrollTaxTables.payFrequency, payFrequency),
      sql`${payrollTaxTables.effectiveTo} IS NULL`,
      sql`${payrollTaxTables.effectiveFrom} < ${effectiveFrom}`
    ));
}

// Once a table has been used to process payroll it is immutable: the payroll
// lines snapshot taxConfigId and must remain reproducible.
async function isTaxConfigReferenced(tx: any, id: number): Promise<boolean> {
  const [hit] = await tx.select({ id: sql`1` })
    .from(payrollRunEmployees)
    .where(sql`(${payrollRunEmployees.snapshotData}->>'taxConfigId')::int = ${id}`)
    .limit(1);
  return !!hit;
}

// A statutory rule that a payroll run already used must not be mutated in place.
async function isStatutoryRuleReferenced(tx: any, rule: any): Promise<boolean> {
  const from = String(rule.effectiveFrom);
  const to = rule.effectiveTo || "9999-12-31";
  const [hit] = await tx.select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(and(
      ne(payrollRuns.status, "DRAFT"),
      sql`${payrollRuns.periodStart} <= ${to}`,
      sql`${payrollRuns.periodEnd} >= ${from}`
    ))
    .limit(1);
  return !!hit;
}

// Load every effective-dated salary slice overlapping a period, newest last.
// The engine blends them so a mid-period raise is reflected only for the days
// it applied (falling back to the active contract when no history exists).
async function loadEffectiveSalarySlices(tx: any, employeeId: number, periodStart: string, periodEnd: string, fallback: any) {
  const rows = await tx.select()
    .from(employeeSalaryHistory)
    .where(and(
      eq(employeeSalaryHistory.employeeId, employeeId),
      sql`${employeeSalaryHistory.effectiveFrom} <= ${periodEnd}`,
      sql`(${employeeSalaryHistory.effectiveTo} IS NULL OR ${employeeSalaryHistory.effectiveTo} >= ${periodStart})`
    ))
    .orderBy(asc(employeeSalaryHistory.effectiveFrom));

  if (rows.length === 0) {
    return [{
      id: null,
      amount: toMoney(fallback?.baseSalary),
      salaryAmount: fallback?.baseSalary ?? "0",
      currency: fallback?.currency ?? "USD",
      payFrequency: fallback?.payFrequency ?? "MONTHLY",
      usdPercentage: fallback?.usdPercentage ?? "100.00",
      zigPercentage: fallback?.zigPercentage ?? "0.00",
      effectiveFrom: periodStart,
      effectiveTo: null,
      source: "contract",
    }];
  }
  return rows.map((r: any) => ({
    id: r.id,
    amount: toMoney(r.salaryAmount),
    salaryAmount: r.salaryAmount,
    currency: r.currency,
    payFrequency: r.payFrequency,
    usdPercentage: r.usdPercentage,
    zigPercentage: r.zigPercentage,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    source: "salary_history",
  }));
}

// Open an effective-dated salary record for a change effective on a given date,
// closing the previously open record so no period is ever overwritten.
async function applySalaryHistoryChange(tx: any, companyId: number, employeeId: number, opts: {
  salaryAmount: string | number;
  currency: string;
  payFrequency: string;
  usdPercentage?: string | number;
  zigPercentage?: string | number;
  effectiveFrom: string;
  reason?: string | null;
  salaryChangeId?: number | null;
  approvedBy?: string | null;
}) {
  await tx.update(employeeSalaryHistory)
    .set({ effectiveTo: addDays(String(opts.effectiveFrom), -1) })
    .where(and(
      eq(employeeSalaryHistory.employeeId, employeeId),
      sql`${employeeSalaryHistory.effectiveTo} IS NULL`
    ));

  const [record] = await tx.insert(employeeSalaryHistory)
    .values({
      companyId,
      employeeId,
      salaryChangeId: opts.salaryChangeId ?? null,
      salaryAmount: String(opts.salaryAmount),
      currency: opts.currency,
      payFrequency: opts.payFrequency,
      usdPercentage: String(opts.usdPercentage ?? "100.00"),
      zigPercentage: String(opts.zigPercentage ?? "0.00"),
      effectiveFrom: opts.effectiveFrom,
      reason: opts.reason ?? null,
      approvedBy: opts.approvedBy ?? null,
    })
    .returning();
  return record;
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

/**
 * Everything a ZIMRA return is built from: locked runs only, plus the checks
 * that decide whether the figures are fit to file. An unfinalised or
 * incomplete return cannot be unsent, so callers must act on `blocked`.
 */
async function loadFinalizedReport(companyId: number, periodStart: string, periodEnd: string, reportType: string, currency?: string, onlyEmployeeId?: number | null) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  let { runs, lines } = await loadReportRuns(companyId, periodStart, periodEnd, currency);
  if (onlyEmployeeId) {
    lines = lines.filter(({ line }: any) => line.employeeId === onlyEmployeeId);
    const represented = new Set(lines.map(({ run }: any) => run.id));
    runs = runs.filter((run: any) => represented.has(run.id));
  }
  const issues = await validateStatutoryReport(company, reportType, runs, lines);
  const summary = summarizeValidation(issues);
  return {
    company,
    runs,
    lines,
    issues,
    summary,
    blocked: summary.exportBlocked,
    blockingIssues: issues.filter((issue: any) => issue.severity === "ERROR"),
  };
}

/** Reply with the filing errors when a return is not fit to file; true means handled. */
function respondReportBlocked(res: any, report: { summary: any; blockingIssues: any[] }): boolean {
  if (!report.summary.exportBlocked) return false;
  res.status(422).json({
    error: "STATUTORY_REPORT_NOT_FIT_TO_FILE",
    message: `${report.summary.errors} blocking issue(s) must be fixed before this return can be exported.`,
    validation: report.summary,
    issues: report.blockingIssues,
  });
  return true;
}

/**
 * One return cannot mix currencies - a ZiG PAYE figure and a USD one added
 * together file as a number no authority can match to a bank deposit. Runs paid
 * in both currencies at once ("SPLIT") stay their own bucket for the same reason.
 */
function respondMixedReportCurrency(res: any, runs: any[], currency?: string): boolean {
  if (currency) return false;
  const currencies = Array.from(new Set(runs.map((run: any) => run.currency)));
  if (currencies.length <= 1) return false;
  res.status(422).json({
    error: "MIXED_CURRENCY_PAYROLL",
    message: `This period has locked runs in ${currencies.join(" and ")}. Request one currency at a time.`,
    currencies,
  });
  return true;
}

/**
 * The ?currency= filter on a report route. Codes reach payroll_runs.currency
 * verbatim, so "ZiG" stays mixed-case and an empty param means "do not filter".
 */
function reportCurrencyParam(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

/** A return is filed per currency, so the file a tenant downloads says which one it holds. */
function reportCurrencySuffix(currency?: string): string {
  return currency ? `_${currency}` : "";
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
    const snapshot = runSnapshot(line.snapshotData);
    if (toMoney(snapshot.taxableIncome) < 0) addIssue("ERROR", "NEGATIVE_TAXABLE_INCOME", "Taxable income cannot be negative", "payroll_run_employees", line.id);
    // PAYE owed is the credit-relieved figure - the employee is deducted that,
    // so remitting the pre-credit amount would overpay ZIMRA. Rows written
    // before the credit was stored still file; they warn instead of blocking.
    const payeDue = snapshot.payeAfterCredit != null
      ? toMoney(snapshot.payeAfterCredit)
      : (snapshot.payeRaw != null ? toMoney(snapshot.payeRaw) : null);
    if (payeDue != null && Math.abs(payeDue - toMoney(line.paye)) > 0.02) {
      if (snapshot.payeAfterCredit != null && Math.abs(toMoney(snapshot.payeRaw) - toMoney(line.paye)) <= 0.02) {
        addIssue("WARNING", "PAYE_CREDIT_NOT_REMITTED", "PAYE line holds the pre-credit amount, so this payslip's tax credit was not remitted", "payroll_run_employees", line.id);
      } else {
        addIssue("ERROR", "PAYE_MISMATCH", "PAYE line amount does not match the PAYE due in the immutable payroll snapshot", "payroll_run_employees", line.id);
      }
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
    const snapshot = runSnapshot(line.snapshotData);
    const sumBy = (items: any[], predicate: (item: any) => boolean) =>
      sumMoney(items.filter(predicate).map((item: any) => item.amount));
    const taxableAllowances = sumBy(allowances, (item) => item.isTaxable);
    const nonTaxableAllowances = sumBy(allowances, (item) => !item.isTaxable);
    const pensionDeductions = sumBy(deductions, (item) => item.deductionType === "PENSION");
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

  // Summed in cents: these totals are what the report validation compares
  // against the locked runs, and a drifted cent reads as a filing mismatch.
  const sumField = (field: keyof (typeof employeeRows)[number]) =>
    sumMoney(employeeRows.map((row: any) => row[field]));
  const totals = {
    grossRemuneration: sumField("grossRemuneration"),
    taxableRemuneration: sumField("taxableRemuneration"),
    taxableBenefits: sumField("taxableBenefits"),
    pensionDeductions: sumField("pensionDeductions"),
    payeDeducted: sumField("payeDeducted"),
    aidsLevy: sumField("aidsLevy"),
    totalPayePayable: sumMoney(employeeRows.map((row: any) => centsOf(row.payeDeducted) + centsOf(row.aidsLevy))),
    nssaEmployee: sumField("nssaEmployee"),
    nssaEmployer: sumField("nssaEmployer"),
    nssaPayable: sumMoney(employeeRows.map((row: any) => centsOf(row.nssaEmployee) + centsOf(row.nssaEmployer))),
    necPayable: sumMoney(employeeRows.map((row: any) => centsOf(row.necEmployee) + centsOf(row.necEmployer))),
    netPay: sumField("netPay"),
  };

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
    respondPayrollError(res, err);
  }
});

router.post("/credentials", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    integrationType: z.string(),
    credentialData: z.record(z.any()), // JSON configurations
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

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
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const [result] = await db.insert(necSectorsConfig)
      .values({ ...parsed.data, companyId })
      .returning();
    await auditPayroll(req, "PAYROLL_NEC_SECTOR_CREATED", "nec_sectors_config", result.id, { code: result.code });
    res.status(201).json(result);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
  }
});

// --- 3. DEPARTMENTS & POSITIONS ENDPOINTS ---
router.get("/departments", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const results = await db.select().from(departments).where(eq(departments.companyId, companyId));
    res.json(results);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.post("/departments", requirePayrollWrite, async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const [dept] = await db.insert(departments).values({ ...req.body, companyId }).returning();
    await auditPayroll(req, "PAYROLL_DEPARTMENT_CREATED", "departments", dept.id, { name: dept.name });
    res.status(201).json(dept);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.get("/positions", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const [rows, filled] = await Promise.all([
      db.select({
        id: positions.id,
        title: positions.title,
        grade: positions.grade,
        necCategory: positions.necCategory,
        payGradeId: positions.payGradeId,
        approvedHeadcount: positions.approvedHeadcount,
        isActive: positions.isActive,
        gradeCode: payrollPayGrades.code,
        gradeName: payrollPayGrades.name,
        gradeCurrency: payrollPayGrades.currency,
        gradeMinSalary: payrollPayGrades.minSalary,
        gradeMidpointSalary: payrollPayGrades.midpointSalary,
      }).from(positions)
        .leftJoin(payrollPayGrades, eq(positions.payGradeId, payrollPayGrades.id))
        .where(eq(positions.companyId, companyId))
        .orderBy(asc(positions.title)),
      db.select({
        positionId: employees.positionId,
        headcount: sql<number>`count(*)::int`,
      }).from(employees)
        .where(and(eq(employees.companyId, companyId), sql`${employees.status} <> 'TERMINATED'`))
        .groupBy(employees.positionId),
    ]);

    const filledByPosition = new Map(filled.map((f) => [f.positionId, Number(f.headcount)]));
    res.json(rows.map((row) => {
      const occupied = filledByPosition.get(row.id) ?? 0;
      const approved = Number(row.approvedHeadcount ?? 1);
      return {
        ...row,
        occupied,
        // A post is a budgeted vacancy when it is approved for more people than it
        // has. Runs read employees, so these never reach a payslip or a return.
        vacancies: Math.max(approved - occupied, 0),
        vacancyCost: row.gradeMidpointSalary
          ? centsToMoney(centsOf(row.gradeMidpointSalary) * Math.max(approved - occupied, 0))
          : null,
      };
    }));
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * `z.coerce.boolean()` is JavaScript's `Boolean()` wearing a costume: the string
 * "false" coerces to true, and a checkbox or a form field arrives as text. Say what
 * the words mean instead of what the type cast does.
 */
export function boolFromText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off", ""].includes(text)) return false;
  return value;
}
const boolField = (fallback: boolean) => z.preprocess(boolFromText, z.boolean().default(fallback));
const optionalBoolField = () => z.preprocess(boolFromText, z.boolean().optional());

const positionSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  grade: z.string().trim().max(40).optional().nullable(),
  necCategory: z.string().trim().max(80).optional().nullable(),
  payGradeId: z.coerce.number().int().optional().nullable(),
  approvedHeadcount: z.coerce.number().int().min(1).max(9999).default(1),
  isActive: boolField(true),
});

router.post("/positions", requirePayrollWrite, async (req, res) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    if (parsed.data.payGradeId) {
      const [grade] = await db.select({ id: payrollPayGrades.id }).from(payrollPayGrades)
        .where(and(eq(payrollPayGrades.id, parsed.data.payGradeId), eq(payrollPayGrades.companyId, companyId)))
        .limit(1);
      if (!grade) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "Selected pay grade does not belong to this company." });
      }
    }
    // No spread of req.body: an insert here used to accept any column the client
    // sent, including companyId for another tenant.
    const [pos] = await db.insert(positions)
      .values({ ...parsed.data, companyId })
      .returning();
    await auditPayroll(req, "PAYROLL_POSITION_CREATED", "positions", pos.id, { title: pos.title });
    res.status(201).json(pos);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.put("/positions/:id", requirePayrollWrite, async (req, res) => {
  const positionId = parseInt(req.params.id, 10);
  if (!Number.isInteger(positionId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid position ID" });

  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const [existing] = await db.select({ id: positions.id }).from(positions)
      .where(and(eq(positions.id, positionId), eq(positions.companyId, companyId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "Position not found for this company" });

    // Same occupancy rule the list uses: a post cannot be approved below the people
    // already sitting in it, or the vacancy maths turns negative and the budget lies.
    const [occupancy] = await db.select({ headcount: sql<number>`count(*)::int` }).from(employees)
      .where(and(
        eq(employees.companyId, companyId),
        eq(employees.positionId, positionId),
        sql`${employees.status} <> 'TERMINATED'`
      ));
    const occupied = Number(occupancy?.headcount ?? 0);
    if (parsed.data.approvedHeadcount < occupied) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `${occupied} ${occupied === 1 ? "person still holds" : "people still hold"} this post, so approved headcount cannot go below ${occupied}. Move them to another position first.`,
      });
    }

    const [pos] = await db.update(positions).set({ ...parsed.data })
      .where(and(eq(positions.id, positionId), eq(positions.companyId, companyId)))
      .returning();
    await auditPayroll(req, "PAYROLL_POSITION_UPDATED", "positions", pos.id, { title: pos.title });
    res.json(pos);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

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
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
  }
});

router.post("/employees", requirePayrollWrite, async (req, res) => {
  // Helpers: the HR form submits "" for untouched optional fields. Normalize
  // those to null/undefined BEFORE validation so zod doesn't reject them
  // (e.g. "".email() fails, "" for a date column breaks PG).
  const blankToNull = (v: unknown) =>
    typeof v === "string" && v.trim() === "" ? null : v;
  const optText = z.preprocess(blankToNull, z.string().nullable().optional());
  const optEmail = z.preprocess(
    blankToNull,
    z.string().email("Invalid email address").nullable().optional()
  );
  const optDate = z.preprocess(blankToNull, z.string().nullable().optional());
  const optIntId = z.preprocess((v: unknown) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : v;
  }, z.number().int().nullable().optional());
  const optBranchId = z.preprocess((v: unknown) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = Number(v);
    return Number.isInteger(n) ? n : v;
  }, z.number().int().optional());

  const contractShape = {
    contractType: z.string().default("PERMANENT"),
    baseSalary: z.preprocess((v: unknown) => (v === "" ? undefined : v), z.coerce.string()),
    currency: z.string().default("USD"),
    usdPercentage: z.coerce.string().default("100.00"),
    zigPercentage: z.coerce.string().default("0.00"),
    payFrequency: z.string().default("MONTHLY"),
    payGradeId: optIntId,
    necSectorId: optIntId,
    probationEndDate: optDate,
  };

  const schema = z.object({
    employeeNumber: z.preprocess(
      blankToNull,
      z.string().trim().min(1).nullable().optional()
    ),
    title: optText,
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    dateOfBirth: optDate,
    gender: optText,
    maritalStatus: optText,
    email: optEmail,
    phone: optText,
    physicalAddress: optText,
    postalAddress: optText,
    nationalId: z.string().trim().min(1, "National ID is required"),
    nssaNumber: optText,
    zimraTaxNumber: optText,
    branchId: optBranchId,
    departmentId: optIntId,
    positionId: optIntId,
    status: z.string().default("ACTIVE"),
    joiningDate: optDate,
    terminationDate: optDate,
    bankName: optText,
    bankBranch: optText,
    bankAccountNumber: optText,
    ecocashNumber: optText,
    emergencyContactName: optText,
    emergencyContactPhone: optText,
    nextOfKinName: optText,
    nextOfKinRelationship: optText,
    nextOfKinPhone: optText,
    nextOfKinAddress: optText,
    contract: z.object(contractShape).optional(),
    // Back-compat: the HR form historically sent contract fields FLAT
    // (contractType/baseSalary/currency/... at top level) instead of nested
    // under `contract`. Accept both shapes.
    contractType: z.string().optional().nullable(),
    baseSalary: z.preprocess((v: unknown) => (v === "" || v === undefined ? undefined : v), z.coerce.string().optional()),
    currency: z.string().optional().nullable(),
    usdPercentage: z.preprocess((v: unknown) => (v === "" || v === undefined ? undefined : v), z.coerce.string().optional()),
    zigPercentage: z.preprocess((v: unknown) => (v === "" || v === undefined ? undefined : v), z.coerce.string().optional()),
    payFrequency: z.string().optional().nullable(),
    payGradeId: optIntId,
    necSectorId: optIntId,
    startDate: optDate,
    endDate: optDate,
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: first ? `${first.path.join(".") || "field"}: ${first.message}` : "Invalid employee data",
      details: parsed.error.errors,
    });
  }

  // Merge nested `contract` with legacy flat contract fields.
  const body = parsed.data as Record<string, any>;
  let contract = body.contract as Record<string, any> | undefined;
  const flatKeys = ["contractType", "baseSalary", "currency", "usdPercentage", "zigPercentage", "payFrequency", "payGradeId", "necSectorId"] as const;
  const hasFlatContract = flatKeys.some((k) => body[k] !== undefined && body[k] !== null);
  if (!contract && hasFlatContract) {
    contract = {
      contractType: body.contractType || "PERMANENT",
      baseSalary: body.baseSalary ?? "0",
      currency: body.currency || "USD",
      usdPercentage: body.usdPercentage ?? "100.00",
      zigPercentage: body.zigPercentage ?? "0.00",
      payFrequency: body.payFrequency || "MONTHLY",
      payGradeId: body.payGradeId ?? null,
      necSectorId: body.necSectorId ?? null,
    };
  }
  if (contract) {
    if (contract.payGradeId === undefined) contract.payGradeId = null;
    if (contract.necSectorId === undefined) contract.necSectorId = null;
    const usdPercentage = Number(contract.usdPercentage || 0);
    const zigPercentage = Number(contract.zigPercentage || 0);
    if (Math.abs((usdPercentage + zigPercentage) - 100) > 0.01) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "USD and ZiG salary split percentages must total 100.",
      });
    }
    if (Number.isNaN(Number(contract.baseSalary))) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "contract.baseSalary: must be a valid number",
      });
    }
  }

  try {
    const companyId = getTargetCompanyId(req);
    // Strip legacy flat contract keys so only real employee columns are inserted.
    const { contract: parsedContract, contractType: _ct, baseSalary: _bs, currency: _cu,
      usdPercentage: _up, zigPercentage: _zp, payFrequency: _pf, payGradeId: _pg,
      necSectorId: _ns, startDate: _sd, endDate: _ed, ...empData } = parsed.data as Record<string, any>;
    void _ct; void _bs; void _cu; void _up; void _zp; void _pf; void _pg; void _ns; void _sd; void _ed;
    if (!empData.joiningDate) {
      empData.joiningDate = new Date().toISOString().slice(0, 10);
    }

    // Resolve branch: must belong to this company. Fall back to the
    // company's first branch instead of hard-coding id 1 (FK violation).
    const companyBranches = await db.select({ id: branches.id })
      .from(branches)
      .where(eq(branches.companyId, companyId));
    if (companyBranches.length === 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "No branches found for this company. Create a branch first." });
    }
    if (!empData.branchId || !companyBranches.some((b) => b.id === empData.branchId)) {
      empData.branchId = companyBranches[0].id;
    }

    // Validate optional FK references up-front for friendly errors.
    if (empData.departmentId) {
      const [dept] = await db.select({ id: departments.id }).from(departments)
        .where(and(eq(departments.id, empData.departmentId), eq(departments.companyId, companyId))).limit(1);
      if (!dept) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Selected department does not belong to this company." });
    }
    if (empData.positionId) {
      const [pos] = await db.select({ id: positions.id }).from(positions)
        .where(and(eq(positions.id, empData.positionId), eq(positions.companyId, companyId))).limit(1);
      if (!pos) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Selected position does not belong to this company." });
    }
    if (contract?.payGradeId) {
      const [grade] = await db.select({ id: payrollPayGrades.id }).from(payrollPayGrades)
        .where(and(eq(payrollPayGrades.id, contract.payGradeId), eq(payrollPayGrades.companyId, companyId))).limit(1);
      if (!grade) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Selected pay grade does not belong to this company." });
    }

    const result = await db.transaction(async (tx) => {
      // 1. Create employee. A blank staff number means "give me the next one in our
      //    own scheme" - employers hand these out verbally, so they must be readable
      //      and predictable, not UUID-ish. Supplied numbers are always respected.
      if (!empData.employeeNumber) {
        const settings = await loadPayrollSettings(companyId);
        const allocated = await allocateStaffNumber(tx, companyId, {
          staffNumberPrefix: settings.staffNumberPrefix,
          staffNumberDigits: settings.staffNumberDigits,
          staffNumberNext: Number(settings.staffNumberNext) || 1,
        });
        empData.employeeNumber = allocated.number;
        await tx.update(payrollCompanySettings)
          .set({ staffNumberNext: allocated.next, updatedAt: new Date() })
          .where(eq(payrollCompanySettings.companyId, companyId));
      }

      const [emp] = await tx.insert(employees)
        .values({ ...empData, joiningDate: empData.joiningDate || new Date().toISOString().slice(0, 10), companyId } as any)
        .returning();

      // 2. Create contract if provided (flat startDate wins, else joining date)
      let createdContract = null;
      if (contract) {
        const contractStart = (body.startDate as string | null) || empData.joiningDate || new Date().toISOString().slice(0, 10);
        const contractEnd = (body.endDate as string | null) || null;
        [createdContract] = await tx.insert(employeeContracts)
          .values({
            employeeId: emp.id,
            contractType: contract.contractType,
            startDate: contractStart,
            endDate: contractEnd,
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

        // Effective-dated history on hire: the very first salary record.
        await applySalaryHistoryChange(tx, companyId, emp.id, {
          salaryAmount: contract.baseSalary,
          currency: contract.currency,
          payFrequency: contract.payFrequency,
          usdPercentage: contract.usdPercentage,
          zigPercentage: contract.zigPercentage,
          effectiveFrom: empData.joiningDate || new Date().toISOString().slice(0, 10),
          reason: "Initial contract",
        });
      }

      // 2b. Employment history on hire.
      await tx.insert(employeeEmploymentHistory).values({
        companyId,
        employeeId: emp.id,
        eventType: "JOINED",
        effectiveFrom: empData.joiningDate || new Date().toISOString().slice(0, 10),
        departmentId: empData.departmentId || null,
        positionId: empData.positionId || null,
        branchId: empData.branchId || null,
        employmentType: contract?.contractType || null,
        contractType: contract?.contractType || null,
        reason: "Employee joined the company",
        createdBy: req.user?.id || null,
      });

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
    if (err?.code === "23505") {
      return res.status(409).json({ error: "CONFLICT", message: "This employee number already exists for the company." });
    }
    if (err?.code === "23503") {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Referenced record (branch/department/position/pay grade) is invalid for this company." });
    }
    respondPayrollError(res, err);
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

    const headers = [
      "Employee Number", "First Name", "Last Name", "National ID", "Email", "Phone", "Status", 
      "Branch", "Department", "Position", "Joining Date", "NSSA Number", "ZIMRA Tax Number",
      "Contract Type", "Pay Frequency", "Base Salary", "Currency", "USD %", "ZiG %", 
      "Bank Name", "Bank Branch", "Account Number", "Ecocash Number"
    ];
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
        emp.branchId ? String(emp.branchId) : "", // Branch ID or code
        emp.department?.name || "",
        emp.position?.title || "",
        contract?.startDate || "",
        emp.nssaNumber || "",
        emp.zimraTaxNumber || "",
        contract?.contractType || "",
        contract?.payFrequency || "",
        contract?.baseSalary || "0",
        contract?.currency || "USD",
        contract?.usdPercentage || "100",
        contract?.zigPercentage || "0",
        emp.bankName || "",
        emp.bankBranch || "",
        emp.bankAccountNumber || "",
        emp.ecocashNumber || ""
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });

    const csvStr = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=employees_export_${new Date().getTime()}.csv`);
    res.send(csvStr);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /employees/import - Import employees from CSV text or JSON rows.
// Accepts { rows: [...] }, { csv: "..." }, or a raw CSV request body.
// Returns a per-row validation report (imported / updated / skipped / errors).
router.post("/employees/import", requirePayrollWrite, async (req, res) => {
  const companyId = getTargetCompanyId(req);

  let sourceRows: ImportRow[];
  try {
    sourceRows = parseImportRows(req.body);
  } catch (err: any) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
  }
  if (sourceRows.length === 0) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "No rows found in the import" });
  }

  try {
    // Lookup maps for codes/titles referenced by the CSV columns. These must be built
    // from this company's own rows: a CSV that names "Accountant" has to resolve to
    // this company's Accountant position, never to another tenant's row that happens
    // to share the title.
    const branchList = await db.select({ id: branches.id, code: branches.code }).from(branches)
      .where(eq(branches.companyId, companyId));
    const deptList = await db.select({ id: departments.id, code: departments.code }).from(departments)
      .where(eq(departments.companyId, companyId));
    const posList = await db.select({ id: positions.id, title: positions.title }).from(positions)
      .where(eq(positions.companyId, companyId));
    const branchByCode = new Map(branchList.map((b) => [String(b.code).toLowerCase(), b.id]));
    const deptByCode = new Map(deptList.map((d) => [String(d.code).toLowerCase(), d.id]));
    const posByTitle = new Map(posList.map((p) => [String(p.title).toLowerCase(), p.id]));

    const report: { rowNumber: number; status: "SUCCESS" | "UPDATED" | "SKIPPED" | "ERROR"; reason?: string; employeeNumber?: string }[] = [];
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    await db.transaction(async (tx) => {
      for (let idx = 0; idx < sourceRows.length; idx++) {
        const row = sourceRows[idx];
        const rowNumber = idx + 2; // header is row 1
        const errors: string[] = [];

        if (textOrNull(row.firstName) == null) errors.push("firstName is required");
        if (textOrNull(row.lastName) == null) errors.push("lastName is required");
        if (textOrNull(row.email) != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email).trim())) {
          errors.push(`email "${row.email}" is not a valid email address`);
        }
        if (textOrNull(row.baseSalary) != null && numberOrNull(row.baseSalary) == null) {
          errors.push(`baseSalary "${row.baseSalary}" is not a valid number`);
        }
        if (textOrNull(row.joiningDate) != null && dateOrNull(row.joiningDate) == null) {
          errors.push(`joiningDate "${row.joiningDate}" is not a valid date (expected YYYY-MM-DD)`);
        }
        if (errors.length > 0) {
          report.push({ rowNumber, status: "ERROR", reason: errors.join("; ") });
          continue;
        }

        const employeeNumber = textOrDefault(row.employeeNumber, `EMP-${Date.now().toString(36)}-${idx}`);
        const [existing] = await tx.select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.companyId, companyId), eq(employees.employeeNumber, employeeNumber)))
          .limit(1);

        const departmentId = deptByCode.get(String(row.departmentCode ?? "").toLowerCase()) ?? null;
        const positionId = posByTitle.get(String(row.positionTitle ?? "").toLowerCase()) ?? null;
        const joiningDate = textOrDefault(row.joiningDate, new Date().toISOString().slice(0, 10));

        const empData = {
          companyId,
          branchId: branchByCode.get(String(row.branchCode ?? "").toLowerCase()) ?? (row.branchId ? Number(row.branchId) : 1),
          departmentId,
          positionId,
          employeeNumber,
          firstName: String(row.firstName).trim(),
          lastName: String(row.lastName).trim(),
          nationalId: textOrNull(row.nationalId) ?? employeeNumber,
          email: textOrNull(row.email),
          phone: textOrNull(row.phone),
          nssaNumber: textOrNull(row.nssaNumber),
          zimraTaxNumber: textOrNull(row.zimraTaxNumber),
          bankName: textOrNull(row.bankName),
          bankBranch: textOrNull(row.bankBranch),
          bankAccountNumber: textOrNull(row.bankAccountNumber),
          ecocashNumber: textOrNull(row.ecocashNumber),
          status: "ACTIVE",
          joiningDate,
        };

        let newEmp = existing;
        let status: "SUCCESS" | "UPDATED" = "SUCCESS";
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
        } else {
          status = "UPDATED";
          await tx.update(employees).set({ ...empData, updatedAt: new Date() }).where(eq(employees.id, existing.id));
        }

        const [activeContract] = await tx.select({ id: employeeContracts.id })
          .from(employeeContracts)
          .where(and(eq(employeeContracts.employeeId, newEmp.id), eq(employeeContracts.isActive, true)))
          .limit(1);

        const contractData = {
          employeeId: newEmp.id,
          contractType: textOrDefault(row.contractType, "PERMANENT"),
          startDate: joiningDate,
          baseSalary: textOrDefault(row.baseSalary, "0"),
          currency: textOrDefault(row.currency, "USD"),
          usdPercentage: textOrDefault(row.usdPercentage, "100"),
          zigPercentage: textOrDefault(row.zigPercentage, "0"),
          payFrequency: textOrDefault(row.payFrequency, "MONTHLY"),
          isActive: true,
        };
        if (activeContract) {
          await tx.update(employeeContracts).set(contractData).where(eq(employeeContracts.id, activeContract.id));
        } else {
          await tx.insert(employeeContracts).values(contractData);
        }

        if (status === "SUCCESS") importedCount++;
        else updatedCount++;
        report.push({ rowNumber, status, employeeNumber });
      }
    });

    const errorRows = report.filter((r) => r.status === "ERROR");
    const skippedRows = report.filter((r) => r.status === "SKIPPED");
    const batchStatus = errorRows.length === 0 ? "COMPLETED" : (importedCount + updatedCount > 0 ? "PARTIAL" : "FAILED");

    const [batch] = await db.insert(payrollImportBatches)
      .values({
        companyId,
        importType: "EMPLOYEES",
        sourceFileName: req.body?.fileName || null,
        status: batchStatus,
        rowCount: sourceRows.length,
        successCount: importedCount + updatedCount,
        errorCount: errorRows.length + skippedRows.length,
        validationSummary: report,
        createdBy: req.user?.id || null,
        completedAt: new Date(),
      })
      .returning();

    for (const r of report) {
      if (r.status === "ERROR") {
        await db.insert(payrollImportRows).values({
          batchId: batch.id,
          rowNumber: r.rowNumber,
          status: "ERROR",
          entityType: "employees",
          rawData: sourceRows[r.rowNumber - 2] ?? {},
          errors: [r.reason],
        });
      }
    }

    await auditPayroll(req, "PAYROLL_EMPLOYEES_IMPORTED", "payroll_import_batches", batch.id, {
      rowCount: sourceRows.length,
      imported: importedCount,
      updated: updatedCount,
      errors: errorRows.length,
      fileName: req.body?.fileName || null,
    });

    res.status(errorRows.length === sourceRows.length ? 400 : 200).json({
      success: errorRows.length !== sourceRows.length,
      total: sourceRows.length,
      imported: importedCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorRows.length,
      report,
      message: `Imported ${importedCount}, updated ${updatedCount}${errorRows.length ? `, ${errorRows.length} rows failed validation` : ""}.`,
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// GET /employees/import/batches - Import history for the audit trail
router.get("/employees/import/batches", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const batches = await db.select()
      .from(payrollImportBatches)
      .where(eq(payrollImportBatches.companyId, companyId))
      .orderBy(desc(payrollImportBatches.createdAt))
      .limit(20);
    res.json(batches);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
  }
});

router.put("/employees/:id", requirePayrollWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.companyId, companyId)))
      .limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const ALLOWED = [
      "title", "firstName", "lastName", "dateOfBirth", "gender", "maritalStatus",
      "email", "phone", "physicalAddress", "postalAddress",
      "nationalId", "nssaNumber", "zimraTaxNumber",
      "bankName", "bankBranch", "bankAccountNumber", "ecocashNumber",
      "emergencyContactName", "emergencyContactPhone",
      "nextOfKinName", "nextOfKinRelationship", "nextOfKinPhone", "nextOfKinAddress",
      "status", "joiningDate", "terminationDate", "terminationType", "terminationReason",
      "departmentId", "positionId",
    ];
    // Contract fields may arrive nested (`contract: {...}`) or flat alongside
    // employee fields (legacy HR form). Collect them instead of dropping.
    const CONTRACT_KEYS = ["contractType", "baseSalary", "currency", "usdPercentage", "zigPercentage", "payFrequency", "payGradeId", "necSectorId", "startDate", "endDate"];
    const rawBody = (req.body || {}) as Record<string, any>;
    const nestedContract = (rawBody.contract && typeof rawBody.contract === "object" ? rawBody.contract : null) as Record<string, any> | null;
    const flatContract: Record<string, any> = {};
    for (const k of CONTRACT_KEYS) {
      if (rawBody[k] !== undefined && rawBody[k] !== "" && rawBody[k] !== null) flatContract[k] = rawBody[k];
    }
    const contractUpdate = nestedContract ? { ...flatContract, ...nestedContract } : (Object.keys(flatContract).length > 0 ? flatContract : null);
    if (contractUpdate) {
      if (contractUpdate.payGradeId === "" || contractUpdate.payGradeId === undefined) contractUpdate.payGradeId = null;
      if (contractUpdate.necSectorId === "" || contractUpdate.necSectorId === undefined) contractUpdate.necSectorId = null;
      if (contractUpdate.endDate === "") contractUpdate.endDate = null;
    }

    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(rawBody)) {
      if (!ALLOWED.includes(key)) continue;
      const value = rawBody[key] === "" ? null : rawBody[key];
      if (key === "email" && value != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: `"${value}" is not a valid email address` });
      }
      updates[key] = value;
    }

    if (updates.employeeNumber) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "employeeNumber cannot be changed" });
    }

    // Apply contract changes bundled with the profile edit (HR edit modal
    // sends Contract-tab fields together with employee fields).
    let appliedContract: Record<string, any> | null = null;
    if (contractUpdate && contractUpdate.baseSalary !== undefined) {
      const [active] = await db.select().from(employeeContracts)
        .where(and(eq(employeeContracts.employeeId, id), eq(employeeContracts.isActive, true)))
        .limit(1);
      const merged = {
        contractType: contractUpdate.contractType ?? active?.contractType ?? "PERMANENT",
        baseSalary: String(contractUpdate.baseSalary),
        currency: contractUpdate.currency ?? active?.currency ?? "USD",
        usdPercentage: String(contractUpdate.usdPercentage ?? active?.usdPercentage ?? "100.00"),
        zigPercentage: String(contractUpdate.zigPercentage ?? active?.zigPercentage ?? "0.00"),
        payFrequency: contractUpdate.payFrequency ?? (active as any)?.payFrequency ?? "MONTHLY",
        payGradeId: contractUpdate.payGradeId ?? active?.payGradeId ?? null,
        necSectorId: contractUpdate.necSectorId ?? active?.necSectorId ?? null,
        startDate: contractUpdate.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: contractUpdate.endDate ?? null,
      };
      if (Number.isNaN(Number(merged.baseSalary))) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "contract.baseSalary: must be a valid number" });
      }
      if (Math.abs((Number(merged.usdPercentage || 0) + Number(merged.zigPercentage || 0)) - 100) > 0.01) {
        return res.status(400).json({ error: "VALIDATION_ERROR", message: "USD and ZiG salary split percentages must total 100." });
      }
      if (merged.payGradeId) {
        const [grade] = await db.select({ id: payrollPayGrades.id }).from(payrollPayGrades)
          .where(and(eq(payrollPayGrades.id, Number(merged.payGradeId)), eq(payrollPayGrades.companyId, companyId))).limit(1);
        if (!grade) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Selected pay grade does not belong to this company." });
      }
      appliedContract = await db.transaction(async (tx) => {
        await tx.update(employeeContracts).set({ isActive: false }).where(eq(employeeContracts.employeeId, id));
        const [nc] = await tx.insert(employeeContracts).values({
          employeeId: id,
          contractType: merged.contractType,
          startDate: merged.startDate,
          endDate: merged.endDate,
          baseSalary: merged.baseSalary,
          currency: merged.currency,
          usdPercentage: merged.usdPercentage,
          zigPercentage: merged.zigPercentage,
          payFrequency: merged.payFrequency,
          payGradeId: merged.payGradeId ? Number(merged.payGradeId) : null,
          necSectorId: merged.necSectorId ? Number(merged.necSectorId) : null,
          isActive: true,
        }).returning();
        await applySalaryHistoryChange(tx, companyId, id, {
          salaryAmount: merged.baseSalary,
          currency: merged.currency,
          payFrequency: merged.payFrequency,
          usdPercentage: merged.usdPercentage,
          zigPercentage: merged.zigPercentage,
          effectiveFrom: merged.startDate,
          reason: "Contract updated via employee profile",
        });
        return nc;
      });
    }

    if (Object.keys(updates).length === 0) {
      if (appliedContract) return res.json({ ...emp, appliedContract });
      return res.json(emp);
    }

    const [updated] = await db.update(employees)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(employees.id, id), eq(employees.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Employee not found" });

    // Effective-dated employment history: transfers, promotions, position/status
    // and termination changes are recorded as immutable events on the timeline.
    const trackingKeys = ["departmentId", "positionId", "status", "terminationDate", "joiningDate"];
    const tracked = trackingKeys.filter((k) => updates[k] !== undefined);
    if (tracked.length > 0) {
      let eventType = "POSITION_CHANGE";
      if (updates.status === "TERMINATED" || updates.terminationDate) {
        eventType = "TERMINATION";
      } else if (updates.status === "REHIRED") {
        eventType = "REHIRE";
      } else if (updates.departmentId !== undefined || updates.positionId !== undefined) {
        eventType = "TRANSFER";
      }
      const effFrom = String(updates.terminationDate || updates.joiningDate || new Date().toISOString().slice(0, 10));
      await db.insert(employeeEmploymentHistory).values({
        companyId,
        employeeId: id,
        eventType,
        effectiveFrom: effFrom,
        departmentId: (updated.departmentId as number | null) || emp.departmentId || null,
        positionId: (updated.positionId as number | null) || emp.positionId || null,
        branchId: (updated.branchId as number | null) ?? emp.branchId ?? null,
        reason: `Employee profile updated: ${tracked.join(", ")}${updates.terminationType ? ` (${updates.terminationType})` : ""}${updates.terminationReason ? ` — ${updates.terminationReason}` : ""}`,
        createdBy: req.user?.id || null,
      });
    }

    await auditPayroll(req, "PAYROLL_EMPLOYEE_UPDATED", "employees", emp.id, {
      changedFields: Object.keys(updates),
    });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "CONFLICT", message: "A record with the same value already exists" });
    }
    respondPayrollError(res, err);
  }
});

// --- SALARY CHANGE REQUESTS & APPROVAL WORKFLOW ---

// POST /employees/:id/salary-change - request a salary revision (pending approval)
router.post("/employees/:id/salary-change", requirePayrollWrite, async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const schema = z.object({
    newBaseSalary: z.coerce.number().positive(),
    currency: z.string().default("USD"),
    payFrequency: z.string().default("MONTHLY"),
    reason: z.string().min(3),
    effectiveDate: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
      .limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const [contract] = await db.select().from(employeeContracts)
      .where(and(eq(employeeContracts.employeeId, employeeId), eq(employeeContracts.isActive, true)))
      .limit(1);

    const [change] = await db.insert(employeeSalaryChanges).values({
      companyId,
      employeeId,
      previousBaseSalary: (contract?.baseSalary ?? "0"),
      newBaseSalary: parsed.data.newBaseSalary.toFixed(2),
      currency: parsed.data.currency,
      payFrequency: parsed.data.payFrequency,
      reason: parsed.data.reason,
      effectiveDate: parsed.data.effectiveDate,
      status: "PENDING",
      requestedBy: req.user?.id || null,
    }).returning();

    await auditPayroll(req, "PAYROLL_SALARY_CHANGE_REQUESTED", "employee_salary_changes", change.id, {
      employeeId,
      previousBaseSalary: change.previousBaseSalary,
      newBaseSalary: change.newBaseSalary,
      effectiveDate: change.effectiveDate,
      reason: change.reason,
    });
    res.status(201).json(change);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// GET /employees/:id/salary-changes - salary revision history for one employee
router.get("/employees/:id/salary-changes", async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  try {
    const companyId = getTargetCompanyId(req);
    const changes = await db.select().from(employeeSalaryChanges)
      .where(and(eq(employeeSalaryChanges.companyId, companyId), eq(employeeSalaryChanges.employeeId, employeeId)))
      .orderBy(desc(employeeSalaryChanges.createdAt));
    res.json(changes);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// GET /employees/:id/timeline - merged employee history timeline. Answers
// "what did we know about this employee at any point in time?" by combining the
// effective-dated employment, salary, income and deduction history records.
router.get("/employees/:id/timeline", async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  try {
    const companyId = getTargetCompanyId(req);
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
      .limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const [employment, salary, income, deduction, salaryChanges] = await Promise.all([
      db.query.employeeEmploymentHistory.findMany({
        where: and(eq(employeeEmploymentHistory.companyId, companyId), eq(employeeEmploymentHistory.employeeId, employeeId)),
        with: { department: true, position: true, branch: true },
        orderBy: [asc(employeeEmploymentHistory.effectiveFrom)],
      }),
      db.select().from(employeeSalaryHistory)
        .where(and(eq(employeeSalaryHistory.companyId, companyId), eq(employeeSalaryHistory.employeeId, employeeId)))
        .orderBy(asc(employeeSalaryHistory.effectiveFrom)),
      db.select().from(employeeIncomeHistory)
        .where(and(eq(employeeIncomeHistory.companyId, companyId), eq(employeeIncomeHistory.employeeId, employeeId)))
        .orderBy(asc(employeeIncomeHistory.effectiveFrom)),
      db.select().from(employeeDeductionHistory)
        .where(and(eq(employeeDeductionHistory.companyId, companyId), eq(employeeDeductionHistory.employeeId, employeeId)))
        .orderBy(asc(employeeDeductionHistory.effectiveFrom)),
      db.select().from(employeeSalaryChanges)
        .where(and(eq(employeeSalaryChanges.companyId, companyId), eq(employeeSalaryChanges.employeeId, employeeId)))
        .orderBy(asc(employeeSalaryChanges.effectiveDate)),
    ]);

    const events: any[] = [];

    for (const s of salary) {
      events.push({
        type: "SALARY",
        date: s.effectiveFrom,
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo,
        title: "Salary set",
        description: `${Number(s.salaryAmount).toLocaleString()} ${s.currency}`,
        amount: s.salaryAmount,
        currency: s.currency,
        reason: s.reason,
        approvedBy: s.approvedBy,
      });
    }
    for (const e of employment) {
      const evtLabels: Record<string, string> = {
        JOINED: "Joined company",
        TRANSFER: "Transferred",
        PROMOTION: "Promoted",
        POSITION_CHANGE: "Position changed",
        CONTRACT_CHANGE: "Contract changed",
        TERMINATION: "Employment terminated",
        REHIRE: "Rehired",
      };
      events.push({
        type: "EMPLOYMENT",
        date: e.effectiveFrom,
        effectiveFrom: e.effectiveFrom,
        effectiveTo: e.effectiveTo,
        title: evtLabels[e.eventType] || e.eventType,
        description: [
          e.department?.name ? `Department: ${e.department.name}` : null,
          e.position?.title ? `Position: ${e.position.title}` : null,
          e.employmentType ? `Type: ${e.employmentType}` : null,
          e.reason || null,
        ].filter(Boolean).join(", "),
        eventType: e.eventType,
        reason: e.reason,
      });
    }
    for (const i of income) {
      events.push({
        type: "INCOME",
        date: i.effectiveFrom,
        effectiveFrom: i.effectiveFrom,
        effectiveTo: i.effectiveTo,
        title: i.name,
        description: `${Number(i.amount).toLocaleString()} ${i.isTaxable ? "(taxable)" : "(non-taxable)"}`,
        amount: i.amount,
        reason: i.reason,
      });
    }
    for (const d of deduction) {
      events.push({
        type: "DEDUCTION",
        date: d.effectiveFrom,
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo,
        title: d.name,
        description: `${Number(d.amount).toLocaleString()} ${d.isTaxDeductible ? "(tax-deductible)" : ""}`,
        amount: d.amount,
        reason: d.reason,
      });
    }
    for (const c of salaryChanges) {
      events.push({
        type: "SALARY_CHANGE",
        date: c.effectiveDate,
        title: "Salary change requested",
        description: `${Number(c.previousBaseSalary).toLocaleString()} → ${Number(c.newBaseSalary).toLocaleString()} (${c.status})`,
        previousAmount: c.previousBaseSalary,
        newAmount: c.newBaseSalary,
        reason: c.reason,
        status: c.status,
        effectiveDate: c.effectiveDate,
      });
    }

    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    res.json({ employee: emp, events });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// GET /salary-changes/pending - approval queue
router.get("/salary-changes/pending", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const changes = await db.query.employeeSalaryChanges.findMany({
      where: and(eq(employeeSalaryChanges.companyId, companyId), eq(employeeSalaryChanges.status, "PENDING")),
      with: { employee: true },
      orderBy: [asc(employeeSalaryChanges.createdAt)],
    });
    res.json(changes);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /salary-changes/:id/approve - approve and apply to the active contract
router.post("/salary-changes/:id/approve", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const companyId = getTargetCompanyId(req);
    const [change] = await db.select().from(employeeSalaryChanges)
      .where(and(eq(employeeSalaryChanges.id, id), eq(employeeSalaryChanges.companyId, companyId)))
      .limit(1);
    if (!change) return res.status(404).json({ message: "Salary change not found" });
    if (change.status !== "PENDING") return res.status(400).json({ error: "STATE_ERROR", message: `Already ${change.status}` });

    const [approved] = await db.update(employeeSalaryChanges)
      .set({ status: "APPROVED", approvedBy: req.user?.id || null, approvedAt: new Date() })
      .where(eq(employeeSalaryChanges.id, id))
      .returning();

    await db.transaction(async (tx) => {
      const [activeContract] = await tx.select().from(employeeContracts)
        .where(and(eq(employeeContracts.employeeId, change.employeeId), eq(employeeContracts.isActive, true)))
        .limit(1);
      if (activeContract) {
        await tx.update(employeeContracts)
          .set({ baseSalary: change.newBaseSalary, currency: change.currency, payFrequency: change.payFrequency })
          .where(eq(employeeContracts.id, activeContract.id));
      }

      // Effective-dated salary history: never overwrite a previous salary. Close
      // the open record and open a new one effective on the change date.
      await applySalaryHistoryChange(tx, companyId, change.employeeId, {
        salaryAmount: change.newBaseSalary,
        currency: change.currency,
        payFrequency: change.payFrequency,
        usdPercentage: activeContract?.usdPercentage ?? "100.00",
        zigPercentage: activeContract?.zigPercentage ?? "0.00",
        effectiveFrom: change.effectiveDate,
        reason: change.reason,
        salaryChangeId: change.id,
        approvedBy: req.user?.id || null,
      });
    });

    await auditPayroll(req, "PAYROLL_SALARY_CHANGE_APPROVED", "employee_salary_changes", change.id, {
      employeeId: change.employeeId,
      previousBaseSalary: change.previousBaseSalary,
      newBaseSalary: change.newBaseSalary,
      approvedBy: req.user?.id,
    });
    res.json(approved);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /salary-changes/:id/reject - reject with a reason
router.post("/salary-changes/:id/reject", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const schema = z.object({ rejectionReason: z.string().optional().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const [change] = await db.select().from(employeeSalaryChanges)
      .where(and(eq(employeeSalaryChanges.id, id), eq(employeeSalaryChanges.companyId, companyId)))
      .limit(1);
    if (!change) return res.status(404).json({ message: "Salary change not found" });
    if (change.status !== "PENDING") return res.status(400).json({ error: "STATE_ERROR", message: `Already ${change.status}` });

    const [rejected] = await db.update(employeeSalaryChanges)
      .set({ status: "REJECTED", approvedBy: req.user?.id || null, rejectionReason: parsed.data.rejectionReason || null })
      .where(eq(employeeSalaryChanges.id, id))
      .returning();

    await auditPayroll(req, "PAYROLL_SALARY_CHANGE_REJECTED", "employee_salary_changes", change.id, {
      employeeId: change.employeeId,
      rejectionReason: rejected.rejectionReason,
    });
    res.json(rejected);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.post("/employees/:id/contract", requirePayrollWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  const blankToNullContract = (v: unknown) =>
    v === "" || v === undefined ? null : v;
  const schema = z.object({
    contractType: z.string().default("PERMANENT"),
    startDate: z.string(),
    endDate: z.preprocess(blankToNullContract, z.string().nullable().optional()),
    probationEndDate: z.preprocess(blankToNullContract, z.string().nullable().optional()),
    payFrequency: z.string().default("MONTHLY"),
    baseSalary: z.preprocess((v: unknown) => (v === "" ? undefined : v), z.coerce.string()),
    currency: z.string().default("USD"),
    usdPercentage: z.coerce.string().default("100.00"),
    zigPercentage: z.coerce.string().default("0.00"),
    payGradeId: z.preprocess((v: unknown) => {
      if (v === "" || v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isInteger(n) ? n : v;
    }, z.number().int().nullable().optional()),
    necSectorId: z.preprocess((v: unknown) => {
      if (v === "" || v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isInteger(n) ? n : v;
    }, z.number().int().nullable().optional()),
  });
  // Tolerate the HR form's `{ employeeId, contractData: {...} }` wrapper.
  const body = (req.body as any)?.contractData && typeof (req.body as any).contractData === "object"
    ? { ...(req.body as any), ...(req.body as any).contractData }
    : req.body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: first ? `${first.path.join(".") || "field"}: ${first.message}` : "Invalid contract data",
      details: parsed.error.errors,
    });
  }

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

      // Effective-dated history: the contract change is a salary + employment
      // event. Never overwrite the previous salary record.
      await applySalaryHistoryChange(tx, companyId, id, {
        salaryAmount: parsed.data.baseSalary,
        currency: parsed.data.currency,
        payFrequency: "MONTHLY",
        usdPercentage: parsed.data.usdPercentage,
        zigPercentage: parsed.data.zigPercentage,
        effectiveFrom: parsed.data.startDate,
        reason: "Contract created",
      });

      await tx.insert(employeeEmploymentHistory).values({
        companyId,
        employeeId: id,
        eventType: "CONTRACT_CHANGE",
        effectiveFrom: parsed.data.startDate,
        departmentId: emp.departmentId || null,
        positionId: emp.positionId || null,
        branchId: emp.branchId || null,
        employmentType: parsed.data.contractType,
        contractType: parsed.data.contractType,
        reason: "Contract created or renewed",
        createdBy: req.user?.id || null,
      });

      return newContract;
    });

    await auditPayroll(req, "PAYROLL_EMPLOYEE_CONTRACT_CREATED", "employee_contracts", contract.id, {
      employeeId: id,
      startDate: contract.startDate,
      currency: contract.currency,
    });
    res.status(201).json(contract);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const [emp] = await db.select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
      .limit(1);
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const [item] = await db.insert(payrollRecurringItems)
      .values({ employeeId, ...parsed.data, isActive: true })
      .returning();

    // Effective-dated income/deduction history record.
    if (item.type === "ALLOWANCE") {
      await db.insert(employeeIncomeHistory).values({
        companyId,
        employeeId,
        recurringItemId: item.id,
        name: item.name,
        amount: item.amount,
        calculationType: "FIXED",
        isTaxable: item.isTaxable,
        effectiveFrom: item.startDate,
        effectiveTo: item.endDate,
        reason: "Recurring allowance added",
        createdBy: req.user?.id || null,
      });
    } else {
      await db.insert(employeeDeductionHistory).values({
        companyId,
        employeeId,
        recurringItemId: item.id,
        name: item.name,
        amount: item.amount,
        calculationType: "FIXED",
        isTaxDeductible: item.isTaxDeductible,
        effectiveFrom: item.startDate,
        effectiveTo: item.endDate,
        reason: "Recurring deduction added",
        createdBy: req.user?.id || null,
      });
    }

    await auditPayroll(req, "PAYROLL_RECURRING_ITEM_CREATED", "payroll_recurring_items", item.id, {
      employeeId,
      type: item.type,
      amount: item.amount,
    });
    res.status(201).json(item);
  } catch (err: any) {
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const [existing] = await db.select({
        itemId: payrollRecurringItems.id,
        employeeId: payrollRecurringItems.employeeId,
        type: payrollRecurringItems.type,
        name: payrollRecurringItems.name,
        amount: payrollRecurringItems.amount,
        isTaxable: payrollRecurringItems.isTaxable,
        isTaxDeductible: payrollRecurringItems.isTaxDeductible,
        startDate: payrollRecurringItems.startDate,
        endDate: payrollRecurringItems.endDate,
        isActive: payrollRecurringItems.isActive,
      })
      .from(payrollRecurringItems)
      .innerJoin(employees, eq(payrollRecurringItems.employeeId, employees.id))
      .where(and(eq(payrollRecurringItems.id, id), eq(employees.companyId, companyId)))
      .limit(1);
    if (!existing) return res.status(404).json({ message: "Recurring payroll item not found" });

    const merged = { ...existing, ...parsed.data };
    const [item] = await db.update(payrollRecurringItems)
      .set(parsed.data)
      .where(eq(payrollRecurringItems.id, id))
      .returning();

    // Never overwrite history: record the change as a new effective-dated
    // version, closing the previous one.
    const today = new Date().toISOString().slice(0, 10);
    const effectiveFrom = parsed.data.startDate || today;
    const isClosing = parsed.data.isActive === false;
    const contentChanged = parsed.data.amount != null || parsed.data.name != null || parsed.data.startDate != null ||
      parsed.data.endDate != null || parsed.data.isTaxable != null || parsed.data.isTaxDeductible != null;

    if (isClosing || contentChanged) {
      if (item.type === "ALLOWANCE") {
        await db.update(employeeIncomeHistory)
          .set({ effectiveTo: isClosing ? addDays(today, -1) : addDays(effectiveFrom, -1) })
          .where(sql`${employeeIncomeHistory.recurringItemId} = ${id} AND ${employeeIncomeHistory.effectiveTo} IS NULL`);
      } else {
        await db.update(employeeDeductionHistory)
          .set({ effectiveTo: isClosing ? addDays(today, -1) : addDays(effectiveFrom, -1) })
          .where(sql`${employeeDeductionHistory.recurringItemId} = ${id} AND ${employeeDeductionHistory.effectiveTo} IS NULL`);
      }
    }
    if (contentChanged && merged.isActive !== false) {
      if (item.type === "ALLOWANCE") {
        await db.insert(employeeIncomeHistory).values({
          companyId,
          employeeId: merged.employeeId,
          recurringItemId: item.id,
          name: merged.name,
          amount: merged.amount,
          calculationType: "FIXED",
          isTaxable: merged.isTaxable,
          effectiveFrom,
          effectiveTo: merged.endDate || null,
          reason: "Recurring allowance changed",
          createdBy: req.user?.id || null,
        });
      } else {
        await db.insert(employeeDeductionHistory).values({
          companyId,
          employeeId: merged.employeeId,
          recurringItemId: item.id,
          name: merged.name,
          amount: merged.amount,
          calculationType: "FIXED",
          isTaxDeductible: merged.isTaxDeductible,
          effectiveFrom,
          effectiveTo: merged.endDate || null,
          reason: "Recurring deduction changed",
          createdBy: req.user?.id || null,
        });
      }
    }

    await auditPayroll(req, "PAYROLL_RECURRING_ITEM_UPDATED", "payroll_recurring_items", item.id, {
      employeeId: merged.employeeId,
      changedFields: Object.keys(parsed.data),
    });
    res.json(item);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  // Labour Act: Paternity leave is 3 working days
  if (parsed.data.leaveType === "PATERNITY" && parsed.data.totalDays > 3) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Paternity leave is limited to 3 working days per the Zimbabwe Labour Act",
    });
  }

  // Labour Act: Maternity leave is 98 consecutive days minimum
  if (parsed.data.leaveType === "MATERNITY" && parsed.data.totalDays < 98) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Maternity leave must be at least 98 consecutive days per the Zimbabwe Labour Act",
    });
  }

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
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

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
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
  }
});

router.post("/loans", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    employeeId: z.coerce.number().int(),
    loanType: z.enum(["LOAN", "ADVANCE"]).default("LOAN"),
    principalAmount: z.coerce.string(),
    interestRate: z.coerce.string().default("0.00"),
    // A term that arrives as 0, Infinity or NaN would divide the repayment by
    // nothing or fail the integer column, so both are derived and bounded here.
    repaymentTermMonths: z.coerce.number().int().min(1).max(600).optional().nullable(),
    monthlyRepaymentAmount: z.coerce.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const principal = toMoney(parsed.data.principalAmount);
    if (!(principal > 0)) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "A loan or advance must be for more than zero." });
    }
    const monthly = toNumber(parsed.data.monthlyRepaymentAmount);
    if (monthly < 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "The monthly deduction cannot be negative." });
    }
    const termMonths = parsed.data.repaymentTermMonths
      ?? Math.max(1, Math.ceil(principal / (monthly > 0 ? monthly : principal)));
    const monthlyRepaymentAmount = monthly > 0
      ? parsed.data.monthlyRepaymentAmount as string
      : roundMoney(principal / termMonths).toFixed(2);
    const [loan] = await db.insert(employeeLoans)
      .values({
        ...parsed.data,
        repaymentTermMonths: termMonths,
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
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
  }
});

// --- 7. STATUTORY CONFIGURATION ENDPOINTS ---
// These routes are the only write path for tax tables, and they write
// payroll_tax_tables + payroll_tax_brackets. Responses keep the historical
// `brackets` array shape so the HR tax tab contract is unchanged.
async function taxConfigView(tx: any, table: any) {
  const brackets = await loadTaxBrackets(tx, table.id);
  return { ...table, brackets, stale: isTaxTableStale(Number(table.taxYear)) };
}

const taxConfigInputSchema = z.object({
  currency: z.string().default("USD"),
  // Omitted means "the tenant's own country" - a default of "ZW" stamped a
  // Lesotho admin's bands under Zimbabwe.
  countryCode: z.string().trim().optional(),
  payFrequency: z.enum(["MONTHLY", "WEEKLY", "FORTNIGHTLY", "DAILY"]).default("MONTHLY"),
  taxYear: z.coerce.number().int().positive().optional(),
  sourceReference: z.string().trim().min(3, "Name the gazette or table you sourced this from").optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional().nullable(),
  brackets: z.array(z.object({
    min: z.number(),
    max: z.number().nullable(),
    rate: z.number(),
    deduction: z.number(),
  })),
});

async function insertTaxBands(tx: any, taxTableId: number, brackets: TaxBracket[]) {
  if (!brackets.length) return;
  await tx.insert(payrollTaxBrackets).values(brackets.map((band, index) => ({
    taxTableId,
    bracketOrder: index + 1,
    minIncome: band.min.toFixed(2),
    maxIncome: band.max === null ? null : band.max.toFixed(2),
    rate: band.rate.toFixed(6),
    deduction: band.deduction.toFixed(2),
  })));
}

router.get("/tax-config", async (req, res) => {
  try {
    const tables = await db.select()
      .from(payrollTaxTables)
      .orderBy(desc(payrollTaxTables.effectiveFrom), desc(payrollTaxTables.version));
    const results: any[] = [];
    for (const table of tables) results.push(await taxConfigView(db, table));
    res.json(results);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.post("/tax-config", requirePayrollApproval, async (req, res) => {
  const parsed = taxConfigInputSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  const periodError = assertValidPeriod(parsed.data.effectiveFrom, parsed.data.effectiveTo);
  if (periodError) return res.status(400).json({ error: "VALIDATION_ERROR", message: periodError });

  const bracketErrors = validateBrackets(parsed.data.brackets);
  if (bracketErrors.length) return res.status(400).json({ error: "INVALID_BRACKETS", details: bracketErrors });

  const bands = canonicalizeBrackets(parsed.data.brackets);
  const taxYear = parsed.data.taxYear ?? new Date(`${parsed.data.effectiveFrom}T00:00:00`).getFullYear();

  try {
    const countryCode = parsed.data.countryCode || (await payrollJurisdiction(getTargetCompanyId(req))).countryCode;
    const overlapError = await assertTaxConfigNoOverlap(db, parsed.data.currency, countryCode, parsed.data.payFrequency, parsed.data.effectiveFrom, parsed.data.effectiveTo);
    if (overlapError) return res.status(409).json({ error: "OVERLAPPING_PERIOD", message: overlapError });

    const table = await db.transaction(async (tx) => {
      // Close the currently open-ended table for this scope so only one table
      // is applicable at any point in time.
      await closeOpenTaxConfig(tx, parsed.data.currency, countryCode, parsed.data.payFrequency, parsed.data.effectiveFrom);

      const [created] = await tx.insert(payrollTaxTables).values({
        companyId: null,
        countryCode,
        currency: parsed.data.currency,
        taxYear,
        payFrequency: parsed.data.payFrequency,
        effectiveFrom: parsed.data.effectiveFrom,
        effectiveTo: parsed.data.effectiveTo ?? null,
        sourceReference: parsed.data.sourceReference ?? null,
        isActive: true,
      }).returning();

      await insertTaxBands(tx, created.id, bands);
      return created;
    });

    await auditPayroll(req, "PAYROLL_TAX_CONFIG_CREATED", "payroll_tax_tables", table.id, {
      currency: table.currency,
      taxYear: table.taxYear,
      effectiveFrom: table.effectiveFrom,
      bandCount: bands.length,
    });
    res.status(201).json(await taxConfigView(db, table));
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    // The rule belongs to the tenant's country. It used to be stamped "ZW" for
    // everyone, which filed a Lesotho tenant's pension rule under Zimbabwe.
    const jurisdiction = await payrollJurisdiction(companyId);
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
      .values({ ...ruleData, companyId, countryCode: jurisdiction.countryCode, isActive: true })
      .returning();
    await auditPayroll(req, "PAYROLL_STATUTORY_RULE_CREATED", "payroll_statutory_rules", rule.id, {
      ruleCode: rule.ruleCode,
      effectiveFrom: rule.effectiveFrom,
    });
    res.status(201).json(rule);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.patch("/statutory-rules/:id", requirePayrollApproval, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const companyId = getTargetCompanyId(req);

    const [existing] = await db.select().from(payrollStatutoryRules)
      .where(and(eq(payrollStatutoryRules.id, id), sql`${payrollStatutoryRules.companyId} = ${companyId} OR ${payrollStatutoryRules.companyId} IS NULL`));
    
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    // Allow updating rates and limits, but block changing ruleCode if system locked
    if (existing.isSystemLocked && req.body.ruleCode && req.body.ruleCode !== existing.ruleCode) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Cannot change the ruleCode of a system-locked statutory rule." });
    }

    // Immutability: rules already used by a finalized payroll run must not be
    // mutated in place. Government rate changes become a new version.
    if (await isStatutoryRuleReferenced(db, existing)) {
      return res.status(409).json({
        error: "IMMUTABLE",
        message: "This statutory rule has already been used by a finalized payroll run and cannot be edited. Create a new rule version covering the new period instead.",
      });
    }

    const [updated] = await db.update(payrollStatutoryRules)
      .set({
        ...req.body,
        ruleCode: existing.isSystemLocked ? existing.ruleCode : (req.body.ruleCode || existing.ruleCode),
        companyId: existing.companyId, // ensure it doesn't change
        isSystemLocked: existing.isSystemLocked // ensure it cannot be unlocked via API
      })
      .where(eq(payrollStatutoryRules.id, id))
      .returning();

    await auditPayroll(req, "PAYROLL_STATUTORY_RULE_UPDATED", "payroll_statutory_rules", id, { updatedFields: Object.keys(req.body) });
    res.json(updated);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.delete("/statutory-rules/:id", requirePayrollApproval, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const companyId = getTargetCompanyId(req);

    const [existing] = await db.select().from(payrollStatutoryRules)
      .where(and(eq(payrollStatutoryRules.id, id), sql`${payrollStatutoryRules.companyId} = ${companyId} OR ${payrollStatutoryRules.companyId} IS NULL`));
    
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (existing.isSystemLocked) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Cannot delete a system-locked statutory rule." });
    }
    if (await isStatutoryRuleReferenced(db, existing)) {
      return res.status(409).json({
        error: "IMMUTABLE",
        message: "This statutory rule has already been used by a finalized payroll run and cannot be deleted.",
      });
    }

    await db.delete(payrollStatutoryRules).where(eq(payrollStatutoryRules.id, id));
    await auditPayroll(req, "PAYROLL_STATUTORY_RULE_DELETED", "payroll_statutory_rules", id, { ruleCode: existing.ruleCode });
    res.json({ success: true });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// Edit an existing tax table (isActive is not touched here)
router.patch("/tax-config/:id", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid id" });

  const parsed = taxConfigInputSchema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  const periodError = assertValidPeriod(parsed.data.effectiveFrom, parsed.data.effectiveTo);
  if (periodError) return res.status(400).json({ error: "VALIDATION_ERROR", message: periodError });

  const bracketErrors = validateBrackets(parsed.data.brackets);
  if (bracketErrors.length) return res.status(400).json({ error: "INVALID_BRACKETS", details: bracketErrors });

  const bands = canonicalizeBrackets(parsed.data.brackets);

  try {
    const [existing] = await db.select().from(payrollTaxTables).where(eq(payrollTaxTables.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "Tax configuration not found" });

    // Immutability: once a table has been used to process payroll, it cannot be
    // edited in place. Government rate changes must be a new version.
    if (await isTaxConfigReferenced(db, id)) {
      return res.status(409).json({
        error: "IMMUTABLE",
        message: "This tax configuration has already been used to process payroll and cannot be edited. Create a new configuration with the new rates instead.",
      });
    }

    // An edit that does not name a country keeps the table where it is.
    const countryCode = parsed.data.countryCode || existing.countryCode;
    const overlapError = await assertTaxConfigNoOverlap(db, parsed.data.currency, countryCode, parsed.data.payFrequency, parsed.data.effectiveFrom, parsed.data.effectiveTo, id);
    if (overlapError) return res.status(409).json({ error: "OVERLAPPING_PERIOD", message: overlapError });

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(payrollTaxTables)
        .set({
          countryCode,
          currency: parsed.data.currency,
          payFrequency: parsed.data.payFrequency,
          taxYear: parsed.data.taxYear ?? existing.taxYear ?? new Date(`${parsed.data.effectiveFrom}T00:00:00`).getFullYear(),
          effectiveFrom: parsed.data.effectiveFrom,
          effectiveTo: parsed.data.effectiveTo ?? null,
          sourceReference: parsed.data.sourceReference ?? existing.sourceReference ?? null,
          version: Number(existing.version || 1) + 1,
        })
        .where(eq(payrollTaxTables.id, id))
        .returning();

      await tx.delete(payrollTaxBrackets).where(eq(payrollTaxBrackets.taxTableId, id));
      await insertTaxBands(tx, id, bands);
      return row;
    });

    await auditPayroll(req, "PAYROLL_TAX_CONFIG_UPDATED", "payroll_tax_tables", updated.id, {
      currency: updated.currency,
      taxYear: updated.taxYear,
      effectiveFrom: updated.effectiveFrom,
      bandCount: bands.length,
    });
    res.json(await taxConfigView(db, updated));
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// Activate a configuration. Applicability is determined by effective dates, so
// activating one table must NOT deactivate others — but two active tables must
// not cover the same period, and a table with gaps or mixed rate units must not
// be made live just because it was stored before validation existed.
router.post("/tax-config/:id/activate", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const [table] = await db.select().from(payrollTaxTables).where(eq(payrollTaxTables.id, id)).limit(1);
    if (!table) return res.status(404).json({ error: "NOT_FOUND", message: "Tax configuration not found" });

    const brackets = await loadTaxBrackets(db, id);
    if (!brackets.length) {
      return res.status(409).json({ error: "EMPTY_TABLE", message: "This tax table has no bands and cannot be activated." });
    }
    const bracketErrors = validateBrackets(brackets);
    if (bracketErrors.length) {
      return res.status(409).json({ error: "INVALID_BRACKETS", details: bracketErrors });
    }

    const overlapError = await assertTaxConfigNoOverlap(db, table.currency, table.countryCode, table.payFrequency, table.effectiveFrom, table.effectiveTo, id);
    if (overlapError) return res.status(409).json({ error: "OVERLAPPING_PERIOD", message: overlapError });

    const [updated] = await db.update(payrollTaxTables)
      .set({ isActive: true })
      .where(eq(payrollTaxTables.id, id))
      .returning();

    await auditPayroll(req, "PAYROLL_TAX_CONFIG_ACTIVATED", "payroll_tax_tables", updated.id, {
      currency: updated.currency,
      effectiveFrom: updated.effectiveFrom,
    });
    res.json(await taxConfigView(db, updated));
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// Deactivate a configuration
router.post("/tax-config/:id/deactivate", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const [updated] = await db.update(payrollTaxTables)
      .set({ isActive: false })
      .where(eq(payrollTaxTables.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "NOT_FOUND", message: "Tax configuration not found" });

    await auditPayroll(req, "PAYROLL_TAX_CONFIG_DEACTIVATED", "payroll_tax_tables", updated.id, {
      currency: updated.currency,
      effectiveFrom: updated.effectiveFrom,
    });
    res.json(await taxConfigView(db, updated));
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * Type lookups by code, across the tenant's own rows and the shared system
 * templates (companyId IS NULL) the list endpoints also show. A second row with
 * the same code would make a recurring assignment ambiguous, so writes refuse it.
 */
async function findPayrollTypeByCode(table: typeof payrollEarningTypes | typeof payrollDeductionTypes, companyId: number, code: string) {
  const [existing] = await db.select({ id: table.id, companyId: table.companyId })
    .from(table)
    .where(and(
      sql`${table.companyId} = ${companyId} OR ${table.companyId} IS NULL`,
      sql`lower(${table.code}) = lower(${code.trim()})`,
    ))
    .limit(1);
  return existing || null;
}

function respondDuplicateCode(res: any, label: string, code: string): boolean {
  res.status(409).json({
    error: "DUPLICATE_CODE",
    message: `A ${label} with the code "${code}" already exists. Payroll matches recurring items to their definition by code, so two rows sharing one would make every payslip ambiguous.`,
  });
  return true;
}

router.get("/earning-types", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const rows = await db.select()
      .from(payrollEarningTypes)
      .where(sql`${payrollEarningTypes.companyId} = ${companyId} OR ${payrollEarningTypes.companyId} IS NULL`)
      .orderBy(asc(payrollEarningTypes.code));
    res.json(rows);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.post("/earning-types", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    category: z.string().default("ALLOWANCE"),
    taxTreatment: z.enum(["TAXABLE", "NON_TAXABLE", "PARTIAL"]).default("TAXABLE"),
    taxablePercentage: z.coerce.number().min(0).max(100).default(100),
    isPensionable: z.boolean().default(false),
    isNssaApplicable: z.boolean().default(false),
    isRecurring: z.boolean().default(false),
    calculationMethod: z.string().default("FIXED"),
    formula: z.string().optional().nullable(),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const clash = await findPayrollTypeByCode(payrollEarningTypes, companyId, parsed.data.code);
    if (clash) return respondDuplicateCode(res, "earning type", parsed.data.code);
    const [row] = await db.insert(payrollEarningTypes)
      .values({
        ...parsed.data,
        taxablePercentage: parsed.data.taxablePercentage.toFixed(2),
        effectiveFrom: parsed.data.effectiveFrom || new Date().toISOString().slice(0, 10),
        companyId,
        countryCode: (await payrollJurisdiction(companyId)).countryCode,
        isActive: true,
      })
      .returning();
    await auditPayroll(req, "PAYROLL_EARNING_TYPE_CREATED", "payroll_earning_types", row.id, { code: row.code });
    res.status(201).json(row);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    taxablePercentage: z.coerce.number().min(0).max(100).optional(),
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const [existing] = await db.select()
      .from(payrollEarningTypes)
      .where(and(
        eq(payrollEarningTypes.id, id),
        sql`${payrollEarningTypes.companyId} = ${companyId} OR ${payrollEarningTypes.companyId} IS NULL`
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ message: "Earning type not found" });

    // A template row (companyId IS NULL) is read by every tenant, so editing it
    // here would rewrite somebody else's payroll. The company makes its own copy.
    if (existing.companyId !== companyId) {
      return res.status(422).json({
        error: "SYSTEM_TYPE_READ_ONLY",
        message: `"${existing.code}" is a built-in earning type shared by every account. Create your own earning type with a different code instead of changing it.`,
      });
    }

    if (parsed.data.code) {
      const clash = await findPayrollTypeByCode(payrollEarningTypes, companyId, parsed.data.code);
      if (clash && clash.id !== id) return respondDuplicateCode(res, "earning type", parsed.data.code);
    }

    const [row] = await db.update(payrollEarningTypes)
      .set({
        ...parsed.data,
        taxablePercentage: parsed.data.taxablePercentage != null ? parsed.data.taxablePercentage.toFixed(2) : undefined,
        effectiveFrom: parsed.data.effectiveFrom || undefined,
      })
      .where(and(eq(payrollEarningTypes.id, id), eq(payrollEarningTypes.companyId, companyId)))
      .returning();
    await auditPayroll(req, "PAYROLL_EARNING_TYPE_UPDATED", "payroll_earning_types", row.id, { code: row.code });
    res.json(row);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
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
    employeeRate: z.coerce.number().min(0).max(100).default(0),
    employerRate: z.coerce.number().min(0).max(100).default(0),
    maxAmount: z.coerce.number().min(0).optional().nullable(),
    priorityOrder: z.coerce.number().int().default(100),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const clash = await findPayrollTypeByCode(payrollDeductionTypes, companyId, parsed.data.code);
    if (clash) return respondDuplicateCode(res, "deduction type", parsed.data.code);
    const [row] = await db.insert(payrollDeductionTypes)
      .values({
        ...parsed.data,
        employeeRate: parsed.data.employeeRate.toFixed(6),
        employerRate: parsed.data.employerRate.toFixed(6),
        maxAmount: parsed.data.maxAmount != null ? parsed.data.maxAmount.toFixed(2) : null,
        effectiveFrom: parsed.data.effectiveFrom || new Date().toISOString().slice(0, 10),
        companyId,
        countryCode: (await payrollJurisdiction(companyId)).countryCode,
        isActive: true,
      })
      .returning();
    await auditPayroll(req, "PAYROLL_DEDUCTION_TYPE_CREATED", "payroll_deduction_types", row.id, { code: row.code });
    res.status(201).json(row);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
  }
});

// GET /dashboard - HR dashboard live metrics
router.get("/dashboard", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);

    const [empCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, "ACTIVE")));
    const [deptCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(departments)
      .where(eq(departments.companyId, companyId));
    const [leavePending] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "PENDING")));
    const [loansPending] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeeLoans)
      .where(and(eq(employeeLoans.companyId, companyId), eq(employeeLoans.status, "PENDING")));

    const recentRuns = await db.select()
      .from(payrollRuns)
      .where(eq(payrollRuns.companyId, companyId))
      .orderBy(desc(payrollRuns.periodEnd))
      .limit(6);

    // Current-year payroll totals from locked runs. ZiG and USD runs are different
    // money, so they are totalled apart instead of added into one meaningless sum.
    const year = String(new Date().getFullYear());
    const yearRuns = await db.select({
      totalGross: payrollRuns.totalGross,
      totalDeductions: payrollRuns.totalDeductions,
      totalNet: payrollRuns.totalNet,
      currency: payrollRuns.currency,
    })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        gte(payrollRuns.periodStart, `${year}-01-01`),
        lte(payrollRuns.periodEnd, `${year}-12-31`),
        eq(payrollRuns.status, "LOCKED")
      ));
    const [companyRow] = await db.select({ currency: companies.currency, country: companies.country })
      .from(companies)
      .where(eq(companies.id, companyId));

    const grouped = new Map<string, typeof yearRuns>();
    for (const run of yearRuns) {
      const key = displayCurrency(run.currency);
      grouped.set(key, [...(grouped.get(key) ?? []), run]);
    }
    const yearTotalsByCurrency = [...grouped.entries()].map(([currency, rows]) => ({
      currency,
      totalGross: sumMoney(rows.map((r) => r.totalGross)),
      totalDeductions: sumMoney(rows.map((r) => r.totalDeductions)),
      totalNet: sumMoney(rows.map((r) => r.totalNet)),
    }));
    const bookedCurrency = displayCurrency(companyRow?.currency);
    const yearTotals = yearTotalsByCurrency.find((t) => t.currency === bookedCurrency)
      ?? yearTotalsByCurrency[0]
      ?? { currency: bookedCurrency, totalGross: 0, totalDeductions: 0, totalNet: 0 };

    const statusCounts: Record<string, number> = {};
    for (const r of recentRuns) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }

    res.json({
      totalEmployees: empCount?.count ?? 0,
      totalDepartments: deptCount?.count ?? 0,
      pendingLeaveRequests: leavePending?.count ?? 0,
      pendingLoans: loansPending?.count ?? 0,
      latestRun: recentRuns[0] ?? null,
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        currency: r.currency,
        totalGross: r.totalGross,
        totalDeductions: r.totalDeductions,
        totalNet: r.totalNet,
      })),
      statusCounts,
      yearTotals: {
        ...yearTotals,
        totalTax: yearTotals.totalDeductions,
      },
      // Every other currency the year was paid in, so the dashboard can say the
      // headline figure is not the whole payroll.
      yearTotalsByCurrency,
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// GET /runs/:id/worksheet - Grid calculations worksheet
// POST /runs - Initiate draft run
/**
 * Payroll pays people, not periods, so two runs are a double payment only when
 * their date ranges overlap AND they can cover the same staff: a company-wide
 * run (no branch) reaches every branch, a branch run reaches its own. Matching
 * on the exact period and branch, as this used to, let a company run and a
 * branch run for the same month through together.
 */
async function findOverlappingRun(
  executor: any,
  args: { companyId: number; periodStart: string; periodEnd: string; currency: string; runType: string; branchId: number | null }
) {
  const overlapping = await executor.select().from(payrollRuns).where(and(
    eq(payrollRuns.companyId, args.companyId),
    eq(payrollRuns.runType, args.runType),
    eq(payrollRuns.currency, args.currency),
    ne(payrollRuns.status, "REVERSED"),
    lte(payrollRuns.periodStart, args.periodEnd),
    gte(payrollRuns.periodEnd, args.periodStart)
  ));
  return overlapping.find((run: any) =>
    args.branchId === null || run.branchId === null || Number(run.branchId) === args.branchId
  ) || null;
}

router.post("/runs", requirePayrollWrite, async (req, res) => {
  const schema = z.object({
    periodStart: z.string(),
    periodEnd: z.string(),
    payFrequency: z.string().default("MONTHLY"),
    currency: z.string().default("USD"),
    exchangeRate: z.coerce.string().default("1.000000"),
    branchId: z.coerce.number().int().optional().nullable(),
    runType: z.enum(["REGULAR", "BONUS"]).default("REGULAR"),
    prorate: z.boolean().default(true),
    prorationBasis: z.enum(["CALENDAR_DAYS", "WORKING_DAYS", "PAYABLE_DAYS", "HOURS_WORKED"]).default("CALENDAR_DAYS"),
    bonuses: z.array(z.object({ employeeId: z.number().int(), amount: z.number() })).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  const isBonusRun = parsed.data.runType === "BONUS";
  const bonusMap = new Map((parsed.data.bonuses || []).map((b) => [b.employeeId, b.amount]));

  try {
    const companyId = getTargetCompanyId(req);
    const branchId = parsed.data.branchId ?? null;

    // Which levies this tenant owes, and what a run may be paid in, is a
    // property of the country the company trades in - not of the code path.
    const jurisdiction = await payrollJurisdiction(companyId);
    if (!supportsCurrency(jurisdiction, parsed.data.currency)) {
      return res.status(422).json({
        error: "UNSUPPORTED_PAYROLL_CURRENCY",
        message: `${jurisdiction.name} payroll runs in ${jurisdiction.currencies.join(" or ")}. Requested currency: ${parsed.data.currency}.`,
        currencies: jurisdiction.currencies,
      });
    }

    // 0. Duplicate run validation: no other live run may overlap this period
    // for the same currency, run type and staff.
    const existingRun = await findOverlappingRun(db, {
      companyId,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      currency: parsed.data.currency,
      runType: parsed.data.runType,
      branchId,
    });
    if (existingRun) {
      return res.status(409).json({
        error: "DUPLICATE_PAYROLL_RUN",
        message: `Run #${existingRun.id} already pays ${existingRun.branchId ? `branch ${existingRun.branchId}` : "the whole company"} for ${existingRun.periodStart} to ${existingRun.periodEnd} in ${existingRun.currency}. Reverse it first or lock the new run for a different period.`,
        existingRunId: existingRun.id,
      });
    }

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
      // Creation is check-then-insert with no unique constraint behind it, so
      // two clerks clicking at once could both pass the validation above and
      // pay the same staff twice. This lock serialises run creation per company
      // for the life of the transaction - no schema change needed.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`payroll-run-${companyId}`}))`);

      const racingRun = await findOverlappingRun(tx, {
        companyId,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        currency: parsed.data.currency,
        runType: parsed.data.runType,
        branchId,
      });
      if (racingRun) {
        throw new PayrollHttpError(409, `Run #${racingRun.id} was created for this period while you were starting this one. Reload the run list.`, "DUPLICATE_PAYROLL_RUN");
      }

      // 1. Create run header
      const [newRun] = await tx.insert(payrollRuns)
        .values({
          companyId,
          branchId: branchId || null,
          periodStart: parsed.data.periodStart,
          periodEnd: parsed.data.periodEnd,
          payFrequency: parsed.data.payFrequency,
          currency: parsed.data.currency,
          exchangeRate: parsed.data.exchangeRate,
          runType: parsed.data.runType,
          prorationBasis: parsed.data.prorationBasis,
          status: "DRAFT"
        })
        .returning();

      // 2. Fetch active tax configurations
      const taxConfig = await loadEffectiveTaxConfig(tx, parsed.data.currency, parsed.data.payFrequency, parsed.data.periodStart, parsed.data.periodEnd);

      if (!taxConfig) {
        throw new PayrollHttpError(422, `Effective tax configuration not found for ${parsed.data.currency} ${parsed.data.payFrequency} covering ${parsed.data.periodStart} to ${parsed.data.periodEnd}`, "TAX_CONFIG_NOT_FOUND");
      }

      // 2b. Load effective statutory rule overrides (ZIMDEF, STANDARDS_LEVY,
      // APWCS, PENSION, NSSA_POBS, AIDS_LEVY) for the run period.
      const statutoryRules = await loadEffectiveStatutoryRules(tx, companyId, parsed.data.currency, parsed.data.payFrequency, parsed.data.periodStart, parsed.data.periodEnd);

      const missingRules = missingRequiredRules(jurisdiction, Object.keys(statutoryRules));
      if (missingRules.length > 0) {
        throw new PayrollHttpError(422, `Missing required statutory rules for ${jurisdiction.name} payroll (${missingRules.join(", ")}). Please configure them in the Statutory Settings before running payroll.`, "STATUTORY_RULES_MISSING");
      }

      // A levy this country does not charge stays at zero even when another
      // tenant's rule rows are visible: ZW rates must never price a payslip
      // outside Zimbabwe.
      const levyRate = (ruleCode: string, field: "employeeRate" | "employerRate", fallback: number) =>
        jurisdictionLevies(jurisdiction, ruleCode) ? statutoryRate(statutoryRules[ruleCode], field, fallback) : 0;
      // Older tenants stored the Standards levy under STANDARDS, so read either.
      const standardsRule = statutoryRules["STANDARDS_LEVY"] || statutoryRules["STANDARDS"];

      // 3. For each employee, fetch contract details and perform payroll calculations
      for (const emp of activeEmployees) {
        const contract = emp.contracts[0];
        if (!contract) continue; // Skip if no active contract

        // Skip employees whose contract currency does not match run currency (unless contract is SPLIT)
        if (contract.currency !== "SPLIT" && contract.currency !== parsed.data.currency) {
          continue;
        }

        // --- Proration: mid-period joins and terminations ---
        // Salary is scaled by calendar days actually worked inside the period.
        const periodStartDate = new Date(parsed.data.periodStart + "T00:00:00");
        const periodEndDate = new Date(parsed.data.periodEnd + "T00:00:00");
        const totalDays = Math.floor((periodEndDate.getTime() - periodStartDate.getTime()) / 86400000) + 1;
        const joinDate = new Date(emp.joiningDate + "T00:00:00");
        const termDate = emp.terminationDate ? new Date(emp.terminationDate + "T00:00:00") : null;
        const effectiveStart = joinDate > periodStartDate ? joinDate : periodStartDate;
        const effectiveEnd = termDate && termDate < periodEndDate ? termDate : periodEndDate;
        if (effectiveStart > effectiveEnd) continue; // joined after period end / left before period start

        const daysWorked = Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;

        // Resolve the salary applicable to this period from the immutable
        // effective-dated salary history (falling back to the active contract).
        // A mid-period salary increase blends the old + new rates across the
        // days each applied (never overwrites history).
        const salarySlices = await loadEffectiveSalarySlices(tx, emp.id, parsed.data.periodStart, parsed.data.periodEnd, contract);
        const blendedSalary = blendSalary(salarySlices, parsed.data.periodStart, parsed.data.periodEnd);
        const effectiveSalary = {
          baseSalary: blendedSalary > 0 ? String(blendedSalary) : String(contract?.baseSalary ?? "0"),
          currency: salarySlices[0]?.currency ?? contract?.currency ?? "USD",
          payFrequency: salarySlices[0]?.payFrequency ?? contract?.payFrequency ?? "MONTHLY",
          usdPercentage: salarySlices[0]?.usdPercentage ?? contract?.usdPercentage ?? "100.00",
          zigPercentage: salarySlices[0]?.zigPercentage ?? contract?.zigPercentage ?? "0.00",
          source: salarySlices.length > 0 ? "salary_history" : "contract",
          historyId: salarySlices[0]?.id ?? null,
        };

        // Configurable proration: joins / leaves / hours worked are measured on
        // the run's chosen basis (calendar, working, payable days or hours).
        const proration = computeProration({
          periodStart: parsed.data.periodStart,
          periodEnd: parsed.data.periodEnd,
          joinDate: emp.joiningDate,
          terminationDate: emp.terminationDate,
          options: { basis: parsed.data.prorationBasis },
        });
        const prorated = parsed.data.prorate && !isBonusRun && proration.isProrated;

        let effectiveBaseSalary = prorated
          ? roundMoney(toMoney(effectiveSalary.baseSalary) * proration.factor)
          : toMoney(effectiveSalary.baseSalary);

        const bonusAmount = isBonusRun ? (bonusMap.get(emp.id) ?? 0) : 0;
        const isTerminal = !!emp.terminationDate && emp.terminationDate >= parsed.data.periodStart && emp.terminationDate <= parsed.data.periodEnd;

        // Bonus runs only pay employees who have a bonus amount set; a $0 line
        // would otherwise pollute the run with empty payslips.
        if (isBonusRun && bonusAmount <= 0) continue;

        // 13th cheque annual accumulation: the $400 tax-free threshold applies
        // per tax year, so bonuses already paid in earlier bonus runs this year
        // count towards it (otherwise every run would re-grant the $400).
        let ytdBonusAmount = 0;
        if (isBonusRun) {
          const yearStart = `${new Date(parsed.data.periodStart + "T00:00:00").getFullYear()}-01-01`;
          const priorBonus = await tx
            .select({ bonus: sql<number>`(${payrollRunEmployees.snapshotData}->>'bonusAmount')::numeric` })
            .from(payrollRunEmployees)
            .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunEmployees.payrollRunId))
            .where(and(
              eq(payrollRunEmployees.employeeId, emp.id),
              eq(payrollRuns.runType, "BONUS"),
              ne(payrollRuns.status, "REVERSED"),
              gte(payrollRuns.periodStart, yearStart)
            ));
          ytdBonusAmount = sumMoney(priorBonus.map((row: any) => row.bonus));
        }

        // For bonus runs the employee's regular salary is not paid again; the
        // engine receives base 0 + bonusAmount and taxes it per the 13th
        // cheque rules (tax-free threshold + cumulative annual treatment).
        const engineBaseSalary = isBonusRun ? 0 : effectiveBaseSalary;

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
        // Items that start/end mid-period are paid pro-rata for the days they ran.
        const recurringItems = await loadActiveRecurringItems(tx, emp.id, parsed.data.periodStart, parsed.data.periodEnd, {
          basis: parsed.data.prorationBasis,
          prorate: parsed.data.prorate && !isBonusRun,
          joinDate: emp.joiningDate,
          terminationDate: emp.terminationDate,
        });

        // Fetch outstanding loan repayment defaults
        const [activeLoan] = await tx.select()
          .from(employeeLoans)
          .where(and(
            eq(employeeLoans.employeeId, emp.id),
            eq(employeeLoans.status, "ACTIVE")
          ))
          .limit(1);
        
        const loanDeduction = activeLoan
          ? centsToMoney(Math.min(centsOf(activeLoan.remainingBalance), centsOf(activeLoan.monthlyRepaymentAmount)))
          : 0;

        // Feed recurring items and the loan repayment into the engine so gross,
        // taxable income, PAYE and net pay all reflect them. (Previously the
        // engine received elements: [] and the recurring amounts only appeared
        // as side rows on the payslip without affecting the calculation.)
        // Bonus runs contain only the bonus payment - no recurring items/loans.
        const elements: PayrollElementInput[] = isBonusRun ? [] : [
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
        if (loanDeduction > 0 && !isBonusRun) {
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

        // The rates actually charged, hoisted so the snapshot records what the
        // engine got instead of re-reading rule rows that may not exist in this
        // country.
        const appliedStatutoryRates = {
          aidsLevyRate: levyRate("AIDS_LEVY", "employeeRate", ZIMBABWE_STATUTORY_DEFAULTS.aidsLevyRate),
          nssaRateEmployee: levyRate("NSSA_POBS", "employeeRate", ZIMBABWE_STATUTORY_DEFAULTS.nssaRateEmployee),
          nssaRateEmployer: levyRate("NSSA_POBS", "employerRate", ZIMBABWE_STATUTORY_DEFAULTS.nssaRateEmployer),
          nssaCeilingLimit: jurisdictionLevies(jurisdiction, "NSSA_POBS") ? toMoney(statutoryRules["NSSA_POBS"]?.ceilingAmount) : 0,
          zimdefRate: levyRate("ZIMDEF", "employerRate", ZIMBABWE_STATUTORY_DEFAULTS.zimdefRate),
          standardsLevyRate: jurisdictionLevies(jurisdiction, "STANDARDS_LEVY") ? statutoryRate(standardsRule, "employerRate", ZIMBABWE_STATUTORY_DEFAULTS.standardsLevyRate) : 0,
          apwcsRate: jurisdictionLevies(jurisdiction, "APWCS") && statutoryRules["APWCS"] ? statutoryRate(statutoryRules["APWCS"], "employerRate", 0.005) : undefined,
        };

        // Perform calculation
        const calcs = ZimbabwePayrollEngine.calculateEmployeeLine({
          baseSalary: engineBaseSalary,
          payFrequency: parsed.data.payFrequency as "MONTHLY" | "WEEKLY" | "FORTNIGHTLY" | "DAILY",
          bonusAmount: isBonusRun ? bonusAmount : undefined,
          ytdBonusAmount: isBonusRun ? ytdBonusAmount : undefined,
          pensionEmployeeRate,
          pensionEmployerRate,
          apwcsRate: appliedStatutoryRates.apwcsRate,
          necRate: jurisdictionLevies(jurisdiction, "NEC") ? toNumber(necRate) : 0,
          necEmployerRate: jurisdictionLevies(jurisdiction, "NEC") ? toNumber(necEmployerRate) : 0,
          necFixedAmount: jurisdictionLevies(jurisdiction, "NEC") ? toNumber(necFixedAmount) : 0,
          usdPercentage: toNumber(effectiveSalary.usdPercentage),
          zigPercentage: toNumber(effectiveSalary.zigPercentage),
          exchangeRate: toNumber(parsed.data.exchangeRate),
          elements,
          taxConfig: {
            brackets: taxConfig.brackets as TaxBracket[],
          },
          statutoryConfig: {
            ...ZIMBABWE_STATUTORY_DEFAULTS,
            ...appliedStatutoryRates,
          }
        });

        // Req 5.13: Skip employees with zero gross salary in standard regular runs
        if (calcs.grossSalary <= 0 && !isBonusRun) {
          continue;
        }

        // A negative net is an impossible payslip: it would book a wages payable
        // credit the bank file then tries to pay backwards.
        if (calcs.netSalary < 0) {
          throw new PayrollHttpError(
            422,
            `Deductions exceed gross pay for ${emp.firstName} ${emp.lastName} (net ${calcs.netSalary.toFixed(2)}). Reduce the loan repayment or deductions before running payroll.`,
            "NEGATIVE_NET_PAY",
          );
        }

        const processedEarnings = calcs.processedEarnings;
        const processedDeductions = calcs.processedDeductions;
        const taxableAllowances = sumMoney(processedEarnings.filter((e) => e.isTaxable).map((e) => e.amount));
        const nontaxableAllowances = sumMoney(processedEarnings.filter((e) => !e.isTaxable).map((e) => e.amount));
        const recurringDeductionTotal = sumMoney(processedDeductions.map((d) => d.amount));
        const taxDeductibleDeductions = sumMoney(processedDeductions.filter((d) => d.isTaxDeductible).map((d) => d.amount));

        // Insert employee payroll run line
        const [runEmployeeLine] = await tx.insert(payrollRunEmployees)
          .values({
            payrollRunId: newRun.id,
            employeeId: emp.id,
            basicSalary: calcs.basicSalary.toFixed(2),
            grossSalary: calcs.grossSalary.toFixed(2),
            netSalary: calcs.netSalary.toFixed(2),
            // The amount withheld for tax is the credit-relieved PAYE - that is
            // what the employee is deducted by and what ZIMRA is owed. payeRaw
            // stays in the snapshot for the ITF16 credit column.
            paye: calcs.payeAfterCredit.toFixed(2),
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
              salaryHistoryId: effectiveSalary.historyId,
              salarySource: effectiveSalary.source,
              calculationBasis: isBonusRun ? "BONUS_RUN" : (prorated ? "PRORATED" : "INITIAL_RUN"),
              proration: prorated ? {
                basis: proration.basis,
                daysWorked,
                totalDays,
                factor: proration.factor,
                breakdown: proration.breakdown,
              } : null,
              isTerminal: isTerminal || false,
              bonusAmount: isBonusRun ? bonusAmount : null,
              ytdBonusAmount: isBonusRun ? ytdBonusAmount : null,
              loanId: activeLoan?.id || null,
              loanDeduction: isBonusRun ? 0 : loanDeduction,
              recurringItemIds: recurringItems.map((item: any) => item.id),
              taxableAllowances,
              nontaxableAllowances,
              recurringDeductionTotal,
              taxDeductibleDeductions,
              pensionEmployeeRate,
              pensionEmployerRate,
              statutoryRatesUsed: {
                ...appliedStatutoryRates,
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
          { name: "PAYE", amount: calcs.payeAfterCredit, isTaxDeductible: false, deductionType: "PAYE" },
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
      const totalBasic = sumMoney(lines.map((line) => line.basicSalary));
      const totalGross = sumMoney(lines.map((line) => line.grossSalary));
      const totalDeductions = sumMoney(lines.map((line) => line.totalDeductions));
      const totalNet = sumMoney(lines.map((line) => line.netSalary));

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
    respondPayrollError(res, err);
  }
});

// GET /runs/:id - Detailed payroll run view with employee lines, allowances, and deductions
router.get("/runs/:id", async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  if (!Number.isInteger(runId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid run ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const run = await db.query.payrollRuns.findFirst({
      where: and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)),
      with: {
        branch: true,
        approvedByUser: true,
        lockedByUser: true,
        journalEntry: true,
        reversalOfRun: true,
        runEmployees: {
          with: {
            employee: true,
            allowances: true,
            deductions: true,
            payslipDocuments: true,
          }
        }
      }
    });

    if (!run) return res.status(404).json({ error: "NOT_FOUND", message: "Payroll run not found" });
    res.json(run);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// PUT /runs/:id/adjustments - Update allowances, overtime, or manual line adjustments on DRAFT runs
router.put("/runs/:id/adjustments", requirePayrollWrite, async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  if (!Number.isInteger(runId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid run ID" });

  const schema = z.object({
    employeeId: z.number().int(),
    allowances: z.array(z.object({
      name: z.string().min(1),
      amount: z.number().min(0),
      isTaxable: z.boolean().default(true),
      allowanceType: z.string().default("OTHER"),
    })).optional(),
    deductions: z.array(z.object({
      name: z.string().min(1),
      amount: z.number().min(0),
      isTaxDeductible: z.boolean().default(false),
      deductionType: z.string().default("OTHER"),
    })).optional(),
    auditNote: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    // Which levies apply is a property of the company's country, same as at run
    // creation - an adjustment must re-price the line under the same rules.
    const jurisdiction = await payrollJurisdiction(companyId);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);

    if (!run) return res.status(404).json({ error: "NOT_FOUND", message: "Payroll run not found" });
    if (run.status !== "DRAFT") {
      return res.status(409).json({ error: "STATE_ERROR", message: "Adjustments can only be made to DRAFT payroll runs" });
    }

    const [runLine] = await db.select().from(payrollRunEmployees)
      .where(and(eq(payrollRunEmployees.payrollRunId, runId), eq(payrollRunEmployees.employeeId, parsed.data.employeeId)))
      .limit(1);

    if (!runLine) return res.status(404).json({ error: "NOT_FOUND", message: "Employee line not found in this payroll run" });

    const reservedSubmitted = [...new Set((parsed.data.deductions || [])
      .map((d) => String(d.deductionType || "OTHER").toUpperCase())
      .filter((type) => ENGINE_DEDUCTION_TYPES.has(type)))];
    if (reservedSubmitted.length > 0) {
      return res.status(400).json({
        error: "RESERVED_DEDUCTION_TYPE",
        message: `${reservedSubmitted.join(", ")} are calculated by payroll from the whole payslip and cannot be entered by hand.`,
      });
    }

    await db.transaction(async (tx) => {
      // 1. Replace the clerk-entered earnings
      if (parsed.data.allowances) {
        await tx.delete(payrollAllowances).where(eq(payrollAllowances.payrollRunEmployeeId, runLine.id));
        if (parsed.data.allowances.length > 0) {
          await tx.insert(payrollAllowances).values(parsed.data.allowances.map((a) => ({
            payrollRunEmployeeId: runLine.id,
            name: a.name,
            amount: a.amount.toFixed(2),
            isTaxable: a.isTaxable,
            isCash: true,
            allowanceType: a.allowanceType,
          })));
        }
      }

      // 2. Replace only the clerk-entered deductions. The calculated lines
      // (PAYE, AIDS levy, NSSA, NEC, pension) stay until the recalculation
      // below rewrites them, and a loan repayment is kept - dropping it used to
      // silently stop the employee repaying and leave PAYE computed on old pay.
      if (parsed.data.deductions) {
        const editable = [...ENGINE_DEDUCTION_TYPES].map((type) => sql`${payrollDeductions.deductionType} != ${type}`);
        await tx.delete(payrollDeductions).where(and(
          eq(payrollDeductions.payrollRunEmployeeId, runLine.id),
          ...editable
        ));
        if (parsed.data.deductions.length > 0) {
          await tx.insert(payrollDeductions).values(parsed.data.deductions.map((d) => ({
            payrollRunEmployeeId: runLine.id,
            name: d.name,
            amount: d.amount.toFixed(2),
            isTaxDeductible: d.isTaxDeductible,
            deductionType: String(d.deductionType || "OTHER").toUpperCase(),
          })));
        }
      }

      // 3. Recalculate the line with the same engine the run was created with,
      // so gross, taxable income, PAYE, NSSA and net pay move together.
      const currentAllowances = await tx.select().from(payrollAllowances).where(eq(payrollAllowances.payrollRunEmployeeId, runLine.id));
      const currentDeductions = await tx.select().from(payrollDeductions).where(eq(payrollDeductions.payrollRunEmployeeId, runLine.id));

      const elements: PayrollElementInput[] = [
        ...currentAllowances.map((a) => ({
          type: "EARNING" as const,
          name: a.name,
          calculationMethod: "FIXED" as const,
          amount: toMoney(a.amount),
          isTaxable: !!a.isTaxable,
          isRecurring: false,
        })),
        ...currentDeductions
          .filter((d) => !ENGINE_DEDUCTION_TYPES.has(d.deductionType))
          .map((d) => ({
            type: "DEDUCTION" as const,
            name: d.name,
            calculationMethod: "FIXED" as const,
            amount: toMoney(d.amount),
            isTaxDeductible: !!d.isTaxDeductible,
            isRecurring: false,
          })),
      ];

      const taxConfig = await loadEffectiveTaxConfig(tx, run.currency, run.payFrequency, run.periodStart, run.periodEnd);
      if (!taxConfig) {
        throw new PayrollHttpError(422, `Effective tax configuration not found for ${run.currency} ${run.payFrequency} covering ${run.periodStart} to ${run.periodEnd}`, "TAX_CONFIG_NOT_FOUND");
      }
      const statutoryRules = await loadEffectiveStatutoryRules(tx, companyId, run.currency, run.payFrequency, run.periodStart, run.periodEnd);
      const missingRules = missingRequiredRules(jurisdiction, Object.keys(statutoryRules));
      if (missingRules.length > 0) {
        throw new PayrollHttpError(422, `Missing required statutory rules for ${jurisdiction.name} payroll (${missingRules.join(", ")}). Configure them in Statutory Settings before adjusting payroll.`, "STATUTORY_RULES_MISSING");
      }
      const levyRate = (ruleCode: string, field: "employeeRate" | "employerRate", fallback: number) =>
        jurisdictionLevies(jurisdiction, ruleCode) ? statutoryRate(statutoryRules[ruleCode], field, fallback) : 0;
      // Older tenants stored the Standards levy under STANDARDS, so read either.
      const standardsRule = statutoryRules["STANDARDS_LEVY"] || statutoryRules["STANDARDS"];

      const snapshot = runSnapshot(runLine.snapshotData);
      let necRate = "0.0000";
      let necEmployerRate = "0.0000";
      let necFixedAmount = "0.00";
      const contractId = Number(snapshot.contractId || 0);
      if (contractId) {
        const [contract] = await tx.select().from(employeeContracts)
          .where(and(eq(employeeContracts.id, contractId), eq(employeeContracts.employeeId, runLine.employeeId)))
          .limit(1);
        if (contract?.necSectorId) {
          const [nec] = await tx.select().from(necSectorsConfig)
            .where(eq(necSectorsConfig.id, contract.necSectorId))
            .limit(1);
          if (nec) {
            necRate = nec.employeeRate;
            necEmployerRate = nec.employerRate;
            necFixedAmount = nec.fixedAmount;
          }
        }
      }

      const pensionRule = statutoryRules["PENSION"];
      const isBonusLine = run.runType === "BONUS";
      const calcs = ZimbabwePayrollEngine.calculateEmployeeLine({
        baseSalary: isBonusLine ? 0 : toMoney(runLine.basicSalary),
        payFrequency: run.payFrequency as "MONTHLY" | "WEEKLY" | "FORTNIGHTLY" | "DAILY",
        bonusAmount: isBonusLine ? toMoney(snapshot.bonusAmount) : undefined,
        ytdBonusAmount: isBonusLine ? toMoney(snapshot.ytdBonusAmount) : undefined,
        pensionEmployeeRate: pensionRule ? statutoryRate(pensionRule, "employeeRate", 0) : 0,
        pensionEmployerRate: pensionRule ? statutoryRate(pensionRule, "employerRate", 0) : 0,
        apwcsRate: jurisdictionLevies(jurisdiction, "APWCS") && statutoryRules["APWCS"] ? statutoryRate(statutoryRules["APWCS"], "employerRate", 0.005) : undefined,
        necRate: jurisdictionLevies(jurisdiction, "NEC") ? toNumber(necRate) : 0,
        necEmployerRate: jurisdictionLevies(jurisdiction, "NEC") ? toNumber(necEmployerRate) : 0,
        necFixedAmount: jurisdictionLevies(jurisdiction, "NEC") ? toNumber(necFixedAmount) : 0,
        usdPercentage: toMoney(runLine.usdPercentage),
        zigPercentage: toMoney(runLine.zigPercentage),
        exchangeRate: toMoney(run.exchangeRate),
        elements,
        taxConfig: { brackets: taxConfig.brackets as TaxBracket[] },
        statutoryConfig: {
          ...ZIMBABWE_STATUTORY_DEFAULTS,
          aidsLevyRate: levyRate("AIDS_LEVY", "employeeRate", ZIMBABWE_STATUTORY_DEFAULTS.aidsLevyRate),
          nssaRateEmployee: levyRate("NSSA_POBS", "employeeRate", ZIMBABWE_STATUTORY_DEFAULTS.nssaRateEmployee),
          nssaRateEmployer: levyRate("NSSA_POBS", "employerRate", ZIMBABWE_STATUTORY_DEFAULTS.nssaRateEmployer),
          nssaCeilingLimit: jurisdictionLevies(jurisdiction, "NSSA_POBS") ? toMoney(statutoryRules["NSSA_POBS"]?.ceilingAmount) : 0,
          zimdefRate: levyRate("ZIMDEF", "employerRate", ZIMBABWE_STATUTORY_DEFAULTS.zimdefRate),
          standardsLevyRate: jurisdictionLevies(jurisdiction, "STANDARDS_LEVY") ? statutoryRate(standardsRule, "employerRate", ZIMBABWE_STATUTORY_DEFAULTS.standardsLevyRate) : 0,
        }
      });

      if (calcs.netSalary < 0) {
        throw new PayrollHttpError(422, `Deductions exceed gross pay for this employee (net ${calcs.netSalary.toFixed(2)}). Reduce the deductions before adjusting the line.`, "NEGATIVE_NET_PAY");
      }

      const { snapshotHash: _oldHash, snapshotVersion: _oldVersion, ...snapshotCarryOver } = snapshot;
      await tx.update(payrollRunEmployees)
        .set({
          grossSalary: calcs.grossSalary.toFixed(2),
          netSalary: calcs.netSalary.toFixed(2),
          paye: calcs.payeAfterCredit.toFixed(2),
          aidsLevy: calcs.aidsLevy.toFixed(2),
          nssaEmployee: calcs.nssaEmployee.toFixed(2),
          nssaEmployer: calcs.nssaEmployer.toFixed(2),
          necEmployee: calcs.necEmployee.toFixed(2),
          necEmployer: calcs.necEmployer.toFixed(2),
          netSalaryUsd: calcs.netSalaryUsd.toFixed(2),
          netSalaryZig: calcs.netSalaryZig.toFixed(2),
          payeUsd: calcs.payeUsd.toFixed(2),
          payeZig: calcs.payeZig.toFixed(2),
          nssaEmployeeUsd: calcs.nssaEmployeeUsd.toFixed(2),
          nssaEmployeeZig: calcs.nssaEmployeeZig.toFixed(2),
          totalAllowances: calcs.totalAllowances.toFixed(2),
          totalDeductions: calcs.totalDeductions.toFixed(2),
          snapshotData: buildPayrollSnapshot({
            ...snapshotCarryOver,
            ...calcs,
            auditNote: parsed.data.auditNote || "Manual line adjustment updated",
            lastAdjustedAt: new Date().toISOString(),
          }),
        })
        .where(eq(payrollRunEmployees.id, runLine.id));

      // 4. Rewrite the calculated deduction lines to match the recalculation
      const keep = [...ENGINE_DEDUCTION_TYPES].map((type) => sql`${payrollDeductions.deductionType} != ${type}`);
      await tx.delete(payrollDeductions).where(and(
        eq(payrollDeductions.payrollRunEmployeeId, runLine.id),
        ...keep
      ));
      const statutoryRows = [
        { name: "PAYE", amount: calcs.payeAfterCredit, isTaxDeductible: false, deductionType: "PAYE" },
        { name: "AIDS Levy", amount: calcs.aidsLevy, isTaxDeductible: false, deductionType: "AIDS_LEVY" },
        { name: "NSSA Employee", amount: calcs.nssaEmployee, isTaxDeductible: true, deductionType: "NSSA" },
        { name: "NEC Employee", amount: calcs.necEmployee, isTaxDeductible: false, deductionType: "NEC" },
        { name: "Pension Employee", amount: calcs.pensionEmployee, isTaxDeductible: true, deductionType: "PENSION" },
      ].filter((item) => item.amount > 0);
      if (statutoryRows.length > 0) {
        await tx.insert(payrollDeductions).values(statutoryRows.map((item) => ({
          payrollRunEmployeeId: runLine.id,
          name: item.name,
          amount: item.amount.toFixed(2),
          isTaxDeductible: item.isTaxDeductible,
          deductionType: item.deductionType,
        })));
      }

      // 5. Update parent run header totals
      const allLines = await tx.select().from(payrollRunEmployees).where(eq(payrollRunEmployees.payrollRunId, runId));
      await tx.update(payrollRuns)
        .set({
          totalBasic: sumMoney(allLines.map((l) => l.basicSalary)).toFixed(2),
          totalGross: sumMoney(allLines.map((l) => l.grossSalary)).toFixed(2),
          totalDeductions: sumMoney(allLines.map((l) => l.totalDeductions)).toFixed(2),
          totalNet: sumMoney(allLines.map((l) => l.netSalary)).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(payrollRuns.id, runId));
    });

    await auditPayroll(req, "PAYROLL_RUN_LINE_ADJUSTED", "payroll_run_employees", runLine.id, {
      payrollRunId: runId,
      employeeId: parsed.data.employeeId,
      auditNote: parsed.data.auditNote,
    });

    res.json({ success: true, message: "Adjustments updated successfully" });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// GET /runs/:id/variances - Compare current run against prior run for month-over-month variances
router.get("/runs/:id/variances", async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  if (!Number.isInteger(runId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid run ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const [currentRun] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);

    if (!currentRun) return res.status(404).json({ error: "NOT_FOUND", message: "Payroll run not found" });

    // Find previous locked or approved payroll run for same company & currency
    const [priorRun] = await db.select().from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.currency, currentRun.currency),
        sql`${payrollRuns.periodEnd} < ${currentRun.periodStart}`,
        ne(payrollRuns.status, "REVERSED")
      ))
      .orderBy(desc(payrollRuns.periodEnd))
      .limit(1);

    const currentLines = await db.query.payrollRunEmployees.findMany({
      where: eq(payrollRunEmployees.payrollRunId, currentRun.id),
      with: { employee: true }
    });

    const priorLines = priorRun ? await db.query.payrollRunEmployees.findMany({
      where: eq(payrollRunEmployees.payrollRunId, priorRun.id),
      with: { employee: true }
    }) : [];

    const priorMap = new Map(priorLines.map(l => [l.employeeId, l]));

    const variances = currentLines.map((cur) => {
      const prior = priorMap.get(cur.employeeId);
      const curGross = centsOf(cur.grossSalary);
      const priorGross = prior ? centsOf(prior.grossSalary) : 0;
      const curNet = centsOf(cur.netSalary);
      const priorNet = prior ? centsOf(prior.netSalary) : 0;

      return {
        employeeId: cur.employeeId,
        employeeNumber: cur.employee?.employeeNumber,
        employeeName: cur.employee ? `${cur.employee.firstName} ${cur.employee.lastName}` : "Unknown",
        currentGross: centsToMoney(curGross),
        priorGross: centsToMoney(priorGross),
        grossVariance: centsToMoney(curGross - priorGross),
        currentNet: centsToMoney(curNet),
        priorNet: centsToMoney(priorNet),
        netVariance: centsToMoney(curNet - priorNet),
        status: !prior ? "NEW_EMPLOYEE" : (Math.abs(curGross - priorGross) > 0 ? "CHANGED" : "UNCHANGED"),
      };
    });

    res.json({
      currentRunId: currentRun.id,
      priorRunId: priorRun?.id || null,
      priorPeriodEnd: priorRun?.periodEnd || null,
      variances,
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /runs/:id/submit-for-approval - Move a DRAFT run into the approval queue
router.post("/runs/:id/submit-for-approval", requirePayrollWrite, async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);
    if (!run) return res.status(404).json({ message: "Payroll run not found" });
    if (run.status === "LOCKED") return res.status(409).json({ error: "RUN_LOCKED", message: "Locked payroll runs cannot be resubmitted" });
    if (run.status === "APPROVED") return res.status(409).json({ error: "RUN_APPROVED", message: "Payroll run is already approved" });
    // A reversed run has a reversing journal in the ledger. Resubmitting it
    // would put the same pay period back on the approval queue a second time.
    if (run.status === "REVERSED") return res.status(409).json({ error: "RUN_REVERSED", message: "A reversed payroll run cannot be resubmitted. Create a replacement run." });

    const [updated] = await db.update(payrollRuns)
      .set({ status: "PENDING_APPROVAL", updatedAt: new Date() })
      .where(and(eq(payrollRuns.id, runId), inArray(payrollRuns.status, ["DRAFT", "PENDING_APPROVAL"])))
      .returning();
    if (!updated) {
      return res.status(409).json({ error: "RUN_STATE_CHANGED", message: "The payroll run changed state. Reload the list and try again." });
    }

    await auditPayroll(req, "PAYROLL_RUN_SUBMITTED", "payroll_runs", runId, {
      periodStart: updated.periodStart,
      periodEnd: updated.periodEnd,
    });
    res.json(updated);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    if (run.status === "LOCKED") return res.status(409).json({ error: "RUN_LOCKED", message: "Locked payroll runs cannot be approved again" });
    if (run.status === "APPROVED") return res.status(409).json({ error: "RUN_APPROVED", message: "Payroll run is already approved" });
    if (run.status === "REVERSED") return res.status(409).json({ error: "RUN_REVERSED", message: "A reversed payroll run cannot be approved. Create a replacement run." });

    const [updated] = await db.update(payrollRuns)
      .set({
        status: "APPROVED",
        approvedBy: userId || null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(payrollRuns.id, runId),
        inArray(payrollRuns.status, ["DRAFT", "PENDING_APPROVAL"]),
        eq(payrollRuns.companyId, companyId)
      ))
      .returning();
    if (!updated) {
      return res.status(409).json({ error: "RUN_STATE_CHANGED", message: "The payroll run changed state. Reload the list and try again." });
    }

    await auditPayroll(req, "PAYROLL_RUN_APPROVED", "payroll_runs", runId, {
      periodStart: updated.periodStart,
      periodEnd: updated.periodEnd,
      totalNet: updated.totalNet,
    });

    res.json(updated);
  } catch (err: any) {
    respondPayrollError(res, err);
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
    if (run.status === "LOCKED") return res.status(409).json({ error: "ALREADY_LOCKED", message: "Payroll run is already locked" });
    if (run.status === "REVERSED") {
      return res.status(409).json({ error: "RUN_REVERSED", message: "A reversed payroll run cannot be locked again. Create a replacement run." });
    }
    if (run.status !== "APPROVED") return res.status(422).json({ error: "NOT_APPROVED", message: "Approve payroll before locking" });

    // Fetch employee lines
    const lines = await db.select().from(payrollRunEmployees).where(eq(payrollRunEmployees.payrollRunId, runId));
    if (lines.length === 0) {
      return res.status(422).json({ error: "NO_PAYSLIPS", message: "This run has no employees, so there is nothing to post to the ledger." });
    }
    const deductionRows = await db.select().from(payrollDeductions)
      .where(inArray(payrollDeductions.payrollRunEmployeeId, lines.map((line) => line.id)));

    const journal = buildPayrollJournal({
      lines: lines.map((line) => ({
        runEmployeeId: line.id,
        grossSalary: line.grossSalary,
        netSalary: line.netSalary,
        nssaEmployer: line.nssaEmployer,
        necEmployer: line.necEmployer,
        pensionEmployer: line.pensionEmployer,
        snapshot: runSnapshot(line.snapshotData),
      })),
      deductions: deductionRows.map((row) => ({
        runEmployeeId: row.payrollRunEmployeeId,
        deductionType: row.deductionType,
        amount: row.amount,
        name: row.name,
      })),
    });

    if (journal.variances.length > 0) {
      const affected = journal.variances.map((variance) => variance.runEmployeeId);
      const who = await db.select({
        runEmployeeId: payrollRunEmployees.id,
        employeeNumber: employees.employeeNumber,
        employeeName: sql<string>`trim(concat(${employees.firstName}, ' ', ${employees.lastName}))`,
      })
        .from(payrollRunEmployees)
        .innerJoin(employees, eq(payrollRunEmployees.employeeId, employees.id))
        .where(inArray(payrollRunEmployees.id, affected));
      const byId = new Map(who.map((row) => [row.runEmployeeId, row]));
      return res.status(422).json({
        error: "PAYROLL_GL_IMBALANCE",
        message: "Some payslips do not reconcile - net pay is not gross minus the deduction lines. Fix the affected payslips before locking.",
        variances: journal.variances.map((variance) => ({
          ...variance,
          ...(byId.get(variance.runEmployeeId) || {}),
        })),
      });
    }

    // Locking writes to the ledger, so a tenant with no chart of accounts is
    // told to build one instead of having a payroll-scoped chart invented for them.
    const [anyAccount] = await db.select({ id: accounts.id }).from(accounts)
      .where(eq(accounts.companyId, companyId))
      .limit(1);
    if (!anyAccount) {
      return res.status(422).json({
        error: "NO_CHART_OF_ACCOUNTS",
        message: "Set up a chart of accounts before locking payroll - the run cannot be posted to the ledger.",
      });
    }

    const accountCodes = {} as Record<PayrollJournalAccountKey, string>;
    for (const key of PAYROLL_JOURNAL_ACCOUNT_KEYS) {
      accountCodes[key] = await storage.getSystemAccountCode(companyId, key);
    }

    await db.transaction(async (tx) => {
      // 1. Draft the payroll journal for accounting approval. It is a DRAFT so
      // the existing journal_post approval can actually pick it up.
      await storage.createJournalEntryDraft(companyId, {
        companyId,
        entryDate: new Date(`${run.periodEnd}T12:00:00Z`),
        description: `Payroll ${run.periodStart} to ${run.periodEnd} (${lines.length} payslip${lines.length === 1 ? "" : "s"})`,
        referenceType: "PAYROLL",
        referenceId: runId.toString(),
        createdBy: userId || null,
        lines: journal.lines.map((line) => ({
          accountCode: accountCodes[line.accountKey],
          type: line.type,
          amount: line.amount,
          memo: line.memo,
          branchId: run.branchId ?? undefined,
        })),
      }, tx);

      // 2. Record loan capital recovered by this run
      for (const line of lines) {
        const snapshot = runSnapshot(line.snapshotData);
        const loanId = Number(snapshot.loanId || 0);
        const loanRepaymentCents = Math.round(toMoney(snapshot.loanDeduction) * 100);
        if (!loanId || loanRepaymentCents <= 0) continue;

        const [loan] = await tx.select().from(employeeLoans)
          .where(and(eq(employeeLoans.id, loanId), eq(employeeLoans.companyId, companyId)))
          .limit(1);
        if (!loan) continue;

        const balanceCents = Math.round(toMoney(loan.remainingBalance) * 100);
        const nextBalanceCents = Math.max(0, balanceCents - loanRepaymentCents);
        const nextBalance = (nextBalanceCents / 100).toFixed(2);
        await tx.update(employeeLoans)
          .set({ remainingBalance: nextBalance, status: nextBalanceCents === 0 ? "COMPLETED" : "ACTIVE" })
          .where(eq(employeeLoans.id, loanId));

        await tx.insert(loanInstallments).values({
          loanId,
          payrollRunEmployeeId: line.id,
          amountPaid: (loanRepaymentCents / 100).toFixed(2),
          principalPaid: (loanRepaymentCents / 100).toFixed(2),
          interestPaid: "0.00",
          remainingBalanceAfter: nextBalance,
        });
      }

      // 3. Lock Payroll Run - only if it is still the approved run we loaded,
      // so two concurrent locks cannot post the journal twice.
      const [locked] = await tx.update(payrollRuns)
        .set({
          status: "LOCKED",
          lockedBy: userId || null,
          lockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.status, "APPROVED")))
        .returning();
      if (!locked) throw new PayrollHttpError(409, "Payroll run changed state while locking. Reload and try again.", "PAYROLL_LOCK_CONFLICT");
    });

    await auditPayroll(req, "PAYROLL_RUN_LOCKED", "payroll_runs", runId, {
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      totalNet: run.totalNet,
      journal: journal.totals,
    });
    res.json({ success: true, status: "LOCKED", journal: journal.totals });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /runs/:id/reverse - reverse a LOCKED run, post a reversing journal entry
router.post("/runs/:id/reverse", requirePayrollApproval, async (req, res) => {
  const runId = parseInt(req.params.id, 10);
  try {
    const companyId = getTargetCompanyId(req);
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);
    if (!run) return res.status(404).json({ message: "Payroll run not found" });
    if (run.status !== "LOCKED") {
      return res.status(409).json({ error: "STATE_ERROR", message: `Only LOCKED runs can be reversed (current: ${run.status})` });
    }

    const userId = req.user?.id || null;

    const lines = await db.select().from(payrollRunEmployees).where(eq(payrollRunEmployees.payrollRunId, runId));
    const deductionRows = lines.length > 0
      ? await db.select().from(payrollDeductions)
          .where(inArray(payrollDeductions.payrollRunEmployeeId, lines.map((line) => line.id)))
      : [];

    // The reversal is rebuilt from the same payslip data the lock used and then
    // mirrored, so the two entries cancel to the cent even if the chart of
    // accounts or the mapping moved on since the run was locked.
    const journal = buildPayrollJournal({
      lines: lines.map((line) => ({
        runEmployeeId: line.id,
        grossSalary: line.grossSalary,
        netSalary: line.netSalary,
        nssaEmployer: line.nssaEmployer,
        necEmployer: line.necEmployer,
        pensionEmployer: line.pensionEmployer,
        snapshot: runSnapshot(line.snapshotData),
      })),
      deductions: deductionRows.map((row) => ({
        runEmployeeId: row.payrollRunEmployeeId,
        deductionType: row.deductionType,
        amount: row.amount,
        name: row.name,
      })),
    });

    if (journal.variances.length > 0) {
      return res.status(422).json({
        error: "PAYROLL_GL_IMBALANCE",
        message: "Some payslips on this run no longer reconcile, so the reversal cannot be derived. Reversal blocked without writing to the ledger.",
        variances: journal.variances,
      });
    }

    const accountCodes = {} as Record<PayrollJournalAccountKey, string>;
    for (const key of PAYROLL_JOURNAL_ACCOUNT_KEYS) {
      accountCodes[key] = await storage.getSystemAccountCode(companyId, key);
    }

    await db.transaction(async (tx) => {
      if (journal.lines.length > 0) {
        await storage.createJournalEntryDraft(companyId, {
          companyId,
          entryDate: new Date(),
          description: `Reversal of payroll journal - run #${runId} (${run.periodEnd})`,
          referenceType: "PAYROLL_REVERSAL",
          referenceId: runId.toString(),
          createdBy: userId,
          lines: reversePayrollJournal(journal).map((line) => ({
            accountCode: accountCodes[line.accountKey],
            type: line.type,
            amount: line.amount,
            memo: line.memo,
            branchId: run.branchId ?? undefined,
          })),
        }, tx);
      }

      // Restore the loan capital this run recovered
      const installments = await tx.select().from(loanInstallments)
        .innerJoin(payrollRunEmployees, eq(loanInstallments.payrollRunEmployeeId, payrollRunEmployees.id))
        .where(eq(payrollRunEmployees.payrollRunId, runId));

      for (const inst of installments) {
        const [loan] = await tx.select().from(employeeLoans)
          .where(and(eq(employeeLoans.id, inst.loan_installments.loanId), eq(employeeLoans.companyId, companyId)))
          .limit(1);
        if (!loan) continue;

        const restoredCents = Math.round(toMoney(loan.remainingBalance) * 100)
          + Math.round(toMoney(inst.loan_installments.principalPaid) * 100);
        await tx.update(employeeLoans)
          .set({
            remainingBalance: (restoredCents / 100).toFixed(2),
            status: restoredCents > 0 ? "ACTIVE" : loan.status,
          })
          .where(eq(employeeLoans.id, loan.id));
      }

      if (installments.length > 0) {
        await tx.delete(loanInstallments).where(inArray(loanInstallments.id, installments.map((i) => i.loan_installments.id)));
      }

      // Only a run that is still locked flips to REVERSED, so two approvers
      // clicking reverse at once cannot post the reversal journal twice.
      const [reversed] = await tx.update(payrollRuns)
        .set({ status: "REVERSED", updatedAt: new Date() })
        .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.status, "LOCKED")))
        .returning();
      if (!reversed) throw new PayrollHttpError(409, "Payroll run changed state while reversing. Reload and try again.", "PAYROLL_REVERSE_CONFLICT");
    });

    await auditPayroll(req, "PAYROLL_RUN_REVERSED", "payroll_runs", runId, {
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      totalNet: run.totalNet,
      reversedBy: userId,
      journal: journal.totals,
    });
    res.json({ success: true, status: "REVERSED", message: `Run #${runId} reversed. A reversing journal entry is waiting for GL approval.` });
  } catch (err: any) {
    respondPayrollError(res, err);
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
    respondPayrollError(res, err);
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
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);
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
    respondPayrollError(res, err);
  }
});

/**
 * Per-company payroll settings. A company that has never set anything up still gets a
 * usable file: no prefix, four-digit numbers, and the documents every employer in
 * Zimbabwe has to be able to show on request.
 */
const PAYROLL_SETTINGS_FALLBACK = {
  staffNumberPrefix: "",
  staffNumberDigits: 4,
  staffNumberNext: 1,
  requiredDocumentTypes: ["CONTRACT", "ID_COPY", "NSSA"] as string[],
  expiryWarningDays: 30,
};

async function loadPayrollSettings(companyId: number) {
  const [row] = await db.select().from(payrollCompanySettings)
    .where(eq(payrollCompanySettings.companyId, companyId))
    .limit(1);
  if (!row) return { ...PAYROLL_SETTINGS_FALLBACK };
  return {
    staffNumberPrefix: row.staffNumberPrefix ?? "",
    staffNumberDigits: Number(row.staffNumberDigits) || PAYROLL_SETTINGS_FALLBACK.staffNumberDigits,
    staffNumberNext: Number(row.staffNumberNext) || 1,
    requiredDocumentTypes: Array.isArray(row.requiredDocumentTypes)
      ? row.requiredDocumentTypes.map((type) => String(type).toUpperCase())
      : PAYROLL_SETTINGS_FALLBACK.requiredDocumentTypes,
    expiryWarningDays: Number(row.expiryWarningDays ?? 30),
  };
}

router.get("/settings", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const settings = await loadPayrollSettings(companyId);
    res.json({ ...settings, documentTypes: EMPLOYEE_DOCUMENT_TYPES });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// Changing how staff are numbered, or which documents a file must contain, is a
// settings decision rather than a data-entry one, so it needs payroll approval.
router.patch("/settings", requirePayrollApproval, async (req, res) => {
  const schema = z.object({
    staffNumberPrefix: z.string().trim().max(8).optional(),
    staffNumberDigits: z.coerce.number().int().min(1).max(12).optional(),
    staffNumberNext: z.coerce.number().int().min(1).max(999_999_999).optional(),
    requiredDocumentTypes: z.array(z.string().trim().min(1)).max(EMPLOYEE_DOCUMENT_TYPES.length).optional(),
    expiryWarningDays: z.coerce.number().int().min(0).max(365).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  const unknown = (parsed.data.requiredDocumentTypes ?? [])
    .map((t) => t.toUpperCase())
    .filter((t) => !isKnownDocumentType(t));
  if (unknown.length > 0) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `Unknown document type(s): ${unknown.join(", ")}. This product tracks: ${EMPLOYEE_DOCUMENT_TYPES.join(", ")}.`,
    });
  }

  try {
    const companyId = getTargetCompanyId(req);
    const current = await loadPayrollSettings(companyId);
    const values = {
      staffNumberPrefix: (parsed.data.staffNumberPrefix ?? current.staffNumberPrefix).toUpperCase(),
      staffNumberDigits: parsed.data.staffNumberDigits ?? current.staffNumberDigits,
      staffNumberNext: parsed.data.staffNumberNext ?? current.staffNumberNext,
      requiredDocumentTypes: (parsed.data.requiredDocumentTypes
        ?? current.requiredDocumentTypes.map((t: string) => String(t))
      ).map((t: string) => t.toUpperCase()),
      expiryWarningDays: parsed.data.expiryWarningDays ?? current.expiryWarningDays,
      updatedAt: new Date(),
    };

    const [row] = await db.insert(payrollCompanySettings)
      .values({ ...values, companyId })
      .onConflictDoUpdate({ target: payrollCompanySettings.companyId, set: values })
      .returning();

    await auditPayroll(req, "PAYROLL_SETTINGS_UPDATED", "payroll_company_settings", row.id, {
      staffNumberPrefix: row.staffNumberPrefix,
      staffNumberDigits: row.staffNumberDigits,
      staffNumberNext: row.staffNumberNext,
      requiredDocumentTypes: row.requiredDocumentTypes,
      expiryWarningDays: row.expiryWarningDays,
    });
    res.json(row);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});


/**
 * Take the next staff number for a company and advance its counter.
 *
 * Runs inside the caller's transaction: the counter and the employee row commit
 * together, so a failed hire never burns a number. Candidates that are already taken
 * are stepped over, because an employer may have deleted staff or imported rows with
 * their own numbering, and the unique index on (company, employee_number) is the thing
 * that actually decides a collision.
 */
// The exact shape drizzle hands to a db.transaction() callback - `typeof db` would
// demand its $client pool, which a transaction does not have.
type PayrollTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function allocateStaffNumber(
  tx: PayrollTransaction,
  companyId: number,
  settings: { staffNumberPrefix: string; staffNumberDigits: number; staffNumberNext: number }
) {
  let candidate = settings.staffNumberNext;
  for (let attempts = 0; attempts < 200; attempts++) {
    const number = nextStaffNumber(settings.staffNumberPrefix, settings.staffNumberDigits, candidate);
    const [taken] = await tx.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.employeeNumber, number)))
      .limit(1);
    if (!taken) return { number, next: candidate + 1 };
    candidate += 1;
  }
  throw Object.assign(new Error("Could not allocate a staff number. Check the payroll numbering settings."), {
    status: 409,
    code: "STAFF_NUMBER_EXHAUSTED",
  });
}

// --- 22. STAFF FILE -------------------------------------------------------
//
// A payroll file is a compliance artefact, not a folder of scans. An expired contract
// still lets payslips run for someone the business no longer employs, and the first
// thing an NSSA or labour inspection asks for is the ID copy and the signed contract -
// on paper, not "we scanned it once". So each document carries its expiry date and
// whether the original is physically held, and the company declares which types every
// active employee must have.
//
// All of the judgement lives in shared/staff-file.ts so the list badge, the expiry
// radar, the month-end checklist and the write path cannot drift apart.

router.get("/employees/:id/documents", async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const companyId = getTargetCompanyId(req);
  try {
    const docs = await db.select().from(employeeDocuments)
      .where(and(eq(employeeDocuments.companyId, companyId), eq(employeeDocuments.employeeId, employeeId)))
      .orderBy(desc(employeeDocuments.createdAt));
    const settings = await loadPayrollSettings(companyId);
    res.json({
      documents: docs,
      status: staffFileStatus(docs as any, settings.requiredDocumentTypes as string[], settings.expiryWarningDays),
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.post("/employees/:id/documents", requirePayrollWrite, async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const schema = z.object({
    documentType: z.string().trim().min(1),
    fileName: z.string().trim().min(1),
    fileUrl: z.string().trim().min(1),
    mimeType: z.string().optional().nullable(),
    fileHash: z.string().optional().nullable(),
    expiryDate: z.preprocess(
      (v: unknown) => (v === "" || v === undefined || v === null ? null : v),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD").nullable().optional()
    ),
    hardCopyOnFile: boolField(false),
    notes: z.string().trim().max(2000).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  const documentType = parsed.data.documentType.toUpperCase();
  if (!isKnownDocumentType(documentType)) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `"${parsed.data.documentType}" is not a document this product tracks. Choose one of: ${EMPLOYEE_DOCUMENT_TYPES.join(", ")}.`,
    });
  }

  try {
    const companyId = getTargetCompanyId(req);
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.id, employeeId)))
      .limit(1);
    if (!emp) return res.status(404).json({ error: "NOT_FOUND", message: "Employee not found" });

    const [doc] = await db.insert(employeeDocuments)
      .values({
        documentType,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        mimeType: parsed.data.mimeType ?? null,
        fileHash: parsed.data.fileHash ?? null,
        expiryDate: parsed.data.expiryDate ?? null,
        hardCopyOnFile: parsed.data.hardCopyOnFile,
        notes: parsed.data.notes ?? null,
        companyId,
        employeeId,
        uploadedBy: (req as any).user?.id || null,
      })
      .returning();
    await auditPayroll(req, "PAYROLL_EMPLOYEE_DOCUMENT_ADDED", "employee_documents", doc.id, {
      employeeId,
      documentType: doc.documentType,
      expiryDate: doc.expiryDate,
    });
    res.status(201).json(doc);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * Correct the paperwork around a stored file: when it expires, whether the signed
 * original is in the cabinet, and a note. The scan itself is never replaced here.
 */
router.patch("/staff-file/documents/:id", requirePayrollWrite, async (req, res) => {
  const documentId = parseInt(req.params.id, 10);
  if (!Number.isInteger(documentId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  const schema = z.object({
    expiryDate: z.preprocess(
      (v: unknown) => (v === "" || v === undefined ? null : v),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD").nullable().optional()
    ),
    hardCopyOnFile: optionalBoolField(),
    notes: z.string().trim().max(2000).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    // Scoped on company as well as id, so one tenant cannot rewrite another's file.
    const [existing] = await db.select().from(employeeDocuments)
      .where(and(eq(employeeDocuments.id, documentId), eq(employeeDocuments.companyId, companyId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "Document not found for this company" });

    const patch: Record<string, any> = {};
    if (parsed.data.expiryDate !== undefined) patch.expiryDate = parsed.data.expiryDate;
    if (parsed.data.hardCopyOnFile !== undefined) patch.hardCopyOnFile = parsed.data.hardCopyOnFile;
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Nothing to update" });
    }

    const [doc] = await db.update(employeeDocuments).set(patch)
      .where(and(eq(employeeDocuments.id, documentId), eq(employeeDocuments.companyId, companyId)))
      .returning();

    await auditPayroll(req, "PAYROLL_EMPLOYEE_DOCUMENT_UPDATED", "employee_documents", doc.id, patch);
    res.json(doc);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.delete("/staff-file/documents/:id", requirePayrollWrite, async (req, res) => {
  const documentId = parseInt(req.params.id, 10);
  if (!Number.isInteger(documentId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const [removed] = await db.delete(employeeDocuments)
      .where(and(eq(employeeDocuments.id, documentId), eq(employeeDocuments.companyId, companyId)))
      .returning();
    if (!removed) return res.status(404).json({ error: "NOT_FOUND", message: "Document not found for this company" });

    await auditPayroll(req, "PAYROLL_EMPLOYEE_DOCUMENT_REMOVED", "employee_documents", removed.id, {
      employeeId: removed.employeeId,
      documentType: removed.documentType,
    });
    res.json({ deleted: true, id: documentId });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * One read for the whole staff file: per-employee completeness for the directory
 * badges, and the expiry radar for the dashboard and the month-end checklist.
 *
 * Deliberately scoped to the company and computed in memory - a small employer's
 * documents number in the hundreds, and the same maths has to run per employee anyway.
 */
/**
 * The scan behind a staff-file record.
 *
 * `/api/upload` is the avatar/logo endpoint and only accepts images; a contract, an
 * ID copy or an NSSA return arrives as a PDF as often as not. So staff files get their
 * own endpoint: PDF and image only, size-capped, stored under uploads/staff-files with
 * a server-generated name (never the client's, which is attacker-controlled), and
 * fingerprinted with a sha256 so a later question about whether the scan in the drawer
 * is the scan on the file has an answer.
 */
const STAFF_FILE_MAX_BYTES = 10 * 1024 * 1024;
const STAFF_FILE_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

function staffFileUploadHandler(req: any, res: any, next: any) {
  const uploadsDir = path.join(process.cwd(), "uploads", "staff-files");
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: any) => {
        fs.mkdirSync(uploadsDir, { recursive: true });
        cb(null, uploadsDir);
      },
      filename: (_req: any, file: any, cb: any) => {
        // Extension comes from the sniffed mime type, not from originalname.
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${STAFF_FILE_EXTENSIONS[file.mimetype] ?? ""}`);
      },
    }),
    limits: { fileSize: STAFF_FILE_MAX_BYTES },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!STAFF_FILE_EXTENSIONS[file.mimetype]) {
        cb(new Error(`Only ${Object.values(STAFF_FILE_EXTENSIONS).join(", ").replace(".", "").toUpperCase()} scans are accepted. Received ${file.mimetype}.`));
        return;
      }
      cb(null, true);
    },
  });
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      const tooBig = err?.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: tooBig
          ? `A staff document scan must be ${STAFF_FILE_MAX_BYTES / (1024 * 1024)}MB or smaller.`
          : err.message,
      });
    }
    next();
  });
}

router.post("/staff-file/upload", requirePayrollWrite, staffFileUploadHandler, async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "VALIDATION_ERROR", message: "No file received. Send it as multipart field \"file\"." });

    const [emp] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.companyId, getTargetCompanyId(req)), eq(employees.id, parseInt(String(req.body?.employeeId ?? ""), 10) || -1)))
      .limit(1);
    if (!emp) {
      // Never leave an orphan scan sitting on disk when the caller named a worker the
      // company does not have.
      fs.unlink(file.path, () => {});
      return res.status(404).json({ error: "NOT_FOUND", message: "Employee not found for this company" });
    }

    const fileHash = crypto.createHash("sha256").update(fs.readFileSync(file.path)).digest("hex");
    await auditPayroll(req, "PAYROLL_EMPLOYEE_DOCUMENT_UPLOADED", "employee_documents", file.filename, {
      employeeId: emp.id,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      fileHash,
    });
    res.status(201).json({
      url: `/uploads/staff-files/${file.filename}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      fileHash,
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.get("/staff-file/summary", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const settings = await loadPayrollSettings(companyId);
    const requiredTypes = (settings.requiredDocumentTypes ?? []) as string[];
    const warningDays = settings.expiryWarningDays;

    const [directory, docs] = await Promise.all([
      db.select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        status: employees.status,
      }).from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.status, "ACTIVE")))
        .orderBy(asc(employees.lastName), asc(employees.firstName)),
      db.select().from(employeeDocuments).where(eq(employeeDocuments.companyId, companyId)),
    ]);

    const byEmployee = new Map<number, any[]>();
    for (const doc of docs) {
      const bucket = byEmployee.get(doc.employeeId);
      if (bucket) bucket.push(doc);
      else byEmployee.set(doc.employeeId, [doc]);
    }

    const employeesOut: Array<Record<string, any>> = [];
    const radar: Array<Record<string, any>> = [];
    for (const emp of directory) {
      const empDocs = byEmployee.get(emp.id) ?? [];
      const status = staffFileStatus(empDocs as any, requiredTypes, warningDays);
      employeesOut.push({ ...emp, fileStatus: status, documentCount: empDocs.length });

      for (const doc of empDocs) {
        const state = documentExpiryState(doc, warningDays);
        if (state === "EXPIRED" || state === "EXPIRING") {
          radar.push({
            documentId: doc.id,
            employeeId: emp.id,
            employeeName: `${emp.firstName} ${emp.lastName}`,
            employeeNumber: emp.employeeNumber,
            documentType: doc.documentType,
            fileName: doc.fileName,
            expiryDate: doc.expiryDate,
            hardCopyOnFile: doc.hardCopyOnFile,
            state,
          });
        }
      }
    }

    radar.sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)));

    res.json({
      requiredDocumentTypes: requiredTypes,
      expiryWarningDays: warningDays,
      employees: employeesOut,
      expiringDocuments: radar,
      totals: {
        activeEmployees: directory.length,
        completeFiles: employeesOut.filter((e) => e.fileStatus.complete).length,
        expiredDocuments: radar.filter((r) => r.state === "EXPIRED").length,
        expiringDocuments: radar.filter((r) => r.state === "EXPIRING").length,
        missingHardCopies: docs.filter((d) => !d.hardCopyOnFile).length,
      },
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * The month-end close, as a list instead of as a memory.
 *
 * A payroll close fails in the same handful of ways: someone's contract expired and
 * they kept being paid, a rise was approved but never applied so the run pays the old
 * salary, a run is sitting in DRAFT while the period it covers is already over, or a
 * filing is due and nobody filed it. Each check below is one of those, computed from
 * the data rather than ticked by hand, and ordered so a blocker always outranks a
 * warning.
 */
router.get("/month-end-checklist", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const settings = await loadPayrollSettings(companyId);
    const requiredTypes = settings.requiredDocumentTypes;
    const warningDays = settings.expiryWarningDays;

    const period = requestedMonth(req.query.period) ?? todayLocalIso().slice(0, 7);
    const { start: periodStart, end: periodEnd } = monthBoundsIso(period);
    const today = todayLocalIso();
    const horizon = addDaysIso(today, warningDays);

    const [directory, docs, openRuns, periodRuns, pendingChanges, expiringContracts, unpaidRemittances] = await Promise.all([
      db.select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
      }).from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.status, "ACTIVE"))),
      db.select().from(employeeDocuments).where(eq(employeeDocuments.companyId, companyId)),
      db.select({
        id: payrollRuns.id,
        status: payrollRuns.status,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        currency: payrollRuns.currency,
      }).from(payrollRuns)
        .where(and(
          eq(payrollRuns.companyId, companyId),
          inArray(payrollRuns.status, ["DRAFT", "PENDING_APPROVAL", "APPROVED"])
        ))
        .orderBy(asc(payrollRuns.periodStart)),
      db.select({ id: payrollRuns.id, status: payrollRuns.status, currency: payrollRuns.currency })
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.companyId, companyId),
          lte(payrollRuns.periodStart, periodEnd),
          gte(payrollRuns.periodEnd, periodStart),
          ne(payrollRuns.status, "REVERSED")
        )),
      db.select({
        id: employeeSalaryChanges.id,
        effectiveDate: employeeSalaryChanges.effectiveDate,
        employeeId: employeeSalaryChanges.employeeId,
      }).from(employeeSalaryChanges)
        .where(and(
          eq(employeeSalaryChanges.companyId, companyId),
          eq(employeeSalaryChanges.status, "PENDING"),
          lte(employeeSalaryChanges.effectiveDate, periodEnd)
        )),
      db.select({
        id: employeeContracts.id,
        employeeId: employeeContracts.employeeId,
        endDate: employeeContracts.endDate,
        contractType: employeeContracts.contractType,
        firstName: employees.firstName,
        lastName: employees.lastName,
      }).from(employeeContracts)
        .innerJoin(employees, eq(employeeContracts.employeeId, employees.id))
        .where(and(
          eq(employees.companyId, companyId),
          eq(employees.status, "ACTIVE"),
          eq(employeeContracts.isActive, true),
          isNotNull(employeeContracts.endDate),
          lte(employeeContracts.endDate, horizon)
        ))
        .orderBy(asc(employeeContracts.endDate)),
      db.select({
        id: payrollRemittances.id,
        name: payrollRemittances.name,
        authority: payrollRemittances.authority,
        dueDate: payrollRemittances.dueDate,
        amount: payrollRemittances.amount,
        currency: payrollRemittances.currency,
      }).from(payrollRemittances)
        .where(and(
          eq(payrollRemittances.companyId, companyId),
          eq(payrollRemittances.status, "NOT_SUBMITTED"),
          lte(payrollRemittances.dueDate, horizon)
        ))
        .orderBy(asc(payrollRemittances.dueDate)),
    ]);

    const byEmployee = new Map<number, any[]>();
    for (const doc of docs) {
      const bucket = byEmployee.get(doc.employeeId);
      if (bucket) bucket.push(doc);
      else byEmployee.set(doc.employeeId, [doc]);
    }

    const incompleteFiles: string[] = [];
    const missingHardCopyEmployees = new Set<number>();
    let expiredDocs = 0;
    let expiringDocs = 0;
    for (const emp of directory) {
      const empDocs = byEmployee.get(emp.id) ?? [];
      const status = staffFileStatus(empDocs as any, requiredTypes, warningDays);
      if (!status.complete) incompleteFiles.push(`${emp.firstName} ${emp.lastName}`.trim());
      if (empDocs.some((d) => EXPIRY_TRACKED_TYPES.includes(d.documentType as any) && !d.hardCopyOnFile)) {
        missingHardCopyEmployees.add(emp.id);
      }
      for (const doc of empDocs) {
        const state = documentExpiryState(doc, warningDays);
        if (state === "EXPIRED") expiredDocs += 1;
        else if (state === "EXPIRING") expiringDocs += 1;
      }
    }

    const lapsedContracts = expiringContracts.filter((c) => String(c.endDate) < today);
    const endingContracts = expiringContracts.filter((c) => String(c.endDate) >= today);
    const overdueRemittances = unpaidRemittances.filter((r) => String(r.dueDate) < today);
    const dueRemittances = unpaidRemittances.filter((r) => String(r.dueDate) >= today);

    const items = [
      {
        id: "STAFF_FILE_COMPLETE",
        label: `Every active file holds the ${requiredTypes.length} required document(s)`,
        count: incompleteFiles.length,
        severity: incompleteFiles.length > 0 ? "WARN" : "OK",
        detail: incompleteFiles.length > 0
          ? `${incompleteFiles.slice(0, 3).join(", ")}${incompleteFiles.length > 3 ? ` and ${incompleteFiles.length - 3} more` : ""}`
          : `All ${directory.length} active ${directory.length === 1 ? "file is" : "files are"} complete.`,
        href: "/hr/employees",
      },
      {
        id: "DOCUMENTS_UNEXPIRED",
        label: "No document on an active file has expired",
        count: expiredDocs,
        severity: expiredDocs > 0 ? "BLOCK" : "OK",
        detail: expiredDocs > 0
          ? `${expiredDocs} expired; an expired contract still lets the holder be paid.`
          : expiringDocs > 0
            ? `${expiringDocs} expire within ${warningDays} days.`
            : "Nothing is expired or due to expire.",
        href: "/hr/employees",
      },
      {
        id: "HARD_COPIES_ON_FILE",
        label: "Signed originals are physically on file",
        count: missingHardCopyEmployees.size,
        severity: missingHardCopyEmployees.size > 0 ? "WARN" : "OK",
        detail: missingHardCopyEmployees.size > 0
          ? `${missingHardCopyEmployees.size} ${missingHardCopyEmployees.size === 1 ? "employee is" : "employees are"} missing a paper original for a contract, ID, NSSA or medical.`
          : "Every tracked document is marked as held in hard copy.",
        href: "/hr/employees",
      },
      {
        id: "CONTRACTS_LAPSED",
        label: "No active employee is past their contract end date",
        count: lapsedContracts.length,
        severity: lapsedContracts.length > 0 ? "BLOCK" : "OK",
        detail: lapsedContracts.length > 0
          ? lapsedContracts.slice(0, 3).map((c) => `${c.firstName} ${c.lastName} (${c.endDate})`).join(", ")
          : endingContracts.length > 0
            ? `${endingContracts.length} end within ${warningDays} days.`
            : "No contract is ending.",
        href: "/hr/employees",
      },
      {
        id: "SALARY_CHANGES_APPLIED",
        label: `No pending salary change takes effect before ${periodEnd}`,
        count: pendingChanges.length,
        severity: pendingChanges.length > 0 ? "BLOCK" : "OK",
        detail: pendingChanges.length > 0
          ? `${pendingChanges.length} change(s) still to approve - the run pays the old salary until they are.`
          : "Nothing waiting on approval for this period.",
        href: "/hr/employees",
      },
      {
        id: "PERIOD_RUN_EXISTS",
        label: `A payroll run exists for ${period}`,
        count: periodRuns.length === 0 ? 1 : 0,
        severity: periodRuns.length === 0 ? "BLOCK" : "OK",
        detail: periodRuns.length === 0
          ? "Start the run before the close date."
          : `${periodRuns.length} ${periodRuns.length === 1 ? "run covers" : "runs cover"} this period.`,
        href: "/hr/payroll",
      },
      {
        id: "RUNS_LOCKED",
        label: "Every run for the period is locked",
        count: openRuns.filter((r) => String(r.periodStart) <= periodEnd && String(r.periodEnd) >= periodStart).length,
        severity: openRuns.some((r) => String(r.periodStart) <= periodEnd && String(r.periodEnd) >= periodStart) ? "WARN" : "OK",
        detail: (() => {
          const open = openRuns.filter((r) => String(r.periodStart) <= periodEnd && String(r.periodEnd) >= periodStart);
          if (open.length === 0) return `Nothing in ${period} is waiting on approval or locking.`;
          return `${open.length} ${open.length === 1 ? "run is" : "runs are"} still ${[...new Set(open.map((r) => r.status.replace(/_/g, " ").toLowerCase()))].join(" / ")}.`;
        })(),
        href: "/hr/payroll",
      },
      {
        id: "STALE_RUNS_OPEN",
        label: "No run from an earlier period is still open",
        count: openRuns.filter((r) => String(r.periodEnd) < periodStart).length,
        severity: openRuns.some((r) => String(r.periodEnd) < periodStart) ? "WARN" : "OK",
        detail: (() => {
          const stale = openRuns.filter((r) => String(r.periodEnd) < periodStart);
          return stale.length === 0
            ? "The only open runs belong to this period."
            : `${stale.length} older run(s) still open, e.g. ${stale[0].periodStart} to ${stale[0].periodEnd}.`;
        })(),
        href: "/hr/payroll",
      },
      {
        id: "REMITTANCES_OVERDUE",
        label: "No statutory remittance is past its due date",
        count: overdueRemittances.length,
        severity: overdueRemittances.length > 0 ? "BLOCK" : "OK",
        detail: overdueRemittances.length > 0
          ? overdueRemittances.slice(0, 3).map((r) => `${r.name} (${r.dueDate})`).join(", ")
          : dueRemittances.length > 0
            ? `${dueRemittances.length} due within ${warningDays} days.`
            : "Nothing outstanding with your fiscal authority.",
        href: "/hr/reports/remittances",
      },
    ];

    const blockers = items.filter((i) => i.severity === "BLOCK").length;
    const warnings = items.filter((i) => i.severity === "WARN").length;

    res.json({
      period,
      periodStart,
      periodEnd,
      generatedAt: new Date().toISOString(),
      items: items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
      summary: {
        total: items.length,
        clear: items.length - blockers - warnings,
        warnings,
        blockers,
        readyToClose: blockers === 0 && warnings === 0,
      },
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});
























router.get("/report/csv", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const runId = typeof req.query.runId === "string" && /^\d+$/.test(req.query.runId) ? parseInt(req.query.runId, 10) : undefined;
    const month = typeof req.query.month === "string" ? req.query.month : monthStartIso().slice(0, 7);
    const csvData = await reportService.generatePayrollReport(companyId, month, runId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payroll_report_${runId ?? month}.csv"`);
    res.send(csvData);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

router.get("/report/payslip/:employeeId", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const employeeId = parseInt(req.params.employeeId, 10);
    if (!Number.isInteger(employeeId)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid employee id" });
    const period = typeof req.query.period === "string" ? req.query.period : monthStartIso().slice(0, 7);
    const runId = typeof req.query.runId === "string" && /^\d+$/.test(req.query.runId) ? parseInt(req.query.runId, 10) : undefined;
    const pdfData = await reportService.generatePayslip(companyId, employeeId, period, runId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip_${employeeId}_${period}.pdf"`);
    res.send(Buffer.from(pdfData));
  } catch (err: any) {
    respondPayrollError(res, err);
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

    // Year-to-date and the band table behind this month's PAYE, so the screen shows
    // exactly what the printed slip shows.
    const employeeIds = records.map((r) => r.employee.id);
    const taxYear = Number(String(run.periodEnd).slice(0, 4));
    const [ytd, labels] = await Promise.all([
      taxYearTotalsByEmployee(companyId, employeeIds, { taxYear, currency: run.currency }),
      taxTableLabels(companyId, records.map((r) => runSnapshot(r.runData.snapshotData)?.taxConfigId)),
    ]);
    const payslips = records.map((record) => ({
      ...record,
      ytd: ytd.get(record.employee.id) ?? null,
      taxTableLabel: labelForSnapshot(runSnapshot(record.runData.snapshotData), labels),
    }));

    res.json({ run, payslips });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// Bulk email payslips for a run (employeeIds optional; defaults to all lines
// in the run). Employees without an email address are skipped and reported.
router.post("/runs/:runId/email-payslips", requirePayrollApproval, async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const runId = parseInt(req.params.runId, 10);
    const requestedIds = Array.isArray(req.body?.employeeIds)
      ? req.body.employeeIds.map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ error: "NOT_FOUND", message: "Run not found" });

    const conditions = [eq(payrollRunEmployees.payrollRunId, runId)];
    if (requestedIds.length > 0) conditions.push(inArray(payrollRunEmployees.employeeId, requestedIds));
    const records = await db.select({
      runData: payrollRunEmployees,
      employee: employees,
    })
      .from(payrollRunEmployees)
      .innerJoin(employees, eq(payrollRunEmployees.employeeId, employees.id))
      .where(and(...conditions));

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    const emailSettings = (company as any)?.emailSettings as any;
    const periodLabel = `${run.periodStart} to ${run.periodEnd}`;

    const sent: any[] = [];
    const skipped: any[] = [];
    const failed: any[] = [];

    for (const { employee } of records) {
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      const to = String(employee.email || "").trim();
      if (!to) {
        skipped.push({ employeeId: employee.id, name });
        continue;
      }
      try {
        const pdf = await reportService.generatePayslip(companyId, employee.id, run.periodStart.slice(0, 7), runId);
        await sendPayslipEmail(to, name, periodLabel, Buffer.from(pdf), emailSettings);
        sent.push({ employeeId: employee.id, name, email: to });
      } catch (err: any) {
        failed.push({ employeeId: employee.id, name, email: to, error: err?.message || "Unknown error" });
      }
    }

    await auditPayroll(req, "PAYROLL_PAYSLIPS_EMAILED", "payroll_runs", runId, {
      requested: records.length,
      sent: sent.length,
      skipped: skipped.length,
      failed: failed.length,
    });

    res.json({ runId, requested: records.length, sent, skipped, failed });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// Printable/exportable run report: run totals plus per-employee lines with the
// employer-cost breakdown (ZIMDEF, Standards Levy, APWCS) reconstructed from
// the calculation snapshot's statutoryRatesUsed.
router.get("/runs/:runId/report", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const runId = parseInt(req.params.runId, 10);

    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ error: "NOT_FOUND" });

    const records = await db.select({
      runData: payrollRunEmployees,
      employee: employees,
    })
      .from(payrollRunEmployees)
      .innerJoin(employees, eq(payrollRunEmployees.employeeId, employees.id))
      .where(eq(payrollRunEmployees.payrollRunId, runId))
      .orderBy(employees.firstName);

    const lines = records.map(({ runData, employee }) => {
      const snapshot: any = runSnapshot(runData.snapshotData);
      const rates = snapshot?.statutoryRatesUsed || {};
      const gross = toMoney(runData.grossSalary);
      const r2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
      const zimdefRate = Number(rates.zimdefRate ?? 0.01) || 0.01;
      const standardsRate = Number(rates.standardsLevyRate ?? 0.005) || 0.005;
      const apwcsRate = rates.apwcsRate != null ? Number(rates.apwcsRate) : zimdefRate / 2;
      // The levy actually charged, from the immutable snapshot, so the report
      // matches the locked journal instead of a rate re-derived here.
      const employerCosts = {
        nssaEmployer: toMoney(runData.nssaEmployer),
        necEmployer: toMoney(runData.necEmployer),
        pensionEmployer: toMoney(runData.pensionEmployer),
        zimdef: snapshot.zimdefAmount != null ? toMoney(snapshot.zimdefAmount) : r2(gross * zimdefRate),
        standardsLevy: snapshot.standardsLevyAmount != null ? toMoney(snapshot.standardsLevyAmount) : r2(gross * standardsRate),
        apwcs: snapshot.apwcsAmount != null ? toMoney(snapshot.apwcsAmount) : r2(gross * apwcsRate),
        total: 0,
      };
      employerCosts.total = centsToMoney(
        centsOf(employerCosts.nssaEmployer) + centsOf(employerCosts.necEmployer) + centsOf(employerCosts.pensionEmployer)
        + centsOf(employerCosts.zimdef) + centsOf(employerCosts.standardsLevy) + centsOf(employerCosts.apwcs),
      );
      return { runData, employee, employerCosts, snapshot };
    });

    const taxYear = Number(String(run.periodEnd).slice(0, 4));
    const [ytd, labels] = await Promise.all([
      taxYearTotalsByEmployee(companyId, lines.map((l) => l.employee.id), { taxYear, currency: run.currency }),
      taxTableLabels(companyId, lines.map((l) => l.snapshot?.taxConfigId)),
    ]);
    const evidencedLines = lines.map((line) => ({
      ...line,
      ytd: ytd.get(line.employee.id) ?? null,
      taxTableLabel: labelForSnapshot(line.snapshot, labels),
    }));

    // The register is signed before it is filed, so the people who approved and locked
    // it travel with it rather than living only in the audit trail.
    const signoffIds = [run.approvedBy, run.lockedBy].filter((id): id is string => typeof id === "string" && id.length > 0);
    const signoffNames = new Map<string, string>();
    if (signoffIds.length > 0) {
      const people = await db.select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
      }).from(users).where(inArray(users.id, signoffIds));
      for (const person of people) {
        signoffNames.set(person.id, (person.name || person.username || person.email || "").trim());
      }
    }
    const signoff = {
      preparedBy: null as string | null,
      approvedBy: run.approvedBy ? (signoffNames.get(run.approvedBy) ?? null) : null,
      approvedAt: run.approvedAt ?? null,
      lockedBy: run.lockedBy ? (signoffNames.get(run.lockedBy) ?? null) : null,
      lockedAt: run.lockedAt ?? null,
    };

    res.json({ run, lines: evidencedLines, signoff });
  } catch (err: any) {
    respondPayrollError(res, err);
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

    // A bank file is a payment instruction, so a run that has not been approved -
    // or one that has since been reversed - must never leave the building as one.
    if (run.status === "DRAFT" || run.status === "PENDING_APPROVAL" || run.status === "REVERSED") {
      return res.status(422).json({
        error: "RUN_NOT_PAYABLE",
        message: `Only an approved or locked run can be exported for payment. This run is ${run.status}.`,
      });
    }

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

    // A split run pays two legs, so a file quoting net_salary (the USD base)
    // would pay the ZiG half of every salary to nobody. One row per leg instead,
    // with the currency named, and single-currency files stay byte-identical.
    const isSplit = run.currency === "SPLIT";
    // @ts-ignore
    const columns = isSplit ? [...formatConfig.columns, { label: "Currency", field: "leg.currency" }] : formatConfig.columns;

    // Add headers
    csvContent += columns.map((c: any) => `"${String(c.label ?? "").replace(/"/g, '""')}"`).join(",") + "\n";

    records.forEach(({ runData, employee }) => {
      const legs = isSplit
        ? [
            { currency: "USD", amount: runData.netSalaryUsd },
            { currency: "ZiG", amount: runData.netSalaryZig },
          ]
        : [{ currency: run.currency, amount: runData.netSalary }];
      for (const leg of legs) {
        const row = columns.map((col: any) => {
          let val = "";
          if (col.field === 'employee.lastName') val = `${employee.firstName} ${employee.lastName}`;
          else if (col.field === 'employee.bankAccountNumber') val = employee.bankAccountNumber || "";
          else if (col.field === 'employee.bankName') val = employee.bankName || "";
          else if (col.field === 'employee.bankBranch') val = employee.bankBranch || "";
          else if (col.field === 'runData.netSalary') val = leg.amount || "0.00";
          else if (col.field === 'leg.currency') val = leg.currency;
          else if (col.field === 'static') val = col.value;
          // Every field is quoted, so an embedded quote has to be doubled or the
          // bank's parser drops the row.
          return `"${String(val ?? "").replace(/"/g, '""')}"`;
        });
        csvContent += row.join(",") + "\n";
      }
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bank_export_run_${runId}.csv"`);
    res.send(csvContent);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// --- ZIMRA STATUTORY EXPORTS ---

// ITF16: Annual income-tax return per employee (CSV download)
router.get("/exports/itf16", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const taxYear = req.query.taxYear ? String(req.query.taxYear) : String(new Date().getFullYear());
  if (!/^\d{4}$/.test(taxYear)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "taxYear must be a four digit year" });

  try {
    const jurisdiction = await payrollJurisdiction(companyId);
    // ITF16 reports PAYE and the AIDS levy, neither of which every market charges.
    if (respondsLevyNotCharged(res, jurisdiction, "ITF16", [STATUTORY_RULE_CODES.aidsLevy])) return;

    const startDate = `${taxYear}-01-01`;
    const endDate = `${taxYear}-12-31`;
    const currency = reportCurrencyParam(req.query.currency);
    const report = await loadFinalizedReport(companyId, startDate, endDate, "ITF16", currency);
    if (respondReportBlocked(res, report)) return;

    // One return cannot mix currencies: ZiG and USD amounts would be added together.
    if (respondMixedReportCurrency(res, report.runs, currency)) return;

    const HEADER = "Employee ID,Surname,First Name,Tax Year,Period Employed (months),Total Gross Income,Total Taxable Income,Total PAYE,Total AIDS Levy,Total Medical Aid Credits,Total Net PAYE Payable\n";

    const runTypes: Record<number, string> = {};
    for (const run of report.runs) runTypes[run.id] = run.runType;

    // Accumulate in cents: these totals are transcribed onto the ITF16 return,
    // so a float drift that shows up as one cent on a thousand payslips is a
    // filing error the employee can be assessed for.
    const agg: Record<number, any> = {};
    for (const { line } of report.lines) {
      const eid = line.employeeId;
      if (!agg[eid]) {
        agg[eid] = { emp: line.employee, months: 0, gross: 0, taxable: 0, paye: 0, aids: 0, medical: 0, netPaye: 0 };
      }
      const isBonusLine = runTypes[line.payrollRunId] === "BONUS";
      const snapshot: any = runSnapshot(line.snapshotData);
      if (!isBonusLine) agg[eid].months++;
      agg[eid].gross += centsOf(line.grossSalary);
      // Taxable income is the figure PAYE was actually charged on, read from the
      // immutable snapshot. Older lines have no snapshot figure, so fall back to
      // what the line used to: bonus lines stored their taxable bonus, and the
      // base on those lines is zero so basic + allowances would understate them.
      const legacyTaxable = centsOf(line.basicSalary) + centsOf(line.totalAllowances);
      agg[eid].taxable += isBonusLine && snapshot.taxableIncome == null
        ? centsOf(snapshot.taxableBonus)
        : snapshot.taxableIncome != null ? centsOf(snapshot.taxableIncome) : legacyTaxable;
      agg[eid].medical += centsOf(snapshot.medicalCredit);
      agg[eid].paye += centsOf(line.paye);
      agg[eid].aids += centsOf(line.aidsLevy);
      agg[eid].netPaye += centsOf(line.paye) + centsOf(line.aidsLevy);
    }

    let csv = HEADER;
    for (const [eid, data] of Object.entries(agg)) {
      csv += `${csvEscape(data.emp.nationalId || eid)},${csvEscape(data.emp.lastName)},${csvEscape(data.emp.firstName)},${taxYear},${data.months},${centsToMoney(data.gross).toFixed(2)},${centsToMoney(data.taxable).toFixed(2)},${centsToMoney(data.paye).toFixed(2)},${centsToMoney(data.aids).toFixed(2)},${centsToMoney(data.medical).toFixed(2)},${centsToMoney(data.netPaye).toFixed(2)}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ITF16_${taxYear}${reportCurrencySuffix(currency)}.csv`);
    res.send(csv);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// P2: Monthly PAYE remittance summary
router.get("/exports/p2", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const month = requestedMonth(req.query.month);
  if (!month) return res.status(400).json({ error: "VALIDATION_ERROR", message: "month must be yyyy-MM" });

  try {
    const jurisdiction = await payrollJurisdiction(companyId);
    if (respondsLevyNotCharged(res, jurisdiction, "P2", [STATUTORY_RULE_CODES.aidsLevy])) return;
    const currency = reportCurrencyParam(req.query.currency);

    const { start, end } = monthBoundsIso(month);
    const report = await loadFinalizedReport(companyId, start, end, "P2", currency);
    if (respondReportBlocked(res, report)) return;
    if (respondMixedReportCurrency(res, report.runs, currency)) return;

    const lines = report.lines.map(({ line }: any) => line);
    const totalGross = sumMoney(lines.map((line: any) => line.grossSalary));
    const totalPaye = sumMoney(lines.map((line: any) => line.paye));
    const totalAids = sumMoney(lines.map((line: any) => line.aidsLevy));

    const result = {
      month,
      // The currency the return is filed in, so the screen can sign the figures
      // instead of assuming dollars.
      currency: report.runs[0]?.currency ?? null,
      employeeCount: lines.length,
      totalGross: totalGross.toFixed(2),
      totalPaye: totalPaye.toFixed(2),
      totalAids: totalAids.toFixed(2),
      totalRemittable: sumMoney([totalPaye, totalAids]).toFixed(2),
      validation: report.summary,
    };

    if (req.query.format === "csv") {
      const csv = "Month,Employees Paid,Total Gross,PAYE,AIDS Levy,Total Remittable\n"
        + `${month},${lines.length},${result.totalGross},${result.totalPaye},${result.totalAids},${result.totalRemittable}\n`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=P2_${month}${reportCurrencySuffix(currency)}.csv`);
      return res.send(csv);
    }

    res.json(result);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// ZIMDEF + Standards Levy: monthly employer levy summary
router.get("/exports/zimdef", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const month = requestedMonth(req.query.month);
  if (!month) return res.status(400).json({ error: "VALIDATION_ERROR", message: "month must be yyyy-MM" });

  try {
    const jurisdiction = await payrollJurisdiction(companyId);
    if (respondsLevyNotCharged(res, jurisdiction, "ZIMDEF", [STATUTORY_RULE_CODES.zimdef])) return;
    const currency = reportCurrencyParam(req.query.currency);

    const { start, end } = monthBoundsIso(month);
    const report = await loadFinalizedReport(companyId, start, end, "ZIMDEF", currency);
    if (respondReportBlocked(res, report)) return;
    if (respondMixedReportCurrency(res, report.runs, currency)) return;

    // The levy actually charged, not a rate re-applied here: the percentage can
    // differ from 1% / 0.5%, and the return has to match the locked payroll.
    const snapshots = report.lines.map(({ line }: any) => runSnapshot(line.snapshotData));
    const totalGross = sumMoney(report.lines.map(({ line }: any) => line.grossSalary));
    const zimdef = sumMoney(snapshots.map((s: any) => s.zimdefAmount ?? 0));
    const standards = sumMoney(snapshots.map((s: any) => s.standardsLevyAmount ?? 0));
    const unrecorded = snapshots.filter((s: any) => s.zimdefAmount == null || s.standardsLevyAmount == null).length;

    const result = {
      month,
      currency: report.runs[0]?.currency ?? null,
      totalGrossWageBill: totalGross.toFixed(2),
      zimdefAmount: zimdef.toFixed(2),
      standardsLevyAmount: standards.toFixed(2),
      totalDue: sumMoney([zimdef, standards]).toFixed(2),
      validation: { ...report.summary, unrecordedLevyLines: unrecorded },
    };

    if (req.query.format === "csv") {
      const csv = "Month,Gross Wage Bill,ZIMDEF,Standards Levy,Total Due\n"
        + `${month},${result.totalGrossWageBill},${result.zimdefAmount},${result.standardsLevyAmount},${result.totalDue}\n`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=ZIMDEF_${month}${reportCurrencySuffix(currency)}.csv`);
      return res.send(csv);
    }

    res.json(result);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// --- STATUTORY REMITTANCE TRACKER ---
// The filing calendar: P2 PAYE, ZIMDEF + Standards Levy and NSSA obligations
// derived from LOCKED payroll runs. Reading it never writes - saving it as
// tracking records is an explicit POST.

/** First pay period ("yyyy-MM") of a window of `months` periods. */
function remittanceStartMonth(months: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString().slice(0, 7);
}

/**
 * The filing calendar. Dates are statutory: PAYE, AIDS levy, ZIMDEF and the
 * Standards Development Levy are due by the 10th of the month after the pay
 * month, NSSA by the end of that month. `dueDay: null` means the last day.
 */
const STATUTORY_OBLIGATIONS: Array<{
  reportType: string;
  name: string;
  authority: string;
  dueDay: number | null;
  /** The levy that has to exist in the tenant's jurisdiction for this filing to be owed. */
  ruleCodes: string[];
  /** Takes the cent accumulator and returns the cent amount due. */
  compute: (agg: { payeAids: number; nssa: number; employerLevies: number }) => number;
}> = [
  { reportType: "P2", name: "ZIMRA PAYE & AIDS Levy Return", authority: "ZIMRA", dueDay: 10, ruleCodes: [STATUTORY_RULE_CODES.aidsLevy], compute: (a) => a.payeAids },
  { reportType: "ZIMDEF", name: "ZIMDEF & Standards Development Levy", authority: "ZIMRA", dueDay: 10, ruleCodes: [STATUTORY_RULE_CODES.zimdef], compute: (a) => a.employerLevies },
  { reportType: "NSSA", name: "NSSA Contributions Schedule", authority: "NSSA", dueDay: null, ruleCodes: [STATUTORY_RULE_CODES.nssaPobs], compute: (a) => a.nssa },
];

/**
 * The filings a jurisdiction actually owes. Listing ZIMRA or NSSA obligations to
 * a tenant whose payroll never charged them would have it "saving" and remitting
 * amounts no authority is expecting.
 */
function obligationsFor(jurisdiction: PayrollJurisdiction) {
  return STATUTORY_OBLIGATIONS.filter((obligation) => obligation.ruleCodes.some((code) => jurisdictionLevies(jurisdiction, code)));
}

function obligationDueDate(period: string, dueDay: number | null): string {
  const [year, month] = period.split("-").map(Number);
  // Deadlines fall in the month after the pay month.
  if (dueDay == null) {
    return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(year, month, dueDay)).toISOString().slice(0, 10);
}

/**
 * Per-period amounts owed, read from locked runs only. The accumulators hold
 * cents so a year of runs cannot drift the figure a remittance is keyed off.
 */
async function loadRemittanceAggregates(companyId: number, startMonth: string) {
  const runs = await db.select().from(payrollRuns)
    .where(and(
      eq(payrollRuns.companyId, companyId),
      eq(payrollRuns.status, "LOCKED"),
      gte(payrollRuns.periodStart, startMonth)
    ))
    .orderBy(asc(payrollRuns.periodStart));

  const byPeriod: Record<string, { gross: number; payeAids: number; nssa: number; employerLevies: number; currency: string }> = {};
  for (const run of runs) {
    const period = String(run.periodStart).slice(0, 7);
    const agg = byPeriod[period] || (byPeriod[period] = { gross: 0, payeAids: 0, nssa: 0, employerLevies: 0, currency: run.currency });
    const lines = await db.select({
      paye: payrollRunEmployees.paye,
      aids: payrollRunEmployees.aidsLevy,
      nssaEmp: payrollRunEmployees.nssaEmployee,
      nssaEr: payrollRunEmployees.nssaEmployer,
      snapshotData: payrollRunEmployees.snapshotData,
    }).from(payrollRunEmployees).where(eq(payrollRunEmployees.payrollRunId, run.id));

    // Cent accumulators: these are the figures a remittance is keyed off, so a
    // drifted total would put the tenant's filing out by a cent per run.
    agg.gross += centsOf(run.totalGross);
    for (const line of lines) {
      agg.payeAids += centsOf(line.paye) + centsOf(line.aids);
      agg.nssa += centsOf(line.nssaEmp) + centsOf(line.nssaEr);
      const snapshot = runSnapshot(line.snapshotData);
      agg.employerLevies += centsOf(snapshot.zimdefAmount) + centsOf(snapshot.standardsLevyAmount);
    }
  }
  return byPeriod;
}

function buildRemittanceSchedule(byPeriod: Record<string, any>, records: any[], startMonth: string, months: number, jurisdiction: PayrollJurisdiction) {
  const obligations = obligationsFor(jurisdiction);
  const recordByKey = new Map(records.map((record) => [`${record.reportType}:${record.period}`, record]));
  const schedule: any[] = [];
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);

  for (let index = 0; index < months; index++) {
    const periodDate = new Date(Date.UTC(startYear, startMonthNumber - 1 + index, 1));
    if (periodDate > new Date()) break;
    const period = periodDate.toISOString().slice(0, 7);
    const agg = byPeriod[period];

    for (const obligation of obligations) {
      const key = `${obligation.reportType}:${period}`;
      const record = recordByKey.get(key);
      const derivedAmount = agg ? centsToMoney(obligation.compute(agg)) : 0;
      schedule.push({
        ...(record || {}),
        id: record?.id ?? null,
        companyId: record?.companyId ?? null,
        authority: obligation.authority,
        reportType: obligation.reportType,
        name: obligation.name,
        period,
        currency: record?.currency || agg?.currency || "USD",
        // A filed return is never re-derived: what was submitted is what was paid.
        amount: record ? record.amount : derivedAmount.toFixed(2),
        derivedAmount: derivedAmount.toFixed(2),
        dueDate: record?.dueDate || obligationDueDate(period, obligation.dueDay),
        status: record?.status || (derivedAmount > 0 ? "NOT_RECORDED" : "NOTHING_DUE"),
        referenceNumber: record?.referenceNumber ?? null,
        paidAmount: record?.paidAmount ?? null,
        paidDate: record?.paidDate ?? null,
        recorded: !!record,
      });
    }
  }

  return schedule
    // A month with no payroll and no saved tracking row is not an obligation.
    .filter((entry: any) => entry.recorded || toMoney(entry.derivedAmount) > 0)
    .sort((a: any, b: any) => String(b.period).localeCompare(String(a.period)) || String(b.reportType).localeCompare(String(a.reportType)));
}

// GET /statutory-remittances?months=13 - filing calendar (read-only)
router.get("/statutory-remittances", async (req, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const months = Math.min(36, Math.max(1, parseInt(String(req.query.months || "13"), 10) || 13));
    const startMonth = remittanceStartMonth(months);

    const [byPeriod, records, jurisdiction] = await Promise.all([
      loadRemittanceAggregates(companyId, `${startMonth}-01`),
      db.select().from(payrollRemittances).where(and(
        eq(payrollRemittances.companyId, companyId),
        gte(payrollRemittances.period, startMonth)
      )),
      payrollJurisdiction(companyId),
    ]);

    res.json(buildRemittanceSchedule(byPeriod, records, startMonth, months, jurisdiction));
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /statutory-remittances/regenerate - save the calendar as tracking records
router.post("/statutory-remittances/regenerate", requirePayrollWrite, async (req, res) => {
  const schema = z.object({ months: z.coerce.number().int().min(1).max(36).default(13) });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const months = parsed.data.months;
    const startMonth = remittanceStartMonth(months);

    const [byPeriod, records, jurisdiction] = await Promise.all([
      loadRemittanceAggregates(companyId, `${startMonth}-01`),
      db.select().from(payrollRemittances).where(and(
        eq(payrollRemittances.companyId, companyId),
        gte(payrollRemittances.period, startMonth)
      )),
      payrollJurisdiction(companyId),
    ]);

    const schedule = buildRemittanceSchedule(byPeriod, records, startMonth, months, jurisdiction);
    const saved: any[] = [];

    for (const entry of schedule) {
      if (toMoney(entry.derivedAmount) <= 0) continue;
      // A return that has been filed keeps the amount it was filed with.
      if (entry.recorded && (entry.status === "SUBMITTED" || entry.status === "PAID")) {
        saved.push(entry);
        continue;
      }
      if (entry.recorded) {
        const [updated] = await db.update(payrollRemittances)
          .set({ amount: entry.derivedAmount, dueDate: entry.dueDate, currency: entry.currency })
          .where(and(eq(payrollRemittances.id, entry.id), eq(payrollRemittances.companyId, companyId)))
          .returning();
        if (updated) saved.push(updated);
        continue;
      }
      const [inserted] = await db.insert(payrollRemittances).values({
        companyId,
        authority: entry.authority,
        reportType: entry.reportType,
        name: entry.name,
        period: entry.period,
        currency: entry.currency,
        amount: entry.derivedAmount,
        dueDate: entry.dueDate,
      }).returning();
      saved.push(inserted);
    }

    await auditPayroll(req, "PAYROLL_REMITTANCE_SCHEDULE_REGENERATED", "payroll_remittances", null as any, {
      months,
      saved: saved.length,
    });
    res.json({ success: true, saved: saved.length });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// POST /statutory-remittances/:id/mark-paid - record submission/remittance
router.post("/statutory-remittances/:id/mark-paid", requirePayrollApproval, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const schema = z.object({
    referenceNumber: z.string().optional().nullable(),
    paidAmount: z.coerce.number().optional().nullable(),
    paidDate: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const [updated] = await db.update(payrollRemittances)
      .set({
        status: "SUBMITTED",
        referenceNumber: parsed.data.referenceNumber || null,
        paidAmount: parsed.data.paidAmount != null ? parsed.data.paidAmount.toFixed(2) : undefined,
        paidDate: parsed.data.paidDate || todayLocalIso(),
      })
      .where(and(eq(payrollRemittances.id, id), eq(payrollRemittances.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Remittance record not found" });

    await auditPayroll(req, "PAYROLL_REMITTANCE_MARKED_PAID", "payroll_remittances", updated.id, {
      reportType: updated.reportType,
      period: updated.period,
      referenceNumber: updated.referenceNumber,
      paidAmount: updated.paidAmount,
      paidDate: updated.paidDate,
    });
    res.json(updated);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// P6: Employee annual tax deduction certificates
// One row per employee for the selected tax year (or a single employee with ?employeeId=).
// Fields mirror the ZIMRA P6 certificate: identity, tax year, months employed,
// gross remuneration, taxable income, PAYE, AIDS Levy, NSSA and net tax remitted.
router.get("/exports/p6", async (req, res) => {
  const companyId = getTargetCompanyId(req);
  const taxYear = req.query.taxYear ? String(req.query.taxYear) : String(new Date().getFullYear());
  if (!/^\d{4}$/.test(taxYear)) return res.status(400).json({ error: "VALIDATION_ERROR", message: "taxYear must be a four digit year" });
  const employeeId = req.query.employeeId ? parseInt(String(req.query.employeeId), 10) : null;
  if (req.query.employeeId && !Number.isInteger(employeeId)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "employeeId must be a number" });
  }

  try {
    const jurisdiction = await payrollJurisdiction(companyId);
    if (respondsLevyNotCharged(res, jurisdiction, "P6", [STATUTORY_RULE_CODES.aidsLevy])) return;

    const startDate = `${taxYear}-01-01`;
    const endDate = `${taxYear}-12-31`;
    const currency = reportCurrencyParam(req.query.currency);
    const report = await loadFinalizedReport(companyId, startDate, endDate, "P6", currency, employeeId);
    if (respondReportBlocked(res, report)) return;
    if (respondMixedReportCurrency(res, report.runs, currency)) return;

    const header = "Employee ID,Surname,First Name,National ID,PAYE Number,Tax Year,Months Employed,Total Gross Income,Total Taxable Income,Total PAYE,Total AIDS Levy,Total NSSA,Total Net PAYE Payable\n";

    const runTypes: Record<number, string> = {};
    for (const run of report.runs) runTypes[run.id] = run.runType;

    const agg: Record<number, any> = {};
    for (const { line } of report.lines) {
      const eid = line.employeeId;
      if (!agg[eid]) {
        agg[eid] = { emp: line.employee, months: 0, gross: 0, taxable: 0, paye: 0, aids: 0, nssa: 0 };
      }
      const isBonusLine = runTypes[line.payrollRunId] === "BONUS";
      const snapshot: any = runSnapshot(line.snapshotData);
      if (!isBonusLine) agg[eid].months++;
      agg[eid].gross += centsOf(line.grossSalary);
      // Same rule as ITF16: report the income PAYE was charged on, from the snapshot.
      const legacyTaxable = centsOf(line.basicSalary) + centsOf(line.totalAllowances);
      agg[eid].taxable += isBonusLine && snapshot.taxableIncome == null
        ? centsOf(snapshot.taxableBonus)
        : snapshot.taxableIncome != null ? centsOf(snapshot.taxableIncome) : legacyTaxable;
      agg[eid].paye += centsOf(line.paye);
      agg[eid].aids += centsOf(line.aidsLevy);
      agg[eid].nssa += centsOf(line.nssaEmployee);
    }

    let csv = header;
    for (const [eid, data] of Object.entries(agg)) {
      const netPaye = centsToMoney(data.paye + data.aids);
      const gross = centsToMoney(data.gross);
      const taxable = centsToMoney(data.taxable);
      const paye = centsToMoney(data.paye);
      const aids = centsToMoney(data.aids);
      const nssa = centsToMoney(data.nssa);
      csv += `${csvEscape(data.emp.employeeNumber || eid)},${csvEscape(data.emp.lastName || '')},${csvEscape(data.emp.firstName || '')},${csvEscape(data.emp.nationalId || '')},${csvEscape(data.emp.zimraTaxNumber || '')},${taxYear},${data.months},${gross.toFixed(2)},${taxable.toFixed(2)},${paye.toFixed(2)},${aids.toFixed(2)},${nssa.toFixed(2)},${netPaye.toFixed(2)}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=P6_${taxYear}${employeeId ? `_${employeeId}` : ''}${reportCurrencySuffix(currency)}.csv`);
    res.send(csv);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

export default router;
