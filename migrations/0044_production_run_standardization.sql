-- Production Run Module Standardization
-- Renames work_orders to production_runs, adds missing fields, creates costing tables

-- Step 1: Rename bom_lines to bom_items (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_lines' AND table_schema = 'public') THEN
    ALTER TABLE bom_lines RENAME TO bom_items;
  END IF;
END $$;

-- Step 2: Rename work_orders to production_runs (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders' AND table_schema = 'public') THEN
    ALTER TABLE work_orders RENAME TO production_runs;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_order_consumptions' AND table_schema = 'public') THEN
    ALTER TABLE work_order_consumptions RENAME TO production_run_consumptions;
  END IF;
END $$;

-- Step 3: Add missing fields to production_runs
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS sales_order_id INTEGER REFERENCES sales_orders(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS artwork_version_snapshot TEXT;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_start TIMESTAMP;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_completion TIMESTAMP;
-- Rename completedDate to actual_completion if it exists, otherwise add it
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_runs' AND column_name = 'completed_date') THEN
        ALTER TABLE production_runs RENAME COLUMN completed_date TO actual_completion;
    ELSE
        ALTER TABLE production_runs ADD COLUMN actual_completion TIMESTAMP;
    END IF;
END $$;

-- Step 4: Add costing fields to production_runs
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_material_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_labor_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS planned_overhead_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS actual_material_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS actual_labor_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS actual_overhead_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS variance_material DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS variance_labor DECIMAL(15,2) DEFAULT 0;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS variance_overhead DECIMAL(15,2) DEFAULT 0;

-- Step 5: Update status enum to include RELEASED and SETTLED
-- Note: PostgreSQL doesn't support ALTER TYPE ... ADD VALUE directly, so we'll handle this in application logic
-- The status field is text, so we can use the new values directly

-- Step 6: Add missing fields to manufacturing_material_transactions
ALTER TABLE manufacturing_material_transactions ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,2);
ALTER TABLE manufacturing_material_transactions ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP DEFAULT NOW();

-- Step 7: Create standard_costs table
CREATE TABLE IF NOT EXISTS standard_costs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  material_cost DECIMAL(15,2) DEFAULT 0,
  labor_cost DECIMAL(15,2) DEFAULT 0,
  overhead_cost DECIMAL(15,2) DEFAULT 0,
  total_cost DECIMAL(15,2) GENERATED ALWAYS AS (material_cost + labor_cost + overhead_cost) STORED,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, product_id, effective_from)
);

-- Step 8: Create time_confirmations table
CREATE TABLE IF NOT EXISTS time_confirmations (
  id SERIAL PRIMARY KEY,
  production_run_id INTEGER NOT NULL REFERENCES production_runs(id),
  work_center_id INTEGER NOT NULL REFERENCES manufacturing_work_centers(id),
  employee_id INTEGER REFERENCES employees(id),
  hours DECIMAL(10,2) NOT NULL,
  hourly_rate DECIMAL(15,2),
  labor_cost DECIMAL(15,2) GENERATED ALWAYS AS (hours * hourly_rate) STORED,
  posted_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  notes TEXT
);

-- Step 9: Create indexes for new tables
CREATE INDEX IF NOT EXISTS standard_costs_company_idx ON standard_costs(company_id);
CREATE INDEX IF NOT EXISTS standard_costs_product_idx ON standard_costs(product_id);
CREATE INDEX IF NOT EXISTS time_confirmations_production_run_idx ON time_confirmations(production_run_id);
CREATE INDEX IF NOT EXISTS time_confirmations_work_center_idx ON time_confirmations(work_center_id);
CREATE INDEX IF NOT EXISTS time_confirmations_employee_idx ON time_confirmations(employee_id);
CREATE INDEX IF NOT EXISTS production_runs_customer_idx ON production_runs(customer_id);
CREATE INDEX IF NOT EXISTS production_runs_sales_order_idx ON production_runs(sales_order_id);

-- Step 10: Update foreign key references in related tables
-- Update manufacturing_material_transactions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_material_transactions' AND column_name='work_order_id') THEN
    ALTER TABLE manufacturing_material_transactions RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;
