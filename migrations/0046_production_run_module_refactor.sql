-- ==========================================================================
-- Migration 0046: Production Run Module Refactor
-- Renames work_orders → production_runs (unified entity)
-- Adds: customer/SO linkage, costing fields, state machine extension
-- Creates: standard_costs, time_confirmations, goods_issues, goods_receipts
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Rename work_orders → production_runs (only if not already done)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_orders')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'production_runs') THEN
    ALTER TABLE work_orders RENAME TO production_runs;
    RAISE NOTICE 'Renamed work_orders → production_runs';
  ELSE
    RAISE NOTICE 'production_runs already exists or work_orders not found — skipping rename';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 2: Rename work_order_consumptions → production_run_consumptions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_order_consumptions')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'production_run_consumptions') THEN
    ALTER TABLE work_order_consumptions RENAME TO production_run_consumptions;
    RAISE NOTICE 'Renamed work_order_consumptions → production_run_consumptions';
  END IF;
END $$;

-- Rename the FK column in production_run_consumptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_run_consumptions' AND column_name = 'work_order_id') THEN
    ALTER TABLE production_run_consumptions RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 3: Rename bom_lines → bom_items (spec alignment)
-- ---------------------------------------------------------------------------
-- NOTE: Kept as bom_lines in schema.ts for now (DB table name unchanged)
-- Uncomment to apply rename if desired:
-- DO $$
-- BEGIN
--   IF EXISTS (...bom_lines...) AND NOT EXISTS (...bom_items...) THEN
--     ALTER TABLE bom_lines RENAME TO bom_items;
--   END IF;
-- END $$;

-- ---------------------------------------------------------------------------
-- Step 4: Add missing columns to production_runs
-- ---------------------------------------------------------------------------

-- New identifier (self-reference for rework)
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS parent_production_run_id INTEGER;

-- Customer / Sales Order linkage
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS sales_order_id INTEGER REFERENCES sales_orders(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS artwork_version_snapshot TEXT;

-- Scheduling columns
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_start TIMESTAMP;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_completion TIMESTAMP;

-- Rename end_date → actual_completion (or add if missing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_runs' AND column_name = 'end_date')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_runs' AND column_name = 'actual_completion') THEN
    ALTER TABLE production_runs RENAME COLUMN end_date TO actual_completion;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_runs' AND column_name = 'actual_completion') THEN
    ALTER TABLE production_runs ADD COLUMN actual_completion TIMESTAMP;
  END IF;
END $$;

-- Rename start_date → planned_start_legacy (or handle separately)
-- NOTE: start_date is kept as-is; planned_start is the new standardised column

-- Absorbed operation fields (from manufacturing_production_runs)
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS routing_operation_id INTEGER REFERENCES manufacturing_routing_operations(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS machine_id INTEGER REFERENCES manufacturing_machines(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES employees(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS shift TEXT;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS downtime_minutes DECIMAL(10,2) DEFAULT 0;

-- Quantity tracking
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS good_quantity DECIMAL(12,4) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS rejected_quantity DECIMAL(12,4) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS completion_percentage DECIMAL(5,2) DEFAULT 0;

-- Planned cost snapshot (set at creation)
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_material_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_labor_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_overhead_cost DECIMAL(15,2) DEFAULT 0;

-- Actual costs (accumulated during production)
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS actual_material_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS actual_labor_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS actual_overhead_cost DECIMAL(15,2) DEFAULT 0;

-- Variances (set on COMPLETED)
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS variance_material DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS variance_labor DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS variance_overhead DECIMAL(15,2) DEFAULT 0;

-- Audit
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- Step 5: Add indexes on production_runs
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS production_runs_company_idx ON production_runs(company_id);
CREATE INDEX IF NOT EXISTS production_runs_customer_idx ON production_runs(customer_id);
CREATE INDEX IF NOT EXISTS production_runs_sales_order_idx ON production_runs(sales_order_id);
CREATE INDEX IF NOT EXISTS production_runs_status_idx ON production_runs(status);

-- ---------------------------------------------------------------------------
-- Step 6: Update FK references in related tables
--         work_order_id → production_run_id where applicable
-- ---------------------------------------------------------------------------

-- manufacturing_material_transactions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_material_transactions' AND column_name = 'work_order_id') THEN
    -- Drop old FK constraint first
    ALTER TABLE manufacturing_material_transactions
      DROP CONSTRAINT IF EXISTS manufacturing_material_transactions_work_order_id_fkey;
    -- Add production_run_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_material_transactions' AND column_name = 'production_run_id') THEN
      ALTER TABLE manufacturing_material_transactions ADD COLUMN production_run_id INTEGER REFERENCES production_runs(id);
    END IF;
    -- Copy data
    UPDATE manufacturing_material_transactions SET production_run_id = work_order_id WHERE production_run_id IS NULL;
  END IF;
END $$;

-- manufacturing_production_notes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_notes' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_production_notes DROP CONSTRAINT IF EXISTS manufacturing_production_notes_work_order_id_fkey;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_notes' AND column_name = 'production_run_id') THEN
      ALTER TABLE manufacturing_production_notes ADD COLUMN production_run_id INTEGER REFERENCES production_runs(id);
    END IF;
    UPDATE manufacturing_production_notes SET production_run_id = work_order_id WHERE production_run_id IS NULL;
    ALTER TABLE manufacturing_production_notes ALTER COLUMN production_run_id SET NOT NULL;
  END IF;
END $$;

-- manufacturing_production_attachments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_attachments' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_production_attachments DROP CONSTRAINT IF EXISTS manufacturing_production_attachments_work_order_id_fkey;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_attachments' AND column_name = 'production_run_id') THEN
      ALTER TABLE manufacturing_production_attachments ADD COLUMN production_run_id INTEGER REFERENCES production_runs(id);
    END IF;
    UPDATE manufacturing_production_attachments SET production_run_id = work_order_id WHERE production_run_id IS NULL;
    ALTER TABLE manufacturing_production_attachments ALTER COLUMN production_run_id SET NOT NULL;
  END IF;
END $$;

-- manufacturing_material_reservations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_material_reservations' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_material_reservations DROP CONSTRAINT IF EXISTS manufacturing_material_reservations_work_order_id_fkey;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_material_reservations' AND column_name = 'production_run_id') THEN
      ALTER TABLE manufacturing_material_reservations ADD COLUMN production_run_id INTEGER REFERENCES production_runs(id);
    END IF;
    UPDATE manufacturing_material_reservations SET production_run_id = work_order_id WHERE production_run_id IS NULL;
    ALTER TABLE manufacturing_material_reservations ALTER COLUMN production_run_id SET NOT NULL;
  END IF;
END $$;

-- manufacturing_production_schedule_lines
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_schedule_lines' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_production_schedule_lines DROP CONSTRAINT IF EXISTS manufacturing_production_schedule_lines_work_order_id_fkey;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_schedule_lines' AND column_name = 'production_run_id') THEN
      ALTER TABLE manufacturing_production_schedule_lines ADD COLUMN production_run_id INTEGER REFERENCES production_runs(id) ON DELETE SET NULL;
    END IF;
    UPDATE manufacturing_production_schedule_lines SET production_run_id = work_order_id WHERE production_run_id IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 7: Create standard_costs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS standard_costs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  material_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  labor_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  overhead_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT standard_costs_company_product_from_idx UNIQUE (company_id, product_id, effective_from)
);
CREATE INDEX IF NOT EXISTS standard_costs_company_idx ON standard_costs(company_id);
CREATE INDEX IF NOT EXISTS standard_costs_product_idx ON standard_costs(product_id);

