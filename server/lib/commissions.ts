import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  approvalRequests,
  crmCommissionRules,
  crmCommissionSettings,
  crmCommissions,
  crmTaskPenalties,
  crmTasks,
  invoices,
  vehicles,
} from "../../shared/schema.js";
import {
  addWorkingHours,
  workingHoursBetween,
  parseWorkingDays,
  type WorkingHoursPolicy,
} from "../../shared/working-hours.js";

/**
 * Sales commission and task-SLA consequences.
 *
 * The money arithmetic is deliberately kept in one place:
 *   gross   = basis × rate  (or a flat amount)
 *   penalty = late-task deductions, capped at a percentage of gross
 *   net     = gross − penalty
 *
 * A commission row snapshots the rule it was calculated with, so editing a
 * rate never rewrites what was already approved. Task penalties attach to the
 * newest unpaid commission; when none exists they sit in `crm_task_penalties`
 * with a null commission and are carried onto the next one.
 */

type Executor = any;

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export type CommissionBasis = "gross_profit" | "revenue" | "fixed";

export type ResolvedRule = {
  basis: CommissionBasis;
  ratePercent: number;
  fixedAmount: number;
};

export type CommissionSettings = {
  responseWindowHours: number;
  penaltyPerLateTask: number;
  penaltyCapPercent: number;
  workingDays: number[];
  workdayStart: string;
  workdayEnd: string;
  utcOffsetMinutes: number;
  defaultBasis: CommissionBasis;
  defaultRatePercent: number;
  defaultFixedAmount: number;
};

function asBasis(value: unknown): CommissionBasis {
  return value === "revenue" || value === "fixed" ? value : "gross_profit";
}

/** Get the company's settings row, creating the defaults on first use. */
export async function getCommissionSettings(companyId: number, executor: Executor = db): Promise<CommissionSettings> {
  const load = async () => {
    const [row] = await executor
      .select()
      .from(crmCommissionSettings)
      .where(eq(crmCommissionSettings.companyId, companyId))
      .limit(1);
    return row ?? null;
  };

  let row = await load();
  if (!row) {
    await executor
      .insert(crmCommissionSettings)
      .values({ companyId })
      .onConflictDoNothing({ target: crmCommissionSettings.companyId });
    row = await load();
  }

  return {
    responseWindowHours: Math.max(1, Number(row?.responseWindowHours ?? 2)),
    penaltyPerLateTask: Math.max(0, Number(row?.penaltyPerLateTask ?? 25)),
    penaltyCapPercent: Math.min(100, Math.max(0, Number(row?.penaltyCapPercent ?? 100))),
    workingDays: parseWorkingDays(row?.workingDays),
    workdayStart: row?.workdayStart || "08:00",
    workdayEnd: row?.workdayEnd || "17:00",
    utcOffsetMinutes: Number(row?.utcOffsetMinutes ?? 120),
    defaultBasis: asBasis(row?.defaultBasis),
    defaultRatePercent: Number(row?.defaultRatePercent ?? 5),
    defaultFixedAmount: Number(row?.defaultFixedAmount ?? 0),
  };
}

export function workingPolicyOf(settings: CommissionSettings): WorkingHoursPolicy {
  return {
    workingDays: settings.workingDays,
    workdayStart: settings.workdayStart,
    workdayEnd: settings.workdayEnd,
    utcOffsetMinutes: settings.utcOffsetMinutes,
  };
}

/** The per-salesperson override, falling back to the company default. */
export async function resolveCommissionRule(
  companyId: number,
  salespersonId: string,
  executor: Executor = db,
): Promise<ResolvedRule & { source: "override" | "default" }> {
  const settings = await getCommissionSettings(companyId, executor);
  const [override] = await executor
    .select()
    .from(crmCommissionRules)
    .where(
      and(
        eq(crmCommissionRules.companyId, companyId),
        eq(crmCommissionRules.salespersonId, salespersonId),
        eq(crmCommissionRules.isActive, true),
      ),
    )
    .limit(1);

  if (override) {
    return {
      basis: asBasis(override.basis),
      ratePercent: Number(override.ratePercent ?? 0),
      fixedAmount: Number(override.fixedAmount ?? 0),
      source: "override",
    };
  }

  return {
    basis: settings.defaultBasis,
    ratePercent: settings.defaultRatePercent,
    fixedAmount: settings.defaultFixedAmount,
    source: "default",
  };
}

/** Apply a rule to a deal. Revenue/cost are in the company's base currency. */
export function computeCommissionAmounts(input: {
  saleAmount: number;
  costAmount: number;
  rule: Pick<ResolvedRule, "basis" | "ratePercent" | "fixedAmount">;
}) {
  const saleAmount = round2(input.saleAmount);
  const costAmount = round2(input.costAmount);
  const basisAmount =
    input.rule.basis === "gross_profit" ? Math.max(0, round2(saleAmount - costAmount)) : saleAmount;
  const grossAmount =
    input.rule.basis === "fixed"
      ? round2(input.rule.fixedAmount)
      : round2(basisAmount * (input.rule.ratePercent / 100));

  return { saleAmount, costAmount, basisAmount, grossAmount };
}

