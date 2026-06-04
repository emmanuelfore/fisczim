-- Explicit statutory report approval and export version controls.

ALTER TABLE payroll_statutory_reports
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE payroll_report_exports
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS payroll_statutory_reports_approval_idx
  ON payroll_statutory_reports(company_id, approval_status, submission_status);
