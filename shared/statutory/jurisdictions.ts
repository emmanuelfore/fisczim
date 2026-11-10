/**
 * Payroll jurisdictions. What a country levies, and which of those levies a
 * payroll run cannot be built without, are jurisdiction facts — they used to be
 * hardcoded in the run route as `if (!rules["AIDS_LEVY"] || !rules["NSSA_POBS"])`
 * on a Zimbabwe-only column list, which blocked any tenant outside Zimbabwe from
 * running payroll at all.
 *
 * Rates themselves still come from the tenant's own payroll_statutory_rules
 * rows: this module only says which codes that table is expected to carry.
 */

export interface PayrollJurisdiction {
  /** Matches payroll_tax_tables.country_code. */
  countryCode: string;
  name: string;
  /**
   * Currencies a payroll run in this country can be denominated in. "SPLIT" is
   * Zimbabwe's dual USD/ZiG payslip, so it appears only where that split exists.
   */
  currencies: string[];
  /** Statutory codes this country levies at all. */
  leviedRuleCodes: string[];
  /** Subset that must be configured before a run can be created. */
  requiredRuleCodes: string[];
}

/** Statutory rule codes as stored on payroll_statutory_rules.rule_code. */
export const STATUTORY_RULE_CODES = {
  aidsLevy: "AIDS_LEVY",
  nssaPobs: "NSSA_POBS",
  nec: "NEC",
  zimdef: "ZIMDEF",
  standardsLevy: "STANDARDS_LEVY",
  apwcs: "APWCS",
  pension: "PENSION",
} as const;

export const ZIMBABWE_JURISDICTION: PayrollJurisdiction = {
  countryCode: "ZW",
  name: "Zimbabwe",
  currencies: ["USD", "ZiG", "SPLIT"],
  leviedRuleCodes: [
    STATUTORY_RULE_CODES.aidsLevy,
    STATUTORY_RULE_CODES.nssaPobs,
    STATUTORY_RULE_CODES.nec,
    STATUTORY_RULE_CODES.zimdef,
    STATUTORY_RULE_CODES.standardsLevy,
    STATUTORY_RULE_CODES.apwcs,
    STATUTORY_RULE_CODES.pension,
  ],
  // AIDS levy rides on every PAYE figure and NSSA POBS is mandatory, so a run
  // without them would under-report to the revenue authority.
  requiredRuleCodes: [STATUTORY_RULE_CODES.aidsLevy, STATUTORY_RULE_CODES.nssaPobs],
};

/**
 * Lesotho payroll is not implemented: there are no published PAYE bands, no
 * Lekuka statutory rules and the NSSA/AIDS-levy codes mean nothing there. It is
 * declared so a Lesotho tenant gets a clear message naming what is missing
 * instead of a Zimbabwe rule checklist it can never satisfy — or, worse, ZW
 * rates silently applied to its payslips.
 */
export const LESOTHO_JURISDICTION: PayrollJurisdiction = {
  countryCode: "LS",
  name: "Lesotho",
  currencies: ["LSL", "USD"],
  leviedRuleCodes: [STATUTORY_RULE_CODES.pension],
  requiredRuleCodes: [],
};

export const PAYROLL_JURISDICTIONS: PayrollJurisdiction[] = [ZIMBABWE_JURISDICTION, LESOTHO_JURISDICTION];

/**
 * Accepts either the ISO code or the free-text companies.country value
 * ("Zimbabwe", "zw", "Lesotho"). Unknown countries fall back to Zimbabwe, the
 * product's default market and the schema default for companies.country.
 */
export function jurisdictionForCountry(value: unknown): PayrollJurisdiction {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["ls", "lesotho", "lsl"].includes(normalized)) return LESOTHO_JURISDICTION;
  if (["zw", "zimbabwe"].includes(normalized)) return ZIMBABWE_JURISDICTION;
  return ZIMBABWE_JURISDICTION;
}

/** True when this country charges the levy at all, configured or not. */
export function jurisdictionLevies(jurisdiction: PayrollJurisdiction, ruleCode: string): boolean {
  return jurisdiction.leviedRuleCodes.includes(ruleCode);
}

/** Currency codes are stored as typed ("ZiG" and "ZIG" both occur), so match loosely. */
export function supportsCurrency(jurisdiction: PayrollJurisdiction, currency: string): boolean {
  const normalized = String(currency || "").trim().toUpperCase();
  return jurisdiction.currencies.some((code) => code.toUpperCase() === normalized);
}

/** Rule codes the country requires that the tenant has not configured. */
export function missingRequiredRules(jurisdiction: PayrollJurisdiction, configuredCodes: string[]): string[] {
  return jurisdiction.requiredRuleCodes.filter((code) => !configuredCodes.includes(code));
}
