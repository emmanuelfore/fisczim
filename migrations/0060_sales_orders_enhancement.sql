-- Sales Orders Enhancement Migration
-- Phase 1: Extend sales_orders table with new columns

-- Make customer_id nullable for Cash & Carry orders
ALTER TABLE sales_orders ALTER COLUMN customer_id DROP NOT NULL;

-- Add order type and extension columns
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'cash_and_carry',
  ADD COLUMN IF NOT EXISTS preorder_type TEXT,
  ADD COLUMN IF NOT EXISTS deposit_pct DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS deposit_paid DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS expected_arrival DATE,
  ADD COLUMN IF NOT EXISTS shipment_id INTEGER,
  ADD COLUMN IF NOT EXISTS lay_by_duration INTEGER,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Add index for order type filtering
CREATE INDEX IF NOT EXISTS sales_orders_order_type_idx ON sales_orders(order_type);
CREATE INDEX IF NOT EXISTS sales_orders_approval_status_idx ON sales_orders(approval_status);

-- Lay-by payment schedule
CREATE TABLE IF NOT EXISTS lay_by_schedules (
  id SERIAL PRIMARY KEY,
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
  instalment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount_due DECIMAL(15,2) NOT NULL,
  amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lay_by_schedules_sales_order_idx ON lay_by_schedules(sales_order_id);

-- Stock reservations for preorders
CREATE TABLE IF NOT EXISTS stock_reservations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_reserved DECIMAL(15,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  reserved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  released_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS stock_reservations_sales_order_idx ON stock_reservations(sales_order_id);
CREATE INDEX IF NOT EXISTS stock_reservations_product_idx ON stock_reservations(product_id);

-- Compound products (bundles)
CREATE TABLE IF NOT EXISTS compound_products (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  selling_price DECIMAL(15,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS compound_products_company_idx ON compound_products(company_id);

CREATE TABLE IF NOT EXISTS compound_product_items (
  id SERIAL PRIMARY KEY,
  compound_product_id INTEGER NOT NULL REFERENCES compound_products(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(10,4) NOT NULL
);