export function netOf(grossAmount: number, penaltyAmount: number) {
  return round2(Math.max(0, grossAmount - penaltyAmount));
}

/** Deadline for answering a task, calculated on the working clock. */
export async function taskResponseDeadline(
  companyId: number,
  from: Date = new Date(),
  executor: Executor = db,
): Promise<{ dueAt: Date; windowHours: number; penaltyPerLateTask: number }> {
  const settings = await getCommissionSettings(companyId, executor);
  return {
    dueAt: addWorkingHours(from, settings.responseWindowHours, workingPolicyOf(settings)),
    windowHours: settings.responseWindowHours,
    penaltyPerLateTask: settings.penaltyPerLateTask,
  };
}

type TaskRow = typeof crmTasks.$inferSelect;

/**
 * Deduct a salesperson's late-response penalty from their pay.
 *
 * Idempotent at the task level (`penalty_applied` is the guard). The ledger row
 * is always written; its commission link tells payroll which statement carried
 * the deduction, and a null link means it is waiting for the next commission.
 */
export async function penaliseLateTask(task: TaskRow): Promise<{ penaltyAmount: number; commissionId: number | null }> {
  if (task.penaltyApplied) return { penaltyAmount: Number(task.penaltyAmount ?? 0), commissionId: null };

  const settings = await getCommissionSettings(task.companyId);
  const policy = workingPolicyOf(settings);
  const lateHours = round2(workingHoursBetween(new Date(task.dueAt), new Date(), policy));
  const requestedAmount = round2(Number(settings.penaltyPerLateTask));

  return db.transaction(async (tx: any) => {
    // Lock the commission we are about to change and re-read the task, so two
    // sweepers (cron + an open tab) cannot double-deduct.
    const [fresh] = await tx
      .select()
      .from(crmTasks)
      .where(eq(crmTasks.id, task.id))
      .limit(1)
      .for("update");
    if (!fresh || fresh.penaltyApplied) {
      return { penaltyAmount: Number(fresh?.penaltyAmount ?? 0), commissionId: null };
    }

    const [commission] = await tx
      .select()
      .from(crmCommissions)
      .where(
        and(
          eq(crmCommissions.companyId, task.companyId),
          eq(crmCommissions.salespersonId, task.assignedTo),
          inArray(crmCommissions.status, ["draft", "pending_approval"]),
        ),
      )
      .orderBy(desc(crmCommissions.createdAt), desc(crmCommissions.id))
      .limit(1)
      .for("update");

    let appliedAmount = 0;
    let commissionId: number | null = null;

    if (commission) {
      const gross = Number(commission.grossAmount ?? 0);
      const currentPenalty = Number(commission.penaltyAmount ?? 0);
      const cap = round2(gross * (settings.penaltyCapPercent / 100));
      const nextPenalty = round2(Math.min(gross, Math.max(currentPenalty, Math.min(currentPenalty + requestedAmount, cap))));
      appliedAmount = round2(Math.max(0, nextPenalty - currentPenalty));
      commissionId = commission.id;

      await tx
        .update(crmCommissions)
        .set({
          penaltyAmount: nextPenalty.toFixed(2),
          netAmount: netOf(gross, nextPenalty).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(crmCommissions.id, commission.id));

      // A pending statement is what the admin is looking at: keep its approval
      // description honest when a late task reduces the amount under review.
      if (commission.approvalRequestId) {
        await tx
          .update(approvalRequests)
          .set({
            description: `Commission statement for ${new Date().toLocaleDateString("en-GB")} — gross ${gross.toFixed(2)}, penalties ${nextPenalty.toFixed(2)}, net ${netOf(gross, nextPenalty).toFixed(2)}.`,
            payload: sql`${approvalRequests.payload} || ${JSON.stringify({ netAmount: netOf(gross, nextPenalty) })}::jsonb`,
          })
          .where(eq(approvalRequests.id, commission.approvalRequestId));
      }
    } else {
      // Nothing open to deduct from yet: carry the full penalty forward.
      appliedAmount = requestedAmount;
    }

    if (appliedAmount > 0) {
      await tx.insert(crmTaskPenalties).values({
        companyId: task.companyId,
        taskId: task.id,
        salespersonId: task.assignedTo,
        commissionId,
        amount: appliedAmount.toFixed(2),
        lateHours: lateHours.toFixed(2),
        reason: `Task "${task.title}" answered outside the ${settings.responseWindowHours}-working-hour window.`,
        appliedAt: commissionId ? new Date() : null,
      });
    }

    await tx
      .update(crmTasks)
      .set({
        penaltyApplied: true,
        penaltyAmount: appliedAmount.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(crmTasks.id, task.id));

    return { penaltyAmount: appliedAmount, commissionId };
  });
}

/**
 * Apply any penalties waiting for a commission. Called whenever a commission is
 * created so a carried deduction lands on the next statement.
 */
export async function consumePendingPenalties(
  tx: Executor,
  companyId: number,
  salespersonId: string,
  commissionId: number,
  grossAmount: number,
): Promise<number> {
  const pending = await tx
    .select()
    .from(crmTaskPenalties)
    .where(
      and(
        eq(crmTaskPenalties.companyId, companyId),
        eq(crmTaskPenalties.salespersonId, salespersonId),
        isNull(crmTaskPenalties.commissionId),
      ),
    )
    .orderBy(crmTaskPenalties.createdAt, crmTaskPenalties.id);
  if (!pending.length) return 0;

  const settings = await getCommissionSettings(companyId, tx);
  const cap = round2(grossAmount * (settings.penaltyCapPercent / 100));

  // Whole ledger rows only: a row is either carried by this statement or left
  // waiting for the next one. That keeps the ledger a truthful record of which
  // statement absorbed each deduction.
  let remaining = Math.min(grossAmount, cap);
  const consume: number[] = [];
  let penalty = 0;
  for (const row of pending) {
    const amount = round2(Number(row.amount ?? 0));
    if (amount <= 0 || amount > remaining) continue;
    consume.push(row.id);
    remaining = round2(remaining - amount);
    penalty = round2(penalty + amount);
    if (remaining <= 0) break;
  }
  if (!consume.length) return 0;

  await tx
    .update(crmTaskPenalties)
    .set({ commissionId, appliedAt: new Date() })
    .where(inArray(crmTaskPenalties.id, consume));

  return penalty;
}

/**
 * Sweep tasks whose response window has closed.
 *
 * Runs from the scheduler and defensively before the task list is read, so a
 * deployment that restarts often still applies penalties promptly. Returns the
 * number of tasks penalised in this pass.
 */
export async function sweepOverdueTaskPenalties(companyId?: number): Promise<number> {
  const conditions = [
    eq(crmTasks.penaltyApplied, false),
    inArray(crmTasks.status, ["pending"]),
    lte(crmTasks.dueAt, new Date()),
  ];
  if (companyId) conditions.push(eq(crmTasks.companyId, companyId));

  const overdue = await db.select().from(crmTasks).where(and(...conditions)).limit(500);
  let applied = 0;
  for (const task of overdue) {
    try {
      await penaliseLateTask(task);
      applied += 1;
    } catch (error) {
      console.error(`[CRM] Failed to penalise late task ${task.id}`, error);
    }
  }
  return applied;
}

/**
 * Create (or return) the commission for an invoiced vehicle.
 *
 * Idempotent through the partial unique index on (company_id, vehicle_id); the
 * vehicle row supplies the salesperson, agreed price and posted COGS, and the
 * invoice (when present) supplies the final revenue.
 */
export async function accrueVehicleCommission(
  executor: Executor,
  input: { companyId: number; vehicleId: number; userId?: string | null },
) {
  const tx = executor ?? db;
  const [vehicle] = await tx
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.companyId, input.companyId)))
    .limit(1);
  if (!vehicle) return null;

  // The salesperson can be on the vehicle or inherited from the linked lead.
  let salespersonId: string | null = vehicle.salespersonId ?? null;
  if (!salespersonId) return null;

  const [existing] = await tx
    .select()
    .from(crmCommissions)
    .where(and(eq(crmCommissions.companyId, input.companyId), eq(crmCommissions.vehicleId, vehicle.id)))
    .limit(1);
  if (existing) return existing;

  let invoiceTotal: number | null = null;
  if (vehicle.invoiceId) {
    const [invoice] = await tx
      .select({ total: invoices.total, currency: invoices.currency, exchangeRate: invoices.exchangeRate })
      .from(invoices)
      .where(eq(invoices.id, vehicle.invoiceId))
      .limit(1);
    if (invoice) invoiceTotal = Number(invoice.total ?? 0) || null;
  }

  const saleAmount =
    invoiceTotal ??
    round2(Number(vehicle.salePrice ?? 0) * Number(vehicle.saleExchangeRate ?? 1) || 0);
  const costAmount = round2(Number(vehicle.cogsAmount ?? 0));
  const rule = await resolveCommissionRule(input.companyId, salespersonId, tx);
  const amounts = computeCommissionAmounts({ saleAmount, costAmount, rule });

  const [created] = await tx
    .insert(crmCommissions)
    .values({
      companyId: input.companyId,
      salespersonId,
      enquiryId: vehicle.enquiryId ?? null,
      vehicleId: vehicle.id,
      invoiceId: vehicle.invoiceId ?? null,
      reference: `Stock ${vehicle.stockNumber} — ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}`.trim(),
      basis: rule.basis,
      saleAmount: amounts.saleAmount.toFixed(2),
      costAmount: amounts.costAmount.toFixed(2),
      basisAmount: amounts.basisAmount.toFixed(2),
      ratePercent: rule.ratePercent.toFixed(3),
      fixedAmount: rule.fixedAmount.toFixed(2),
      grossAmount: amounts.grossAmount.toFixed(2),
      penaltyAmount: "0.00",
      netAmount: amounts.grossAmount.toFixed(2),
      status: "draft",
      periodMonth: new Date().toISOString().slice(0, 7),
      notes: "Accrued automatically when the vehicle was invoiced.",
      requestedBy: input.userId ?? null,
    })
    .onConflictDoNothing()
    .returning();

  // The conflict target is the partial index; fetch the winner when we lost a
  // race rather than returning undefined to the caller.
  const commission =
    created ??
    (
      await tx
        .select()
        .from(crmCommissions)
        .where(and(eq(crmCommissions.companyId, input.companyId), eq(crmCommissions.vehicleId, vehicle.id)))
        .limit(1)
    )[0];
  if (!commission || !created) return commission ?? null;

  // Carried penalties from before this deal existed.
  const carried = await consumePendingPenalties(
    tx,
    input.companyId,
    salespersonId,
    commission.id,
    Number(commission.grossAmount ?? 0),
  );
  if (carried > 0) {
    return (
      await tx
        .select()
        .from(crmCommissions)
        .where(eq(crmCommissions.id, commission.id))
        .limit(1)
    )[0];
  }
  return commission;
}

