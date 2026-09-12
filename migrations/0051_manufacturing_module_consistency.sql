-- ==========================================================================
-- Migration 0051: Manufacturing Module Schema Consistency
-- Aligns live DB with shared/schema.ts for the manufacturing module:
--  1. bom_lines -> bom_items (rename; identical column shape)
--  2. Create manufacturing_material_transactions
--  3. Create manufacturing_production_notes
--  4. Create manufacturing_production_attachments
--  5. manufacturing_routings: add version
--  6. manufacturing_routing_operations: add sequence, operation_name, default_machine_id
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- Step 1: bom_lines -> bom_items
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bom_lines')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bom_items') THEN
    ALTER TABLE bom_lines RENAME TO bom_items;
    RAISE NOTICE 'Renamed bom_lines -> bom_items';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 2: manufacturing_material_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manufacturing_material_transactions (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER, -- Legacy FK kept for historical data; new records use goods_issues/goods_receipts
  production_run_id INTEGER REFERENCES production_runs(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL DEFAULT 'ISSUE', -- ISSUE, RETURN, FINISHED_GOOD, SCRAP, BY_PRODUCT, CO_PRODUCT
  quantity DECIMAL(12,4) NOT NULL,
  date TIMESTAMP DEFAULT NOW(),
  reason TEXT
);

-- ---------------------------------------------------------------------------
-- Step 3: manufacturing_production_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manufacturing_production_notes (
  id SERIAL PRIMARY KEY,
  production_run_id INTEGER NOT NULL REFERENCES production_runs(id),
  note_type TEXT NOT NULL DEFAULT 'GENERAL', -- GENERAL, DELAY, SCRAP, QUALITY
  content TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Step 4: manufacturing_production_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manufacturing_production_attachments (
  id SERIAL PRIMARY KEY,
  production_run_id INTEGER NOT NULL REFERENCES production_runs(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Step 5: manufacturing_routings -> version
-- ---------------------------------------------------------------------------
ALTER TABLE manufacturing_routings ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0';

-- ---------------------------------------------------------------------------
-- Step 6: manufacturing_routing_operations -> sequence, operation_name, default_machine_id
-- ---------------------------------------------------------------------------
ALTER TABLE manufacturing_routing_operations ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE manufacturing_routing_operations ADD COLUMN IF NOT EXISTS operation_name TEXT NOT NULL DEFAULT '';
ALTER TABLE manufacturing_routing_operations ADD COLUMN IF NOT EXISTS default_machine_id INTEGER REFERENCES manufacturing_machines(id);

-- Backfill operation_name from legacy name column where populated
UPDATE manufacturing_routing_operations SET operation_name = name WHERE operation_name = '' AND name IS NOT NULL AND name <> '';

-- ==========================================================================
-- Sanity: final consistency snapshot
-- ==========================================================================
DO $$
DECLARE v_bom_items TEXT := (SELECT to_regclass('public.bom_items'));
DECLARE v_mmt TEXT := (SELECT to_regclass('public.manufacturing_material_transactions'));
BEGIN
  RAISE NOTICE 'bom_items exists: %', (v_bom_items IS NOT NULL);
  RAISE NOTICE 'manufacturing_material_transactions exists: %', (v_mmt IS NOT NULL);
END $$;
