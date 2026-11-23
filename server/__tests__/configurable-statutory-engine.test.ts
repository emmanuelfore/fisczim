import { describe, expect, test } from "vitest";
import {
  ZimbabwePayrollEngine,
  type ApprovedTaxCredit,
  type ConfiguredStatutoryRule,
} from "../../shared/payroll-engine";
import { validateBrackets } from "../../shared/statutory/brackets";
import {
  STATUTORY_RULE_CODES_2026,
  VERIFIED_ZW_2026_STATUTORY_RULES,
  ZIMBABWE_STATUTORY_DEFAULTS,
  ZIMRA_USD_PAYE_2026,
} from "../../shared/statutory/zimbabwe";

const PAYE_BRACKETS = [
  { min: 0, max: 100, rate: 0, deduction: 0 },
  { min: 100, max: 300, rate: 20, deduction: 20 },
  { min: 300, max: 1000, rate: 25, deduction: 35 },
  { min: 1000, max: 2000, rate: 30, deduction: 85 },
  { min: 2000, max: 3000, rate: 35, deduction: 185 },
  { min: 3000, max: null, rate: 40, deduction: 335 },
];

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
  taxConfig: { brackets: PAYE_BRACKETS },
  statutoryConfig: {
    ...ZIMBABWE_STATUTORY_DEFAULTS,
    // Deliberately different from the configured rule ceiling so the test can
    // prove the tenant rule, not the legacy fallback, is applied.
    nssaCeilingLimit: 1000,
    standardsLevyRate: 0,
    zimdefRate: 0,
  },
};

const CONFIGURED_RULES: ConfiguredStatutoryRule[] = [
  {
    ruleCode: "AIDS_LEVY",
    name: "AIDS Levy",
    category: "EMPLOYEE_DEDUCTION",
    responsibleParty: "EMPLOYEE",
    calculationType: "PERCENTAGE",
    calculationBasis: "PAYE_AFTER_CREDITS",
    employeeRate: 0.03,
    employerRate: 0,
  },
  {
    ruleCode: "NSSA_POBS_EMPLOYEE",
    name: "NSSA POBS — Employee",
    category: "EMPLOYEE_DEDUCTION",
    responsibleParty: "EMPLOYEE",
    calculationType: "PERCENTAGE",
    calculationBasis: "INSURABLE_EARNINGS",
    employeeRate: 0.045,
    employerRate: 0,
    ceilingAmount: 700,
  },
  {
    ruleCode: "NSSA_POBS_EMPLOYER",
    name: "NSSA POBS — Employer",
    category: "EMPLOYER_CONTRIBUTION",
    responsibleParty: "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "INSURABLE_EARNINGS",
    employeeRate: 0,
    employerRate: 0.045,
    ceilingAmount: 700,
  },
  {
    ruleCode: "ZIMDEF",
    name: "ZIMDEF Training Levy",
    category: "EMPLOYER_CONTRIBUTION",
    responsibleParty: "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "GROSS_WAGE_BILL",
    employeeRate: 0,
    employerRate: 0.01,
  },
  {
    ruleCode: "APWCS",
    name: "NSSA APWCS Premium",
    category: "EMPLOYER_CONTRIBUTION",
    responsibleParty: "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "APWCS_INSURABLE_WAGE_BILL",
    employeeRate: 0,
    employerRate: null,
    requiresIndustryRate: true,
  },
];

