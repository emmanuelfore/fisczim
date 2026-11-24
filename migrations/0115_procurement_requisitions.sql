-- Departmental purchase requisitions, supplier quote comparison and controlled
-- conversion into purchase orders. All dimensions are stored on the requisition
-- so manager approval evidence and the eventual PO carry the same analytical
-- code as the requesting department.

CREATE TABLE IF NOT EXISTS purchase_requisitions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  requisition_number TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  cost_center_id INTEGER REFERENCES cost_centers(id),
  location_id INTEGER REFERENCES inventory_locations(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  requested_by UUID NOT NULL REFERENCES users(id),
  needed_by DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  estimated_total NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  selected_quote_id INTEGER,
  purchase_order_id INTEGER REFERENCES purchase_orders(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requisitions_company_number_idx
  ON purchase_requisitions(company_id, requisition_number);
CREATE INDEX IF NOT EXISTS purchase_requisitions_company_idx
  ON purchase_requisitions(company_id);

CREATE TABLE IF NOT EXISTS purchase_requisition_items (
  id SERIAL PRIMARY KEY,
  requisition_id INTEGER NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS purchase_requisition_items_requisition_idx
  ON purchase_requisition_items(requisition_id);

CREATE TABLE IF NOT EXISTS supplier_quotes (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  requisition_id INTEGER NOT NULL REFERENCES purchase_requisitions(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  quote_number TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  total NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  received_date DATE,
  notes TEXT,
  selected_by UUID REFERENCES users(id),
  selected_at TIMESTAMP,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_quotes_company_number_idx
  ON supplier_quotes(company_id, quote_number);
CREATE INDEX IF NOT EXISTS supplier_quotes_company_idx
  ON supplier_quotes(company_id);
CREATE INDEX IF NOT EXISTS supplier_quotes_requisition_idx
  ON supplier_quotes(requisition_id);

CREATE TABLE IF NOT EXISTS supplier_quote_items (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES supplier_quotes(id) ON DELETE CASCADE,
  requisition_item_id INTEGER NOT NULL REFERENCES purchase_requisition_items(id),
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(15,2) NOT NULL,
  lead_time_days INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS supplier_quote_items_quote_idx
  ON supplier_quote_items(quote_id);
