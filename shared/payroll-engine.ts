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

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number; // e.g., 0.20 for 20%
  deduction: number; // offset constant
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

  apwcsRate?: number;

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
    nssaCeilingLimit: number;
    medicalAidCreditMonthly: number; // This might be an upper cap if any, otherwise we just use 50%
    blindPersonCreditAnnual: number;
    elderlyPersonCreditAnnual: number;
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
}

export const ZIMBABWE_DEFAULTS = {
  aidsLevyRate: 0.03,
  zimdefRate: 0.01,
  standardsLevyRate: 0.005,
  taxFreeBonusThreshold: 400.00,
  nssaRateEmployee: 0.045,
  nssaRateEmployer: 0.045,
};

export class ZimbabwePayrollEngine {

  private static round2(v: number): number {
    return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  }

  private static normalizeRate(rate: number): number {
    const r = Number(rate || 0);
    return r >= 1 ? r / 100 : r;
  }

  // ZIMRA publishes monthly tax tables (min/max/rate/deduction constants).
  // For non-monthly frequencies we normalize the period income to a monthly
  // equivalent, apply the monthly table, then scale back to the period.
  private static periodsPerMonth(freq: string, workingDaysPerMonth: number): number {
    switch ((freq || "MONTHLY").toUpperCase()) {
      case "WEEKLY": return 52 / 12;
      case "FORTNIGHTLY": return 26 / 12;
      case "DAILY": return workingDaysPerMonth;
      default: return 1;
    }
  }

  // Monthly PAYE: direct bracket walk against monthly constants.
  // (The previous implementation annualized income ×12 but matched it against
  // MONTHLY deduction constants, overtaxing every band — e.g. $3,000/mo became
  // $1,163.75 instead of $865.00.)
  private static computeMonthlyPAYE(monthlyIncome: number, brackets: TaxBracket[]): number {
    if (!brackets?.length || monthlyIncome <= 0) return 0;
    const income = Number(monthlyIncome);
    for (const bracket of brackets) {
      const min = Number(bracket.min);
      const max = bracket.max === null ? Infinity : Number(bracket.max);
      if (income >= min && income <= max) {
        return Math.max(0, income * ZimbabwePayrollEngine.normalizeRate(Number(bracket.rate)) - Number(bracket.deduction));
      }
    }
    return 0;
  }

  // Annual PAYE derived from the monthly table (ZIMRA annual = monthly constant ×12).
  private static computeAnnualPAYE(annualIncome: number, brackets: TaxBracket[]): number {
    if (!brackets?.length || annualIncome <= 0) return 0;
    return ZimbabwePayrollEngine.computeMonthlyPAYE(Number(annualIncome) / 12, brackets) * 12;
  }

