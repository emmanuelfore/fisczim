import { ZimbabwePayrollEngine, CalculationInput } from "./shared/payroll-engine.ts";

const input: CalculationInput = {
  baseSalary: 2000,
  elements: [],
  medicalExpenses: 2500, // 50% = 1250 credit
  monthNumber: 5,
  useFds: true,
  fdsMethod: "FORECASTING",
  rolledOverCredits: 0,
  ytdTaxableIncome: 8000,
  ytdPayePaid: 1000,
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
      { min: 0, max: 100000, rate: 20, deduction: 0 }
    ]
  },
  statutoryConfig: {
    aidsLevyRate: 0.03,
    zimdefRate: 0.01,
    standardsLevyRate: 0.005,
    taxFreeBonusThreshold: 400,
    nssaRateEmployee: 0,
    nssaRateEmployer: 0,
    nssaCeilingLimit: 700,
    medicalAidCreditMonthly: 99999,
    blindPersonCreditAnnual: 0,
    elderlyPersonCreditAnnual: 0,
    maxTaxDeductiblePensionAnnual: 54000,
    hoursPerDay: 8,
    workingDaysPerMonth: 22,
    overtimeMultiplierStandard: 1.5,
    overtimeMultiplierSunday: 2.0
  }
};

const result = ZimbabwePayrollEngine.calculateEmployeeLine(input);
console.log("PAYE Raw:", result.payeRaw);
console.log("Tax Credit Applied:", result.taxCreditApplied);
console.log("PAYE After Credit:", result.payeAfterCredit);
console.log("Rolled Over Credits:", result.rolledOverCredits);

if (result.rolledOverCredits > 0 && result.payeAfterCredit === 0) {
  console.log("TEST PASSED: Credits rolled over and PAYE is zero");
} else {
  console.log("TEST FAILED");
}
