/**
 * Working-hours arithmetic for CRM response SLAs.
 *
 * A task given to a team member must be answered within a number of *working*
 * hours. "Working" is a company policy: which weekdays count, the start and end
 * of the day, and the offset of the business clock from UTC. Zimbabwe runs on
 * CAT (UTC+2) all year, so a fixed offset is enough and avoids dragging a
 * timezone database into both the server and the browser bundle.
 *
 * All maths is done on a "business clock" (UTC millis shifted by the offset) so
 * the result does not depend on the machine's local timezone.
 */

export type WorkingHoursPolicy = {
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  /** "HH:MM" on the business clock. */
  workdayStart: string;
  /** "HH:MM" on the business clock. */
  workdayEnd: string;
  /** Minutes the business clock is ahead of UTC. CAT = 120. */
  utcOffsetMinutes: number;
};

export const DEFAULT_WORKING_HOURS: WorkingHoursPolicy = {
  workingDays: [1, 2, 3, 4, 5],
  workdayStart: "08:00",
  workdayEnd: "17:00",
  utcOffsetMinutes: 120,
};

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Parse "HH:MM" (or "HH:MM:SS") into minutes from midnight, clamped to a day. */
export function parseClock(value: string | null | undefined, fallback: string): number {
  const text = (value || fallback).trim();
  const [hoursRaw, minutesRaw] = text.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return parseClock(fallback, "00:00");
  }
  return Math.min(24 * 60 - 1, Math.max(0, hours * 60 + minutes));
}

/** Stored as a comma-separated list, e.g. "1,2,3,4,5". */
export function parseWorkingDays(value: string | null | undefined): number[] {
  if (!value) return DEFAULT_WORKING_HOURS.workingDays;
  const days = String(value)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return days.length ? [...new Set(days)] : DEFAULT_WORKING_HOURS.workingDays;
}

export function serializeWorkingDays(days: number[] | null | undefined): string {
  const clean = (days || [])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return (clean.length ? [...new Set(clean)] : DEFAULT_WORKING_HOURS.workingDays).sort((a, b) => a - b).join(",");
}

function isoDay(date: Date): number {
  return date.getUTCDay() || 7;
}

function startOfBusinessDay(businessMs: number, startMinutes: number): number {
  const date = new Date(businessMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + startMinutes * MINUTE;
}

/**
 * Advance `start` by `hours` of working time.
 *
 * A request raised outside business hours starts counting at the next opening
 * time, which is what "respond within two working hours" means in practice.
 */
export function addWorkingHours(
  start: Date,
  hours: number,
  policy: WorkingHoursPolicy = DEFAULT_WORKING_HOURS,
): Date {
  const startMinutes = parseClock(policy.workdayStart, "08:00");
  const endMinutes = parseClock(policy.workdayEnd, "17:00");
  const offset = policy.utcOffsetMinutes * MINUTE;
  const days = new Set(policy.workingDays.length ? policy.workingDays : DEFAULT_WORKING_HOURS.workingDays);

  if (!(hours > 0) || endMinutes <= startMinutes) return new Date(start);

  let remaining = hours * 60 * MINUTE;
  let business = start.getTime() + offset;

  // The guard is a safety net against a malformed policy (no working days, a
  // zero-length day) rather than the normal exit path.
  for (let guard = 0; guard < 4000; guard += 1) {
    const date = new Date(business);
    const dayStart = startOfBusinessDay(business, startMinutes);
    const dayEnd = startOfBusinessDay(business, endMinutes);

    if (!days.has(isoDay(date))) {
      business = dayStart + DAY;
      continue;
    }
    if (business < dayStart) business = dayStart;
    if (business >= dayEnd) {
      business = dayStart + DAY;
      continue;
    }

    const available = dayEnd - business;
    if (available >= remaining) {
      business += remaining;
      return new Date(business - offset);
    }
    remaining -= available;
    business = dayStart + DAY;
  }

  return new Date(business - offset);
}

/** How many working hours lie between two instants (0 when `end` is earlier). */
export function workingHoursBetween(
  start: Date,
  end: Date,
  policy: WorkingHoursPolicy = DEFAULT_WORKING_HOURS,
): number {
  const startMinutes = parseClock(policy.workdayStart, "08:00");
  const endMinutes = parseClock(policy.workdayEnd, "17:00");
  const offset = policy.utcOffsetMinutes * MINUTE;
  const days = new Set(policy.workingDays.length ? policy.workingDays : DEFAULT_WORKING_HOURS.workingDays);

  if (endMinutes <= startMinutes || end.getTime() <= start.getTime()) return 0;

  let business = start.getTime() + offset;
  const finish = end.getTime() + offset;
  let total = 0;

  for (let guard = 0; guard < 4000 && business < finish; guard += 1) {
    const date = new Date(business);
    const dayStart = startOfBusinessDay(business, startMinutes);
    const dayEnd = startOfBusinessDay(business, endMinutes);

    if (!days.has(isoDay(date))) {
      business = dayStart + DAY;
      continue;
    }
    if (business < dayStart) business = dayStart;
    if (business >= dayEnd) {
      business = dayStart + DAY;
      continue;
    }

    const stop = Math.min(finish, dayEnd);
    if (stop > business) total += stop - business;
    if (stop < dayEnd) break;
    business = dayStart + DAY;
  }

  return total / (60 * MINUTE);
}

/** "2h 15m" – the label used on the task list. */
export function formatWorkingDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0m";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
