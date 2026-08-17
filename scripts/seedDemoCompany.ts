import 'dotenv/config';
import { db } from '../server/db.js';
import { 
  companies, employees, payrollRuns, payrollRunEmployees, 
  payrollEarningTypes, payrollDeductionTypes, payrollPayGrades, taxTablesConfig, employeeContracts,
  branches, departments, positions, payrollStatutoryRules,
  employeeSalaryHistory, employeeEmploymentHistory, employeeIncomeHistory, employeeDeductionHistory,
  payrollRecurringItems
} from '../shared/schema.js';
import { reportService } from '../server/services/reportService.js';
import { eq } from 'drizzle-orm';
import { addMonths, addDays, format, startOfMonth, subMonths } from 'date-fns';

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
    
    // Proration scenarios:
    //  - EMP1001 joined on the 17th of this month (mid-period join)
    //  - EMP1002 terminated on the 12th of this month (mid-period leaver)
    //  - EMP1003 got a mid-month salary increase on the 15th of this month
    const now = new Date();
    const thisMonth = startOfMonth(now);
    let joiningDate = '2023-01-01';
    if (i === 1) joiningDate = format(addDays(thisMonth, 16), 'yyyy-MM-dd'); // joins 17th
    if (i === 2) joiningDate = '2023-06-01'; // leaves on the 12th this month

    const [emp] = await db.insert(employees).values({
      companyId: demoCompany.id,
      branchId: demoBranch.id,
      departmentId: demoDept.id,
      positionId: demoPosition.id,
      firstName: `Employee${i}`,
      lastName: `DemoUser`,
      employeeNumber: `EMP${1000 + i}`,
      nationalId: `12-345678${String(i).padStart(2, '0')}X01`,
      joiningDate,
      status: i === 2 ? 'TERMINATED' : 'ACTIVE',
      terminationDate: i === 2 ? format(addDays(thisMonth, 11), 'yyyy-MM-dd') : null
    }).returning();
    
    const basePay = Number(grade.minSalary) + Math.random() * (Number(grade.midpointSalary) - Number(grade.minSalary));
    await db.insert(employeeContracts).values({
      employeeId: emp.id,
      payGradeId: grade.id,
      startDate: joiningDate,
      payFrequency: 'MONTHLY',
      baseSalary: basePay.toFixed(2),
      currency: 'USD',
      usdPercentage: '100.00',
      zigPercentage: '0.00',
      isActive: i !== 2
    });

    // Effective-dated salary history: initial record from join, and for EMP1003
    // a mid-month raise effective the 15th so the run blends old + new rates.
    await db.insert(employeeSalaryHistory).values({
      companyId: demoCompany.id,
      employeeId: emp.id,
      salaryAmount: basePay.toFixed(2),
      currency: 'USD',
      payFrequency: 'MONTHLY',
      usdPercentage: '100.00',
      zigPercentage: '0.00',
      effectiveFrom: joiningDate,
      effectiveTo: null,
      reason: 'Initial salary'
    });
    if (i === 3) {
      const raised = Math.round(basePay * 1.1 * 100) / 100;
      await db.update(employeeSalaryHistory)
        .set({ effectiveTo: format(addDays(thisMonth, 14), 'yyyy-MM-dd') })
        .where(eq(employeeSalaryHistory.employeeId, emp.id));
      await db.insert(employeeSalaryHistory).values({
        companyId: demoCompany.id,
        employeeId: emp.id,
        salaryAmount: raised.toFixed(2),
        currency: 'USD',
        payFrequency: 'MONTHLY',
        usdPercentage: '100.00',
        zigPercentage: '0.00',
        effectiveFrom: format(addDays(thisMonth, 15), 'yyyy-MM-dd'),
        effectiveTo: null,
        reason: 'Mid-month salary increase'
      });
    }

    // Effective-dated employment history (JOINED, TERMINATION for the leaver).
    await db.insert(employeeEmploymentHistory).values({
      companyId: demoCompany.id,
      employeeId: emp.id,
      eventType: 'JOINED',
      effectiveFrom: joiningDate,
      departmentId: demoDept.id,
      positionId: demoPosition.id,
      branchId: demoBranch.id,
      employmentType: 'PERMANENT',
      contractType: 'PERMANENT',
      reason: 'Initial hire'
    });
    if (i === 2) {
      await db.insert(employeeEmploymentHistory).values({
        companyId: demoCompany.id,
        employeeId: emp.id,
        eventType: 'TERMINATION',
        effectiveFrom: format(addDays(thisMonth, 11), 'yyyy-MM-dd'),
        departmentId: demoDept.id,
        positionId: demoPosition.id,
        branchId: demoBranch.id,
        employmentType: 'PERMANENT',
        contractType: 'PERMANENT',
        reason: 'Resignation'
      });
    }

    // Recurring allowances/deductions (income history). EMP1006 gets a transport
    // allowance that only starts on the 20th of this month so it is prorated.
    await db.insert(payrollRecurringItems).values({
      employeeId: emp.id,
      type: 'ALLOWANCE',
      name: 'Transport Allowance',
      amount: '100.00',
      isTaxable: false,
      startDate: i === 6 ? format(addDays(thisMonth, 19), 'yyyy-MM-dd') : '2023-01-01',
      isActive: i !== 2
    });
    await db.insert(employeeIncomeHistory).values({
      companyId: demoCompany.id,
      employeeId: emp.id,
      name: 'Transport Allowance',
      amount: '100.00',
      calculationType: 'FIXED',
      isTaxable: false,
      effectiveFrom: i === 6 ? format(addDays(thisMonth, 19), 'yyyy-MM-dd') : '2023-01-01',
      effectiveTo: null,
      reason: 'Transport allowance'
    });
    await db.insert(employeeDeductionHistory).values({
      companyId: demoCompany.id,
      employeeId: emp.id,
      name: 'Medical Aid',
      amount: '50.00',
      calculationType: 'FIXED',
      isTaxDeductible: true,
      effectiveFrom: '2023-01-01',
      effectiveTo: null,
      reason: 'Medical aid'
    });

    insertedEmployees.push({ emp, basePay });
  }
  console.log(`Created 20 employees, their contracts, salary/employment/income/deduction history`);

  // 6. Run 3 months of payroll (plus the current month to surface proration)
  const currentDate = new Date();
  for (let m = 3; m >= 0; m--) {
    const runDate = startOfMonth(subMonths(currentDate, m));
    const periodStart = format(runDate, 'yyyy-MM-dd');
    const periodEnd = format(addMonths(runDate, 1), 'yyyy-MM-dd'); 

    const [run] = await db.insert(payrollRuns).values({
      companyId: demoCompany.id,
      periodStart,
      periodEnd,
      status: m === 0 ? 'DRAFT' : 'LOCKED',
      runType: 'REGULAR',
      prorationBasis: 'CALENDAR_DAYS',
      totalGross: '0',
      totalNet: '0',
      totalDeductions: '0'
    }).returning();

    let totalGross = 0;
    let totalNet = 0;
    let runTotalTaxes = 0;
    let runTotalDeductions = 0;

    for (const { emp, basePay } of insertedEmployees) {
      // Skip the terminated employee entirely for historical runs.
      if (emp.status === 'TERMINATED') continue;
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
