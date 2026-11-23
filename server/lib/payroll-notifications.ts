/**
 * Pending payroll run alerts.
 *
 * Runs do not go through the generic approval_requests inbox, so they need their
 * own notification records. Alerts are generated on state changes and removed
 * once a run is locked or reversed — a stale "needs attention" badge is worse
 * than no badge at all.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { payrollRunNotifications, payrollRuns } from "../../shared/schema.js";
import { runDates, type PayrollCalendarSettings } from "../../shared/payroll-calendar.js";
import { storage } from "../storage.js";
import { userHasPermission } from "./permissions.js";

export const PENDING_RUN_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as const;

export type RunNotificationKind = "CREATED" | "SUBMITTED" | "APPROVED";

type RunSummary = {
  id: number;
  periodStart: string;
  periodEnd: string;
  payFrequency: string;
  currency: string;
  status: string;
};

export function isPendingRunStatus(status: string): boolean {
  return (PENDING_RUN_STATUSES as readonly string[]).includes(status);
}

const NOTIFICATION_COPY: Record<RunNotificationKind, (run: RunSummary) => { title: string; message: string }> = {
  CREATED: (run) => ({
    title: "Payroll run created",
    message: `A ${run.payFrequency.toLowerCase()} run for ${run.periodStart} – ${run.periodEnd} is in draft. Review the worksheet and submit it for approval.`,
  }),
  SUBMITTED: (run) => ({
    title: "Payroll run awaiting approval",
    message: `The ${run.periodStart} – ${run.periodEnd} run (${run.currency}) is waiting for approval.`,
  }),
  APPROVED: (run) => ({
    title: "Payroll run approved",
    message: `The ${run.periodStart} – ${run.periodEnd} run is approved and ready to lock and post.`,
  }),
};

/** Notify every user who can view payroll for this company. */
export async function notifyPayrollRunChange(
  companyId: number,
  run: RunSummary,
  kind: RunNotificationKind,
): Promise<number> {
  const companyUsers = await storage.getCompanyUsers(companyId);
  const recipients: string[] = [];
  for (const user of companyUsers) {
    const canView = Boolean((user as any).isSuperAdmin)
      || await userHasPermission(user.id, companyId, "payroll.view", false);
    if (canView) recipients.push(user.id);
  }
  if (recipients.length === 0) return 0;

  const copy = NOTIFICATION_COPY[kind](run);
  const inserted = await db.insert(payrollRunNotifications)
    .values(recipients.map((userId) => ({
      companyId,
      userId,
      runId: run.id,
      kind,
      title: copy.title,
      message: copy.message,
      href: `/hr/payroll?run=${run.id}`,
    })))
    .onConflictDoNothing()
    .returning({ id: payrollRunNotifications.id });
  return inserted.length;
}

/** A locked or reversed run is finished; drop its outstanding alerts. */
export async function clearPayrollRunNotifications(companyId: number, runId: number): Promise<void> {
  await db.delete(payrollRunNotifications)
    .where(and(
      eq(payrollRunNotifications.companyId, companyId),
      eq(payrollRunNotifications.runId, runId),
    ));
}

export async function listPendingPayrollRuns(companyId: number, settings: PayrollCalendarSettings) {
  const runs = await db.select({
    id: payrollRuns.id,
    periodStart: payrollRuns.periodStart,
    periodEnd: payrollRuns.periodEnd,
    payFrequency: payrollRuns.payFrequency,
    currency: payrollRuns.currency,
    status: payrollRuns.status,
    totalNet: payrollRuns.totalNet,
    updatedAt: payrollRuns.updatedAt,
  }).from(payrollRuns)
    .where(and(
      eq(payrollRuns.companyId, companyId),
      inArray(payrollRuns.status, [...PENDING_RUN_STATUSES]),
    ))
    .orderBy(asc(payrollRuns.periodEnd))
    .limit(20);

  return runs.map((run) => ({
    ...run,
    ...runDates(String(run.periodEnd), run.payFrequency, settings),
  }));
}

export async function listPayrollNotifications(companyId: number, userId: string, limit = 20) {
  const rows = await db.select({
    id: payrollRunNotifications.id,
    kind: payrollRunNotifications.kind,
    title: payrollRunNotifications.title,
    message: payrollRunNotifications.message,
    href: payrollRunNotifications.href,
    isRead: payrollRunNotifications.isRead,
    createdAt: payrollRunNotifications.createdAt,
    runStatus: payrollRuns.status,
    periodStart: payrollRuns.periodStart,
    periodEnd: payrollRuns.periodEnd,
  }).from(payrollRunNotifications)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunNotifications.runId))
    .where(and(
      eq(payrollRunNotifications.companyId, companyId),
      eq(payrollRunNotifications.userId, userId),
    ))
    .orderBy(desc(payrollRunNotifications.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));

  // Defensive: if a run was locked by another path, do not surface its alert.
  const items = rows.filter((row) => isPendingRunStatus(row.runStatus));
  const counted = await db.select({ count: sql<number>`count(*)::int` })
    .from(payrollRunNotifications)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunNotifications.runId))
    .where(and(
      eq(payrollRunNotifications.companyId, companyId),
      eq(payrollRunNotifications.userId, userId),
      eq(payrollRunNotifications.isRead, false),
      inArray(payrollRuns.status, [...PENDING_RUN_STATUSES]),
    ));
  return {
    items,
    unreadCount: Number(counted[0]?.count || 0),
  };
}

export async function markPayrollNotificationRead(
  companyId: number,
  userId: string,
  notificationId: number,
): Promise<boolean> {
  const [row] = await db.update(payrollRunNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(payrollRunNotifications.id, notificationId),
      eq(payrollRunNotifications.companyId, companyId),
      eq(payrollRunNotifications.userId, userId),
    ))
    .returning({ id: payrollRunNotifications.id });
  return Boolean(row);
}

export async function markAllPayrollNotificationsRead(companyId: number, userId: string): Promise<number> {
  const updated = await db.update(payrollRunNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(
      eq(payrollRunNotifications.companyId, companyId),
      eq(payrollRunNotifications.userId, userId),
      eq(payrollRunNotifications.isRead, false),
    ))
    .returning({ id: payrollRunNotifications.id });
  return updated.length;
}
