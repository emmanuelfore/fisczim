import { generatePayrollSummaryCsv, PayrollCsvRecord } from '../utils/csvHelper.js';
import { generatePayslipPdf, PayslipData } from '../utils/pdfHelper.js';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { payrollRunEmployees, employees, payrollRuns, payrollCalculationAudits } from '../../shared/schema.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { format } from 'date-fns';

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
      const monthEnd = `${month}-31`;
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
      const paye = Number(r.runEmployee.paye);
      const aidsLevy = Number(r.runEmployee.aidsLevy);
      const nssa = Number(r.runEmployee.nssaEmployee);
      const totalDeductions = Number(r.runEmployee.totalDeductions);
      return {
        employeeId: r.employee.employeeNumber || r.employee.id.toString(),
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        grossPay: Number(r.runEmployee.grossSalary).toFixed(2),
        taxableIncome: snapshot?.taxableIncome != null
          ? Number(snapshot.taxableIncome).toFixed(2)
          : Number(r.runEmployee.grossSalary).toFixed(2),
        paye: paye.toFixed(2),
        nssa: nssa.toFixed(2),
        aidsLevy: aidsLevy.toFixed(2),
        otherDeductions: (totalDeductions - paye - aidsLevy - nssa).toFixed(2),
        netPay: Number(r.runEmployee.netSalary).toFixed(2)
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
  async generatePayslip(employeeId: number, period: string, runId?: number): Promise<Uint8Array> {
    // Fetch employee
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) throw new Error('Employee not found');

    // Fetch company
    const company = await storage.getCompany(employee.companyId);
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
      const monthEnd = `${period}-31`;
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

    // In a real scenario, earnings and deductions would be queried from payrollAllowances / payrollDeductions
    // For this implementation, we use the summary fields on the runEmployee record
    const payslipData: PayslipData = {
      companyName: company.name,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeId: employee.employeeNumber || employee.id.toString(),
      period: period,
      earnings: [
        { name: 'Basic Salary', amount: Number(runEmployee.basicSalary) },
        // if gross > basic, the difference is allowances
        ...(Number(runEmployee.grossSalary) > Number(runEmployee.basicSalary) ? [{ name: 'Allowances', amount: Number(runEmployee.grossSalary) - Number(runEmployee.basicSalary) }] : [])
      ],
      deductions: [
        { name: 'PAYE', amount: Number(runEmployee.paye) },
        { name: 'NSSA', amount: Number(runEmployee.nssaEmployee) },
        { name: 'AIDS Levy', amount: Number(runEmployee.aidsLevy) },
        { name: 'NEC', amount: Number(runEmployee.necEmployee) }
      ].filter(d => d.amount > 0),
      grossPay: Number(runEmployee.grossSalary),
      netPay: Number(runEmployee.netSalary),
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
