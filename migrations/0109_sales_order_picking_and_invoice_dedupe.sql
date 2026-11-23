-- Sales order fulfilment: proper picking/dispatch records and one active
-- invoice per sales order. Also repairs the legacy quotation links which
-- pointed at invoices instead of real quotations.

ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS picked_quantity numeric(10, 2) DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS sales_pick_lists (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  sales_order_id integer NOT NULL REFERENCES sales_orders(id),
  pick_number text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  location_id integer REFERENCES inventory_locations(id),
  delivery_number text,
  recipient_name text,
  delivery_notes text,
  picked_by uuid REFERENCES users(id),
  picked_at timestamp,
  dispatched_by uuid REFERENCES users(id),
  dispatched_at timestamp,
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT sales_pick_lists_company_number_unique UNIQUE (company_id, pick_number)
);

CREATE TABLE IF NOT EXISTS sales_pick_list_items (
  id serial PRIMARY KEY,
  pick_list_id integer NOT NULL REFERENCES sales_pick_lists(id) ON DELETE CASCADE,
  sales_order_item_id integer NOT NULL REFERENCES sales_order_items(id),
  product_id integer REFERENCES products(id),
  description text NOT NULL,
  ordered_quantity numeric(10, 2) NOT NULL,
  picked_quantity numeric(10, 2) DEFAULT 0 NOT NULL,
  notes text
);

CREATE INDEX IF NOT EXISTS sales_pick_lists_company_idx ON sales_pick_lists (company_id);
CREATE INDEX IF NOT EXISTS sales_pick_lists_sales_order_idx ON sales_pick_lists (sales_order_id);
CREATE INDEX IF NOT EXISTS sales_pick_list_items_pick_list_idx ON sales_pick_list_items (pick_list_id);
CREATE INDEX IF NOT EXISTS sales_pick_list_items_order_item_idx ON sales_pick_list_items (sales_order_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_pick_lists_one_active_per_sales_order_idx
  ON sales_pick_lists (sales_order_id)
  WHERE status <> 'CANCELLED';

-- Cancel duplicate active invoices for the same sales order. Keep the entry
-- that is already posted to the ledger first, then a FiscalInvoice, then the
-- oldest record. This preserves accounting history instead of deleting rows.
UPDATE invoices i
SET status = 'cancelled',
    notes = concat_ws(' | ', notes,
      'Automatically cancelled by migration 0109: duplicate active invoice for this sales order.')
WHERE i.sales_order_id IS NOT NULL
  AND COALESCE(i.status, '') <> 'cancelled'
  AND i.id NOT IN (
    SELECT DISTINCT ON (x.sales_order_id) x.id
    FROM invoices x
    WHERE x.sales_order_id IS NOT NULL
      AND COALESCE(x.status, '') <> 'cancelled'
    ORDER BY x.sales_order_id,
      CASE WHEN EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'INVOICE' AND je.reference_id = x.id::text
      ) THEN 0 ELSE 1 END,
      CASE WHEN x.transaction_type = 'FiscalInvoice' THEN 0 ELSE 1 END,
      x.created_at ASC,
      x.id ASC
  );

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_per_sales_order_idx
  ON invoices (sales_order_id)
  WHERE sales_order_id IS NOT NULL AND COALESCE(status, '') <> 'cancelled';

-- Repoint quotation links to the real quotation tables. Legacy values that do
-- not resolve to a real quotation are cleared rather than silently mislinked.
DO $$
DECLARE
  constraint_name record;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'sales_orders'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[
        (SELECT a.attnum FROM pg_attribute a
         WHERE a.attrelid = 'sales_orders'::regclass AND a.attname = 'quotation_id')
      ]
  LOOP
    EXECUTE format('ALTER TABLE sales_orders DROP CONSTRAINT %I', constraint_name.conname);
  END LOOP;
END $$;

UPDATE sales_orders so
SET quotation_id = NULL
WHERE so.quotation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.id = so.quotation_id);

ALTER TABLE sales_orders
  ADD CONSTRAINT sales_orders_quotation_id_quotations_fkey
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;

DO $$
DECLARE
  constraint_name record;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'sales_order_items'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[
        (SELECT a.attnum FROM pg_attribute a
         WHERE a.attrelid = 'sales_order_items'::regclass AND a.attname = 'quotation_item_id')
      ]
  LOOP
    EXECUTE format('ALTER TABLE sales_order_items DROP CONSTRAINT %I', constraint_name.conname);
  END LOOP;
END $$;

UPDATE sales_order_items soi
SET quotation_item_id = NULL
WHERE soi.quotation_item_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM quotation_items qi WHERE qi.id = soi.quotation_item_id);

ALTER TABLE sales_order_items
  ADD CONSTRAINT sales_order_items_quotation_item_id_quotation_items_fkey
  FOREIGN KEY (quotation_item_id) REFERENCES quotation_items(id) ON DELETE SET NULL;
