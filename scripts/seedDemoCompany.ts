import { db } from '../server/db.js';
import { 
  companies, employees, payrollRuns, payrollRunEmployees, 
  payrollEarningTypes, payrollDeductionTypes, payrollPayGrades, taxTablesConfig, employeeContracts,
  branches, departments, positions, payrollStatutoryRules
} from '../shared/schema.js';
import { reportService } from '../server/services/reportService.js';
import { eq } from 'drizzle-orm';
import { addMonths, format, startOfMonth, subMonths } from 'date-fns';

async function seedDemoCompany() {
  console.log('Starting Demo Company seeding...');
  
  // 1. Create Demo Company with statutory details
  const [demoCompany] = await db.insert(companies).values({
    name: 'Demo Company (Zimbabwe)',
    address: '123 Demo Street',
    city: 'Harare',
    phone: '+263772123456',
    email: 'hr@democompany.co.zw',
    tin: `ZIM-456-${Date.now()}`,
    bpNumber: '0200123456',
    nssaEmployerNumber: 'NSSA-987654'
  }).returning();
  console.log(`Created Demo Company with ID: ${demoCompany.id}`);

  // 2. Setup Tax Tables (ZIMRA 2026 approximation)
  // Ensure we disable any existing active USD tax tables first
  await db.update(taxTablesConfig)
    .set({ isActive: false })
    .where(eq(taxTablesConfig.currency, 'USD'));

  const [taxTable] = await db.insert(taxTablesConfig).values({
    currency: 'USD',
    effectiveFrom: '2024-01-01',
    brackets: [
      { min: 0, max: 100, rate: 0, deduction: 0 },
      { min: 101, max: 500, rate: 0.20, deduction: 20.20 },
      { min: 501, max: 1000, rate: 0.25, deduction: 45.20 },
      { min: 1001, max: 5000, rate: 0.30, deduction: 95.20 },
      { min: 5001, max: null, rate: 0.40, deduction: 595.20 }
    ],
    isActive: true
  }).returning();
  console.log(`Created Tax Table ID: ${taxTable.id}`);

  // 2.5 Setup Statutory Rules
  await db.insert(payrollStatutoryRules).values([
    {
      companyId: demoCompany.id,
      ruleCode: 'AIDS_LEVY',
      name: 'AIDS Levy',
      currency: 'USD',
      payFrequency: 'MONTHLY',
      employeeRate: '0.0300',
      employerRate: '0.0000',
      calculationBasis: 'PAYE',
      isActive: true,
      isSystemLocked: true,
      effectiveFrom: '2023-01-01'
    },
    {
      companyId: demoCompany.id,
      ruleCode: 'NSSA_POBS',
      name: 'NSSA POBS',
      currency: 'USD',
      payFrequency: 'MONTHLY',
      employeeRate: '0.0450',
      employerRate: '0.0450',
      ceilingAmount: '700.00',
      calculationBasis: 'TAXABLE_INCOME',
      isActive: true,
      isSystemLocked: true,
      effectiveFrom: '2023-01-01'
    }
  ]);
  console.log(`Created Statutory Rules`);

  // 3. Setup Pay Grades
  const payGrades = await db.insert(payrollPayGrades).values([
    { companyId: demoCompany.id, code: 'G1', name: 'Executive', minSalary: '5000.00', midpointSalary: '7500.00', maxSalary: '10000.00', effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'G2', name: 'Senior Management', minSalary: '3000.00', midpointSalary: '4000.00', maxSalary: '5000.00', effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'G3', name: 'Middle Management', minSalary: '1500.00', midpointSalary: '2250.00', maxSalary: '3000.00', effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'G4', name: 'General Staff', minSalary: '500.00', midpointSalary: '1000.00', maxSalary: '1500.00', effectiveFrom: '2023-01-01' }
  ]).returning();
  console.log(`Created ${payGrades.length} Pay Grades`);

  // 4. Setup Payroll Elements (Incomes and Deductions) specific to Demo Company
  await db.insert(payrollEarningTypes).values([
    { companyId: demoCompany.id, code: 'BASIC', name: 'Basic Salary', category: 'BASIC', taxTreatment: 'TAXABLE', isPensionable: true, isNssaApplicable: true, isRecurring: true, effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'TRANSPORT', name: 'Transport Allowance', category: 'ALLOWANCE', taxTreatment: 'NON_TAXABLE', isPensionable: false, isNssaApplicable: false, isRecurring: true, effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'HOUSING', name: 'Housing Allowance', category: 'ALLOWANCE', taxTreatment: 'TAXABLE', isPensionable: false, isNssaApplicable: false, isRecurring: true, effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'OVERTIME', name: 'Overtime', category: 'OVERTIME', taxTreatment: 'TAXABLE', isPensionable: false, isNssaApplicable: true, isRecurring: false, effectiveFrom: '2023-01-01' }
  ]);

  await db.insert(payrollDeductionTypes).values([
    { companyId: demoCompany.id, code: 'PAYE', name: 'PAYE Tax', category: 'STATUTORY', timing: 'POST_TAX', contributionSide: 'EMPLOYEE', effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'NSSA', name: 'NSSA Contribution', category: 'STATUTORY', timing: 'POST_TAX', contributionSide: 'EMPLOYEE', effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'AIDS', name: 'AIDS Levy', category: 'STATUTORY', timing: 'POST_TAX', contributionSide: 'EMPLOYEE', effectiveFrom: '2023-01-01' },
    { companyId: demoCompany.id, code: 'MEDICAL', name: 'Medical Aid', category: 'VOLUNTARY', timing: 'PRE_TAX', contributionSide: 'EMPLOYEE', effectiveFrom: '2023-01-01' }
  ]);
  console.log(`Created Payroll Earning/Deduction Types`);

  // 4.5 Setup Branch, Dept, Position
  const [demoBranch] = await db.insert(branches).values({
    companyId: demoCompany.id,
    name: 'HQ Harare',
    code: 'HQ-HRE',
    address: '123 Demo Street',
    city: 'Harare'
  }).returning();
  
  const [demoDept] = await db.insert(departments).values({
    companyId: demoCompany.id,
    name: 'General',
    code: 'GEN'
  }).returning();

  const [demoPosition] = await db.insert(positions).values({
    companyId: demoCompany.id,
    title: 'Staff'
  }).returning();

  // 5. Create 20 Employees
  const insertedEmployees = [];
  for (let i = 1; i <= 20; i++) {
    const gradeIndex = i <= 2 ? 0 : i <= 5 ? 1 : i <= 10 ? 2 : 3;
    const grade = payGrades[gradeIndex];
    
    const [emp] = await db.insert(employees).values({
      companyId: demoCompany.id,
      branchId: demoBranch.id,
      departmentId: demoDept.id,
      positionId: demoPosition.id,
      firstName: `Employee${i}`,
      lastName: `DemoUser`,
      employeeNumber: `EMP${1000 + i}`,
      nationalId: `12-345678${String(i).padStart(2, '0')}X01`,
      joiningDate: '2023-01-01',
      status: 'ACTIVE'
    }).returning();
    
    const basePay = Number(grade.minSalary) + Math.random() * (Number(grade.midpointSalary) - Number(grade.minSalary));
    await db.insert(employeeContracts).values({
      employeeId: emp.id,
      payGradeId: grade.id,
      startDate: '2023-01-01',
      payFrequency: 'MONTHLY',
      baseSalary: basePay.toFixed(2),
      currency: 'USD',
      usdPercentage: '100.00',
      zigPercentage: '0.00',
      isActive: true
    });
    
    insertedEmployees.push({ emp, basePay });
  }
  console.log(`Created 20 employees and their contracts`);

  // 6. Run 3 months of payroll
  const currentDate = new Date();
  for (let m = 3; m >= 1; m--) {
    const runDate = startOfMonth(subMonths(currentDate, m));
    const periodStart = format(runDate, 'yyyy-MM-dd');
    const periodEnd = format(addMonths(runDate, 1), 'yyyy-MM-dd'); 

    const [run] = await db.insert(payrollRuns).values({
      companyId: demoCompany.id,
      periodStart,
      periodEnd,
      status: 'LOCKED',
      totalGross: '0',
      totalNet: '0',
      totalDeductions: '0'
    }).returning();

    let totalGross = 0;
    let totalNet = 0;
    let runTotalTaxes = 0;
    let runTotalDeductions = 0;

    for (const { emp, basePay } of insertedEmployees) {
      const gross = basePay + (Math.random() > 0.5 ? 100 : 0);
      
      let payeTax = 0;
      if (gross > 100) payeTax = (gross - 100) * 0.2;
      if (gross > 500) payeTax = (gross - 500) * 0.25 + 80;
      
      const nssaTax = Math.min(gross * 0.045, 700 * 0.045);
      const aidsLevy = payeTax * 0.03; 
      const netPay = gross - payeTax - nssaTax - aidsLevy;

      totalGross += gross;
      totalNet += netPay;
      runTotalTaxes += payeTax;
      runTotalDeductions += (nssaTax + aidsLevy);

      const [runEmp] = await db.insert(payrollRunEmployees).values({
        payrollRunId: run.id,
        employeeId: emp.id,
        basicSalary: basePay.toFixed(2),
        grossSalary: gross.toFixed(2),
        netSalary: netPay.toFixed(2),
        paye: payeTax.toFixed(2),
        aidsLevy: aidsLevy.toFixed(2),
        nssaEmployee: nssaTax.toFixed(2),
        snapshotData: {
           formulasUsed: { PAYE: 'ZIMRA 2026', NSSA: '4.5%', AIDS: '3%' }
        }
      }).returning();

      await reportService.createAuditSnapshot(runEmp.id, {
        runId: run.id,
        employeeId: emp.id,
        formulasUsed: {
          PAYE: 'ZIMRA 2026 Brackets',
          NSSA: '4.5% of Basic (capped at 700)',
          AIDS: '3% of PAYE'
        },
        basicSalary: basePay,
        grossSalary: gross,
        deductions: {
          PAYE: payeTax,
          NSSA: nssaTax,
          AIDS_LEVY: aidsLevy
        },
        netSalary: netPay,
        auditTimestamp: new Date().toISOString()
      });
    }

    await db.update(payrollRuns).set({
      totalGross: totalGross.toFixed(2),
      totalNet: totalNet.toFixed(2),
      totalDeductions: runTotalDeductions.toFixed(2)
    }).where(eq(payrollRuns.id, run.id));
    
    console.log(`Generated payroll run for ${periodStart} with total gross $${totalGross.toFixed(2)}`);
  }

  console.log('Demo Company seeding complete!');
  process.exit(0);
}

seedDemoCompany().catch(err => {
  console.error('Failed to seed:', err);
  process.exit(1);
});
