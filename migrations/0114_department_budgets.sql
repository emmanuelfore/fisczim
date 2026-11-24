-- Departmental budgets with GL-backed actuals. Actuals are never stored on
-- the budget row because they are derived from posted ledger entries at report time.

CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  department_id INTEGER REFERENCES departments(id),
  cost_center_id INTEGER REFERENCES cost_centers(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS budgets_company_period_idx
  ON budgets(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS budgets_scope_idx
  ON budgets(company_id, department_id, cost_center_id, account_id);
