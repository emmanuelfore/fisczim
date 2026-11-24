-- Quotations capture the dispatch/stock location alongside their analytical
-- dimensions, so the value survives approval and conversion to a sales order.
-- Nullable to keep legacy tenants and existing documents untouched.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS location_id integer REFERENCES inventory_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotations_location_idx ON quotations (location_id);
