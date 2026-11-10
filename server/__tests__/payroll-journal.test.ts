import { describe, expect, test } from "vitest";
import {
  buildPayrollJournal,
  reversePayrollJournal,
  type PayrollJournalDeductionRow,
  type PayrollJournalEmployeeLine,
} from "../lib/payroll-journal";

// A $1,000 ZiG/USD payslip after the Finance Act bands: PAYE is shown as the
// credit-relieved amount, which is what the employee is actually deducted.
const LINE: PayrollJournalEmployeeLine = {
  runEmployeeId: 1,
  grossSalary: "1000.00",
  netSalary: "560.75",
  nssaEmployer: "31.50",
  necEmployer: "1.50",
  pensionEmployer: undefined,
  snapshot: { pensionEmployer: 50, zimdefAmount: 10, standardsLevyAmount: 5, apwcsAmount: 5 },
};

const DEDUCTIONS: PayrollJournalDeductionRow[] = [
  { runEmployeeId: 1, deductionType: "PAYE", amount: "215.00", name: "PAYE" },
  { runEmployeeId: 1, deductionType: "AIDS_LEVY", amount: "10.75", name: "AIDS Levy" },
  { runEmployeeId: 1, deductionType: "NSSA", amount: "31.50", name: "NSSA Employee" },
  { runEmployeeId: 1, deductionType: "NEC", amount: "12.00", name: "NEC Employee" },
  { runEmployeeId: 1, deductionType: "PENSION", amount: "50.00", name: "Pension Employee" },
  { runEmployeeId: 1, deductionType: "LOAN_REPAYMENT", amount: "100.00", name: "Loan repayment" },
  { runEmployeeId: 1, deductionType: "OTHER", amount: "20.00", name: "Savings" },
];

function amountFor(journal: ReturnType<typeof buildPayrollJournal>, accountKey: string) {
  return journal.lines.find((line) => line.accountKey === accountKey)?.amount ?? 0;
}

describe("buildPayrollJournal", () => {
  test("posts one balanced entry with every statutory component", () => {
    const journal = buildPayrollJournal({ lines: [LINE], deductions: DEDUCTIONS });

    expect(journal.variances).toEqual([]);
    expect(amountFor(journal, "payrollExpenseAccountCode")).toBe(1000);
    expect(amountFor(journal, "employerPayrollLevyAccountCode")).toBe(103);
    expect(amountFor(journal, "wagesPayableAccountCode")).toBe(560.75);
    expect(amountFor(journal, "payrollTaxPayableAccountCode")).toBe(225.75);
    expect(amountFor(journal, "statutoryContributionsPayableAccountCode")).toBe(196.5);
    expect(amountFor(journal, "employeeDeductionsPayableAccountCode")).toBe(20);
    expect(amountFor(journal, "staffLoansReceivableAccountCode")).toBe(100);

    const debits = journal.lines.filter((line) => line.type === "DEBIT").reduce((sum, line) => sum + line.amount, 0);
    const credits = journal.lines.filter((line) => line.type === "CREDIT").reduce((sum, line) => sum + line.amount, 0);
    expect(debits).toBeCloseTo(credits, 2);
    expect(Math.abs(debits - credits)).toBeLessThan(0.005);
  });

  test("refuses a payslip whose net pay is not gross minus its deductions", () => {
    const tampered = { ...LINE, netSalary: "600.00" };
    const journal = buildPayrollJournal({ lines: [tampered], deductions: DEDUCTIONS });

    expect(journal.variances).toHaveLength(1);
    expect(journal.variances[0]).toMatchObject({ runEmployeeId: 1, variance: -39.25 });
    // Nothing from the bad line reaches the totals, so the entry cannot balance
    // and the lock fails closed instead of plugging the difference.
    expect(amountFor(journal, "payrollExpenseAccountCode")).toBe(0);
  });

  test("omits buckets nobody owes", () => {
    const journal = buildPayrollJournal({
      lines: [{ runEmployeeId: 2, grossSalary: "200.00", netSalary: "180.00" }],
      deductions: [
        { runEmployeeId: 2, deductionType: "PAYE", amount: "20.00", name: "PAYE" },
        { runEmployeeId: 2, deductionType: "AIDS_LEVY", amount: "0.00", name: "AIDS Levy" },
      ],
    });

    expect(journal.lines.map((line) => line.accountKey)).toEqual([
      "payrollExpenseAccountCode",
      "wagesPayableAccountCode",
      "payrollTaxPayableAccountCode",
    ]);
  });

  test("adds every payslip in cents so a large run cannot drift", () => {
    const lines = Array.from({ length: 300 }, (_, index) => ({
      runEmployeeId: index + 1,
      grossSalary: "0.10",
      netSalary: "0.00",
    }));
    const deductions = lines.map((line) => ({
      runEmployeeId: line.runEmployeeId,
      deductionType: "PAYE",
      amount: "0.10",
    }));

    const journal = buildPayrollJournal({ lines, deductions });
    expect(amountFor(journal, "payrollExpenseAccountCode")).toBe(30);
    expect(amountFor(journal, "payrollTaxPayableAccountCode")).toBe(30);
  });

  test("a reversal is the same entry with the sides swapped", () => {
    const journal = buildPayrollJournal({ lines: [LINE], deductions: DEDUCTIONS });
    const reversed = reversePayrollJournal(journal);

    expect(reversed).toHaveLength(journal.lines.length);
    reversed.forEach((line, index) => {
      expect(line.type).not.toBe(journal.lines[index].type);
      expect(line.amount).toBe(journal.lines[index].amount);
    });
    const debits = reversed.filter((line) => line.type === "DEBIT").reduce((sum, line) => sum + line.amount, 0);
    const credits = reversed.filter((line) => line.type === "CREDIT").reduce((sum, line) => sum + line.amount, 0);
    expect(Math.abs(debits - credits)).toBeLessThan(0.005);
  });
});
