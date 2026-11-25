import { describe, expect, test } from "vitest";
import { calculateVehiclePaymentPlan } from "../../shared/vehicle-payment-plan.js";

const terms = {
  agreedPrice: 20_000,
  depositAmount: 5_000,
  months: 6,
  interestType: "none",
  interestRate: 0,
  adminFee: 0,
  startDate: "2026-01-31",
};

describe("vehicle payment plan", () => {
  test("keeps the deposit separate and clamps instalments to the end of shorter months", () => {
    const result = calculateVehiclePaymentPlan(terms);
    expect(result).toMatchObject({ total: 20_000, interest: 0 });
    expect(result.lines[0]).toEqual({ type: "deposit", amount: 5_000, dueDate: "2026-01-31" });
    expect(result.lines[1]).toEqual({ type: "instalment", amount: 2_500, dueDate: "2026-02-28" });
    expect(result.lines[2].dueDate).toBe("2026-03-31");
  });

  test("shows fixed interest and admin fee separately from the deposit", () => {
    const result = calculateVehiclePaymentPlan({ ...terms, interestType: "fixed_amount", interestRate: 600 });
    expect(result).toMatchObject({ total: 20_600, interest: 600 });
    expect(result.lines.slice(1).map(line => line.amount)).toEqual(Array(6).fill(2_600));
    expect(calculateVehiclePaymentPlan({ ...terms, adminFee: 50 }).total).toBe(20_050);
  });

  test("retains flat and reducing-balance interest calculations", () => {
    expect(calculateVehiclePaymentPlan({ ...terms, interestType: "flat_rate", interestRate: 12 }).interest).toBe(900);
    expect(calculateVehiclePaymentPlan({ ...terms, interestType: "percent_pa", interestRate: 12 }).interest).toBe(529.35);
  });

  test("puts any rounding remainder on the final instalment", () => {
    const result = calculateVehiclePaymentPlan({ ...terms, agreedPrice: 100, depositAmount: 0, months: 3 });
    expect(result.lines.slice(1).map(line => line.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(result.total).toBe(100);
  });
});
