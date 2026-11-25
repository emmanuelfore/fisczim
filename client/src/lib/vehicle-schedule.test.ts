import { describe, expect, test } from "vitest";
import { applyReceiptsToPreview, dealScheduleSummary, paymentSchedulePosition } from "./vehicle-schedule";

const today = "2026-11-25";

describe("vehicle schedule balances", () => {
  test("shows how much of an instalment the customer has covered", () => {
    expect(paymentSchedulePosition({ amount: 2500, open: 700, dueDate: "2026-12-01" }, today))
      .toEqual({ paid: 1800, open: 700, status: "partial" });
  });

  test.each([
    ["2026-11-24", 100, "overdue"],
    ["2026-11-25", 100, "due"],
    ["2026-11-26", 100, "upcoming"],
    ["2026-11-24", 0, "paid"],
  ] as const)("labels %s with %s remaining as %s", (dueDate, open, status) => {
    expect(paymentSchedulePosition({ amount: 100, open, dueDate }, today).status).toBe(status);
  });
});

describe("customer deal preview", () => {
  test("includes overdue and today's unpaid amounts, with the next future payment shown separately", () => {
    const late = { amount: 100, open: 25, dueDate: "2026-11-24" };
    const current = { amount: 200, open: 150, dueDate: today };
    const future = { amount: 500, open: 500, dueDate: "2026-12-03" };
    const paidFuture = { amount: 20, open: 0, dueDate: "2026-11-30" };
    expect(dealScheduleSummary([future, current, late, paidFuture], today))
      .toEqual({ total: 820, balance: 675, dueToday: 175, next: future });
  });

  test("applies existing receipts to a draft schedule in due order", () => {
    const later = { amount: 200, dueDate: "2026-12-01" };
    const deposit = { amount: 100, dueDate: "2026-11-25" };
    expect(applyReceiptsToPreview([later, deposit], 125.01)).toEqual([
      { ...deposit, id: 0, open: 0 },
      { ...later, id: 1, open: 174.99 },
    ]);
  });
});
