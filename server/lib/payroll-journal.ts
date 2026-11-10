/**
 * Payroll -> general ledger.
 *
 * A locked payroll run is one expense (gross pay), one extra cost centre
 * (employer statutory), and the liabilities the company now owes to the staff,
 * the revenue authority, the pension funds and any assigned creditor. Deriving
 * every line from the itemised payslip rows means the entry balances by
 * construction, and the only way it can fail is when a payslip itself does not
 * reconcile - which is reported per employee instead of being plugged.
 */

export type PayrollJournalAccountKey =
  | "payrollExpenseAccountCode"
  | "employerPayrollLevyAccountCode"
  | "wagesPayableAccountCode"
  | "payrollTaxPayableAccountCode"
  | "statutoryContributionsPayableAccountCode"
  | "employeeDeductionsPayableAccountCode"
  | "staffLoansReceivableAccountCode";

export interface PayrollJournalEmployeeLine {
  runEmployeeId: number;
  grossSalary: unknown;
  netSalary: unknown;
  nssaEmployer?: unknown;
  necEmployer?: unknown;
  pensionEmployer?: unknown;
  snapshot?: Record<string, any> | null;
}

export interface PayrollJournalDeductionRow {
  runEmployeeId: number;
  deductionType: string;
  amount: unknown;
  name?: string;
}

export interface PayrollJournalLedgerLine {
  accountKey: PayrollJournalAccountKey;
  type: "DEBIT" | "CREDIT";
  amount: number;
  memo: string;
}

/** net pay does not equal gross minus the deduction rows on this payslip. */
export interface PayrollJournalVariance {
  runEmployeeId: number;
  grossSalary: number;
  netSalary: number;
  totalDeductions: number;
  variance: number;
}

export interface PayrollJournal {
  lines: PayrollJournalLedgerLine[];
  variances: PayrollJournalVariance[];
  totals: {
    grossPay: number;
    employerStatutory: number;
    netPayPayable: number;
    taxWithheld: number;
    contributionsPayable: number;
    otherDeductionsPayable: number;
    staffLoanRelief: number;
  };
}

const TAX_DEDUCTION_TYPES = new Set(["PAYE", "AIDS_LEVY"]);
const CONTRIBUTION_DEDUCTION_TYPES = new Set(["NSSA", "NEC", "PENSION"]);
const LOAN_DEDUCTION_TYPES = new Set(["LOAN_REPAYMENT"]);

/** Every account the journal can touch, in the order the ledger lines are built. */
export const PAYROLL_JOURNAL_ACCOUNT_KEYS: PayrollJournalAccountKey[] = [
  "payrollExpenseAccountCode",
  "employerPayrollLevyAccountCode",
  "wagesPayableAccountCode",
  "payrollTaxPayableAccountCode",
  "statutoryContributionsPayableAccountCode",
  "employeeDeductionsPayableAccountCode",
  "staffLoansReceivableAccountCode",
];

