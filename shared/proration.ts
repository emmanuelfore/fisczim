// Configurable payroll proration.
//
// Proration answers: "how much of a full-period amount should this employee
// receive for a period, given when they joined / left / changed terms inside
// it?" The basis (and the constants it needs) are configuration, not hardcoded
// in the payroll route:
//
//   CALENDAR_DAYS  - every day in the period counts (incl. weekends/holidays)
//   WORKING_DAYS   - only Mon-Fri count (or Mon-Sat when workingDaysPerWeek=6)
//   PAYABLE_DAYS   - working days, but the full-period denominator uses the
//                    company's contracted payable days per month
//   HOURS_WORKED   - prorate by scheduled hours actually worked (falls back to
//                    working days when no attendance figures are supplied)
//
// All date arithmetic is inclusive on both ends: "joined on the 17th" counts
// the 17th as a paid day.

export type ProrationBasis = "CALENDAR_DAYS" | "WORKING_DAYS" | "PAYABLE_DAYS" | "HOURS_WORKED";

export const PRORATION_BASES: ProrationBasis[] = ["CALENDAR_DAYS", "WORKING_DAYS", "PAYABLE_DAYS", "HOURS_WORKED"];

export interface ProrationOptions {
  basis?: ProrationBasis; // which basis to use; defaults to CALENDAR_DAYS
  workingDaysPerWeek?: number; // 5 (Mon-Fri) or 6 (Mon-Sat)
  payableDaysPerMonth?: number; // contracted paid days in a standard month
  hoursPerDay?: number; // standard scheduled hours per day
}

export interface ProrationInput {
  periodStart: string; // yyyy-mm-dd inclusive
  periodEnd: string; // yyyy-mm-dd inclusive
  joinDate?: string | null; // effective employment start
  terminationDate?: string | null; // last paid day
  options?: ProrationOptions;
}

export interface ProrationResult {
  basis: ProrationBasis;
  factor: number; // 0..1 multiplier to apply to a full-period amount
  isProrated: boolean;
  worked: number; // units actually worked inside the period (per basis)
  total: number; // full-period units (per basis)
  effectiveStart: string;
  effectiveEnd: string;
  breakdown: Record<string, number>;
}

const DAY = 86400000;

function toDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY) + 1;
}

