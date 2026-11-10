export const AGING_BUCKETS = ["current", "days1_30", "days31_60", "days61_90", "days90plus"] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];

export type AgingAmounts = Record<AgingBucket, number>;

export function emptyAgingAmounts(): AgingAmounts {
  return { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
}

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "days1_30";
  if (daysOverdue <= 60) return "days31_60";
  if (daysOverdue <= 90) return "days61_90";
  return "days90plus";
}

export function daysOverdue(dueDate: Date, asOf: Date): number {
  return Math.floor((asOf.getTime() - dueDate.getTime()) / 86400000);
}

// An invoice with no due date ages from its issue date, never from "today" —
// otherwise it would sit in "current" forever.
export function resolveDueDate(
  dueDate: Date | string | null | undefined,
  issueDate: Date | string | null | undefined,
  asOf: Date,
): Date {
  const due = dueDate ? new Date(dueDate) : null;
  if (due && !Number.isNaN(due.getTime())) return due;
  const issued = issueDate ? new Date(issueDate) : null;
  if (issued && !Number.isNaN(issued.getTime())) return issued;
  return asOf;
}

export function addToBucket(amounts: AgingAmounts, days: number, balance: number): void {
  amounts[agingBucket(days)] += balance;
}

// The accounting aging endpoints predate the canonical names; keep their wire
// shape while sharing one set of boundaries.
export function legacyAgingFields(amounts: AgingAmounts) {
  return {
    current: amounts.current,
    days30: amounts.days1_30,
    days60: amounts.days31_60,
    days90: amounts.days61_90,
    over90: amounts.days90plus,
  };
}