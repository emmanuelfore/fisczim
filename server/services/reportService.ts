import { generatePayrollSummaryCsv, PayrollCsvRecord } from '../utils/csvHelper.js';
import { generatePayslipPdf, PayslipData } from '../utils/pdfHelper.js';
import { storage } from '../storage.js';
import { db } from '../db.js';
import {
  payrollRunEmployees, employees, payrollRuns, payrollCalculationAudits,
  payrollAllowances, payrollDeductions
} from '../../shared/schema.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { format, endOfMonth, parseISO } from 'date-fns';
import { displayCurrency, formatMoney, sumMoney } from '../../shared/currency.js';
import { taxYearTotalsByEmployee, taxTableLabels, labelForSnapshot } from '../lib/payslip-evidence.js';

function monthEndIso(monthStart: string): string {
  return format(endOfMonth(parseISO(monthStart)), 'yyyy-MM-dd');
}

/** Decimal columns arrive as strings; a null must not become NaN on a payslip. */
function num(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** Stored amounts are decimal(15,2), so subtracting in cents is exact. */
function cents(value: unknown): number {
  return Math.round(num(value) * 100);
}

function toMoneyString(valueCents: number): string {
  return (valueCents / 100).toFixed(2);
}

/** The calculation snapshot is a jsonb column or its JSON text, depending on driver. */
function parseSnapshot(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? value as Record<string, any> : null;
}

export class ReportService {
  /**
   * Generates a CSV summary for a given payroll run (or month, when runId is omitted).
   * runId is the robust path: it resolves the exact run instead of guessing by periodStart.
   */
  async generatePayrollReport(companyId: number, month: string, runId?: number): Promise<string> {
    // 1. Resolve the payroll run. Prefer the explicit runId; otherwise find the
    // run whose period overlaps the requested month.
    let run;
    if (runId) {
      [run] = await db.select()
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.id, runId),
          eq(payrollRuns.companyId, companyId)
        ));
      if (!run) throw new Error(`Payroll run ${runId} not found`);
    } else {
      const monthStart = `${month}-01`;
      const monthEnd = monthEndIso(monthStart);
      [run] = await db.select()
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.companyId, companyId),
          lte(payrollRuns.periodStart, monthEnd),
          gte(payrollRuns.periodEnd, monthStart)
        ))
        .orderBy(desc(payrollRuns.createdAt));
      if (!run) throw new Error(`No payroll run found for ${month}`);
    }

    // 2. Fetch run employees joined with employee details
    const records = await db.select({
      runEmployee: payrollRunEmployees,
      employee: employees
    })
      .from(payrollRunEmployees)
      .innerJoin(employees, eq(payrollRunEmployees.employeeId, employees.id))
      .where(eq(payrollRunEmployees.payrollRunId, run.id));

    // 3. Map to CSV records. Where the run line stores a calculation snapshot
    // we prefer it for taxable income over the old grossSalary stand-in.
    const csvData: PayrollCsvRecord[] = records.map(r => {
      let snapshot: any = null;
      if (r.runEmployee.snapshotData) {
        try {
          snapshot = typeof r.runEmployee.snapshotData === 'string'
            ? JSON.parse(r.runEmployee.snapshotData)
            : r.runEmployee.snapshotData;
        } catch (e) { /* keep null */ }
      }
      const paye = num(r.runEmployee.paye);
      const aidsLevy = num(r.runEmployee.aidsLevy);
      const nssa = num(r.runEmployee.nssaEmployee);
      const totalDeductions = num(r.runEmployee.totalDeductions);
      const grossSalary = num(r.runEmployee.grossSalary);
      return {
        employeeId: r.employee.employeeNumber || r.employee.id.toString(),
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        grossPay: grossSalary.toFixed(2),
        taxableIncome: snapshot?.taxableIncome != null
          ? num(snapshot.taxableIncome).toFixed(2)
          : grossSalary.toFixed(2),
        paye: paye.toFixed(2),
        nssa: nssa.toFixed(2),
        aidsLevy: aidsLevy.toFixed(2),
        otherDeductions: toMoneyString(cents(totalDeductions) - cents(paye) - cents(aidsLevy) - cents(nssa)),
        netPay: num(r.runEmployee.netSalary).toFixed(2)
      };
    });

    // 4. Generate CSV string
    return generatePayrollSummaryCsv(csvData);
  }

  /**
   * Generates a PDF payslip for a specific employee and run (or period, when
   * runId is omitted). runId resolves the exact run so payslips always match
   * the run the user is viewing.
   */
  async generatePayslip(companyId: number, employeeId: number, period: string, runId?: number): Promise<Uint8Array> {
    // The tenant making the request decides whose payslip can be rendered: an
    // employee id from another company's roster is a miss, not that employee.
    const [employee] = await db.select().from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)));
    if (!employee) throw new Error('Employee not found');

    // Fetch company
    const company = await storage.getCompany(companyId);
    if (!company) throw new Error('Company not found');

    // Fetch payroll run: explicit runId wins, otherwise period overlap
    let run;
    if (runId) {
      [run] = await db.select()
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.id, runId),
          eq(payrollRuns.companyId, company.id)
        ));
      if (!run) throw new Error('Payroll run not found');
    } else {
      const monthStart = `${period}-01`;
      const monthEnd = monthEndIso(monthStart);
      [run] = await db.select()
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.companyId, company.id),
          lte(payrollRuns.periodStart, monthEnd),
          gte(payrollRuns.periodEnd, monthStart)
        ))
        .orderBy(desc(payrollRuns.createdAt));
      if (!run) throw new Error(`No payroll run found for period ${period}`);
    }

    // Fetch run employee
    const [runEmployee] = await db.select()
      .from(payrollRunEmployees)
      .where(and(
        eq(payrollRunEmployees.payrollRunId, run.id),
        eq(payrollRunEmployees.employeeId, employee.id)
      ));

    if (!runEmployee) throw new Error('No payroll data found for this employee in the given period');

    // Fetch audit record if available
    const audits = await storage.listPayrollAudits(runEmployee.id);
    const auditRef = audits.length > 0 ? `AUDIT-${audits[0].id}` : 'NO-AUDIT-REF';

    // Itemised lines when the run stored them. The summary columns are the fallback,
    // because a payslip that only says "Allowances 40.00" is the document an employee
    // disputes and the one a payroll audit asks to see broken down.
    const [allowanceRows, deductionRows] = await Promise.all([
      db.select().from(payrollAllowances)
        .where(eq(payrollAllowances.payrollRunEmployeeId, runEmployee.id))
        .orderBy(payrollAllowances.id),
      db.select().from(payrollDeductions)
        .where(eq(payrollDeductions.payrollRunEmployeeId, runEmployee.id))
        .orderBy(payrollDeductions.id),
    ]);

    const basicSalary = num(runEmployee.basicSalary);
    const grossSalary = num(runEmployee.grossSalary);
    const allowanceCents = cents(grossSalary) - cents(basicSalary);

    const earnings: PayslipData['earnings'] = [{ name: 'Basic Salary', amount: basicSalary }];
    if (allowanceRows.length > 0) {
      for (const row of allowanceRows) earnings.push({ name: row.name, amount: num(row.amount) });
    } else if (allowanceCents > 0) {
      earnings.push({ name: 'Allowances', amount: allowanceCents / 100 });
    }

    const deductions: PayslipData['deductions'] = deductionRows.length > 0
      ? deductionRows.map((row) => ({ name: row.name, amount: num(row.amount) }))
      : [
        { name: 'PAYE', amount: num(runEmployee.paye) },
        { name: 'NSSA', amount: num(runEmployee.nssaEmployee) },
        { name: 'AIDS Levy', amount: num(runEmployee.aidsLevy) },
        { name: 'NEC', amount: num(runEmployee.necEmployee) },
        { name: 'Pension', amount: num(runEmployee.pensionEmployee) },
      ].filter((d) => d.amount > 0);

    // Year to date and the band table behind this month's PAYE, both sourced from the
    // shared payslip-evidence module so the printed slip can never disagree with the
    // on-screen one. It keeps the same rules: the run's tax year from its period end,
    // YTD only in the run's own currency, reversed runs excluded, and the snapshot's
    // tax table named exactly (table, version, effective date) or said out loud as
    // not recorded when the snapshot has none.
    const taxYear = Number(String(run.periodEnd).slice(0, 4));
    const snapshot = parseSnapshot(runEmployee.snapshotData);
    const [ytdTotals, taxTableLabelMap] = await Promise.all([
      taxYearTotalsByEmployee(companyId, [employee.id], { taxYear, currency: run.currency }),
      taxTableLabels(companyId, [snapshot?.taxConfigId]),
    ]);
    const totals = ytdTotals.get(employee.id);

    const employerCost = sumMoney([
      grossSalary,
      num(runEmployee.nssaEmployer),
      num(runEmployee.necEmployer),
      num(runEmployee.pensionEmployer),
    ]) - sumMoney([num(runEmployee.nssaEmployee), num(runEmployee.necEmployee), num(runEmployee.pensionEmployee)]);

    const payslipData: PayslipData = {
      companyName: company.name,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeId: employee.employeeNumber || employee.id.toString(),
      period: period,
      periodStart: String(run.periodStart).slice(0, 10),
      periodEnd: String(run.periodEnd).slice(0, 10),
      currency: displayCurrency(run.currency),
      currencyCode: run.currency,
      nationalId: employee.nationalId ?? null,
      taxNumber: employee.zimraTaxNumber ?? null,
      nssaNumber: employee.nssaNumber ?? null,
      earnings,
      deductions,
      grossPay: grossSalary,
      netPay: num(runEmployee.netSalary),
      employerCost,
      taxYear,
      ytd: {
        // The module accumulates in integer cents and returns exact money strings;
        // PayslipData prints numbers, so each total is converted once here rather
        // than re-added in floats.
        gross: Number(totals?.gross ?? '0.00'),
        paye: Number(totals?.paye ?? '0.00'),
        nssa: Number(totals?.nssa ?? '0.00'),
        aids: Number(totals?.aids ?? '0.00'),
        net: Number(totals?.net ?? '0.00'),
        runs: totals?.runs ?? 0,
      },
      taxTableLabel: labelForSnapshot(snapshot, taxTableLabelMap),
      auditRef
    };

    return await generatePayslipPdf(payslipData);
  }

  /**
   * Helper to store a snapshot of the calculation
   */
  async createAuditSnapshot(runEmployeeId: number, snapshotData: any): Promise<void> {
    await storage.createPayrollAudit({
      payrollRunEmployeeId: runEmployeeId,
      snapshotData
    });
  }
}

export const reportService = new ReportService();
