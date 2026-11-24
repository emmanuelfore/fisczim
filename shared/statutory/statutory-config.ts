/**
 * Configurable statutory rule definitions.
 *
 * These values are seed data only. Payroll reads the tenant's effective-dated
 * rows from `payroll_statutory_rules`; nothing here is applied implicitly.
 * APWCS deliberately has no rate: it must be resolved from an effective-dated
 * NSSA industrial classification/premium schedule.
 */

export type StatutoryCategory = "EMPLOYEE_DEDUCTION" | "EMPLOYER_CONTRIBUTION" | "TAX_CREDIT";
export type StatutoryResponsibleParty = "EMPLOYEE" | "EMPLOYER" | "BOTH";
export type StatutoryCalculationType =
  | "PERCENTAGE"
  | "FIXED_ANNUAL"
  | "PERCENT_OF_QUALIFYING_EXPENSE";
export type StatutoryCeilingPeriod = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export interface StatutoryRuleSeed {
  ruleCode: string;
  name: string;
  category: StatutoryCategory;
  responsibleParty: StatutoryResponsibleParty;
  calculationType: StatutoryCalculationType;
  calculationBasis: string;
  currency: string;
  employeeRate: number | null;
  employerRate: number | null;
  annualAmount: number | null;
  ceilingAmount: number | null;
  ceilingPeriod: StatutoryCeilingPeriod | null;
  isCapped: boolean;
  requiresIndustryRate: boolean;
  effectiveFrom: string;
  statutoryAuthority: string;
  sourceReference: string;
  notes?: string;
}

