import { describe, expect, it } from "vitest";
import {
  AGING_BUCKETS,
  addToBucket,
  agingBucket,
  daysOverdue,
  emptyAgingAmounts,
  legacyAgingFields,
  resolveDueDate,
} from "../../shared/aging";

describe("aging buckets", () => {
  it("places each boundary day in exactly one bucket", () => {
    expect(agingBucket(-400)).toBe("current");
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(1)).toBe("days1_30");
    expect(agingBucket(30)).toBe("days1_30");
    expect(agingBucket(31)).toBe("days31_60");
    expect(agingBucket(60)).toBe("days31_60");
    expect(agingBucket(61)).toBe("days61_90");
    expect(agingBucket(90)).toBe("days61_90");
    expect(agingBucket(91)).toBe("days90plus");
  });

  it("never returns a bucket outside the canonical set", () => {
    for (let days = -730; days <= 730; days++) {
      expect(AGING_BUCKETS).toContain(agingBucket(days));
    }
  });

  it("accumulates balances into the matching bucket only", () => {
    const amounts = emptyAgingAmounts();
    addToBucket(amounts, 0, 100);
    addToBucket(amounts, 15, 20);
    addToBucket(amounts, 45, 3);
    addToBucket(amounts, 75, 4);
    addToBucket(amounts, 120, 5);
    expect(amounts).toEqual({
      current: 100,
      days1_30: 20,
      days31_60: 3,
      days61_90: 4,
      days90plus: 5,
    });
    expect(Object.values(amounts).reduce((a, b) => a + b, 0)).toBe(132);
  });

  it("keeps the accounting wire field names aligned with the canonical buckets", () => {
    const amounts = { current: 1, days1_30: 2, days31_60: 3, days61_90: 4, days90plus: 5 };
    expect(legacyAgingFields(amounts)).toEqual({
      current: 1,
      days30: 2,
      days60: 3,
      days90: 4,
      over90: 5,
    });
  });
});

describe("days overdue", () => {
  it("counts whole elapsed days and stays negative before the due date", () => {
    const due = new Date("2026-01-01T00:00:00Z");
    expect(daysOverdue(due, new Date("2026-01-01T12:00:00Z"))).toBe(0);
    expect(daysOverdue(due, new Date("2026-01-31T00:00:00Z"))).toBe(30);
    expect(daysOverdue(due, new Date("2025-12-31T00:00:00Z"))).toBe(-1);
  });
});

describe("resolveDueDate", () => {
  const asOf = new Date("2026-06-01T00:00:00Z");

  it("prefers the due date over the issue date", () => {
    expect(resolveDueDate("2026-02-01", "2026-01-01", asOf).toISOString()).toBe(
      new Date("2026-02-01").toISOString(),
    );
  });

  it("ages from the issue date when no due date is recorded", () => {
    expect(resolveDueDate(null, "2026-01-01", asOf).toISOString()).toBe(
      new Date("2026-01-01").toISOString(),
    );
    expect(resolveDueDate(undefined, undefined, asOf)).toBe(asOf);
  });

  it("ignores an unparseable date instead of producing NaN buckets", () => {
    expect(resolveDueDate("not-a-date", "2026-01-01", asOf).toISOString()).toBe(
      new Date("2026-01-01").toISOString(),
    );
    expect(resolveDueDate("not-a-date", "also-bad", asOf)).toBe(asOf);
  });
});