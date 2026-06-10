import { describe, expect, test } from "vitest";
import { ZimbabwePayrollEngine } from "../../shared/payroll-engine";

describe("ZimbabwePayrollEngine", () => {
  test("normalizes percentage rates and applies tax-deductible fixed deductions", () => {
    const result = ZimbabwePayrollEngine.calculateEmployeeLine({
      baseSalary: 1000,
      taxableAllowances: 100,
      nontaxableAllowances: 50,
      otherDeductions: 60,
      taxDeductibleDeductions: 40,
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
        nssaRateEmployee: 4.5,
        nssaRateEmployer: 4.5,
        nssaCeilingLimit: 700,
        aidsLevyRate: 3,
      },
    });

    expect(result.grossSalary).toBe(1150);
    expect(result.taxableIncome).toBe(978.5);
    expect(result.nssaEmployee).toBe(31.5);
    expect(result.pensionEmployee).toBe(50);
    expect(result.necEmployee).toBe(12);
    expect(result.payeRaw).toBe(175.7);
    expect(result.aidsLevy).toBe(5.27);
    expect(result.totalDeductions).toBe(334.47);
    expect(result.netSalary).toBe(815.53);
    expect(result.netSalaryUsd).toBe(570.87);
    expect(result.netSalaryZig).toBe(3302.9);
  });

  test("accepts decimal rates without scaling them again", () => {
    const result = ZimbabwePayrollEngine.calculateEmployeeLine({
      baseSalary: 1000,
      taxableAllowances: 0,
      nontaxableAllowances: 0,
      otherDeductions: 0,
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
        nssaRateEmployee: 0.045,
        nssaRateEmployer: 0.045,
        nssaCeilingLimit: 1000,
        aidsLevyRate: 0.03,
      },
    });

    expect(result.nssaEmployee).toBe(45);
    expect(result.pensionEmployee).toBe(50);
    expect(result.necEmployee).toBe(10);
    expect(result.payeRaw).toBe(181);
    expect(result.aidsLevy).toBe(5.43);
    expect(result.netSalary).toBe(708.57);
  });
});
