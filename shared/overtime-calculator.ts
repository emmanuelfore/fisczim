/**
 * Zimbabwe Overtime Calculator
 * Labour Act Chapter 28:01, Section 15
 */

export interface OvertimeInput {
  baseMonthlySalary: number;
  workingDaysInMonth?: number; // default 22
  hoursPerDay?: number;        // default 8
  standardOvertimeHours: number;
  sundayHolidayOvertimeHours: number;
}

export interface OvertimeResult {
  hourlyRate: number;
  standardOvertimePay: number;  // 1.5x
  sundayHolidayOvertimePay: number; // 2.0x
  totalOvertimePay: number;
}

export function calculateOvertime(input: OvertimeInput): OvertimeResult {
  const workDays = input.workingDaysInMonth ?? 22;
  const hpd = input.hoursPerDay ?? 8;
  const hourlyRate = input.baseMonthlySalary / (workDays * hpd);
  const standardOvertimePay = input.standardOvertimeHours * hourlyRate * 1.5;
  const sundayHolidayOvertimePay = input.sundayHolidayOvertimeHours * hourlyRate * 2.0;
  return {
    hourlyRate: Math.round(hourlyRate * 10000) / 10000,
    standardOvertimePay: Math.round(standardOvertimePay * 100) / 100,
    sundayHolidayOvertimePay: Math.round(sundayHolidayOvertimePay * 100) / 100,
    totalOvertimePay: Math.round((standardOvertimePay + sundayHolidayOvertimePay) * 100) / 100,
  };
}

/** Zimbabwe Public Holidays 2026 (update annually) */
export const ZIM_PUBLIC_HOLIDAYS_2026: string[] = [
  "2026-01-01", // New Year's Day
  "2026-02-21", // Robert Gabriel Mugabe National Youth Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-04-18", // Independence Day
  "2026-05-01", // Workers' Day
  "2026-05-25", // Africa Day
  "2026-08-10", // Heroes' Day
  "2026-08-11", // Defence Forces Day
  "2026-12-22", // Unity Day
  "2026-12-25", // Christmas Day
  "2026-12-26", // Boxing Day
];

export function isPublicHoliday(dateStr: string, holidays = ZIM_PUBLIC_HOLIDAYS_2026): boolean {
  return holidays.includes(dateStr);
}

export function isSundayOrHoliday(dateStr: string, holidays = ZIM_PUBLIC_HOLIDAYS_2026): boolean {
  const d = new Date(dateStr);
  return d.getDay() === 0 || isPublicHoliday(dateStr, holidays);
}

/**
 * Calculate leave days between two dates, excluding weekends and public holidays
 * for accurate prorated salary / leave encashment calculations
 */
export function countWorkingDays(
  startDateStr: string,
  endDateStr: string,
  holidays = ZIM_PUBLIC_HOLIDAYS_2026
): number {
  let count = 0;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    if (!isSundayOrHoliday(iso, holidays)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
