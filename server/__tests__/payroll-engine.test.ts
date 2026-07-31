import { describe, expect, test } from "vitest";
import { ZimbabwePayrollEngine } from "../../shared/payroll-engine";

const STATUTORY = {
  aidsLevyRate: 0.03,
  zimdefRate: 0.01,
  standardsLevyRate: 0.005,
  taxFreeBonusThreshold: 400,
  nssaRateEmployee: 0.045,
  nssaRateEmployer: 0.045,
  nssaCeilingLimit: 700,
  medicalAidCreditMonthly: 75,
  blindPersonCreditAnnual: 900,
  elderlyPersonCreditAnnual: 900,
  maxTaxDeductiblePensionAnnual: 54000,
  hoursPerDay: 8,
  workingDaysPerMonth: 22,
  overtimeMultiplierStandard: 1.5,
  overtimeMultiplierSunday: 2,
};

describe("ZimbabwePayrollEngine", () => {
  test("applies tax-deductible deductions, NSSA cap and pension/nec rates", () => {
    const result = ZimbabwePayrollEngine.calculateEmployeeLine({
      baseSalary: 1000,
      elements: [
        { type: "EARNING", name: "Allowance", calculationMethod: "FIXED", amount: 100, isTaxable: true },
        { type: "EARNING", name: "NonTax", calculationMethod: "FIXED", amount: 50, isTaxable: false },
        { type: "DEDUCTION", name: "TaxDeductible", calculationMethod: "FIXED", amount: 40, isTaxDeductible: true },
        { type: "DEDUCTION", name: "Other", calculationMethod: "FIXED", amount: 60, isTaxDeductible: false },
      ],
      pensionEmployeeRate: 5,
      pensionEmployerRate: 5,
      necRate: 1,
      necEmployerRate: 1,
      necFixedAmount: 2,
      usdPercentage: 70,
      zigPercentage: 30,
      exchangeRate: 13.5,
      taxConfig: {
        brackets: [{ min: 0, max: null, rate: 20, deduction: 20 }],
      },
      statutoryConfig: STATUTORY,
    });

    expect(result.grossSalary).toBe(1150);
    expect(result.taxableIncome).toBe(978.5);
    expect(result.nssaEmployee).toBe(31.5);
    expect(result.pensionEmployee).toBe(50);
    expect(result.necEmployee).toBe(12);
    expect(result.payeRaw).toBe(175.7);
    expect(result.aidsLevy).toBe(5.27);
    expect(result.totalDeductions).toBe(374.47);
    expect(result.netSalary).toBe(775.53);
    expect(result.netSalaryUsd).toBeCloseTo(542.87, 2);
    expect(result.netSalaryZig).toBeCloseTo(3140.9, 2);
  });

  test("accepts decimal rates without scaling them again", () => {
    const result = ZimbabwePayrollEngine.calculateEmployeeLine({
      baseSalary: 1000,
      elements: [],
      pensionEmployeeRate: 0.05,
      pensionEmployerRate: 0.05,
      necRate: 0.01,
      necEmployerRate: 0.01,
      necFixedAmount: 0,
      usdPercentage: 100,
      zigPercentage: 0,
      exchangeRate: 1,
      taxConfig: {
        brackets: [{ min: 0, max: null, rate: 0.2, deduction: 0 }],
      },
      statutoryConfig: STATUTORY,
    });

    expect(result.nssaEmployee).toBe(31.5);
    expect(result.pensionEmployee).toBe(50);
    expect(result.necEmployee).toBe(10);
    expect(result.payeRaw).toBe(183.7);
    expect(result.aidsLevy).toBe(5.51);
    expect(result.netSalary).toBeCloseTo(719.29, 2);
  });

  test("taxes monthly income on the monthly bracket table (no annualization bug)", () => {
    // ZIMRA 2025/2026 USD monthly table: 40% band starts at 3,000 with a 335 deduction
    const brackets = [
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 100, max: 300, rate: 20, deduction: 20 },
      { min: 300, max: 1000, rate: 25, deduction: 35 },
      { min: 1000, max: 2000, rate: 30, deduction: 85 },
      { min: 2000, max: 3000, rate: 35, deduction: 185 },
      { min: 3000, max: null, rate: 40, deduction: 335 },
    ];

    const at = (baseSalary: number, expectedPaye: number) => {
      const result = ZimbabwePayrollEngine.calculateEmployeeLine({
        baseSalary,
        elements: [],
        pensionEmployeeRate: 0,
        pensionEmployerRate: 0,
        necRate: 0,
        necEmployerRate: 0,
        necFixedAmount: 0,
        usdPercentage: 100,
        zigPercentage: 0,
        exchangeRate: 1,
        taxConfig: { brackets },
        statutoryConfig: STATUTORY,
      });
      expect(result.payeRaw).toBeCloseTo(expectedPaye, 2);
    };

    // tax-free band: $100/mo pays nothing
    at(100, 0);
    // $3,000/mo: taxable 2968.5 (after NSSA 31.50) at 35% − 185 = 853.97
    at(3000, 853.97);
    // $4,000/mo: taxable 3968.5 at 40% − 335 = 1252.40
    at(4000, 1252.4);
  });

  test("normalizes non-monthly pay frequencies to the monthly table", () => {
    const brackets = [
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 100, max: 300, rate: 20, deduction: 20 },
      { min: 300, max: 1000, rate: 25, deduction: 35 },
      { min: 1000, max: 2000, rate: 30, deduction: 85 },
      { min: 2000, max: 3000, rate: 35, deduction: 185 },
      { min: 3000, max: null, rate: 40, deduction: 335 },
    ];
    const base = {
      baseSalary: 1000,
      elements: [],
      pensionEmployeeRate: 0,
      pensionEmployerRate: 0,
      necRate: 0,
      necEmployerRate: 0,
      necFixedAmount: 0,
      usdPercentage: 100,
      zigPercentage: 0,
      exchangeRate: 1,
      taxConfig: { brackets },
      statutoryConfig: STATUTORY,
    } as any;

    // Weekly $1,000: taxable 968.5 (after NSSA 31.50); monthly-equivalent
    // 968.5/(52/12)=223.5 → 223.5×0.2−20=24.7 → ×(52/12) ≈ 107.03
    const weekly = ZimbabwePayrollEngine.calculateEmployeeLine({ ...base, payFrequency: "WEEKLY" });
    expect(weekly.payeRaw).toBeCloseTo(107.03, 1);

    // Fortnightly $1,000: monthly-equivalent 968.5/(26/12)=446.99 → 446.99×0.25−35=76.75 → ×(26/12) ≈ 166.29
    const fortnightly = ZimbabwePayrollEngine.calculateEmployeeLine({ ...base, payFrequency: "FORTNIGHTLY" });
    expect(fortnightly.payeRaw).toBeCloseTo(166.29, 1);
  });
});