describe("configured statutory engine", () => {
  test("keeps employer contributions out of employee deductions", () => {
    const result = ZimbabwePayrollEngine.calculateEmployeeLine({
      ...BASE_INPUT,
      statutoryRules: CONFIGURED_RULES,
    });

    // USD 700 monthly ceiling caps each side at 31.50.
    expect(result.nssaEmployee).toBe(31.5);
    expect(result.nssaEmployer).toBe(31.5);
    // ZIMDEF is 1% of the gross wage bill and is employer-only.
    expect(result.zimdefAmount).toBe(20);
    expect(result.apwcsAmount).toBe(0);
    expect(result.statutoryBreakdown.warnings.join(" ")).toMatch(/APWCS premium not configured/);

    const employerCodes = result.statutoryBreakdown.employerCosts.map((item) => item.code);
    const employeeCodes = result.statutoryBreakdown.employeeDeductions.map((item) => item.code);
    expect(employerCodes).toEqual(expect.arrayContaining(["NSSA_POBS_EMPLOYER", "ZIMDEF"]));
    expect(employeeCodes).not.toContain("ZIMDEF");
    expect(employeeCodes).not.toContain("NSSA_POBS_EMPLOYER");

    // Salary 2,000 + 31.50 NSSA employer + 20 ZIMDEF; no APWCS without a rate.
    expect(result.totalEmployerCost).toBeCloseTo(2051.5, 2);
    // Employer cost never reduces the employee's net pay.
    expect(result.netSalary).toBeCloseTo(2000 - result.payeFinal - result.nssaEmployee, 2);
  });

  test("applies approved credits before AIDS levy and never drives PAYE below zero", () => {
    const base = {
      ...BASE_INPUT,
      baseSalary: 1000,
      statutoryConfig: { ...BASE_INPUT.statutoryConfig, nssaCeilingLimit: 700 },
    };
    const credit: ApprovedTaxCredit = {
      code: "ELDERLY_CREDIT",
      calculationType: "FIXED_ANNUAL",
      annualAmount: 900,
      currency: "USD",
    };

    const result = ZimbabwePayrollEngine.calculateEmployeeLine({ ...base, taxCredits: [credit] });
    // Taxable 968.50 → $207.13 PAYE; $900/year is $75/month.
    expect(result.payeRaw).toBe(207.13);
    expect(result.taxCreditApplied).toBe(75);
    expect(result.payeAfterCredit).toBe(132.13);
    // AIDS levy is 3% of PAYE after credits, not of the raw PAYE.
    expect(result.aidsLevy).toBe(3.96);
    expect(result.payeFinal).toBe(136.09);

    const excess: ApprovedTaxCredit = { ...credit, annualAmount: 100000 };
    const floored = ZimbabwePayrollEngine.calculateEmployeeLine({ ...base, taxCredits: [excess] });
    expect(floored.payeAfterCredit).toBe(0);
    expect(floored.aidsLevy).toBe(0);
    expect(floored.payeFinal).toBe(0);
  });

  test("prices APWCS only from a supplied industry premium", () => {
    const unpriced = ZimbabwePayrollEngine.calculateEmployeeLine({
      ...BASE_INPUT,
      statutoryRules: CONFIGURED_RULES,
    });
    expect(unpriced.apwcsAmount).toBe(0);
    expect(unpriced.statutoryBreakdown.warnings.join(" ")).toMatch(/APWCS premium not configured/);

    const priced = ZimbabwePayrollEngine.calculateEmployeeLine({
      ...BASE_INPUT,
      statutoryRules: CONFIGURED_RULES,
      apwcsRate: 0.0138,
    });
    expect(priced.apwcsAmount).toBe(27.6);
    expect(priced.statutoryBreakdown.warnings.join(" ")).not.toMatch(/APWCS premium not configured/);
  });

  test("seed values stay configurable and never invent an APWCS rate", () => {
    const byCode = Object.fromEntries(
      VERIFIED_ZW_2026_STATUTORY_RULES.map((rule) => [rule.ruleCode, rule]),
    );

    expect(validateBrackets(ZIMRA_USD_PAYE_2026.brackets)).toEqual([]);
    expect(byCode.AIDS_LEVY.employeeRate).toBe(0.03);
    expect(byCode.NSSA_POBS_EMPLOYEE.employeeRate).toBe(0.045);
    expect(byCode.NSSA_POBS_EMPLOYEE.ceilingAmount).toBe(700);
    expect(byCode.NSSA_POBS_EMPLOYER.employerRate).toBe(0.045);
    expect(byCode.NSSA_POBS_EMPLOYER.ceilingAmount).toBe(700);
    expect(byCode.ZIMDEF.employerRate).toBe(0.01);
    expect(byCode.APWCS.employerRate).toBeNull();
    expect(byCode.APWCS.requiresIndustryRate).toBe(true);
    expect(byCode.MEDICAL_CREDIT.employeeRate).toBe(0.5);
    expect(STATUTORY_RULE_CODES_2026).not.toContain("NSSA_POBS");

    for (const code of ["ELDERLY_CREDIT", "BLIND_CREDIT", "DISABLED_CREDIT"]) {
      expect(byCode[code].annualAmount).toBe(900);
    }
  });
});
