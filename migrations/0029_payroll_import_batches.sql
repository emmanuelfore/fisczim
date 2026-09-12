-- Payroll import audit tables for employee master data, payroll rules, and operational balances.

CREATE TABLE IF NOT EXISTS payroll_import_batches (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  import_type TEXT NOT NULL,
  source_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  validation_summary JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS payroll_import_batches_company_idx
  ON payroll_import_batches(company_id);

CREATE INDEX IF NOT EXISTS payroll_import_batches_type_idx
  ON payroll_import_batches(import_type, created_at);

CREATE TABLE IF NOT EXISTS payroll_import_rows (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES payroll_import_batches(id),
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  entity_type TEXT,
  entity_id TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}',
  errors JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payroll_import_rows_batch_idx
  ON payroll_import_rows(batch_id);

CREATE INDEX IF NOT EXISTS payroll_import_rows_status_idx
  ON payroll_import_rows(status);
