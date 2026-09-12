CREATE TABLE IF NOT EXISTS payroll_attendance_imports (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  branch_id integer REFERENCES branches(id),
  source text NOT NULL DEFAULT 'MANUAL',
  provider text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'IMPORTED',
  row_count integer NOT NULL DEFAULT 0,
  summary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_attendance_imports_company_idx ON payroll_attendance_imports(company_id);
CREATE INDEX IF NOT EXISTS payroll_attendance_imports_period_idx ON payroll_attendance_imports(period_start, period_end);

CREATE TABLE IF NOT EXISTS employee_documents (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  document_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  mime_type text,
  file_hash text,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_documents_employee_idx ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS employee_documents_company_idx ON employee_documents(company_id);

CREATE TABLE IF NOT EXISTS payslip_documents (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  payroll_run_id integer NOT NULL REFERENCES payroll_runs(id),
  payroll_run_employee_id integer NOT NULL REFERENCES payroll_run_employees(id),
  employee_id integer NOT NULL REFERENCES employees(id),
  document_url text,
  document_hash text,
  delivery_channel text NOT NULL DEFAULT 'DOWNLOAD',
  delivery_status text NOT NULL DEFAULT 'GENERATED',
  password_protected boolean NOT NULL DEFAULT false,
  generated_by uuid REFERENCES users(id),
  generated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payslip_documents_run_idx ON payslip_documents(payroll_run_id);
CREATE INDEX IF NOT EXISTS payslip_documents_employee_idx ON payslip_documents(employee_id);

CREATE TABLE IF NOT EXISTS payroll_integration_events (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  integration_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  direction text NOT NULL DEFAULT 'OUTBOUND',
  status text NOT NULL DEFAULT 'PENDING',
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_integration_events_company_idx ON payroll_integration_events(company_id);
CREATE INDEX IF NOT EXISTS payroll_integration_events_entity_idx ON payroll_integration_events(entity_type, entity_id);
