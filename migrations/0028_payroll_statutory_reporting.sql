CREATE TABLE IF NOT EXISTS payroll_statutory_reports (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  report_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  tax_year integer,
  currency text NOT NULL DEFAULT 'USD',
  version integer NOT NULL DEFAULT 1,
  payroll_run_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tax_tables_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  statutory_rates_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_data jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  status text NOT NULL DEFAULT 'GENERATED',
  submission_status text NOT NULL DEFAULT 'NOT_SUBMITTED',
  submission_reference text,
  amendment_of_report_id integer,
  generated_by uuid REFERENCES users(id),
  generated_at timestamp DEFAULT now(),
  submitted_at timestamp
);

CREATE INDEX IF NOT EXISTS payroll_statutory_reports_company_idx ON payroll_statutory_reports(company_id);
CREATE INDEX IF NOT EXISTS payroll_statutory_reports_type_period_idx ON payroll_statutory_reports(report_type, period_start, period_end);

CREATE TABLE IF NOT EXISTS payroll_report_exports (
  id serial PRIMARY KEY,
  report_id integer NOT NULL REFERENCES payroll_statutory_reports(id),
  format text NOT NULL,
  file_name text NOT NULL,
  file_url text,
  file_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES users(id),
  generated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_report_exports_report_idx ON payroll_report_exports(report_id);

CREATE TABLE IF NOT EXISTS payroll_report_validation_issues (
  id serial PRIMARY KEY,
  report_id integer REFERENCES payroll_statutory_reports(id),
  company_id integer NOT NULL REFERENCES companies(id),
  report_type text NOT NULL,
  severity text NOT NULL DEFAULT 'ERROR',
  code text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_resolved boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_report_validation_company_idx ON payroll_report_validation_issues(company_id);
CREATE INDEX IF NOT EXISTS payroll_report_validation_report_idx ON payroll_report_validation_issues(report_id);

CREATE TABLE IF NOT EXISTS payroll_statutory_deadlines (
  id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id),
  country_code text NOT NULL DEFAULT 'ZW',
  authority text NOT NULL,
  report_type text NOT NULL,
  name text NOT NULL,
  due_day integer,
  due_month integer,
  frequency text NOT NULL DEFAULT 'MONTHLY',
  reminder_days_before integer NOT NULL DEFAULT 7,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_deadline_lookup_idx ON payroll_statutory_deadlines(country_code, authority, report_type);
CREATE INDEX IF NOT EXISTS payroll_deadline_company_idx ON payroll_statutory_deadlines(company_id);
