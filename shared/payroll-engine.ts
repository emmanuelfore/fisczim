/**
 * Zimbabwe Payroll Calculation Engine
 * Compliant with: ZIMRA Finance Act, Income Tax Act (ITA), Labour Act Chapter 28:01,
 * NSSA Act Chapter 17:04, NEC Collective Bargaining Agreements.
 *
 * Implements:
 *  - Final Deduction System (FDS) - YTD PAYE reconciliation (Forecasting & Averaging)
 *  - Progressive PAYE brackets (USD & ZiG)
 *  - AIDS Levy (3% of PAYE)
 *  - NSSA POBS (4.5% employee + employer, capped at insurable ceiling)
 *  - NSSA APWCS (employer-only, industry-specific rate)
 *  - NEC levy (sector-specific, employee + employer)
 *  - ZIMDEF 1% + Standards Development Levy 0.5% (both employer-only)
 *  - Tax-free bonus threshold (USD 400 p.a. per Finance Act)
 *  - Tax credits (medical aid 50%, blind, elderly) with credit roll-overs
 *  - Split-currency net pay (USD / ZiG) per Finance Act Section 14(2)
 *  - Overtime: 1.5x standard, 2.0x Sunday / Public Holiday (Labour Act S.15)
 */

import { rateAsFraction, selectBracket, type TaxBracketRow } from "./statutory/brackets.js";
import { payPeriodsPerYear } from "./statutory/statutory-config.js";

export type TaxBracket = TaxBracketRow;

/** Effective statutory rule resolved from tenant configuration for a payroll period. */
export interface ConfiguredStatutoryRule {
  ruleCode: string;
  name: string;
  category: "EMPLOYEE_DEDUCTION" | "EMPLOYER_CONTRIBUTION" | "TAX_CREDIT";
  responsibleParty: "EMPLOYEE" | "EMPLOYER" | "BOTH";
  calculationType?: string;
  calculationBasis?: string;
  employeeRate?: number | null;
  employerRate?: number | null;
  ceilingAmount?: number | null;
  annualAmount?: number | null;
  requiresIndustryRate?: boolean;
  sourceReference?: string | null;
}

/** Approved employee credit claim resolved for a payroll period. */
export interface ApprovedTaxCredit {
  code: string;
  calculationType: "FIXED_ANNUAL" | "PERCENT_OF_QUALIFYING_EXPENSE";
  annualAmount?: number | null;
  rate?: number | null;
  qualifyingExpenses?: number | null;
  currency?: string;
}

export interface StatutoryBreakdown {
  employeeDeductions: Array<{ code: string; name: string; amount: number; responsibleParty: string }>;
  employerCosts: Array<{ code: string; name: string; amount: number; responsibleParty: string }>;
  taxCredits: Array<{ code: string; amount: number }>;
  warnings: string[];
}

export interface PayrollElementInput {
  type: "EARNING" | "DEDUCTION";
  categoryId?: number;
  name: string;
  calculationMethod: "FIXED" | "PERCENTAGE" | "FORMULA";
  percentageRate?: number; // e.g. 10.0 for 10%
  amount?: number; // Fixed or Override amount
  isTaxable?: boolean;
  isTaxDeductible?: boolean;
  isRecurring?: boolean;
}

export interface CalculationInput {
  baseSalary: number; // Monthly base salary in run currency
  elements: PayrollElementInput[];
  payFrequency?: "MONTHLY" | "WEEKLY" | "FORTNIGHTLY" | "DAILY";
  
  bonusAmount?: number;
  ytdBonusAmount?: number;
  
  standardOvertimeHours?: number;
  sundayPublicHolidayOvertimeHours?: number;

  pensionEmployeeRate: number;
  pensionEmployerRate: number;

  necRate: number;
  necEmployerRate: number;
  necFixedAmount: number;

  apwcsRate?: number | null;
  apwcsGrossUpEnabled?: boolean;
  employerMedicalContributions?: number;
  zimdefBasisIncludesEmployerContributions?: boolean;
  statutoryRules?: ConfiguredStatutoryRule[];
  taxCredits?: ApprovedTaxCredit[];

