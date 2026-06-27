import { stringify } from 'csv-stringify/sync';

export interface PayrollCsvRecord {
  employeeId: string;
  name: string;
  grossPay: string;
  taxableIncome: string;
  paye: string;
  nssa: string;
  aidsLevy: string;
  otherDeductions: string;
  netPay: string;
}

export function generatePayrollSummaryCsv(records: PayrollCsvRecord[]): string {
  return stringify(records, {
    header: true,
    columns: {
      employeeId: 'Employee ID',
      name: 'Name',
      grossPay: 'Gross Pay',
      taxableIncome: 'Taxable Income',
      paye: 'PAYE',
      nssa: 'NSSA',
      aidsLevy: 'AIDS Levy',
      otherDeductions: 'Other Deductions',
      netPay: 'Net Pay'
    }
  });
}
