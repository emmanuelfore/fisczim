CREATE TABLE IF NOT EXISTS payroll_tax_tables (
  id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id),
  country_code text NOT NULL DEFAULT 'ZW',
  currency text NOT NULL DEFAULT 'USD',
  tax_year integer NOT NULL,
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  effective_from date NOT NULL,
  effective_to date,
  version integer NOT NULL DEFAULT 1,
  source_reference text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_tax_tables_company_idx ON payroll_tax_tables(company_id);
CREATE INDEX IF NOT EXISTS payroll_tax_tables_lookup_idx ON payroll_tax_tables(country_code, currency, pay_frequency, effective_from);

CREATE TABLE IF NOT EXISTS payroll_tax_brackets (
  id serial PRIMARY KEY,
  tax_table_id integer NOT NULL REFERENCES payroll_tax_tables(id),
  bracket_order integer NOT NULL,
  min_income numeric(15,2) NOT NULL DEFAULT 0.00,
  max_income numeric(15,2),
  rate numeric(8,6) NOT NULL DEFAULT 0.000000,
  deduction numeric(15,2) NOT NULL DEFAULT 0.00,
  base_tax numeric(15,2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS payroll_tax_brackets_table_idx ON payroll_tax_brackets(tax_table_id, bracket_order);

CREATE TABLE IF NOT EXISTS payroll_statutory_rules (
  id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id),
  country_code text NOT NULL DEFAULT 'ZW',
  rule_code text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  employee_rate numeric(8,6) NOT NULL DEFAULT 0.000000,
  employer_rate numeric(8,6) NOT NULL DEFAULT 0.000000,
  ceiling_amount numeric(15,2),
  floor_amount numeric(15,2),
  calculation_basis text NOT NULL DEFAULT 'TAXABLE_INCOME',
  formula text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date NOT NULL,
  effective_to date,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_statutory_rules_lookup_idx ON payroll_statutory_rules(country_code, rule_code, currency, pay_frequency, effective_from);
CREATE INDEX IF NOT EXISTS payroll_statutory_rules_company_idx ON payroll_statutory_rules(company_id);

CREATE TABLE IF NOT EXISTS payroll_earning_types (
  id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id),
  country_code text NOT NULL DEFAULT 'ZW',
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'ALLOWANCE',
  tax_treatment text NOT NULL DEFAULT 'TAXABLE',
  taxable_percentage numeric(5,2) NOT NULL DEFAULT 100.00,
  is_pensionable boolean NOT NULL DEFAULT false,
  is_nssa_applicable boolean NOT NULL DEFAULT false,
  is_recurring boolean NOT NULL DEFAULT false,
  calculation_method text NOT NULL DEFAULT 'FIXED',
  formula text,
  gl_account_id integer REFERENCES accounts(id),
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_earning_types_company_code_idx ON payroll_earning_types(company_id, code);

CREATE TABLE IF NOT EXISTS payroll_deduction_types (
  id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id),
  country_code text NOT NULL DEFAULT 'ZW',
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'COMPANY',
  timing text NOT NULL DEFAULT 'POST_TAX',
  contribution_side text NOT NULL DEFAULT 'EMPLOYEE',
  calculation_method text NOT NULL DEFAULT 'FIXED',
  formula text,
  employee_rate numeric(8,6) NOT NULL DEFAULT 0.000000,
  employer_rate numeric(8,6) NOT NULL DEFAULT 0.000000,
  max_amount numeric(15,2),
  priority_order integer NOT NULL DEFAULT 100,
  gl_account_id integer REFERENCES accounts(id),
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_deduction_types_company_code_idx ON payroll_deduction_types(company_id, code);
CREATE INDEX IF NOT EXISTS payroll_deduction_types_priority_idx ON payroll_deduction_types(priority_order);

CREATE TABLE IF NOT EXISTS payroll_salary_structures (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  default_earning_type_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_deduction_type_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  CONSTRAINT payroll_salary_structures_company_code_unique UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS payroll_pay_grades (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  salary_structure_id integer REFERENCES payroll_salary_structures(id),
  code text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  min_salary numeric(15,2) NOT NULL DEFAULT 0.00,
  midpoint_salary numeric(15,2) NOT NULL DEFAULT 0.00,
  max_salary numeric(15,2) NOT NULL DEFAULT 0.00,
  nec_sector_id integer REFERENCES nec_sectors_config(id),
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT payroll_pay_grades_company_code_unique UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS payroll_pay_grades_company_idx ON payroll_pay_grades(company_id);

CREATE TABLE IF NOT EXISTS payroll_pay_grade_steps (
  id serial PRIMARY KEY,
  pay_grade_id integer NOT NULL REFERENCES payroll_pay_grades(id),
  step_code text NOT NULL,
  step_name text NOT NULL,
  salary_amount numeric(15,2) NOT NULL,
  progression_months integer,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS payroll_pay_grade_steps_grade_idx ON payroll_pay_grade_steps(pay_grade_id);

CREATE TABLE IF NOT EXISTS employee_payroll_profiles (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  salary_structure_id integer REFERENCES payroll_salary_structures(id),
  pay_grade_id integer REFERENCES payroll_pay_grades(id),
  pay_grade_step_id integer REFERENCES payroll_pay_grade_steps(id),
  pay_frequency text NOT NULL DEFAULT 'MONTHLY',
  currency text NOT NULL DEFAULT 'USD',
  is_nssa_exempt boolean NOT NULL DEFAULT false,
  is_paye_exempt boolean NOT NULL DEFAULT false,
  tax_credit_amount numeric(15,2) NOT NULL DEFAULT 0.00,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_payroll_profiles_employee_idx ON employee_payroll_profiles(employee_id);
CREATE INDEX IF NOT EXISTS employee_payroll_profiles_company_idx ON employee_payroll_profiles(company_id);

ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS pay_grade_id integer REFERENCES payroll_pay_grades(id);