  annualTaxCreditAmount?: number;
  medicalAidMonthlyContribution?: number;
  medicalExpenses?: number;

  ytdTaxableIncome?: number;
  ytdPayePaid?: number;
  ytdPensionContribution?: number;
  monthNumber?: number;
  
  useFds?: boolean;
  fdsMethod?: "FORECASTING" | "AVERAGING";
  rolledOverCredits?: number;

  usdPercentage: number;
  zigPercentage: number;
  exchangeRate: number;

  taxConfig: {
    brackets: TaxBracket[];
  };

  statutoryConfig: {
    aidsLevyRate: number;
    zimdefRate: number;
    standardsLevyRate: number;
    taxFreeBonusThreshold: number;
    nssaRateEmployee: number;
    nssaRateEmployer: number;
    nssaCeilingLimit: number | null;
    medicalAidCreditMonthly: number; // This might be an upper cap if any, otherwise we just use 50%
    blindPersonCreditAnnual: number;
    elderlyPersonCreditAnnual: number;
    disabledPersonCreditAnnual?: number;
    medicalCreditRate?: number;
    maxTaxDeductiblePensionAnnual: number;
    hoursPerDay: number;
    workingDaysPerMonth: number;
    overtimeMultiplierStandard: number;
    overtimeMultiplierSunday: number;
  };
}

export interface ProcessedPayrollElement {
  type: "EARNING" | "DEDUCTION";
  categoryId?: number;
  name: string;
  amount: number;
  isTaxable?: boolean;
  isTaxDeductible?: boolean;
  isRecurring?: boolean;
}

export interface CalculationResult {
  processedEarnings: ProcessedPayrollElement[];
  processedDeductions: ProcessedPayrollElement[];

  basicSalary: number;
  grossSalary: number;
  taxableIncome: number;

  hourlyRate: number;
  standardOvertimePay: number;
  sundayOvertimePay: number;
  totalOvertimePay: number;

  taxableBonus: number;
  nonTaxableBonus: number;

  nssaEmployee: number;
  nssaEmployer: number;
  apwcsAmount: number;
  pensionEmployee: number;
  pensionEmployer: number;
  necEmployee: number;
  necEmployer: number;
  zimdefAmount: number;
  standardsLevyAmount: number;

  payeRaw: number;
  taxCreditApplied: number;
  payeAfterCredit: number;
  aidsLevy: number;
  payeFinal: number;

  fdsAdjustment: number;
  rolledOverCredits: number;

  totalAllowances: number;
  totalDeductions: number;
  netSalary: number;

  usdPercentage: number;
  zigPercentage: number;
  netSalaryUsd: number;
  netSalaryZig: number;
  payeUsd: number;
  payeZig: number;
  nssaEmployeeUsd: number;
  nssaEmployeeZig: number;

  totalEmployerCost: number;
  statutoryBreakdown: StatutoryBreakdown;
}

export class ZimbabwePayrollEngine {

  private static round2(v: number): number {
    return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  }

  private static normalizeRate(rate: number): number {
    return rateAsFraction(rate);
  }

  // PAYE uses the published table for the run's own frequency. The API only
  // loads a table whose pay_frequency matches the run, so weekly/daily bands are
  // never derived by dividing a monthly table.
  private static computePAYE(periodIncome: number, brackets: TaxBracket[]): number {
    if (!brackets?.length || periodIncome <= 0) return 0;
    const income = Number(periodIncome);
    const bracket = selectBracket(income, brackets);
    if (!bracket) return 0;
    return Math.max(0, income * rateAsFraction(bracket.rate) - Number(bracket.deduction));
  }

  // Annual PAYE for FDS is the configured period table scaled by the number of
  // periods in the year (monthly ×12, weekly ×52, and so on). This annualises the
  // income into the same published table; it does not invent another band set.
  private static computeAnnualPAYE(
    annualIncome: number,
    brackets: TaxBracket[],
    periodsPerYear: number,
  ): number {
    if (!brackets?.length || annualIncome <= 0) return 0;
    return ZimbabwePayrollEngine.computePAYE(Number(annualIncome) / periodsPerYear, brackets) * periodsPerYear;
  }

