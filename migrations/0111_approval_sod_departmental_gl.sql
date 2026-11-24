-- Approval segregation of duties, complete request-type coverage and
-- departmental analytics on the general ledger and source documents.

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "default_department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cost_center_id" integer REFERENCES cost_centers(id);
--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "cost_center_id" integer REFERENCES cost_centers(id);
--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN IF NOT EXISTS "cost_center_id" integer REFERENCES cost_centers(id);
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "cost_center_id" integer REFERENCES cost_centers(id);
--> statement-breakpoint
ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "cost_center_id" integer REFERENCES cost_centers(id);
--> statement-breakpoint
ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "location_id" integer REFERENCES inventory_locations(id);
--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "cashbook_entry_lines" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE "inventory_location_stocks" ADD COLUMN IF NOT EXISTS "reorder_level" numeric(10,2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "requested_by" uuid REFERENCES users(id);
--> statement-breakpoint

-- Backfill account defaults from their existing cost-centre default.
UPDATE accounts a
SET default_department_id = d.id
FROM departments d
WHERE d.company_id = a.company_id
  AND d.cost_center_id = a.default_cost_center_id
  AND a.default_department_id IS NULL;
--> statement-breakpoint

-- Backfill posted ledger lines from the cost centre carried on the line.
UPDATE ledger_entries le
SET department_id = d.id
FROM journal_entries je, departments d
WHERE je.id = le.journal_entry_id
  AND d.company_id = je.company_id
  AND d.cost_center_id = le.cost_center_id
  AND le.department_id IS NULL;
--> statement-breakpoint

-- Then fall back to the account-level default department.
UPDATE ledger_entries le
SET department_id = a.default_department_id
FROM accounts a
WHERE a.id = le.account_id
  AND le.department_id IS NULL
  AND a.default_department_id IS NOT NULL;
--> statement-breakpoint

-- Analytical indexes for departmental reporting.
CREATE INDEX IF NOT EXISTS ledger_entries_company_department_idx
  ON ledger_entries (department_id, cost_center_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS accounts_company_default_department_idx
  ON accounts (company_id, default_department_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_location_stocks_reorder_idx
  ON inventory_location_stocks (location_id, reorder_level);
--> statement-breakpoint

-- Activate the approval framework for tenants that have not configured it yet
-- (including PRO ELECTRICS). Thresholds remain 0 until the client agrees the
-- monetary authority limits.
UPDATE companies
SET approval_settings = $$
{
  "stock_adjustment": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "grn_confirm": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "journal_post": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "invoice_issue": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "sales_commission": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "quotation": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "discount": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "sales_order": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "purchase_order": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "supplier_registration": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "credit_note": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "payment_execution": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "leave": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "expense": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false}
}
$$::jsonb
WHERE approval_settings IS NULL;
