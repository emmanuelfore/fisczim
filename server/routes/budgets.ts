import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "../db.js";
import {
  accounts,
  budgets,
  costCenters,
  departments,
  journalEntries,
  ledgerEntries,
} from "../../shared/schema.js";
import { userHasPermission } from "../lib/permissions.js";
import { requireDepartmentalDimensions } from "../lib/departmental.js";
import { logAction } from "../audit.js";

const budgetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  costCenterId: z.coerce.number().int().positive().nullable().optional(),
  accountId: z.coerce.number().int().positive(),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  amount: z.coerce.number().nonnegative(),
  currency: z.string().trim().min(3).max(10).default("USD"),
  status: z.enum(["DRAFT", "APPROVED", "CLOSED"]).default("DRAFT"),
});

const httpError = (status: number, message: string): Error & { status: number } =>
  Object.assign(new Error(message), { status });

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export function createBudgetsRouter(requireAuth: any, requireCompanyAccess: any) {
  const router = Router();
  const base = [requireAuth, requireCompanyAccess];

  async function need(req: any, permission: string) {
    if (!req.user?.id) return false;
    return userHasPermission(
      req.user.id,
      Number(req.params.companyId),
      permission,
      Boolean(req.user?.isSuperAdmin),
    );
  }

  const requireView = [
    ...base,
    async (req: any, res: any, next: any) => {
      if (await need(req, "accounting.view")) return next();
      return res.status(403).json({ error: "Permission required: accounting.view" });
    },
  ];
  const requireManage = [
    ...base,
    async (req: any, res: any, next: any) => {
      if (await need(req, "accounting.budgets")) return next();
      return res.status(403).json({ error: "Permission required: accounting.budgets" });
    },
  ];

  async function assertReferences(companyId: number, body: z.infer<typeof budgetSchema>) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, body.accountId), eq(accounts.companyId, companyId)))
      .limit(1);
    if (!account) throw httpError(422, "Account does not belong to this company");

    if (body.departmentId) {
      const [department] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(and(eq(departments.id, body.departmentId), eq(departments.companyId, companyId)))
        .limit(1);
      if (!department) throw httpError(422, "Department does not belong to this company");
    }
    if (body.costCenterId) {
      const [costCenter] = await db
        .select({ id: costCenters.id })
        .from(costCenters)
        .where(and(eq(costCenters.id, body.costCenterId), eq(costCenters.companyId, companyId)))
        .limit(1);
      if (!costCenter) throw httpError(422, "Cost centre does not belong to this company");
    }
    if (body.periodEnd < body.periodStart) {
      throw httpError(422, "Period end must be on or after period start");
    }

    // Budgets must carry the same mandatory analytical dimensions as postings.
    await requireDepartmentalDimensions(companyId, {
      departmentId: body.departmentId,
      costCenterId: body.costCenterId,
    });
  }

  async function loadBudget(companyId: number, id: number) {
    const [row] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.companyId, companyId)))
      .limit(1);
    if (!row) throw httpError(404, "Budget not found");
    return row;
  }

  async function withActuals(companyId: number, rows: Array<typeof budgets.$inferSelect>) {
    if (!rows.length) return [];
    const start = new Date(rows.reduce((min, row) => (row.periodStart < min ? row.periodStart : min), rows[0].periodStart));
    const end = new Date(`${rows.reduce((max, row) => (row.periodEnd > max ? row.periodEnd : max), rows[0].periodEnd)}T23:59:59`);

    const lines = await db
      .select({
        accountId: ledgerEntries.accountId,
        departmentId: ledgerEntries.departmentId,
        costCenterId: ledgerEntries.costCenterId,
        type: ledgerEntries.type,
        amount: ledgerEntries.baseAmount,
        accountType: accounts.type,
      })
      .from(ledgerEntries)
      .innerJoin(journalEntries, eq(ledgerEntries.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(and(
        eq(journalEntries.companyId, companyId),
        ne(journalEntries.status, "VOID"),
        // entryDate is a timestamp; string comparison against date columns is
        // intentionally avoided here so timezone conversion cannot drop a day.
        gte(journalEntries.entryDate, start),
        lte(journalEntries.entryDate, end),
      ));

    return rows.map((budget) => {
      const accountType = String(
        lines.find((line) => line.accountId === budget.accountId)?.accountType || "EXPENSE",
      ).toUpperCase();
      const debitNormal = !["REVENUE", "LIABILITY", "EQUITY"].includes(accountType);
      const actual = money(lines.reduce((sum, line) => {
        if (line.accountId !== budget.accountId) return sum;
        if (budget.departmentId && line.departmentId !== budget.departmentId) return sum;
        if (budget.costCenterId && line.costCenterId !== budget.costCenterId) return sum;
        const direction = line.type === "DEBIT" ? 1 : -1;
        return sum + direction * Number(line.amount || 0) * (debitNormal ? 1 : -1);
      }, 0));
      const budgetAmount = money(Number(budget.amount || 0));
      const variance = money(actual - budgetAmount);
      return {
        ...budget,
        actual,
        variance,
        favorableVariance: debitNormal ? money(-variance) : variance,
        utilization: budgetAmount > 0 ? money((actual / budgetAmount) * 100) : null,
        accountType,
      };
    });
  }

  const listHandler = async (req: any, res: any) => {
    try {
      const companyId = Number(req.params.companyId);
      const query = z.object({
        fiscalYear: z.coerce.number().int().optional(),
        departmentId: z.coerce.number().int().positive().optional(),
        costCenterId: z.coerce.number().int().positive().optional(),
        status: z.string().max(20).optional(),
      }).parse(req.query);
      const conditions = [eq(budgets.companyId, companyId)];
      if (query.fiscalYear) conditions.push(eq(budgets.fiscalYear, query.fiscalYear));
      if (query.departmentId) conditions.push(eq(budgets.departmentId, query.departmentId));
      if (query.costCenterId) conditions.push(eq(budgets.costCenterId, query.costCenterId));
      if (query.status) conditions.push(eq(budgets.status, query.status));
      const rows = await db.select().from(budgets).where(and(...conditions));
      res.json(await withActuals(companyId, rows));
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message || "Could not load budgets" });
    }
  };

  const createHandler = async (req: any, res: any) => {
    try {
      const companyId = Number(req.params.companyId);
      const body = budgetSchema.parse(req.body);
      await assertReferences(companyId, body);
      const [created] = await db.insert(budgets).values({
        companyId,
        name: body.name,
        departmentId: body.departmentId ?? null,
        costCenterId: body.costCenterId ?? null,
        accountId: body.accountId,
        fiscalYear: body.fiscalYear,
        periodStart: dateString(body.periodStart),
        periodEnd: dateString(body.periodEnd),
        amount: String(body.amount),
        currency: body.currency,
        status: body.status,
        createdBy: req.user?.id || null,
      }).returning();
      await logAction(companyId, req.user?.id || "system", "BUDGET_CREATED", "budget", String(created.id), {
        departmentId: created.departmentId,
        costCenterId: created.costCenterId,
        amount: created.amount,
      });
      res.status(201).json((await withActuals(companyId, [created]))[0]);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message || "Could not create budget" });
    }
  };

  router.get("/companies/:companyId/accounting/budgets", ...requireView, listHandler);
  router.post("/companies/:companyId/accounting/budgets", ...requireManage, createHandler);

  // Compatibility with the older /api/accounting/budgets screens, which infer
  // the tenant from the query string, body, header or active user profile.
  const resolveLegacyCompany = (req: any, res: any, next: any) => {
    const requested =
      req.query?.companyId ?? req.body?.companyId ?? req.headers?.["x-company-id"] ?? req.user?.companyId;
    if (!requested) return res.status(400).json({ message: "No company profile selected" });
    req.params.companyId = String(requested);
    next();
  };
  router.get("/accounting/budgets", resolveLegacyCompany, requireCompanyAccess, ...requireView, listHandler);
  router.post("/accounting/budgets", resolveLegacyCompany, requireCompanyAccess, ...requireManage, createHandler);

  router.put("/companies/:companyId/accounting/budgets/:id", ...requireManage, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid budget id" });
      const existing = await loadBudget(companyId, id);
      if (existing.status === "CLOSED") return res.status(409).json({ message: "Closed budgets cannot be edited" });
      const body = budgetSchema.parse(req.body);
      await assertReferences(companyId, body);
      const [updated] = await db.update(budgets).set({
        name: body.name,
        departmentId: body.departmentId ?? null,
        costCenterId: body.costCenterId ?? null,
        accountId: body.accountId,
        fiscalYear: body.fiscalYear,
        periodStart: dateString(body.periodStart),
        periodEnd: dateString(body.periodEnd),
        amount: String(body.amount),
        currency: body.currency,
        status: body.status,
        updatedAt: new Date(),
      }).where(and(eq(budgets.id, id), eq(budgets.companyId, companyId))).returning();
      await logAction(companyId, req.user?.id || "system", "BUDGET_UPDATED", "budget", String(id));
      res.json((await withActuals(companyId, [updated]))[0]);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message || "Could not update budget" });
    }
  });

  router.delete("/companies/:companyId/accounting/budgets/:id", ...requireManage, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid budget id" });
      const existing = await loadBudget(companyId, id);
      if (existing.status !== "DRAFT") {
        return res.status(409).json({ message: "Only draft budgets may be deleted. Close the budget instead." });
      }
      await db.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.companyId, companyId)));
      await logAction(companyId, req.user?.id || "system", "BUDGET_DELETED", "budget", String(id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not delete budget" });
    }
  });

  return router;
}
