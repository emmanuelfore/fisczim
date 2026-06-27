import { generatePayrollSummaryCsv, PayrollCsvRecord } from '../utils/csvHelper.js';
import { generatePayslipPdf, PayslipData } from '../utils/pdfHelper.js';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { payrollRunEmployees, employees, payrollRuns, payrollCalculationAudits } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { format } from 'date-fns';

export class ReportService {
  /**
   * Generates a CSV summary for a given company and month (e.g. '2026-05')
   */
  async generatePayrollReport(companyId: number, month: string): Promise<string> {
    // 1. Find the payroll run for the given company and month
    const [run] = await db.select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        // Simple match if periodStart string starts with the month. 
        // A more robust approach might be needed depending on how periods are saved.
        eq(payrollRuns.periodStart, `${month}-01`)
      ))
      .orderBy(desc(payrollRuns.createdAt));

    if (!run) {
      throw new Error(`No payroll run found for ${month}`);
    }

    // 2. Fetch run employees joined with employee details
    const records = await db.select({
      runEmployee: payrollRunEmployees,
      employee: employees
    })
      .from(payrollRunEmployees)
      .innerJoin(employees, eq(payrollRunEmployees.employeeId, employees.id))
      .where(eq(payrollRunEmployees.payrollRunId, run.id));

    // 3. Map to CSV records
    const csvData: PayrollCsvRecord[] = records.map(r => ({
      employeeId: r.employee.employeeNumber || r.employee.id.toString(),
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      grossPay: Number(r.runEmployee.grossSalary).toFixed(2),
      taxableIncome: Number(r.runEmployee.grossSalary).toFixed(2), // Simplified for now
      paye: Number(r.runEmployee.paye).toFixed(2),
      nssa: Number(r.runEmployee.nssaEmployee).toFixed(2),
      aidsLevy: Number(r.runEmployee.aidsLevy).toFixed(2),
      otherDeductions: Number(r.runEmployee.necEmployee).toFixed(2), // Simplify by adding NEC for now
      netPay: Number(r.runEmployee.netSalary).toFixed(2)
    }));

    // 4. Generate CSV string
    return generatePayrollSummaryCsv(csvData);
  }

  /**
   * Generates a PDF payslip for a specific employee and period
   */
  async generatePayslip(employeeId: number, period: string): Promise<Uint8Array> {
    // Fetch employee
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) throw new Error('Employee not found');

    // Fetch company
    const company = await storage.getCompany(employee.companyId);
    if (!company) throw new Error('Company not found');

    // Fetch payroll run
    const [run] = await db.select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, company.id),
        eq(payrollRuns.periodStart, `${period}-01`)
      ))
      .orderBy(desc(payrollRuns.createdAt));
    
    if (!run) throw new Error(`No payroll run found for period ${period}`);

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