/** Amounts are decimal(15,2), so cents are exact and float sums cannot drift. */
function cents(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function fromCents(value: number): number {
  return value / 100;
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return 0;
}

/**
 * The employer-side statutory cost of a payslip. Older rows only carry the
 * columns that were written at creation time, so the calculation snapshot is
 * trusted first and the columns are the fallback.
 */
function employerCostCents(line: PayrollJournalEmployeeLine): number {
  const snapshot = line.snapshot || {};
  return (
    cents(firstDefined(snapshot.nssaEmployer, line.nssaEmployer)) +
    cents(firstDefined(snapshot.necEmployer, line.necEmployer)) +
    cents(firstDefined(snapshot.pensionEmployer, line.pensionEmployer)) +
    cents(snapshot.zimdefAmount) +
    cents(snapshot.standardsLevyAmount) +
    cents(snapshot.apwcsAmount)
  );
}

function push(target: Map<PayrollJournalAccountKey, number>, key: PayrollJournalAccountKey, amountCents: number) {
  target.set(key, (target.get(key) || 0) + amountCents);
}

export function buildPayrollJournal(input: {
  lines: PayrollJournalEmployeeLine[];
  deductions: PayrollJournalDeductionRow[];
}): PayrollJournal {
  const bucketsByRunLine = new Map<number, {
    tax: number;
    contributions: number;
    loans: number;
    other: number;
    total: number;
  }>();

  for (const line of input.lines) {
    bucketsByRunLine.set(line.runEmployeeId, { tax: 0, contributions: 0, loans: 0, other: 0, total: 0 });
  }

  for (const deduction of input.deductions) {
    const bucket = bucketsByRunLine.get(deduction.runEmployeeId);
    if (!bucket) continue; // a stray row from an employee no longer on the run
    const amount = cents(deduction.amount);
    if (amount <= 0) continue;
    bucket.total += amount;
    if (TAX_DEDUCTION_TYPES.has(deduction.deductionType)) bucket.tax += amount;
    else if (CONTRIBUTION_DEDUCTION_TYPES.has(deduction.deductionType)) bucket.contributions += amount;
    else if (LOAN_DEDUCTION_TYPES.has(deduction.deductionType)) bucket.loans += amount;
    else bucket.other += amount;
  }

  const totals = {
    grossPayCents: 0,
    employerStatutoryCents: 0,
    netPayCents: 0,
    taxCents: 0,
    contributionCents: 0,
    otherCents: 0,
    loanCents: 0,
  };

  const variances: PayrollJournalVariance[] = [];

  for (const line of input.lines) {
    const bucket = bucketsByRunLine.get(line.runEmployeeId)!;
    const gross = cents(line.grossSalary);
    const net = cents(line.netSalary);

    // The engine's own invariant, restated against what was actually stored:
    // net pay is gross minus the deduction rows on this payslip. When it is not,
    // the payslip is wrong and no journal can be derived from it.
    if (gross - net !== bucket.total) {
      variances.push({
        runEmployeeId: line.runEmployeeId,
        grossSalary: fromCents(gross),
        netSalary: fromCents(net),
        totalDeductions: fromCents(bucket.total),
        variance: fromCents(gross - net - bucket.total),
      });
      continue;
    }

    totals.grossPayCents += gross;
    totals.netPayCents += net;
    totals.taxCents += bucket.tax;
    totals.contributionCents += bucket.contributions;
    totals.otherCents += bucket.other;
    totals.loanCents += bucket.loans;
    totals.employerStatutoryCents += employerCostCents(line);
  }

  const amounts = new Map<PayrollJournalAccountKey, number>();
  push(amounts, "payrollExpenseAccountCode", totals.grossPayCents);
  push(amounts, "employerPayrollLevyAccountCode", totals.employerStatutoryCents);
  push(amounts, "wagesPayableAccountCode", totals.netPayCents);
  push(amounts, "payrollTaxPayableAccountCode", totals.taxCents);
  push(amounts, "statutoryContributionsPayableAccountCode", totals.contributionCents + totals.employerStatutoryCents);
  push(amounts, "employeeDeductionsPayableAccountCode", totals.otherCents);
  push(amounts, "staffLoansReceivableAccountCode", totals.loanCents);

  const debit = (key: PayrollJournalAccountKey, memo: string) => ({ key, type: "DEBIT" as const, memo });
  const credit = (key: PayrollJournalAccountKey, memo: string) => ({ key, type: "CREDIT" as const, memo });

  const blueprint = [
    debit("payrollExpenseAccountCode", "Gross pay for the period"),
    debit("employerPayrollLevyAccountCode", "Employer statutory contributions and levies"),
    credit("wagesPayableAccountCode", "Net pay owed to staff"),
    credit("payrollTaxPayableAccountCode", "PAYE and AIDS levy withheld"),
    credit("statutoryContributionsPayableAccountCode", "Employee and employer statutory contributions"),
    credit("employeeDeductionsPayableAccountCode", "Other deductions owed to assigned creditors"),
    credit("staffLoansReceivableAccountCode", "Staff loan capital repaid through payroll"),
  ];

  const lines: PayrollJournalLedgerLine[] = blueprint
    .map((entry) => ({
      accountKey: entry.key,
      type: entry.type,
      amount: fromCents(amounts.get(entry.key) || 0),
      memo: entry.memo,
    }))
    .filter((entry) => entry.amount > 0);

  return {
    lines,
    variances,
    totals: {
      grossPay: fromCents(totals.grossPayCents),
      employerStatutory: fromCents(totals.employerStatutoryCents),
      netPayPayable: fromCents(totals.netPayCents),
      taxWithheld: fromCents(totals.taxCents),
      contributionsPayable: fromCents(totals.contributionCents + totals.employerStatutoryCents),
      otherDeductionsPayable: fromCents(totals.otherCents),
      staffLoanRelief: fromCents(totals.loanCents),
    },
  };
}

/**
 * A reversal is the same entry with the sides swapped, so the original posting
 * and its reversal cancel exactly even if the chart of accounts moved in
 * between.
 */
export function reversePayrollJournal(journal: PayrollJournal): PayrollJournalLedgerLine[] {
  return journal.lines.map((line) => ({
    ...line,
    type: line.type === "DEBIT" ? "CREDIT" : "DEBIT",
    memo: `Reversal: ${line.memo}`,
  }));
}