/** Approve/reject decision coming from either the CRM screen or the inbox. */
export async function applyCommissionDecision(
  companyId: number,
  commissionId: number,
  decision: "approve" | "reject",
  reviewerId: string,
  reviewNotes?: string | null,
) {
  const [commission] = await db
    .select()
    .from(crmCommissions)
    .where(and(eq(crmCommissions.id, commissionId), eq(crmCommissions.companyId, companyId)))
    .limit(1);
  if (!commission) throw new Error("Commission not found");
  if (commission.status === "paid") throw new Error("A paid commission cannot be changed");
  if (decision === "approve" && !["draft", "pending_approval", "rejected"].includes(commission.status)) {
    throw new Error(`A ${commission.status} commission cannot be approved`);
  }

  const [updated] = await db
    .update(crmCommissions)
    .set({
      status: decision === "approve" ? "approved" : "rejected",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
      updatedAt: new Date(),
    })
    .where(eq(crmCommissions.id, commissionId))
    .returning();
  return updated;
}

/**
 * Cancel the open commission attached to a vehicle whose sale was reversed.
 * Paid statements are left untouched because the money has already moved.
 */
export async function cancelVehicleCommission(
  executor: Executor,
  companyId: number,
  vehicleId: number,
  reason: string,
) {
  const tx = executor ?? db;
  const [commission] = await tx
    .select()
    .from(crmCommissions)
    .where(and(eq(crmCommissions.companyId, companyId), eq(crmCommissions.vehicleId, vehicleId)))
    .limit(1);
  if (!commission || commission.status === "paid") return commission ?? null;

  const [updated] = await tx
    .update(crmCommissions)
    .set({
      status: "rejected",
      reviewNotes: reason,
      updatedAt: new Date(),
    })
    .where(eq(crmCommissions.id, commission.id))
    .returning();
  return updated ?? null;
}

/** Serialisable policy block returned to the client with commission data. */
export function settingsForClient(settings: CommissionSettings) {
  return {
    responseWindowHours: settings.responseWindowHours,
    penaltyPerLateTask: settings.penaltyPerLateTask,
    penaltyCapPercent: settings.penaltyCapPercent,
    workingDays: settings.workingDays,
    workdayStart: settings.workdayStart,
    workdayEnd: settings.workdayEnd,
    utcOffsetMinutes: settings.utcOffsetMinutes,
    defaultBasis: settings.defaultBasis,
    defaultRatePercent: settings.defaultRatePercent,
    defaultFixedAmount: settings.defaultFixedAmount,
  };
}

/** Used by the settings route to report which task penalties are pending. */
export async function pendingPenaltyTotal(companyId: number, salespersonId?: string): Promise<number> {
  const conditions = [eq(crmTaskPenalties.companyId, companyId), isNull(crmTaskPenalties.commissionId)];
  if (salespersonId) conditions.push(eq(crmTaskPenalties.salespersonId, salespersonId));
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${crmTaskPenalties.amount}), 0)` })
    .from(crmTaskPenalties)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}