  public static calculateEmployeeLine(input: CalculationInput): CalculationResult {
    const r2 = ZimbabwePayrollEngine.round2;
    const nr = ZimbabwePayrollEngine.normalizeRate;

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
    const nssaBase = Math.min(earningsSubjectToTaxes, input.statutoryConfig.nssaCeilingLimit);
    const nssaEmployee = r2(nssaBase * input.statutoryConfig.nssaRateEmployee);
    const nssaEmployer = r2(nssaBase * input.statutoryConfig.nssaRateEmployer);

    // ── 5. APWCS ───────────────────────────────────────────────────────────
    const apwcsRate = Number(input.apwcsRate ?? (input.statutoryConfig.zimdefRate / 2));
    const apwcsAmount = r2(grossSalary * nr(apwcsRate));

    // ── 6. Pension ─────────────────────────────────────────────────────────
    const pensionEmployee = r2(input.baseSalary * nr(Number(input.pensionEmployeeRate || 0)));
    const pensionEmployer = r2(input.baseSalary * nr(Number(input.pensionEmployerRate || 0)));

    // ── 7. NEC ─────────────────────────────────────────────────────────────
    const necEmployee = r2((input.baseSalary * nr(Number(input.necRate || 0))) + Number(input.necFixedAmount || 0));
    const necEmployer = r2((input.baseSalary * nr(Number(input.necEmployerRate || 0))) + Number(input.necFixedAmount || 0));

    // ── 8. ZIMDEF & Standards ──────────────────────────────────────────────
    const zimdefAmount = r2(grossSalary * nr(input.statutoryConfig.zimdefRate));
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
    const periodsPerMonth = ZimbabwePayrollEngine.periodsPerMonth(input.payFrequency || "MONTHLY", input.statutoryConfig.workingDaysPerMonth);
    // Normalize the period income to a monthly equivalent, tax it on the
    // monthly table, then scale back to the period being paid.
    const standalonePaye = r2(ZimbabwePayrollEngine.computeMonthlyPAYE(taxableIncome / periodsPerMonth, brackets) * periodsPerMonth);

    if (useFds && monthNum > 0) {
      if (fdsMethod === "FORECASTING") {
        const remainingMonths = 12 - monthNum;
        const regularTaxableIncome = r2(input.baseSalary + regularTaxableAllowances - totalTaxDeductible - nssaEmployee);
        const annualizedTaxable = r2(ytdTaxable + taxableIncome + (Math.max(0, regularTaxableIncome) * remainingMonths));
        const annualPAYE = ZimbabwePayrollEngine.computeAnnualPAYE(annualizedTaxable, brackets);
        
        const taxBalance = Math.max(0, annualPAYE - ytdPaid);
        payeRaw = r2(taxBalance / (remainingMonths + 1));
      } else { // AVERAGING
        const averageTaxable = r2((ytdTaxable + taxableIncome) / monthNum);
        const annualizedTaxable = r2(averageTaxable * 12);
        const annualPAYE = ZimbabwePayrollEngine.computeAnnualPAYE(annualizedTaxable, brackets);
        
        const cumulativeTaxToDate = r2((annualPAYE / 12) * monthNum);
        payeRaw = Math.max(0, r2(cumulativeTaxToDate - ytdPaid));
      }
      fdsAdjustment = r2(payeRaw - standalonePaye);
    } else {
      payeRaw = standalonePaye;
    }

    // ── 11. Tax Credits ────────────────────────────────────────────────────
    const medicalAidContrib = Number(input.medicalAidMonthlyContribution || 0);
    const medicalExp = Number(input.medicalExpenses || 0);
    const medicalCredit = r2((medicalAidContrib + medicalExp) * 0.5); // 50% for medical

    const monthlyOtherCredits = r2(Number(input.annualTaxCreditAmount || 0) / 12);
    const carriedOver = monthNum === 1 ? 0 : Number(input.rolledOverCredits || 0);
    const totalMonthlyCredit = r2(medicalCredit + monthlyOtherCredits + carriedOver);
    
    const taxCreditApplied = Math.min(payeRaw, totalMonthlyCredit);
    const payeAfterCredit = Math.max(0, r2(payeRaw - taxCreditApplied));
    const rolledOverCredits = monthNum === 12 ? 0 : r2(totalMonthlyCredit - taxCreditApplied);

    // ── 12. AIDS Levy ──────────────────────────────────────────────────────
    const aidsLevy = r2(payeAfterCredit * input.statutoryConfig.aidsLevyRate);
    const payeFinal = r2(payeAfterCredit + aidsLevy);

    // ── 13. Net Salary ─────────────────────────────────────────────────────
    const totalDeductions = r2(payeFinal + nssaEmployee + pensionEmployee + necEmployee + otherDeductions + taxDeductibleDeductions);
    const netSalary = r2(grossSalary - totalDeductions);

    // ── 14. Split Currency ─────────────────────────────────────────────────
    const usdRatio = r2(Number(input.usdPercentage || 100) / 100);
    const zigRatio = r2(Number(input.zigPercentage || 0) / 100);
    const rate = Number(input.exchangeRate || 1);

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
    };
  }
}