function countWorkingDays(from: string, to: string, workingDaysPerWeek: number): number {
  let count = 0;
  const cursor = toDate(from);
  const end = toDate(to).getTime();
  const workOnSaturday = workingDaysPerWeek >= 6;
  while (cursor.getTime() <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && (dow !== 6 || workOnSaturday)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function clip(periodStart: string, periodEnd: string, joinDate?: string | null, terminationDate?: string | null) {
  const start = joinDate && joinDate > periodStart ? joinDate : periodStart;
  const end = terminationDate && terminationDate < periodEnd ? terminationDate : periodEnd;
  const valid = start <= end;
  return { effectiveStart: valid ? start : periodStart, effectiveEnd: valid ? end : periodEnd, valid };
}

function normalizeOptions(options?: ProrationOptions): Required<ProrationOptions> {
  return {
    basis: options?.basis ?? "CALENDAR_DAYS",
    workingDaysPerWeek: options?.workingDaysPerWeek ?? 5,
    payableDaysPerMonth: options?.payableDaysPerMonth ?? 22,
    hoursPerDay: options?.hoursPerDay ?? 8,
  };
}

export function computeProration(input: ProrationInput): ProrationResult {
  const opts = normalizeOptions(input.options);
  const basis = opts.basis;
  const { effectiveStart, effectiveEnd, valid } = clip(input.periodStart, input.periodEnd, input.joinDate, input.terminationDate);

  const totalCalendarDays = daysBetweenInclusive(input.periodStart, input.periodEnd);
  const workedCalendarDays = valid ? daysBetweenInclusive(effectiveStart, effectiveEnd) : 0;

  const totalWorkingDays = countWorkingDays(input.periodStart, input.periodEnd, opts.workingDaysPerWeek);
  const workedWorkingDays = valid ? countWorkingDays(effectiveStart, effectiveEnd, opts.workingDaysPerWeek) : 0;

  let worked = workedCalendarDays;
  let total = totalCalendarDays;

  switch (basis) {
    case "WORKING_DAYS":
      worked = workedWorkingDays;
      total = totalWorkingDays;
      break;
    case "PAYABLE_DAYS": {
      // Payable days scale a standard month (30 calendar days) to the
      // company's contracted paid days, so a full month pays full salary.
      worked = workedWorkingDays;
      total = Math.max(1, Math.round(opts.payableDaysPerMonth * (totalCalendarDays / 30)));
      break;
    }
    case "HOURS_WORKED": {
      // Default: scheduled hours derived from working days. Attendance data
      // may later supply actual hours; this keeps the same shape.
      worked = workedWorkingDays * opts.hoursPerDay;
      total = Math.max(1, totalWorkingDays * opts.hoursPerDay);
      break;
    }
    case "CALENDAR_DAYS":
    default:
      break;
  }

  const factor = total > 0 ? Math.min(1, Math.max(0, worked / total)) : 0;

  return {
    basis,
    factor: Math.round(factor * 10000) / 10000,
    isProrated: factor < 1,
    worked,
    total,
    effectiveStart,
    effectiveEnd,
    breakdown: {
      workedCalendarDays,
      totalCalendarDays,
      workedWorkingDays,
      totalWorkingDays,
    },
  };
}

// A full-period amount split across a sub-window, e.g. an allowance that only
// runs from the 20th to the end of the month, on the same basis. Also honors
// the employee's employment window so a mid-month joiner/leaver never receives
// a full allowance for days they were not employed.
export function prorateAmount(
  amount: number,
  startDate: string,
  endDate: string | null,
  periodStart: string,
  periodEnd: string,
  options?: ProrationOptions,
  employment?: { joinDate?: string | null; terminationDate?: string | null },
): number {
  // The item's own active window clipped to the period.
  const itemStart = startDate > periodStart ? startDate : periodStart;
  const itemEnd = endDate && endDate < periodEnd ? endDate : periodEnd;
  if (itemStart > itemEnd) return 0;

  // The window the employee actually worked (employment window clipped to the
  // item's window), measured against the FULL period on the run's basis.
  const join = employment?.joinDate && employment.joinDate > itemStart ? employment.joinDate : itemStart;
  const term = employment?.terminationDate && employment.terminationDate < itemEnd ? employment.terminationDate : itemEnd;
  if (join > term) return 0;

  const worked = computeProration({
    periodStart,
    periodEnd,
    joinDate: join,
    terminationDate: term,
    options,
  });

  if (!worked.isProrated) return amount;
  const factor = worked.total > 0 ? Math.min(1, Math.max(0, worked.worked / worked.total)) : 0;
  return Math.round(amount * factor * 100) / 100;
}

// Weight a sequence of effective-dated salary slices by how many units each
// one overlaps the period. Handles "increase halfway through the month" as a
// blended average rather than picking one record for the whole period.
export interface SalarySlice {
  amount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function blendSalary(slices: SalarySlice[], periodStart: string, periodEnd: string, options?: ProrationOptions): number {
  if (slices.length === 0) return 0;
  const opts = normalizeOptions(options);
  let totalUnits = 0;
  let weighted = 0;
  for (const s of slices) {
    const start = s.effectiveFrom > periodStart ? s.effectiveFrom : periodStart;
    const end = s.effectiveTo && s.effectiveTo < periodEnd ? s.effectiveTo : periodEnd;
    if (start > end) continue;
    const units = daysBetweenInclusive(start, end) / opts.hoursPerDay;
    totalUnits += units;
    weighted += s.amount * units;
  }
  return totalUnits > 0 ? Math.round((weighted / totalUnits) * 100) / 100 : 0;
}