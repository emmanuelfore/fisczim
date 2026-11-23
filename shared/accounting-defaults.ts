/**
 * Single source of truth for default GL account codes.
 *
 * Server posting code and settings screens must import these values instead of
 * maintaining their own literals. A settings save that fabricates defaults can
 * otherwise silently repoint VAT/FX postings at the wrong account.
 */
export const DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS = {
  cashAccountCode: "1000",
  accountsReceivableCode: "1200",
  inventoryAccountCode: "1300",
  inventoryInTransitCode: "1310",
  accountsPayableCode: "2000",
  vatOutputAccountCode: "2200",
  vatInputAccountCode: "1420",
  salesRevenueAccountCode: "4000",
  cogsAccountCode: "5000",
  generalExpenseAccountCode: "5100",
  fxGainAccountCode: "4100",
  fxLossAccountCode: "5300",
  withholdingTaxPayableCode: "2012",
  grniAccountCode: "2000",
  landedCostClearingAccountCode: "2016",
  partnerPayableAccountCode: "2017",
  payrollExpenseAccountCode: "5004",
  wagesPayableAccountCode: "2004",
  payrollTaxPayableAccountCode: "2013",
  employerPayrollLevyAccountCode: "5020",
  statutoryContributionsPayableAccountCode: "2018",
  employeeDeductionsPayableAccountCode: "2019",
  staffLoansReceivableAccountCode: "1320",
  customerDepositsAccountCode: "2010",
  commissionPayableAccountCode: "2021",
  commissionExpenseAccountCode: "5005",
  otherIncomeAccountCode: "4900",
  busConductorCashAccountCode: "1060",
  busCashOnHandAccountCode: "1000",
  busMobileMoneyAccountCode: "1070",
  busCardClearingAccountCode: "1070",
  busRevenueAccountCode: "4110",
  busCashShortageAccountCode: "5920",
  busCashOverageAccountCode: "4920",
} as const;

export type AccountingSystemAccountKey = keyof typeof DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS;

export function mergeAccountingSystemAccounts(settings: unknown): typeof DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS {
  const raw = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS).map(([key, fallback]) => {
      const value = raw[key];
      return [key, typeof value === "string" && value.trim() ? value.trim() : fallback];
    })
  ) as typeof DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS;
}
