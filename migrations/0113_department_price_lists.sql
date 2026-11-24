-- Department/customer-specific selling price lists.
-- Null department_id / customer_id on a list means "all departments" /
-- "all customers" respectively. Item rows are tiered by min_quantity and may
-- optionally target a product variation. All date ranges are inclusive and a
-- null bound means unbounded.

CREATE TABLE IF NOT EXISTS price_lists (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  department_id INTEGER REFERENCES departments(id),
  customer_id INTEGER REFERENCES customers(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS price_lists_company_code_idx
  ON price_lists(company_id, code);
CREATE INDEX IF NOT EXISTS price_lists_company_idx
  ON price_lists(company_id);
CREATE INDEX IF NOT EXISTS price_lists_scope_idx
  ON price_lists(company_id, department_id, customer_id);

CREATE TABLE IF NOT EXISTS price_list_items (
  id SERIAL PRIMARY KEY,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variation_id INTEGER REFERENCES product_variations(id),
  unit_price NUMERIC(15,2) NOT NULL,
  min_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMP,
  effective_to TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS price_list_items_scope_idx
  ON price_list_items(price_list_id, product_id, COALESCE(variation_id, 0), min_quantity);
CREATE INDEX IF NOT EXISTS price_list_items_list_idx
  ON price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS price_list_items_product_idx
  ON price_list_items(product_id);
