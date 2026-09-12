ALTER TABLE products
  ADD COLUMN IF NOT EXISTS oem_part_number text,
  ADD COLUMN IF NOT EXISTS supplier_part_number text,
  ADD COLUMN IF NOT EXISTS alternate_part_numbers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vehicle_fitment jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fitment_notes text,
  ADD COLUMN IF NOT EXISTS serial_tracking_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS warranty_tracking_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS warranty_months integer DEFAULT 0;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS warranty_months integer,
  ADD COLUMN IF NOT EXISTS warranty_expires_at timestamp;

CREATE TABLE IF NOT EXISTS product_serial_numbers (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  branch_id integer REFERENCES branches(id),
  product_id integer NOT NULL REFERENCES products(id),
  serial_number text NOT NULL,
  status text NOT NULL DEFAULT 'IN_STOCK',
  supplier_id integer REFERENCES suppliers(id),
  received_inventory_transaction_id integer,
  sold_invoice_id integer REFERENCES invoices(id),
  sold_invoice_item_id integer REFERENCES invoice_items(id),
  sold_at timestamp,
  warranty_expires_at timestamp,
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_serial_numbers_company_serial_unique
  ON product_serial_numbers(company_id, serial_number);
CREATE INDEX IF NOT EXISTS product_serial_numbers_company_idx ON product_serial_numbers(company_id);
CREATE INDEX IF NOT EXISTS product_serial_numbers_product_idx ON product_serial_numbers(product_id);
CREATE INDEX IF NOT EXISTS product_serial_numbers_status_idx ON product_serial_numbers(status);

CREATE TABLE IF NOT EXISTS warranty_claims (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  branch_id integer REFERENCES branches(id),
  customer_id integer REFERENCES customers(id),
  product_id integer NOT NULL REFERENCES products(id),
  invoice_id integer REFERENCES invoices(id),
  invoice_item_id integer REFERENCES invoice_items(id),
  serial_number_id integer REFERENCES product_serial_numbers(id),
  claim_number text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  reason text NOT NULL,
  resolution text,
  received_at timestamp DEFAULT now(),
  resolved_at timestamp,
  created_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warranty_claims_company_idx ON warranty_claims(company_id);
CREATE INDEX IF NOT EXISTS warranty_claims_claim_number_idx ON warranty_claims(claim_number);
CREATE INDEX IF NOT EXISTS warranty_claims_status_idx ON warranty_claims(status);

CREATE TABLE IF NOT EXISTS laybys (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  branch_id integer REFERENCES branches(id),
  customer_id integer NOT NULL REFERENCES customers(id),
  layby_number text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  subtotal decimal(10,2) NOT NULL,
  tax_amount decimal(10,2) NOT NULL DEFAULT '0.00',
  total decimal(10,2) NOT NULL,
  deposit_required decimal(10,2) DEFAULT '0.00',
  paid_amount decimal(10,2) NOT NULL DEFAULT '0.00',
  currency text NOT NULL DEFAULT 'USD',
  expiry_date timestamp,
  completed_invoice_id integer REFERENCES invoices(id),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS laybys_company_idx ON laybys(company_id);
CREATE INDEX IF NOT EXISTS laybys_customer_idx ON laybys(customer_id);
CREATE INDEX IF NOT EXISTS laybys_number_idx ON laybys(layby_number);
CREATE INDEX IF NOT EXISTS laybys_status_idx ON laybys(status);

CREATE TABLE IF NOT EXISTS layby_items (
  id serial PRIMARY KEY,
  layby_id integer NOT NULL REFERENCES laybys(id),
  product_id integer NOT NULL REFERENCES products(id),
  description text NOT NULL,
  quantity decimal(10,2) NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  tax_rate decimal(5,2) NOT NULL DEFAULT '0.00',
  line_total decimal(10,2) NOT NULL,
  serial_number_id integer REFERENCES product_serial_numbers(id),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS layby_items_layby_idx ON layby_items(layby_id);
CREATE INDEX IF NOT EXISTS layby_items_product_idx ON layby_items(product_id);

CREATE TABLE IF NOT EXISTS layby_payments (
  id serial PRIMARY KEY,
  layby_id integer NOT NULL REFERENCES laybys(id),
  company_id integer NOT NULL REFERENCES companies(id),
  branch_id integer REFERENCES branches(id),
  amount decimal(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  payment_method text NOT NULL,
  reference text,
  notes text,
  payment_date timestamp NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS layby_payments_layby_idx ON layby_payments(layby_id);
CREATE INDEX IF NOT EXISTS layby_payments_company_idx ON layby_payments(company_id);
