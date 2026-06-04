CREATE TABLE IF NOT EXISTS nec_sectors_config (
  id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id),
  name text NOT NULL,
  code text NOT NULL,
  employee_rate numeric(5,4) NOT NULL DEFAULT 0.0000,
  employer_rate numeric(5,4) NOT NULL DEFAULT 0.0000,
  fixed_amount numeric(15,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nec_sectors_company_idx ON nec_sectors_config(company_id);

CREATE TABLE IF NOT EXISTS departments (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  code text,
  gl_account_id integer REFERENCES accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS departments_company_idx ON departments(company_id);

CREATE TABLE IF NOT EXISTS positions (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  title text NOT NULL,
  grade text,
  nec_category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS positions_company_idx ON positions(company_id);

CREATE TABLE IF NOT EXISTS employees (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  branch_id integer NOT NULL REFERENCES branches(id),
  department_id integer REFERENCES departments(id),
  position_id integer REFERENCES positions(id),
  employee_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  national_id text NOT NULL,
  nssa_number text,
  zimra_tax_number text,
  bank_name text,
  bank_branch text,
  bank_account_number text,
  ecocash_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  status text NOT NULL DEFAULT 'ACTIVE',
  joining_date date NOT NULL,
  termination_date date,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT employees_company_emp_no_unique UNIQUE(company_id, employee_number)
);

CREATE INDEX IF NOT EXISTS employees_company_idx ON employees(company_id);
CREATE INDEX IF NOT EXISTS employees_branch_idx ON employees(branch_id);
CREATE INDEX IF NOT EXISTS employees_status_idx ON employees(status);

CREATE TABLE IF NOT EXISTS employee_contracts (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id),
  contract_type text NOT NULL DEFAULT 'PERMANENT',
  start_date date NOT NULL,
  end_date date,
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  base_salary numeric(15,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  usd_percentage numeric(5,2) NOT NULL DEFAULT 100.00,
  zig_percentage numeric(5,2) NOT NULL DEFAULT 0.00,
  nec_sector_id integer REFERENCES nec_sectors_config(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_contracts_employee_idx ON employee_contracts(employee_id);

CREATE TABLE IF NOT EXISTS tax_tables_config (
  id serial PRIMARY KEY,
  currency text NOT NULL DEFAULT 'USD',
  effective_from date NOT NULL,
  effective_to date,
  brackets jsonb NOT NULL,
  nssa_rate_employee numeric(5,4) NOT NULL DEFAULT 0.0450,
  nssa_rate_employer numeric(5,4) NOT NULL DEFAULT 0.0450,
  nssa_ceiling_limit numeric(15,2) NOT NULL,
  aids_levy_rate numeric(5,4) NOT NULL DEFAULT 0.0300,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tax_tables_currency_period_idx ON tax_tables_config(currency, effective_from);

CREATE TABLE IF NOT EXISTS payroll_recurring_items (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id),
  type text NOT NULL,
  name text NOT NULL,
  amount numeric(15,2) NOT NULL,
  is_taxable boolean NOT NULL DEFAULT true,
  is_tax_deductible boolean NOT NULL DEFAULT false,
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS payroll_recurring_employee_idx ON payroll_recurring_items(employee_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  branch_id integer REFERENCES branches(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  currency text NOT NULL DEFAULT 'USD',
  exchange_rate numeric(15,6) NOT NULL DEFAULT 1.000000,
  status text NOT NULL DEFAULT 'DRAFT',
  version integer NOT NULL DEFAULT 1,
  reversal_of_run_id integer,
  total_basic numeric(15,2) NOT NULL DEFAULT 0.00,
  total_gross numeric(15,2) NOT NULL DEFAULT 0.00,
  total_deductions numeric(15,2) NOT NULL DEFAULT 0.00,
  total_net numeric(15,2) NOT NULL DEFAULT 0.00,
  approved_by uuid REFERENCES users(id),
  approved_at timestamp,
  locked_by uuid REFERENCES users(id),
  locked_at timestamp,
  journal_entry_id integer REFERENCES journal_entries(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_runs_company_period_idx ON payroll_runs(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS payroll_runs_status_idx ON payroll_runs(status);

CREATE TABLE IF NOT EXISTS payroll_run_employees (
  id serial PRIMARY KEY,
  payroll_run_id integer NOT NULL REFERENCES payroll_runs(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  basic_salary numeric(15,2) NOT NULL,
  gross_salary numeric(15,2) NOT NULL,
  net_salary numeric(15,2) NOT NULL,
  paye numeric(15,2) NOT NULL DEFAULT 0.00,
  aids_levy numeric(15,2) NOT NULL DEFAULT 0.00,
  nssa_employee numeric(15,2) NOT NULL DEFAULT 0.00,
  nssa_employer numeric(15,2) NOT NULL DEFAULT 0.00,
  nec_employee numeric(15,2) NOT NULL DEFAULT 0.00,
  nec_employer numeric(15,2) NOT NULL DEFAULT 0.00,
  pension_employee numeric(15,2) NOT NULL DEFAULT 0.00,
  pension_employer numeric(15,2) NOT NULL DEFAULT 0.00,
  usd_percentage numeric(5,2) NOT NULL DEFAULT 100.00,
  zig_percentage numeric(5,2) NOT NULL DEFAULT 0.00,
  net_salary_usd numeric(15,2) NOT NULL DEFAULT 0.00,
  net_salary_zig numeric(15,2) NOT NULL DEFAULT 0.00,
  paye_usd numeric(15,2) NOT NULL DEFAULT 0.00,
  paye_zig numeric(15,2) NOT NULL DEFAULT 0.00,
  nssa_employee_usd numeric(15,2) NOT NULL DEFAULT 0.00,
  nssa_employee_zig numeric(15,2) NOT NULL DEFAULT 0.00,
  total_allowances numeric(15,2) NOT NULL DEFAULT 0.00,
  total_deductions numeric(15,2) NOT NULL DEFAULT 0.00,
  is_paid boolean NOT NULL DEFAULT false,
  paid_at timestamp,
  payment_reference text,
  snapshot_data jsonb NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_run_employees_run_idx ON payroll_run_employees(payroll_run_id);
CREATE INDEX IF NOT EXISTS payroll_run_employees_employee_idx ON payroll_run_employees(employee_id);

CREATE TABLE IF NOT EXISTS payroll_allowances (
  id serial PRIMARY KEY,
  payroll_run_employee_id integer NOT NULL REFERENCES payroll_run_employees(id),
  name text NOT NULL,
  amount numeric(15,2) NOT NULL,
  is_taxable boolean NOT NULL DEFAULT true,
  is_cash boolean NOT NULL DEFAULT true,
  allowance_type text NOT NULL DEFAULT 'OTHER'
);

CREATE INDEX IF NOT EXISTS payroll_allowances_employee_line_idx ON payroll_allowances(payroll_run_employee_id);

CREATE TABLE IF NOT EXISTS payroll_deductions (
  id serial PRIMARY KEY,
  payroll_run_employee_id integer NOT NULL REFERENCES payroll_run_employees(id),
  name text NOT NULL,
  amount numeric(15,2) NOT NULL,
  is_tax_deductible boolean NOT NULL DEFAULT false,
  deduction_type text NOT NULL DEFAULT 'OTHER'
);

CREATE INDEX IF NOT EXISTS payroll_deductions_employee_line_idx ON payroll_deductions(payroll_run_employee_id);

CREATE TABLE IF NOT EXISTS leave_requests (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  leave_type text NOT NULL DEFAULT 'ANNUAL',
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_days integer NOT NULL,
  reason text,
  attachment_url text,
  status text NOT NULL DEFAULT 'PENDING',
  encashment_days integer NOT NULL DEFAULT 0,
  encashment_amount numeric(15,2),
  approved_by uuid REFERENCES users(id),
  approved_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_requests_company_idx ON leave_requests(company_id);
CREATE INDEX IF NOT EXISTS leave_requests_employee_idx ON leave_requests(employee_id);

CREATE TABLE IF NOT EXISTS leave_balances (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id),
  leave_type text NOT NULL DEFAULT 'ANNUAL',
  accrued_days numeric(5,2) NOT NULL DEFAULT 0.00,
  used_days numeric(5,2) NOT NULL DEFAULT 0.00,
  pending_days numeric(5,2) NOT NULL DEFAULT 0.00,
  available_days numeric(5,2) NOT NULL DEFAULT 0.00,
  last_accrued_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_balances_employee_type_idx ON leave_balances(employee_id, leave_type);

CREATE TABLE IF NOT EXISTS employee_loans (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  principal_amount numeric(15,2) NOT NULL,
  interest_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  repayment_term_months integer NOT NULL,
  monthly_repayment_amount numeric(15,2) NOT NULL,
  remaining_balance numeric(15,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  disbursed_date date,
  approved_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_loans_company_idx ON employee_loans(company_id);
CREATE INDEX IF NOT EXISTS employee_loans_employee_idx ON employee_loans(employee_id);

CREATE TABLE IF NOT EXISTS loan_installments (
  id serial PRIMARY KEY,
  loan_id integer NOT NULL REFERENCES employee_loans(id),
  payroll_run_employee_id integer REFERENCES payroll_run_employees(id),
  amount_paid numeric(15,2) NOT NULL,
  principal_paid numeric(15,2) NOT NULL,
  interest_paid numeric(15,2) NOT NULL,
  remaining_balance_after numeric(15,2) NOT NULL,
  repayment_date timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_installments_loan_idx ON loan_installments(loan_id);

CREATE TABLE IF NOT EXISTS disciplinary_records (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  incident_date date NOT NULL,
  offense_type text NOT NULL,
  description text NOT NULL,
  action_taken text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disciplinary_records_company_idx ON disciplinary_records(company_id);

CREATE TABLE IF NOT EXISTS assigned_assets (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  employee_id integer REFERENCES employees(id),
  asset_name text NOT NULL,
  serial_number text,
  value numeric(15,2),
  assigned_date date,
  returned_date date,
  condition text NOT NULL DEFAULT 'GOOD'
);

CREATE INDEX IF NOT EXISTS assigned_assets_company_idx ON assigned_assets(company_id);

CREATE TABLE IF NOT EXISTS payment_batches (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  payment_method text NOT NULL DEFAULT 'BANK_TRANSFER',
  currency text NOT NULL DEFAULT 'USD',
  total_amount numeric(15,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'DRAFT',
  exported_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_batches_company_idx ON payment_batches(company_id);

CREATE TABLE IF NOT EXISTS payment_batch_details (
  id serial PRIMARY KEY,
  batch_id integer NOT NULL REFERENCES payment_batches(id),
  payroll_run_employee_id integer NOT NULL REFERENCES payroll_run_employees(id),
  amount numeric(15,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  failure_reason text
);

CREATE INDEX IF NOT EXISTS payment_batch_details_batch_idx ON payment_batch_details(batch_id);

CREATE TABLE IF NOT EXISTS tenant_integration_credentials (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  integration_type text NOT NULL,
  credential_data text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT company_integration_unique UNIQUE(company_id, integration_type)
);
