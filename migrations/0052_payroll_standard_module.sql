-- 0052: Payroll standard-module additions
-- 1) Salary change requests with approval workflow
CREATE TABLE IF NOT EXISTS employee_salary_changes (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  previous_base_salary numeric(15,2) NOT NULL,
  new_base_salary numeric(15,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  reason text NOT NULL,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  requested_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamp,
  rejection_reason text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salary_changes_company_idx ON employee_salary_changes (company_id, status);
CREATE INDEX IF NOT EXISTS salary_changes_employee_idx ON employee_salary_changes (employee_id);

-- 2) Run type (REGULAR vs BONUS / 13th cheque)
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'REGULAR';

-- 3) Statutory remittance tracker
CREATE TABLE IF NOT EXISTS payroll_remittances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  authority text NOT NULL,
  report_type text NOT NULL,
  name text NOT NULL,
  period text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  amount numeric(15,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'NOT_SUBMITTED',
  reference_number text,
  paid_amount numeric(15,2),
  paid_date date,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS remittances_company_idx ON payroll_remittances (company_id, report_type, period);
