-- Department / cost centre / warehouse foundation for PRO ELECTRICS.
-- All links are nullable so existing tenants are unaffected until data is set.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL;

ALTER TABLE inventory_locations
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id integer REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id integer REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id integer REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id integer REFERENCES cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS departments_cost_center_idx ON departments (cost_center_id);
CREATE INDEX IF NOT EXISTS products_department_idx ON products (department_id);
CREATE INDEX IF NOT EXISTS products_cost_center_idx ON products (cost_center_id);
CREATE INDEX IF NOT EXISTS inventory_locations_department_idx ON inventory_locations (department_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_department_idx ON inventory_transactions (department_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_cost_center_idx ON inventory_transactions (cost_center_id);
CREATE INDEX IF NOT EXISTS quotations_department_idx ON quotations (department_id);
CREATE INDEX IF NOT EXISTS quotations_cost_center_idx ON quotations (cost_center_id);
CREATE INDEX IF NOT EXISTS sales_orders_department_idx ON sales_orders (department_id);
CREATE INDEX IF NOT EXISTS sales_orders_cost_center_idx ON sales_orders (cost_center_id);
CREATE INDEX IF NOT EXISTS invoices_department_idx ON invoices (department_id);
CREATE INDEX IF NOT EXISTS invoices_cost_center_idx ON invoices (cost_center_id);
CREATE INDEX IF NOT EXISTS purchase_orders_department_idx ON purchase_orders (department_id);
CREATE INDEX IF NOT EXISTS purchase_orders_cost_center_idx ON purchase_orders (cost_center_id);
CREATE INDEX IF NOT EXISTS expenses_department_idx ON expenses (department_id);
CREATE INDEX IF NOT EXISTS expenses_cost_center_idx ON expenses (cost_center_id);

-- Backfill links from the existing normalized cost centres where names match.
UPDATE departments d
SET cost_center_id = cc.id
FROM cost_centers cc
WHERE d.company_id = cc.company_id
  AND d.cost_center_id IS NULL
  AND lower(regexp_replace(d.name, '[^a-z0-9]+', '', 'g')) =
      lower(regexp_replace(cc.name, '[^a-z0-9]+', '', 'g'));

UPDATE inventory_locations il
SET department_id = d.id
FROM departments d
WHERE il.company_id = d.company_id
  AND il.department_id IS NULL
  AND lower(regexp_replace(il.name, '[^a-z0-9]+', '', 'g')) =
      lower(regexp_replace(d.name, '[^a-z0-9]+', '', 'g'));
