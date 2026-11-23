/**
 * Quarterly statutory rate review schedule.
 *
 * Zimbabwe uses UTC+2 year round (Africa/Harare, no DST). 09:00 local is
 * therefore 07:00 UTC. The cron expression deliberately names only the first
 * month of each quarter so the reminder never fires in February/March etc.
 *
 * This module is pure and date-injectable so the schedule can be asserted in
 * unit tests without waiting for 2027 or relying on the host timezone.
 */

export const STATUTORY_REVIEW_TIME_ZONE = "Africa/Harare";
export const STATUTORY_REVIEW_CRON = "0 9 1 1,4,7,10 *";
export const STATUTORY_REVIEW_START_UTC = "2027-01-01T07:00:00.000Z";

const REVIEW_MONTHS = [0, 3, 6, 9] as const; // Jan, Apr, Jul, Oct (JS months)
const REVIEW_HOUR_UTC = 7;

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function utcAt(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1, REVIEW_HOUR_UTC, 0, 0, 0));
}

/**
 * Returns the quarterly review instants from `fromYear` onwards. Useful for
 * seeding a persisted reminders table and for tests.
 */
export function statutoryReviewOccurrences(fromYear = 2027, count = 8): Date[] {
  const results: Date[] = [];
  for (let year = fromYear; results.length < count; year += 1) {
    for (const month of REVIEW_MONTHS) {
      results.push(utcAt(year, month));
      if (results.length >= count) break;
    }
  }
  return results;
}

/** True once the first scheduled reminder (1 Jan 2027 09:00 CAT) has arrived. */
export function isStatutoryReviewDue(now: Date | string | number = new Date()): boolean {
  return toDate(now).getTime() >= Date.parse(STATUTORY_REVIEW_START_UTC);
}

/** Next review instant strictly after `now`; null if the schedule has no next run. */
export function nextStatutoryReviewAt(now: Date | string | number = new Date()): Date | null {
  const instant = toDate(now);
  const start = Date.parse(STATUTORY_REVIEW_START_UTC);
  const baseYear = instant.getUTCFullYear();

  for (const candidate of statutoryReviewOccurrences(baseYear, 8)) {
    if (candidate.getTime() > instant.getTime() && candidate.getTime() >= start) {
      return candidate;
    }
  }
  return null;
}

export interface StatutoryReviewSchedule {
  cronExpression: string;
  timeZone: string;
  startAtUtc: string;
  due: boolean;
  nextRunUtc: string | null;
  nextRunLocal: string | null;
}

const harareFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: STATUTORY_REVIEW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Descriptive representation of the schedule, suitable for admin UI/API. */
export function getStatutoryReviewSchedule(now: Date | string | number = new Date()): StatutoryReviewSchedule {
  const next = nextStatutoryReviewAt(now);
  return {
    cronExpression: STATUTORY_REVIEW_CRON,
    timeZone: STATUTORY_REVIEW_TIME_ZONE,
    startAtUtc: STATUTORY_REVIEW_START_UTC,
    due: isStatutoryReviewDue(now),
    nextRunUtc: next ? next.toISOString() : null,
    nextRunLocal: next ? harareFormatter.format(next) : null,
  };
}