  public static calculateEmployeeLine(input: CalculationInput): CalculationResult {
    const r2 = ZimbabwePayrollEngine.round2;
    const nr = ZimbabwePayrollEngine.normalizeRate;

    const rulesByCode = new Map(
      (input.statutoryRules || []).map((rule) => [String(rule.ruleCode).toUpperCase(), rule]),
    );
    const ruleRate = (code: string, side: "employeeRate" | "employerRate", fallback: number): number => {
      const rule = rulesByCode.get(code);
      const raw = rule ? rule[side] : undefined;
      if (raw === null || raw === undefined) return fallback;
      const value = Number(raw);
      return Number.isFinite(value) ? value : fallback;
    };
    const warnings: string[] = [];

    // ── 1. Overtime ────────────────────────────────────────────────────────
    const dailyRate = input.baseSalary / input.statutoryConfig.workingDaysPerMonth;
    const hourlyRate = r2(dailyRate / input.statutoryConfig.hoursPerDay);
    
    const standardOvertimePay = r2((input.standardOvertimeHours || 0) * hourlyRate * input.statutoryConfig.overtimeMultiplierStandard);
    const sundayOvertimePay = r2((input.sundayPublicHolidayOvertimeHours || 0) * hourlyRate * input.statutoryConfig.overtimeMultiplierSunday);
    const totalOvertimePay = r2(standardOvertimePay + sundayOvertimePay);

    // ── 2. Bonus Taxability ────────────────────────────────────────────────
    const bonusThreshold = input.statutoryConfig.taxFreeBonusThreshold;
    const bonusThisMonth = Number(input.bonusAmount || 0);
    const ytdBonus = Number(input.ytdBonusAmount || 0);
    const cumulativeBonus = ytdBonus + bonusThisMonth;
    
    const prevTaxableBonus = Math.max(0, ytdBonus - bonusThreshold);
    const totalTaxableBonus = Math.max(0, cumulativeBonus - bonusThreshold);
    const taxableBonus = r2(totalTaxableBonus - prevTaxableBonus);
    const nonTaxableBonus = r2(bonusThisMonth - taxableBonus);

    // ── Dynamic Elements ───────────────────────────────────────────────────
    let taxableAllowances = 0;
    let regularTaxableAllowances = 0;
    let nontaxableAllowances = 0;
    let taxDeductibleDeductions = 0;
    let otherDeductions = 0;
    
    const processedEarnings: ProcessedPayrollElement[] = [];
    const processedDeductions: ProcessedPayrollElement[] = [];

    for (const el of input.elements || []) {
      let calcAmount = 0;
      if (el.calculationMethod === "PERCENTAGE") {
        calcAmount = r2(input.baseSalary * nr(el.percentageRate || 0));
      } else {
        calcAmount = r2(Number(el.amount || 0));
      }

      if (el.type === "EARNING") {
        if (el.isTaxable) {
          taxableAllowances += calcAmount;
          if (el.isRecurring) regularTaxableAllowances += calcAmount;
        } else {
          nontaxableAllowances += calcAmount;
        }
        processedEarnings.push({ ...el, amount: calcAmount });
      } else {
        if (el.isTaxDeductible) taxDeductibleDeductions += calcAmount;
        else otherDeductions += calcAmount;
        processedDeductions.push({ ...el, amount: calcAmount });
      }
    }

    // ── 3. Gross & Allowances ──────────────────────────────────────────────
    const totalAllowances = r2(taxableAllowances + nontaxableAllowances + totalOvertimePay + bonusThisMonth);
    const grossSalary = r2(input.baseSalary + totalAllowances);

    // ── 4. NSSA POBS ───────────────────────────────────────────────────────
    const earningsSubjectToTaxes = r2(input.baseSalary + taxableAllowances + taxableBonus + totalOvertimePay);
    const nssaEmployeeRule = rulesByCode.get("NSSA_POBS_EMPLOYEE");
    const nssaEmployerRule = rulesByCode.get("NSSA_POBS_EMPLOYER");
    const configuredCeiling =
      nssaEmployeeRule?.ceilingAmount ??
      nssaEmployerRule?.ceilingAmount ??
      input.statutoryConfig.nssaCeilingLimit;
    const ceiling = configuredCeiling === null || configuredCeiling === undefined
      ? Infinity
      : Number(configuredCeiling);
    const effectiveCeiling = Number.isFinite(ceiling) && ceiling >= 0 ? ceiling : Infinity;
    const nssaBase = Math.min(earningsSubjectToTaxes, effectiveCeiling);
    const nssaEmployee = r2(nssaBase * ruleRate("NSSA_POBS_EMPLOYEE", "employeeRate", input.statutoryConfig.nssaRateEmployee));
    const nssaEmployer = r2(nssaBase * ruleRate("NSSA_POBS_EMPLOYER", "employerRate", input.statutoryConfig.nssaRateEmployer));

    // ── 5. APWCS (employer-only, industry-specific) ───────────────────────
    // There is deliberately no fallback percentage. A missing effective premium
    // produces zero and a warning instead of inventing a statutory rate.
    const apwcsRule = rulesByCode.get("APWCS");
    const configuredApwcsRate = input.apwcsRate ?? apwcsRule?.employerRate ?? null;
    const apwcsRate = configuredApwcsRate === null || configuredApwcsRate === undefined
      ? 0
      : Number(configuredApwcsRate);
    const apwcsBase = input.apwcsGrossUpEnabled === false ? earningsSubjectToTaxes : grossSalary;
    const apwcsAmount = r2(apwcsBase * nr(apwcsRate));
    if (!Number.isFinite(apwcsRate) || apwcsRate <= 0) {
      warnings.push("APWCS premium not configured: add an NSSA industry code and effective-dated premium rate before remitting.");
    }

    // ── 6. Pension ─────────────────────────────────────────────────────────
    const pensionEmployee = r2(input.baseSalary * nr(Number(input.pensionEmployeeRate || 0)));
    const pensionEmployer = r2(input.baseSalary * nr(Number(input.pensionEmployerRate || 0)));

    // ── 7. NEC ─────────────────────────────────────────────────────────────
    const necEmployee = r2((input.baseSalary * nr(Number(input.necRate || 0))) + Number(input.necFixedAmount || 0));
    const necEmployer = r2((input.baseSalary * nr(Number(input.necEmployerRate || 0))) + Number(input.necFixedAmount || 0));

    // ── 8. ZIMDEF & Standards (employer-only) ──────────────────────────────
    const zimdefIncludeEmployer = input.zimdefBasisIncludesEmployerContributions ?? rulesByCode.has("ZIMDEF");
    const zimdefBase = zimdefIncludeEmployer
      ? r2(grossSalary + pensionEmployer + Number(input.employerMedicalContributions || 0))
      : grossSalary;
    const zimdefAmount = r2(zimdefBase * nr(ruleRate("ZIMDEF", "employerRate", input.statutoryConfig.zimdefRate)));
    const standardsLevyAmount = r2(grossSalary * nr(input.statutoryConfig.standardsLevyRate));

    // ── 9. Taxable Income ──────────────────────────────────────────────────
    const prevPension = Number(input.ytdPensionContribution || 0);
    const cumulativePension = prevPension + pensionEmployee;
    const limit = input.statutoryConfig.maxTaxDeductiblePensionAnnual;

    let taxDeductiblePension = pensionEmployee;
    if (prevPension >= limit) taxDeductiblePension = 0;
    else if (cumulativePension > limit) taxDeductiblePension = r2(limit - prevPension);
    
    const totalTaxDeductible = r2(taxDeductiblePension + taxDeductibleDeductions);
    const taxableIncome = Math.max(0, r2(earningsSubjectToTaxes - nssaEmployee - totalTaxDeductible));

    // ── 10. PAYE ───────────────────────────────────────────────────────────
    const brackets = input.taxConfig.brackets || [];
    const useFds = input.useFds ?? false;
    const fdsMethod = input.fdsMethod || "FORECASTING";
    const monthNum = Math.max(1, Math.min(12, Number(input.monthNumber || 12)));
    const ytdTaxable = Number(input.ytdTaxableIncome || 0);
    const ytdPaid = Number(input.ytdPayePaid || 0);

    let payeRaw: number;
    let fdsAdjustment = 0;
    const periodsPerYear = payPeriodsPerYear(input.payFrequency, input.statutoryConfig.workingDaysPerMonth);
    // The brackets are already the published table for this pay frequency.
    const standalonePaye = r2(ZimbabwePayrollEngine.computePAYE(taxableIncome, brackets));

    if (useFds && monthNum > 0) {
      if (fdsMethod === "FORECASTING") {
        const remainingMonths = 12 - monthNum;
        const regularTaxableIncome = r2(input.baseSalary + regularTaxableAllowances - totalTaxDeductible - nssaEmployee);
        const annualizedTaxable = r2(ytdTaxable + taxableIncome + (Math.max(0, regularTaxableIncome) * remainingMonths));
        const annualPAYE = ZimbabwePayrollEngine.computeAnnualPAYE(annualizedTaxable, brackets, periodsPerYear);
        
        const taxBalance = Math.max(0, annualPAYE - ytdPaid);
        payeRaw = r2(taxBalance / (remainingMonths + 1));
      } else { // AVERAGING
        const averageTaxable = r2((ytdTaxable + taxableIncome) / monthNum);
        const annualizedTaxable = r2(averageTaxable * 12);
        const annualPAYE = ZimbabwePayrollEngine.computeAnnualPAYE(annualizedTaxable, brackets, periodsPerYear);
        
        const cumulativeTaxToDate = r2((annualPAYE / 12) * monthNum);
        payeRaw = Math.max(0, r2(cumulativeTaxToDate - ytdPaid));
      }
      fdsAdjustment = r2(payeRaw - standalonePaye);
    } else {
      payeRaw = standalonePaye;
    }

    // ── 11. Tax Credits (approved claims only) ─────────────────────────────
    const appliedCreditItems: Array<{ code: string; amount: number }> = [];
    let periodCredits = 0;

    if (input.taxCredits && input.taxCredits.length > 0) {
      for (const credit of input.taxCredits) {
        let amount = 0;
        if (credit.calculationType === "FIXED_ANNUAL") {
          amount = r2(Number(credit.annualAmount || 0) / periodsPerYear);
        } else if (credit.calculationType === "PERCENT_OF_QUALIFYING_EXPENSE") {
          amount = r2(Number(credit.qualifyingExpenses || 0) * nr(Number(credit.rate ?? 0)));
        }
        if (amount > 0) {
          appliedCreditItems.push({ code: credit.code, amount });
          periodCredits = r2(periodCredits + amount);
        }
      }
    } else {
      // Backwards compatibility for older payroll runs that only supplied flat
      // credit inputs. New runs resolve approved employee claims instead.
      const medicalAidContrib = Number(input.medicalAidMonthlyContribution || 0);
      const medicalExp = Number(input.medicalExpenses || 0);
      const medicalCredit = r2((medicalAidContrib + medicalExp) * Number(input.statutoryConfig.medicalCreditRate ?? 0.5));
      const otherCredits = r2(Number(input.annualTaxCreditAmount || 0) / periodsPerYear);
      periodCredits = r2(medicalCredit + otherCredits);
      if (medicalCredit > 0) appliedCreditItems.push({ code: "MEDICAL_CREDIT", amount: medicalCredit });
      if (otherCredits > 0) appliedCreditItems.push({ code: "ANNUAL_TAX_CREDIT", amount: otherCredits });
    }

    const carriedOver = monthNum === 1 ? 0 : Number(input.rolledOverCredits || 0);
    const totalPeriodCredit = r2(periodCredits + carriedOver);

    const taxCreditApplied = Math.min(payeRaw, totalPeriodCredit);
    const payeAfterCredit = Math.max(0, r2(payeRaw - taxCreditApplied));
    const rolledOverCredits = monthNum === 12 ? 0 : r2(totalPeriodCredit - taxCreditApplied);

    // ── 12. AIDS Levy ──────────────────────────────────────────────────────
    const aidsLevyRate = ruleRate("AIDS_LEVY", "employeeRate", input.statutoryConfig.aidsLevyRate);
    const aidsLevy = r2(payeAfterCredit * aidsLevyRate);
    const payeFinal = r2(payeAfterCredit + aidsLevy);

    // ── 13. Net Salary ─────────────────────────────────────────────────────
    const totalDeductions = r2(payeFinal + nssaEmployee + pensionEmployee + necEmployee + otherDeductions + taxDeductibleDeductions);
    const netSalary = r2(grossSalary - totalDeductions);

    // ── 14. Split Currency ─────────────────────────────────────────────────
    const usdRatio = r2(Number(input.usdPercentage || 100) / 100);
    const zigRatio = r2(Number(input.zigPercentage || 0) / 100);
    const rate = Number(input.exchangeRate || 1);

    const ruleName = (code: string, fallback: string) => rulesByCode.get(code)?.name || fallback;
    const statutoryBreakdown: StatutoryBreakdown = {
      employeeDeductions: [
        { code: "PAYE", name: "PAYE", amount: payeAfterCredit, responsibleParty: "EMPLOYEE" },
        { code: "AIDS_LEVY", name: ruleName("AIDS_LEVY", "AIDS Levy"), amount: aidsLevy, responsibleParty: "EMPLOYEE" },
        { code: "NSSA_POBS_EMPLOYEE", name: ruleName("NSSA_POBS_EMPLOYEE", "NSSA POBS"), amount: nssaEmployee, responsibleParty: "EMPLOYEE" },
        { code: "PENSION_EMPLOYEE", name: "Pension Fund", amount: pensionEmployee, responsibleParty: "EMPLOYEE" },
        { code: "NEC_EMPLOYEE", name: "NEC", amount: necEmployee, responsibleParty: "EMPLOYEE" },
      ].filter((item) => item.amount > 0),
      employerCosts: [
        { code: "NSSA_POBS_EMPLOYER", name: ruleName("NSSA_POBS_EMPLOYER", "NSSA POBS"), amount: nssaEmployer, responsibleParty: "EMPLOYER" },
        { code: "ZIMDEF", name: ruleName("ZIMDEF", "ZIMDEF Training Levy"), amount: zimdefAmount, responsibleParty: "EMPLOYER" },
        { code: "APWCS", name: ruleName("APWCS", "NSSA APWCS Premium"), amount: apwcsAmount, responsibleParty: "EMPLOYER" },
        { code: "PENSION_EMPLOYER", name: "Pension Fund", amount: pensionEmployer, responsibleParty: "EMPLOYER" },
        { code: "NEC_EMPLOYER", name: "NEC", amount: necEmployer, responsibleParty: "EMPLOYER" },
        { code: "STANDARDS_LEVY", name: "Standards Development Levy", amount: standardsLevyAmount, responsibleParty: "EMPLOYER" },
      ].filter((item) => item.amount > 0),
      taxCredits: appliedCreditItems,
      warnings,
    };

    return {
      processedEarnings,
      processedDeductions,
      basicSalary: input.baseSalary,
      grossSalary,
      taxableIncome,

      hourlyRate,
      standardOvertimePay,
      sundayOvertimePay,
      totalOvertimePay,

      taxableBonus,
      nonTaxableBonus,

      nssaEmployee,
      nssaEmployer,
      apwcsAmount,
      pensionEmployee,
      pensionEmployer,
      necEmployee,
      necEmployer,
      zimdefAmount,
      standardsLevyAmount,

      payeRaw,
      taxCreditApplied,
      payeAfterCredit,
      aidsLevy,
      payeFinal,

      fdsAdjustment,
      rolledOverCredits,

      totalAllowances,
      totalDeductions,
      netSalary,

      usdPercentage: Number(input.usdPercentage),
      zigPercentage: Number(input.zigPercentage),
      netSalaryUsd: r2(netSalary * usdRatio),
      netSalaryZig: r2(netSalary * zigRatio * rate),
      payeUsd: r2(payeFinal * usdRatio),
      payeZig: r2(payeFinal * zigRatio * rate),
      nssaEmployeeUsd: r2(nssaEmployee * usdRatio),
      nssaEmployeeZig: r2(nssaEmployee * zigRatio * rate),

      totalEmployerCost: r2(grossSalary + nssaEmployer + pensionEmployer + necEmployer + apwcsAmount + zimdefAmount + standardsLevyAmount),
      statutoryBreakdown,
    };
  }
}
