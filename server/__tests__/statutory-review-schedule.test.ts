import { describe, expect, it } from "vitest";
import {
  STATUTORY_REVIEW_CRON,
  STATUTORY_REVIEW_START_UTC,
  STATUTORY_REVIEW_TIME_ZONE,
  getStatutoryReviewSchedule,
  isStatutoryReviewDue,
  nextStatutoryReviewAt,
  statutoryReviewOccurrences,
} from "../../shared/statutory/review-schedule.js";

describe("statutory review schedule", () => {
  it("is 09:00 on 1 Jan/Apr/Jul/Oct in Africa/Harare", () => {
    expect(STATUTORY_REVIEW_CRON).toBe("0 9 1 1,4,7,10 *");
    expect(STATUTORY_REVIEW_TIME_ZONE).toBe("Africa/Harare");
    expect(STATUTORY_REVIEW_START_UTC).toBe("2027-01-01T07:00:00.000Z");
  });

  it("does not fire before 1 January 2027 09:00 CAT", () => {
    expect(isStatutoryReviewDue("2026-12-31T23:00:00.000Z")).toBe(false);
    expect(isStatutoryReviewDue("2027-01-01T06:59:59.000Z")).toBe(false);
    expect(isStatutoryReviewDue("2027-01-01T07:00:00.000Z")).toBe(true);
  });

  it("returns the exact quarterly UTC instants", () => {
    expect(statutoryReviewOccurrences(2027, 5).map((date) => date.toISOString())).toEqual([
      "2027-01-01T07:00:00.000Z",
      "2027-04-01T07:00:00.000Z",
      "2027-07-01T07:00:00.000Z",
      "2027-10-01T07:00:00.000Z",
      "2028-01-01T07:00:00.000Z",
    ]);
  });

  it("computes the next run strictly after the supplied instant", () => {
    expect(nextStatutoryReviewAt("2026-11-22T10:00:00.000Z")?.toISOString()).toBe(
      "2027-01-01T07:00:00.000Z",
    );
    expect(nextStatutoryReviewAt("2027-01-01T07:00:00.000Z")?.toISOString()).toBe(
      "2027-04-01T07:00:00.000Z",
    );
    expect(nextStatutoryReviewAt("2027-04-01T06:59:59.000Z")?.toISOString()).toBe(
      "2027-04-01T07:00:00.000Z",
    );
  });

  it("exposes a schedule description with a Harare local time", () => {
    const schedule = getStatutoryReviewSchedule("2026-12-01T00:00:00.000Z");
    expect(schedule.cronExpression).toBe(STATUTORY_REVIEW_CRON);
    expect(schedule.timeZone).toBe(STATUTORY_REVIEW_TIME_ZONE);
    expect(schedule.due).toBe(false);
    expect(schedule.nextRunUtc).toBe("2027-01-01T07:00:00.000Z");
    expect(schedule.nextRunLocal).toContain("01/01/2027");
    expect(schedule.nextRunLocal).toContain("09:00");
  });
});
