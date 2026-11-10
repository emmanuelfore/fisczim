import { describe, expect, it } from "vitest";
import {
  parseAsOfDate,
  parseOptionalRange,
  parseReportRange,
  throughEndOfDay,
} from "../../shared/report-dates";

const now = new Date(2026, 2, 15, 9, 30);

describe("parseReportRange", () => {
  it("defaults to the current calendar month", () => {
    const result = parseReportRange({}, { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.start).toEqual(new Date(2026, 2, 1));
    expect(result.end).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999));
  });

  it("defaults to the current year when asked", () => {
    const result = parseReportRange({}, { default: "year", now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.start).toEqual(new Date(2026, 0, 1));
    expect(result.end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });

  it("defaults to all time when asked", () => {
    const result = parseReportRange({}, { default: "all", now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.start).toEqual(new Date(0));
    expect(result.end).toEqual(throughEndOfDay(now));
  });

  it("makes a supplied end date cover the whole day", () => {
    const result = parseReportRange({ startDate: "2026-03-01", endDate: "2026-03-31" }, { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.end.getHours()).toBe(23);
    expect(result.end.getMinutes()).toBe(59);
    expect(result.end.getSeconds()).toBe(59);
    expect(result.end.getMilliseconds()).toBe(999);
  });

  it("rejects an unparseable bound instead of querying with Invalid Date", () => {
    expect(parseReportRange({ startDate: "not-a-date" }, { now })).toEqual({
      ok: false,
      message: "Invalid startDate format",
    });
    expect(parseReportRange({ endDate: "not-a-date" }, { now })).toEqual({
      ok: false,
      message: "Invalid endDate format",
    });
  });

  it("rejects an inverted range", () => {
    const result = parseReportRange({ startDate: "2026-03-31", endDate: "2026-03-01" }, { now });
    expect(result.ok).toBe(false);
  });

  it("requires both bounds in required mode", () => {
    expect(parseReportRange({ startDate: "2026-03-01" }, { default: "required", now })).toEqual({
      ok: false,
      message: "startDate and endDate are required",
    });
    const result = parseReportRange(
      { startDate: "2026-03-01", endDate: "2026-03-31" },
      { default: "required", now },
    );
    expect(result.ok).toBe(true);
  });

  it("reads alternate query keys", () => {
    const result = parseReportRange(
      { from: "2026-03-01", to: "2026-03-31" },
      { startKey: "from", endKey: "to", now },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.start.getDate()).toBe(1);
    expect(result.end.getDate()).toBe(31);
  });

  it("treats a blank parameter as absent", () => {
    const result = parseReportRange({ startDate: "", endDate: "  " }, { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.start).toEqual(new Date(2026, 2, 1));
  });
});

describe("parseOptionalRange", () => {
  it("leaves absent bounds undefined so statements stay unbounded", () => {
    expect(parseOptionalRange({})).toEqual({ ok: true, start: undefined, end: undefined });
  });

  it("still validates and closes the supplied end day", () => {
    const result = parseOptionalRange({ to: "2026-03-31" }, { startKey: "from", endKey: "to" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.start).toBeUndefined();
    expect(result.end?.getHours()).toBe(23);
    expect(parseOptionalRange({ from: "bad" }, { startKey: "from", endKey: "to" })).toEqual({
      ok: false,
      message: "Invalid from format",
    });
  });
});

describe("parseAsOfDate", () => {
  it("falls back to now and rejects garbage", () => {
    expect(parseAsOfDate({}, "date", now)).toEqual({ ok: true, date: now });
    expect(parseAsOfDate({ date: "bad" }, "date", now)).toEqual({
      ok: false,
      message: "Invalid date format",
    });
  });
});