export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number; // e.g., 0.20 for 20%
  deduction: number; // offset constant
}

export interface CalculationInput {
  baseSalary: number; // expressed in run currency base
  taxableAllowances: number;
  nontaxableAllowances: number;
  otherDeductions: number; // loans, garnishees, etc.
  taxDeductibleDeductions?: number; // registered pension/approved deductions expressed as fixed amounts
  pensionEmployeeRate: number; // e.g., 0.05
  pensionEmployerRate: number; // e.g., 0.05
  necRate: number; // employee percentage rate e.g., 0.0100 for 1%
  necEmployerRate: number; // employer percentage rate
  necFixedAmount: number; // flat fee (if applicable)
  usdPercentage: number; // contract split ratio (e.g. 70.00)
  zigPercentage: number; // contract split ratio (e.g. 30.00)
  exchangeRate: number; // USD -> ZiG exchange rate for conversions
  taxConfig: {
    brackets: TaxBracket[];
    nssaRateEmployee: number;
    nssaRateEmployer: number;
    nssaCeilingLimit: number; // Ceiling in contract currency base
    aidsLevyRate: number;
  };
}

export interface CalculationResult {
  basicSalary: number;
  grossSalary: number;
  taxableIncome: number;
  nssaEmployee: number;
  nssaEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  necEmployee: number;
  necEmployer: number;
  payeRaw: number;
  aidsLevy: number;
  payeFinal: number;
  totalAllowances: number;
  totalDeductions: number;
  netSalary: number;
  
  // Finance Act Split Currency Outputs
  usdPercentage: number;
  zigPercentage: number;
  netSalaryUsd: number;
  netSalaryZig: number;
  payeUsd: number;
  payeZig: number;
  nssaEmployeeUsd: number;
  nssaEmployeeZig: number;
}

export class ZimbabwePayrollEngine {
  private static normalizeRate(rate: number): number {
    const numericRate = Number(rate || 0);
    return numericRate >= 1 ? numericRate / 100 : numericRate;
  }

  /**
   * Calculates a single employee's payslip line based on gross pay and configured tax rules.
   * Compiles statutory deductions (NSSA, NEC, Pension, ZIMRA progressive brackets, AIDS Levy)
   * and splits net pay/statutory balances into USD/ZiG currency envelopes per contract percentages.
   */
  public static calculateEmployeeLine(input: CalculationInput): CalculationResult {
    const basic = Number(input.baseSalary);
    const taxableAllowances = Number(input.taxableAllowances || 0);
    const nontaxableAllowances = Number(input.nontaxableAllowances || 0);
    const otherDeductions = Number(input.otherDeductions || 0);
    const taxDeductibleDeductions = Number(input.taxDeductibleDeductions || 0);
    
    const totalAllowances = Number((taxableAllowances + nontaxableAllowances).toFixed(2));
    
    // 1. Gross Salary (Blended total in base currency)
    const grossSalary = Number((basic + totalAllowances).toFixed(2));
    const earningsSubjectToTaxes = Number((basic + taxableAllowances).toFixed(2));

    // 2. NSSA Pension Calculations (Employee and Employer shares)
    const nssaBasis = Math.min(earningsSubjectToTaxes, Number(input.taxConfig.nssaCeilingLimit || 0));
    const nssaEmployee = Number((nssaBasis * ZimbabwePayrollEngine.normalizeRate(Number(input.taxConfig.nssaRateEmployee))).toFixed(2));
    const nssaEmployer = Number((nssaBasis * ZimbabwePayrollEngine.normalizeRate(Number(input.taxConfig.nssaRateEmployer))).toFixed(2));

    // 3. Pension Contributions (Company schemes)
    const pensionEmployee = Number((basic * ZimbabwePayrollEngine.normalizeRate(Number(input.pensionEmployeeRate || 0))).toFixed(2));
    const pensionEmployer = Number((basic * ZimbabwePayrollEngine.normalizeRate(Number(input.pensionEmployerRate || 0))).toFixed(2));

    // 4. NEC Deductions (Percentage-based + fixed contribution fees)
    const necEmployee = Number(((basic * ZimbabwePayrollEngine.normalizeRate(Number(input.necRate || 0))) + Number(input.necFixedAmount || 0)).toFixed(2));
    const necEmployer = Number(((basic * ZimbabwePayrollEngine.normalizeRate(Number(input.necEmployerRate || 0))) + Number(input.necFixedAmount || 0)).toFixed(2));

    // 5. Taxable Income Calculation (ZIMRA allows NSSA and registered Pension as tax-free deductions)
    const taxableIncome = Math.max(0, Number((earningsSubjectToTaxes - nssaEmployee - pensionEmployee - taxDeductibleDeductions).toFixed(2)));

    // 6. Progressive PAYE Bracket Calculation
    let payeRaw = 0;
    const brackets = input.taxConfig.brackets || [];
    
    // Evaluate matching progressive tax band
    for (const bracket of brackets) {
      const min = Number(bracket.min);
      const max = bracket.max === null ? null : Number(bracket.max);
      
      if (taxableIncome >= min && (max === null || taxableIncome <= max)) {
        payeRaw = (taxableIncome * ZimbabwePayrollEngine.normalizeRate(Number(bracket.rate))) - Number(bracket.deduction);
        break;
      }
    }
    
    payeRaw = Math.max(0, Number(payeRaw.toFixed(2)));

    // 7. AIDS Levy (3% flat of raw PAYE liability)
    const aidsLevy = Number((payeRaw * ZimbabwePayrollEngine.normalizeRate(Number(input.taxConfig.aidsLevyRate))).toFixed(2));
    const payeFinal = Number((payeRaw + aidsLevy).toFixed(2));

    // 8. Total Employee Deductions
    const totalDeductions = Number((payeFinal + nssaEmployee + necEmployee + pensionEmployee + otherDeductions).toFixed(2));

    // 9. Net Salary (Base Currency)
    const netSalary = Number((grossSalary - totalDeductions).toFixed(2));

    // 10. Split Currency Partitioning (Section 14(2) Finance Act compliance)
    // If USD% = 70% and ZiG% = 30%, we pay and remit in both currencies proportionately.
    const usdRatio = Number((Number(input.usdPercentage || 100) / 100).toFixed(4));
    const zigRatio = Number((Number(input.zigPercentage || 0) / 100).toFixed(4));
    const rate = Number(input.exchangeRate || 1.00);

    const netSalaryUsd = Number((netSalary * usdRatio).toFixed(2));
    const netSalaryZig = Number((netSalary * zigRatio * rate).toFixed(2));

    const payeUsd = Number((payeFinal * usdRatio).toFixed(2));
    const payeZig = Number((payeFinal * zigRatio * rate).toFixed(2));

    const nssaEmployeeUsd = Number((nssaEmployee * usdRatio).toFixed(2));
    const nssaEmployeeZig = Number((nssaEmployee * zigRatio * rate).toFixed(2));

    return {
      basicSalary: basic,
      grossSalary,
      taxableIncome,
      nssaEmployee,
      nssaEmployer,
      pensionEmployee,
      pensionEmployer,
      necEmployee,
      necEmployer,
      payeRaw,
      aidsLevy,
      payeFinal,
      totalAllowances,
      totalDeductions,
      netSalary,
      
      usdPercentage: Number(input.usdPercentage),
      zigPercentage: Number(input.zigPercentage),
      netSalaryUsd,
      netSalaryZig,
      payeUsd,
      payeZig,
      nssaEmployeeUsd,
      nssaEmployeeZig
    };
  }
}