ALTER TABLE manufacturing_material_transactions DROP CONSTRAINT IF EXISTS manufacturing_material_transactions_work_order_id_fkey;
ALTER TABLE manufacturing_material_transactions ADD CONSTRAINT manufacturing_material_transactions_production_run_id_fkey 
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id);

-- Update manufacturing_production_notes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_production_notes' AND column_name='work_order_id') THEN
    ALTER TABLE manufacturing_production_notes RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;
ALTER TABLE manufacturing_production_notes DROP CONSTRAINT IF EXISTS manufacturing_production_notes_work_order_id_fkey;
ALTER TABLE manufacturing_production_notes ADD CONSTRAINT manufacturing_production_notes_production_run_id_fkey 
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id);

-- Update manufacturing_production_attachments
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_production_attachments' AND column_name='work_order_id') THEN
    ALTER TABLE manufacturing_production_attachments RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;
ALTER TABLE manufacturing_production_attachments DROP CONSTRAINT IF EXISTS manufacturing_production_attachments_work_order_id_fkey;
ALTER TABLE manufacturing_production_attachments ADD CONSTRAINT manufacturing_production_attachments_production_run_id_fkey 
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id);

-- Update manufacturing_material_reservations
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_material_reservations' AND column_name='work_order_id') THEN
    ALTER TABLE manufacturing_material_reservations RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;
ALTER TABLE manufacturing_material_reservations DROP CONSTRAINT IF EXISTS manufacturing_material_reservations_work_order_id_fkey;
ALTER TABLE manufacturing_material_reservations ADD CONSTRAINT manufacturing_material_reservations_production_run_id_fkey 
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id);

-- Update manufacturing_production_schedule_lines
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='manufacturing_production_schedule_lines' AND column_name='work_order_id') THEN
    ALTER TABLE manufacturing_production_schedule_lines RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;
ALTER TABLE manufacturing_production_schedule_lines DROP CONSTRAINT IF EXISTS manufacturing_production_schedule_lines_work_order_id_fkey;
ALTER TABLE manufacturing_production_schedule_lines ADD CONSTRAINT manufacturing_production_schedule_lines_production_run_id_fkey 
  FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE SET NULL;

-- Update manufacturing_production_runs (merge into production_runs)
-- Data migration: move manufacturing_production_runs data into production_runs
-- This is a complex migration - we'll add fields to production_runs to accommodate the child table data
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS routing_operation_id INTEGER REFERENCES manufacturing_routing_operations(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS machine_id INTEGER REFERENCES manufacturing_machines(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES employees(id);
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS shift TEXT;
ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS downtime_minutes DECIMAL(10,2) DEFAULT 0;

-- Migrate data from manufacturing_production_runs to production_runs
INSERT INTO production_runs (
  company_id, bom_id, routing_id, status, planned_quantity, completed_quantity,
  routing_operation_id, machine_id, operator_id, shift, downtime_minutes,
  start_time, end_time, created_at
)
SELECT 
  pr.company_id, wo.bom_id, wo.routing_id, pr.status, pr.planned_quantity, pr.actual_quantity,
  pr.routing_operation_id, pr.machine_id, pr.operator_id, pr.shift, pr.downtime_minutes,
  pr.start_time, pr.end_time, pr.created_at
FROM manufacturing_production_runs pr
JOIN production_runs wo ON pr.work_order_id = wo.id
ON CONFLICT DO NOTHING;

-- Drop the old table after migration
-- DROP TABLE manufacturing_production_runs CASCADE;
-- Commented out for safety - can be dropped after verification

-- Step 11: Add comments for documentation
COMMENT ON TABLE production_runs IS 'Production runs - renamed from work_orders. Main production execution entity.';
COMMENT ON TABLE bom_items IS 'Bill of Materials component lines - renamed from bom_lines.';
COMMENT ON TABLE standard_costs IS 'Standard costs for products used for planned production costing.';
COMMENT ON TABLE time_confirmations IS 'Labor time confirmations for production runs, tracking work center and employee hours.';
