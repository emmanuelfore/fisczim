import { describe, expect, test } from "vitest";
import {
  ZimbabwePayrollEngine,
  type ConfiguredStatutoryRule,
} from "../../shared/payroll-engine";
import { ZIMBABWE_STATUTORY_DEFAULTS } from "../../shared/statutory/zimbabwe";

const BASE_INPUT = {
  baseSalary: 2000,
  elements: [],
  pensionEmployeeRate: 0,
  pensionEmployerRate: 0,
  necRate: 0,
  necEmployerRate: 0,
  necFixedAmount: 0,
  usdPercentage: 100,
  zigPercentage: 0,
  exchangeRate: 1,
  taxConfig: {
    brackets: [
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 100, max: 300, rate: 20, deduction: 20 },
      { min: 300, max: 1000, rate: 25, deduction: 35 },
      { min: 1000, max: 2000, rate: 30, deduction: 85 },
      { min: 2000, max: 3000, rate: 35, deduction: 185 },
      { min: 3000, max: null, rate: 40, deduction: 335 },
    ],
  },
  statutoryConfig: {
    ...ZIMBABWE_STATUTORY_DEFAULTS,
    standardsLevyRate: 0,
    zimdefRate: 0,
  },
};

function rule(ruleCode: string, side: "employeeRate" | "employerRate", rate: number): ConfiguredStatutoryRule {
  return {
    ruleCode,
    name: ruleCode,
    category: side === "employeeRate" ? "EMPLOYEE_DEDUCTION" : "EMPLOYER_CONTRIBUTION",
    responsibleParty: side === "employeeRate" ? "EMPLOYEE" : "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "GROSS_WAGE_BILL",
    [side]: rate,
  } as ConfiguredStatutoryRule;
}

describe("NHIF and WCIF engine hooks", () => {
  test("configured rates become a net-pay deduction and an employer cost", () => {
    const result = ZimbabwePayrollEngine.calculateEmployeeLine({
      ...BASE_INPUT,
      statutoryRules: [rule("NHIF", "employeeRate", 0.02), rule("WCIF", "employerRate", 0.01)],
    });

    expect(result.nhifAmount).toBe(40);
    expect(result.wcifAmount).toBe(20);
    expect(result.totalDeductions).toBeGreaterThanOrEqual(40);
    expect(result.statutoryBreakdown.employeeDeductions).toContainEqual({
      code: "NHIF",
      name: "NHIF",
      amount: 40,
      responsibleParty: "EMPLOYEE",
    });
    expect(result.statutoryBreakdown.employerCosts).toContainEqual({
      code: "WCIF",
      name: "WCIF",
      amount: 20,
      responsibleParty: "EMPLOYER",
    });
    expect(result.totalEmployerCost).toBe(result.grossSalary + result.nssaEmployer + result.pensionEmployer + result.necEmployer + result.apwcsAmount + 20 + result.zimdefAmount + result.standardsLevyAmount);
  });

  test("unconfigured rates produce zero and an explicit warning", () => {
    const result = ZimbabwePayrollEngine.calculateEmployeeLine(BASE_INPUT);

    expect(result.nhifAmount).toBe(0);
    expect(result.wcifAmount).toBe(0);
    const warnings = result.statutoryBreakdown.warnings.join(" ");
    expect(warnings).toContain("NHIF contribution not configured");
    expect(warnings).toContain("WCIF premium not configured");
  });
});