export const VERIFIED_ZW_2026_STATUTORY_RULES: StatutoryRuleSeed[] = [
  {
    ruleCode: "AIDS_LEVY",
    name: "AIDS Levy",
    category: "EMPLOYEE_DEDUCTION",
    responsibleParty: "EMPLOYEE",
    calculationType: "PERCENTAGE",
    calculationBasis: "PAYE_AFTER_CREDITS",
    currency: "USD",
    employeeRate: 0.03,
    employerRate: 0,
    annualAmount: null,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "ZIMRA",
    sourceReference: "ZIMRA 2026 USD PAYE tables / PAYE guidance",
    notes: "3% of PAYE payable after approved tax credits.",
  },
  {
    ruleCode: "NSSA_POBS_EMPLOYEE",
    name: "NSSA POBS — Employee",
    category: "EMPLOYEE_DEDUCTION",
    responsibleParty: "EMPLOYEE",
    calculationType: "PERCENTAGE",
    calculationBasis: "INSURABLE_EARNINGS",
    currency: "USD",
    employeeRate: 0.045,
    employerRate: 0,
    annualAmount: null,
    ceilingAmount: 700,
    ceilingPeriod: "MONTHLY",
    isCapped: true,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "NSSA",
    sourceReference: "NSSA POBS contribution notice — USD insurable earnings ceiling",
    notes: "Applies to eligible employees below 65. Ceiling is gazetted quarterly; create a new version when it changes.",
  },
  {
    ruleCode: "NSSA_POBS_EMPLOYER",
    name: "NSSA POBS — Employer",
    category: "EMPLOYER_CONTRIBUTION",
    responsibleParty: "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "INSURABLE_EARNINGS",
    currency: "USD",
    employeeRate: 0,
    employerRate: 0.045,
    annualAmount: null,
    ceilingAmount: 700,
    ceilingPeriod: "MONTHLY",
    isCapped: true,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "NSSA",
    sourceReference: "NSSA POBS contribution notice — USD insurable earnings ceiling",
    notes: "Employer cost only; never deducted from net pay.",
  },
  {
    ruleCode: "ZIMDEF",
    name: "ZIMDEF Training Levy",
    category: "EMPLOYER_CONTRIBUTION",
    responsibleParty: "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "GROSS_WAGE_BILL",
    currency: "USD",
    employeeRate: 0,
    employerRate: 0.01,
    annualAmount: null,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "ZIMDEF",
    sourceReference: "ZIMDEF employer FAQs — 1% of gross wage bill, monthly",
    notes: "Wage bill includes basic pay, bonuses, commissions, allowances, employer pension/medical contributions, benefits in kind and directors' emoluments. Payable by the 15th of the following month.",
  },
  {
    ruleCode: "APWCS",
    name: "NSSA APWCS Premium",
    category: "EMPLOYER_CONTRIBUTION",
    responsibleParty: "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "APWCS_INSURABLE_WAGE_BILL",
    currency: "USD",
    employeeRate: 0,
    employerRate: null,
    annualAmount: null,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: true,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "NSSA",
    sourceReference: "NSSA APWCS industrial classification and gazetted premium schedule",
    notes: "No default rate. Configure the employer's NSSA industry code and effective-dated premium rate. Covers employees above 16, including those above 65; civil servants may be exempt.",
  },
  {
    ruleCode: "NHIF",
    name: "NHIF Contribution",
    category: "EMPLOYEE_DEDUCTION",
    responsibleParty: "EMPLOYEE",
    calculationType: "PERCENTAGE",
    calculationBasis: "GROSS_WAGE_BILL",
    currency: "USD",
    employeeRate: null,
    employerRate: 0,
    annualAmount: null,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: true,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "NHIF",
    sourceReference: "National Health Insurance Fund contribution schedule / applicable tier",
    notes: "No default rate. Configure the employee contribution rate or tier-equivalent percentage effective for the pay period before relying on this deduction.",
  },
  {
    ruleCode: "WCIF",
    name: "Workers' Compensation Levy",
    category: "EMPLOYER_CONTRIBUTION",
    responsibleParty: "EMPLOYER",
    calculationType: "PERCENTAGE",
    calculationBasis: "GROSS_WAGE_BILL",
    currency: "USD",
    employeeRate: 0,
    employerRate: null,
    annualAmount: null,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: true,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "Workers' Compensation Insurance Fund",
    sourceReference: "Compensation for Injuries and Diseases Act — industry class premium schedule",
    notes: "No default rate. Configure the employer's industry class and effective premium rate. Never deduct from net pay.",
  },
  {
    ruleCode: "ELDERLY_CREDIT",
    name: "Elderly Person Tax Credit",
    category: "TAX_CREDIT",
    responsibleParty: "EMPLOYEE",
    calculationType: "FIXED_ANNUAL",
    calculationBasis: "QUALIFYING_INDIVIDUAL",
    currency: "USD",
    employeeRate: null,
    employerRate: null,
    annualAmount: 900,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "ZIMRA",
    sourceReference: "ZIMRA PAYE explained — elderly persons credit",
    notes: "USD 900 per year (USD 75 monthly equivalent). Requires approved employee eligibility.",
  },
  {
    ruleCode: "BLIND_CREDIT",
    name: "Blind Person Tax Credit",
    category: "TAX_CREDIT",
    responsibleParty: "EMPLOYEE",
    calculationType: "FIXED_ANNUAL",
    calculationBasis: "QUALIFYING_INDIVIDUAL",
    currency: "USD",
    employeeRate: null,
    employerRate: null,
    annualAmount: 900,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "ZIMRA",
    sourceReference: "ZIMRA PAYE explained — blind persons credit",
    notes: "USD 900 per year (USD 75 monthly equivalent). Requires approved employee eligibility.",
  },
  {
    ruleCode: "DISABLED_CREDIT",
    name: "Disabled Person Tax Credit",
    category: "TAX_CREDIT",
    responsibleParty: "EMPLOYEE",
    calculationType: "FIXED_ANNUAL",
    calculationBasis: "QUALIFYING_INDIVIDUAL",
    currency: "USD",
    employeeRate: null,
    employerRate: null,
    annualAmount: 900,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "ZIMRA",
    sourceReference: "ZIMRA PAYE explained — mentally or physically disabled persons credit",
    notes: "USD 900 per year (USD 75 monthly equivalent). Requires approved employee eligibility.",
  },
  {
    ruleCode: "MEDICAL_CREDIT",
    name: "Medical Expenses Tax Credit",
    category: "TAX_CREDIT",
    responsibleParty: "EMPLOYEE",
    calculationType: "PERCENT_OF_QUALIFYING_EXPENSE",
    calculationBasis: "QUALIFYING_EXPENSE",
    currency: "USD",
    employeeRate: 0.5,
    employerRate: null,
    annualAmount: null,
    ceilingAmount: null,
    ceilingPeriod: null,
    isCapped: false,
    requiresIndustryRate: false,
    effectiveFrom: "2026-01-01",
    statutoryAuthority: "ZIMRA",
    sourceReference: "ZIMRA PAYE explained — medical expenses and invalid appliances",
    notes: "One credit for every USD 2 of qualifying expenditure (50%). Not a fixed USD 900 credit. Requires supporting documentation and approval.",
  },
];

export const STATUTORY_RULE_CODES_2026 = VERIFIED_ZW_2026_STATUTORY_RULES.map((rule) => rule.ruleCode);

/** Pay periods per year, used only to allocate approved annual credits. */
export function payPeriodsPerYear(frequency: string | undefined, workingDaysPerMonth = 22): number {
  switch ((frequency || "MONTHLY").toUpperCase()) {
    case "DAILY": return workingDaysPerMonth * 12;
    case "WEEKLY": return 52;
    case "FORTNIGHTLY": return 26;
    case "MONTHLY": return 12;
    case "ANNUAL": return 1;
    default: return 12;
  }
}