-- ---------------------------------------------------------------------------
-- Step 8: Create time_confirmations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_confirmations (
  id SERIAL PRIMARY KEY,
  production_run_id INTEGER NOT NULL REFERENCES production_runs(id),
  work_center_id INTEGER NOT NULL REFERENCES manufacturing_work_centers(id),
  employee_id INTEGER REFERENCES employees(id),
  hours DECIMAL(10,2) NOT NULL,
  hourly_rate DECIMAL(15,2),
  labor_cost DECIMAL(15,2),
  overhead_cost DECIMAL(15,2),
  posted_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS time_confirmations_production_run_idx ON time_confirmations(production_run_id);
CREATE INDEX IF NOT EXISTS time_confirmations_work_center_idx ON time_confirmations(work_center_id);
CREATE INDEX IF NOT EXISTS time_confirmations_employee_idx ON time_confirmations(employee_id);

-- ---------------------------------------------------------------------------
-- Step 9: Create goods_issues
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goods_issues (
  id SERIAL PRIMARY KEY,
  production_run_id INTEGER NOT NULL REFERENCES production_runs(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER REFERENCES inventory_locations(id),
  quantity DECIMAL(12,4) NOT NULL,
  unit_cost DECIMAL(15,2),
  total_cost DECIMAL(15,2),
  type TEXT NOT NULL DEFAULT 'ISSUE',  -- ISSUE, RETURN, SCRAP
  posted_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS goods_issues_production_run_idx ON goods_issues(production_run_id);
CREATE INDEX IF NOT EXISTS goods_issues_product_idx ON goods_issues(product_id);

-- ---------------------------------------------------------------------------
-- Step 10: Create goods_receipts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goods_receipts (
  id SERIAL PRIMARY KEY,
  production_run_id INTEGER NOT NULL REFERENCES production_runs(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER REFERENCES inventory_locations(id),
  customer_id INTEGER REFERENCES customers(id),
  quantity DECIMAL(12,4) NOT NULL,
  unit_cost DECIMAL(15,2),
  total_cost DECIMAL(15,2),
  posted_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS goods_receipts_production_run_idx ON goods_receipts(production_run_id);
CREATE INDEX IF NOT EXISTS goods_receipts_product_idx ON goods_receipts(product_id);
CREATE INDEX IF NOT EXISTS goods_receipts_customer_idx ON goods_receipts(customer_id);

-- ---------------------------------------------------------------------------
-- Step 11: Table comments
-- ---------------------------------------------------------------------------
COMMENT ON TABLE production_runs IS 'Unified production run entity (renamed from work_orders). Absorbs manufacturing_production_runs operation fields.';
COMMENT ON TABLE standard_costs IS 'Standard planned costs per product, versioned by effective_from date. Used to snapshot planned costs at production run creation.';
COMMENT ON TABLE time_confirmations IS 'Labor time bookings against production runs. Drives actual_labor_cost and actual_overhead_cost accumulation.';
COMMENT ON TABLE goods_issues IS 'Raw material pulls from inventory for a production run. Each posting deducts inventory_location_stocks.';
COMMENT ON TABLE goods_receipts IS 'Finished goods credited to inventory on production run completion. Routes to customer_stock when customer_id is set.';
