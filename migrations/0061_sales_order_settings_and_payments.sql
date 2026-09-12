-- Sales Order Settings and Payments Enhancement Migration

-- Make invoice_id nullable in payments table for sales order deposit payments
ALTER TABLE payments ALTER COLUMN invoice_id DROP NOT NULL;

-- Add sales_order_id and customer_id to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sales_order_id INTEGER REFERENCES sales_orders(id),
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS payments_sales_order_idx ON payments(sales_order_id);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments(customer_id);

-- Add payment_method and payment_reference to lay_by_schedules
ALTER TABLE lay_by_schedules
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- Sales Order Settings table
CREATE TABLE IF NOT EXISTS sales_order_settings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  air_preorder_min_deposit_pct DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  sea_preorder_min_deposit_pct DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  layby_min_deposit_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  layby_default_duration_months INTEGER NOT NULL DEFAULT 3,
  deposit_gl_account_id INTEGER REFERENCES accounts(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_order_settings_company_idx ON sales_order_settings(company_id);
