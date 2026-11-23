/**
 * Payroll calendar helpers.
 *
 * The settings live on payroll_company_settings; these functions turn them into
 * the actual period and pay date shown in the new-run dialog, the dashboard and
 * the pending-run alerts. Kept dependency-free so web/desktop/mobile can share it.
 */

export const PAY_FREQUENCIES = ["MONTHLY", "WEEKLY", "FORTNIGHTLY", "DAILY"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export interface PayrollCalendarSettings {
  defaultPayFrequency?: string | null;
  payDay?: number | null;
  periodCutoffDay?: number | null;
  reminderDaysBefore?: number | null;
}

export interface PayPeriod {
  payFrequency: PayFrequency;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  reminderDate: string;
}

const pad = (value: number) => String(value).padStart(2, "0");
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function fromIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dayInMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, clamp(day, 1, lastDay));
}

export function frequencyOf(value?: string | null): PayFrequency {
  return PAY_FREQUENCIES.includes(value as PayFrequency) ? (value as PayFrequency) : "MONTHLY";
}

function daysBefore(date: Date, days: number): string {
  return toIso(addDays(date, -clamp(days, 0, 365)));
}

/** Pay date for a run that has already been created. */
export function dueDateForRun(
  periodEnd: string,
  frequency: string | null | undefined,
  settings: PayrollCalendarSettings,
): string {
  const end = fromIso(periodEnd);
  if (!end) return periodEnd;
  const freq = frequencyOf(frequency);
  if (freq === "MONTHLY") {
    const nextMonth = new Date(end.getFullYear(), end.getMonth() + 1, 1);
    return toIso(dayInMonth(nextMonth.getFullYear(), nextMonth.getMonth(), Number(settings.payDay) || 25));
  }
  if (freq === "DAILY") return toIso(end);
  return toIso(addDays(end, 7));
}

/** Pay date and alert start date for a run that already exists. */
export function runDates(
  periodEnd: string,
  frequency: string | null | undefined,
  settings: PayrollCalendarSettings,
): { dueDate: string; reminderDate: string } {
  const dueDate = dueDateForRun(periodEnd, frequency, settings);
  const due = fromIso(dueDate);
  const reminderDays = clamp(Number(settings.reminderDaysBefore ?? 7) || 0, 0, 365);
  return {
    dueDate,
    reminderDate: due ? daysBefore(due, reminderDays) : dueDate,
  };
}

/** Current open pay period plus its pay date, derived from the calendar settings. */
export function currentPayPeriod(
  settings: PayrollCalendarSettings,
  now: Date = new Date(),
): PayPeriod {
  const payFrequency = frequencyOf(settings.defaultPayFrequency);
  const cutoffDay = clamp(Number(settings.periodCutoffDay) || 20, 1, 31);
  const payDay = clamp(Number(settings.payDay) || 25, 1, 31);
  const reminderDays = clamp(Number(settings.reminderDaysBefore ?? 7) || 0, 0, 365);

  let periodStart: Date;
  let periodEnd: Date;
  let dueDate: string;

  if (payFrequency === "MONTHLY") {
    const thisMonthCutoff = dayInMonth(now.getFullYear(), now.getMonth(), cutoffDay);
    periodEnd = toIso(now) >= toIso(thisMonthCutoff)
      ? thisMonthCutoff
      : dayInMonth(now.getFullYear(), now.getMonth() - 1, cutoffDay);
    periodStart = addDays(dayInMonth(periodEnd.getFullYear(), periodEnd.getMonth() - 1, cutoffDay), 1);
    const nextMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);
    dueDate = toIso(dayInMonth(nextMonth.getFullYear(), nextMonth.getMonth(), payDay));
  } else {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (payFrequency === "DAILY") {
      periodStart = today;
      periodEnd = today;
      dueDate = toIso(today);
    } else {
      // Pay weeks close on Friday; the bank/payment date is the following Friday.
      const daysSinceFriday = (today.getDay() - 5 + 7) % 7;
      periodEnd = addDays(today, -daysSinceFriday);
      periodStart = addDays(periodEnd, payFrequency === "FORTNIGHTLY" ? -13 : -6);
      dueDate = toIso(addDays(periodEnd, 7));
    }
  }

  return {
    payFrequency,
    periodStart: toIso(periodStart),
    periodEnd: toIso(periodEnd),
    dueDate,
    reminderDate: daysBefore(fromIso(dueDate) as Date, reminderDays),
  };
}
