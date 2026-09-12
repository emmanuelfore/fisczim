-- 1. Rename work_orders -> production_runs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_orders')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'production_runs') THEN
    ALTER TABLE work_orders RENAME TO production_runs;
  END IF;
END $$;

-- 2. Rename work_order_consumptions -> production_run_consumptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_order_consumptions')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'production_run_consumptions') THEN
    ALTER TABLE work_order_consumptions RENAME TO production_run_consumptions;
  END IF;
END $$;

-- 3. Rename FK in production_run_consumptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_run_consumptions' AND column_name = 'work_order_id') THEN
    ALTER TABLE production_run_consumptions RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;

-- 4. Rename end_date to actual_completion
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_runs' AND column_name = 'end_date')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_runs' AND column_name = 'actual_completion') THEN
    ALTER TABLE production_runs RENAME COLUMN end_date TO actual_completion;
  END IF;
END $$;

-- 5. Rename FK in manufacturing_material_transactions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_material_transactions' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_material_transactions RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;

-- 6. Rename FK in manufacturing_production_notes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_notes' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_production_notes RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;

-- 7. Rename FK in manufacturing_production_attachments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_attachments' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_production_attachments RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;

-- 8. Rename FK in manufacturing_material_reservations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_material_reservations' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_material_reservations RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;

-- 9. Rename FK in manufacturing_production_schedule_lines
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturing_production_schedule_lines' AND column_name = 'work_order_id') THEN
    ALTER TABLE manufacturing_production_schedule_lines RENAME COLUMN work_order_id TO production_run_id;
  END IF;
END $$;
