-- 0084_declared_primary_keys_remaining.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0084_declared_primary_keys_remaining.sql
--
-- WHY THIS EXISTS
-- 0076 and 0080 each keyed the few tables a feature happened to need. The rest of the
-- drift is the same and far larger: of the 194 tables in the application schema, 103 had no
-- primary key at all, even though shared/schema.ts declares `serial("id").primaryKey()`
-- on every one of them. Unkeyed tables mean three concrete losses, not a tidiness issue:
--
--   * Nothing may reference them. PostgreSQL only lets a foreign key point at a unique
--     key, which is why 0074/0075/0078 had to create their columns without the
--     constraints the schema declared.
--   * `WHERE id = ?` has no one-row guarantee. The app writes updates and deletes by id
--     everywhere, silently assuming a key that is not there.
--   * Nothing stops a duplicate id being written. Where that has already happened
--     (see EXCLUDED below) it is only visible because this sweep went and looked.
--
-- PREFLIGHT, verified against production on 2026-11-05 for every table listed here:
--   * `id` exists, is NOT NULL, and is defaulted by its own sequence;
--   * 0 rows share an id value, 0 rows have a null id;
--   * no sequence is behind its table's max(id), so declaring the key cannot start
--     throwing duplicate-key errors on the app's very next insert;
--   * no table in this list is referenced by an existing foreign key, so no constraint
--     has to be rebuilt.
-- 101 tables, 122,881 rows in total.
--
-- EXCLUDED ON PURPOSE (2): these have colliding ids, so a primary key is a
-- human decision about which row keeps which id, not a DDL job:
--   * ledger_entries: 692 duplicated id value(s) across 85,403 rows.
--   * pos_shifts: 1 duplicated id value(s) across 323 rows.
--
-- ledger_entries holds two genuinely different journal lines under one id (id 1 is both a
-- 150.50 USD debit from May and a 1.10 USD debit from August), and pos_shifts has id 1 in
-- both company 21 and company 91 - an unkeyed cross-tenant collision, where a shift closed
-- by id could address either tenant. Both need their rows renumbered and their sequences
-- reset before they can be keyed, in a migration with a rollback that a human has read.
--
-- Reversible: the rollback at the bottom drops every key this file adds. None of these
-- tables is referenced by a foreign key yet, so they all come away cleanly.

BEGIN;

SET LOCAL search_path TO public;

-- 1. Preflight every target before altering any of them. A duplicate or null id is a
--    decision about real data, so name the table and the count instead of letting
--    Postgres fail halfway through an index build with a raw error.
DO $$
DECLARE
  offenders text;
  row record;
  n bigint;
  found_schema text;
BEGIN
  FOR row IN
    SELECT unnest(ARRAY[
      'landed_cost_allocations', 'landed_cost_documents', 'lay_by_schedules', 'layby_items',
      'layby_payments', 'laybys', 'leave_balances', 'leave_requests',
      'loan_installments', 'manufacturing_machines', 'manufacturing_material_reservations', 'manufacturing_material_shortages',
      'manufacturing_material_transactions', 'manufacturing_mrp_recommendations', 'manufacturing_mrp_runs', 'manufacturing_production_attachments',
      'manufacturing_production_notes', 'manufacturing_production_schedule_lines', 'manufacturing_production_schedules', 'manufacturing_routing_operations',
      'manufacturing_routings', 'manufacturing_work_centers', 'mobile_money_transactions', 'nec_sectors_config',
      'payment_allocations', 'payment_batch_details', 'payment_batches', 'payments',
      'payroll_allowances', 'payroll_attendance_imports', 'payroll_calculation_audits', 'payroll_deduction_types',
      'payroll_deductions', 'payroll_earning_types', 'payroll_elements', 'payroll_import_batches',
      'payroll_import_rows', 'payroll_integration_events', 'payroll_pay_grade_steps', 'payroll_recurring_items',
      'payroll_remittances', 'payroll_report_exports', 'payroll_report_validation_issues', 'payroll_salary_structures',
      'payroll_statutory_deadlines', 'payroll_statutory_reports', 'payroll_statutory_rules', 'payroll_tax_brackets',
      'payroll_tax_tables', 'payslip_documents', 'pos_holds', 'pos_shift_transactions',
      'price_adjustments', 'product_batches', 'product_categories', 'product_serial_numbers',
      'product_variations', 'production_run_consumptions', 'production_runs', 'provisions',
      'purchase_order_items', 'purchase_orders', 'purchase_return_items', 'purchase_returns',
      'quotation_items', 'quotations', 'recipe_items', 'recurring_invoices',
      'reset_tokens', 'restaurant_sections', 'restaurant_tables', 'revenue_contracts',
      'sales_order_audit_logs', 'sales_order_items', 'sales_order_settings', 'sales_orders',
      'scheduled_reports', 'standard_costs', 'stock_allocations', 'stock_reservations',
      'stock_take_items', 'stock_takes', 'stock_transfer_items', 'stock_transfers',
      'subscriptions', 'supplier_invoice_items', 'supplier_invoices', 'supplier_payment_allocations',
      'supplier_payments', 'suppliers', 'tax_categories', 'tax_obligations',
      'tax_rate_history', 'tax_tables_config', 'tenant_integration_credentials', 'time_confirmations',
      'validation_errors', 'warranty_claims', 'withholding_tax_certificates', 'withholding_tax_rates',
      'zimra_logs'
    ]) AS table_name
  LOOP
    -- Unqualified names resolve through the search_path, and this database keeps a second
    -- `users` (keyed, Supabase's own) in the `auth` schema. Pin every target to the
    -- application schema before touching it, or a same-named table elsewhere takes the lock.
    SELECT n.nspname INTO found_schema
      FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace
     WHERE k.oid = to_regclass(row.table_name);
    IF found_schema IS DISTINCT FROM 'public' THEN
      RAISE EXCEPTION 'the search_path resolves "%" into the "%" schema, not public',
        row.table_name, coalesce(found_schema, 'nothing');
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM (SELECT id FROM %I GROUP BY id HAVING count(*) > 1) d',
      row.table_name
    ) INTO n;
    IF n > 0 THEN
      offenders := coalesce(offenders || E'\n  ', '') || row.table_name || ': ' || n || ' duplicated id value(s)';
    END IF;

    EXECUTE format('SELECT count(*) FROM %I WHERE id IS NULL', row.table_name) INTO n;
    IF n > 0 THEN
      offenders := coalesce(offenders || E'\n  ', '') || row.table_name || ': ' || n || ' row(s) with a null id';
    END IF;
  END LOOP;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION E'cannot declare primary keys, the ids are not one row per value:\n  %', offenders;
  END IF;
END
$$;

-- 2. Declare the keys. Guarded per table, so re-running this file is a no-op, and never
--    NOT VALID: a primary key is either enforced or it is not a control at all.
DO $$
DECLARE
  row record;
BEGIN
  FOR row IN
    SELECT unnest(ARRAY[
      'landed_cost_allocations', 'landed_cost_documents', 'lay_by_schedules', 'layby_items',
      'layby_payments', 'laybys', 'leave_balances', 'leave_requests',
      'loan_installments', 'manufacturing_machines', 'manufacturing_material_reservations', 'manufacturing_material_shortages',
      'manufacturing_material_transactions', 'manufacturing_mrp_recommendations', 'manufacturing_mrp_runs', 'manufacturing_production_attachments',
      'manufacturing_production_notes', 'manufacturing_production_schedule_lines', 'manufacturing_production_schedules', 'manufacturing_routing_operations',
      'manufacturing_routings', 'manufacturing_work_centers', 'mobile_money_transactions', 'nec_sectors_config',
      'payment_allocations', 'payment_batch_details', 'payment_batches', 'payments',
      'payroll_allowances', 'payroll_attendance_imports', 'payroll_calculation_audits', 'payroll_deduction_types',
      'payroll_deductions', 'payroll_earning_types', 'payroll_elements', 'payroll_import_batches',
      'payroll_import_rows', 'payroll_integration_events', 'payroll_pay_grade_steps', 'payroll_recurring_items',
      'payroll_remittances', 'payroll_report_exports', 'payroll_report_validation_issues', 'payroll_salary_structures',
      'payroll_statutory_deadlines', 'payroll_statutory_reports', 'payroll_statutory_rules', 'payroll_tax_brackets',
      'payroll_tax_tables', 'payslip_documents', 'pos_holds', 'pos_shift_transactions',
      'price_adjustments', 'product_batches', 'product_categories', 'product_serial_numbers',
      'product_variations', 'production_run_consumptions', 'production_runs', 'provisions',
      'purchase_order_items', 'purchase_orders', 'purchase_return_items', 'purchase_returns',
      'quotation_items', 'quotations', 'recipe_items', 'recurring_invoices',
      'reset_tokens', 'restaurant_sections', 'restaurant_tables', 'revenue_contracts',
      'sales_order_audit_logs', 'sales_order_items', 'sales_order_settings', 'sales_orders',
      'scheduled_reports', 'standard_costs', 'stock_allocations', 'stock_reservations',
      'stock_take_items', 'stock_takes', 'stock_transfer_items', 'stock_transfers',
      'subscriptions', 'supplier_invoice_items', 'supplier_invoices', 'supplier_payment_allocations',
      'supplier_payments', 'suppliers', 'tax_categories', 'tax_obligations',
      'tax_rate_history', 'tax_tables_config', 'tenant_integration_credentials', 'time_confirmations',
      'validation_errors', 'warranty_claims', 'withholding_tax_certificates', 'withholding_tax_rates',
      'zimra_logs'
    ]) AS table_name
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = row.table_name::regclass AND contype = 'p'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY (id)',
        row.table_name, row.table_name || '_pkey');
    END IF;
  END LOOP;
END
$$;

COMMIT;

-- Rollback (children first is not needed here - nothing references these tables yet):
--   ALTER TABLE landed_cost_allocations DROP CONSTRAINT IF EXISTS landed_cost_allocations_pkey;
--   ALTER TABLE landed_cost_documents DROP CONSTRAINT IF EXISTS landed_cost_documents_pkey;
--   ALTER TABLE lay_by_schedules DROP CONSTRAINT IF EXISTS lay_by_schedules_pkey;
--   ALTER TABLE layby_items DROP CONSTRAINT IF EXISTS layby_items_pkey;
--   ALTER TABLE layby_payments DROP CONSTRAINT IF EXISTS layby_payments_pkey;
--   ALTER TABLE laybys DROP CONSTRAINT IF EXISTS laybys_pkey;
--   ALTER TABLE leave_balances DROP CONSTRAINT IF EXISTS leave_balances_pkey;
--   ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_pkey;
--   ALTER TABLE loan_installments DROP CONSTRAINT IF EXISTS loan_installments_pkey;
--   ALTER TABLE manufacturing_machines DROP CONSTRAINT IF EXISTS manufacturing_machines_pkey;
--   ALTER TABLE manufacturing_material_reservations DROP CONSTRAINT IF EXISTS manufacturing_material_reservations_pkey;
--   ALTER TABLE manufacturing_material_shortages DROP CONSTRAINT IF EXISTS manufacturing_material_shortages_pkey;
--   ALTER TABLE manufacturing_material_transactions DROP CONSTRAINT IF EXISTS manufacturing_material_transactions_pkey;
--   ALTER TABLE manufacturing_mrp_recommendations DROP CONSTRAINT IF EXISTS manufacturing_mrp_recommendations_pkey;
--   ALTER TABLE manufacturing_mrp_runs DROP CONSTRAINT IF EXISTS manufacturing_mrp_runs_pkey;
--   ALTER TABLE manufacturing_production_attachments DROP CONSTRAINT IF EXISTS manufacturing_production_attachments_pkey;
--   ALTER TABLE manufacturing_production_notes DROP CONSTRAINT IF EXISTS manufacturing_production_notes_pkey;
--   ALTER TABLE manufacturing_production_schedule_lines DROP CONSTRAINT IF EXISTS manufacturing_production_schedule_lines_pkey;
--   ALTER TABLE manufacturing_production_schedules DROP CONSTRAINT IF EXISTS manufacturing_production_schedules_pkey;
--   ALTER TABLE manufacturing_routing_operations DROP CONSTRAINT IF EXISTS manufacturing_routing_operations_pkey;
--   ALTER TABLE manufacturing_routings DROP CONSTRAINT IF EXISTS manufacturing_routings_pkey;
--   ALTER TABLE manufacturing_work_centers DROP CONSTRAINT IF EXISTS manufacturing_work_centers_pkey;
--   ALTER TABLE mobile_money_transactions DROP CONSTRAINT IF EXISTS mobile_money_transactions_pkey;
--   ALTER TABLE nec_sectors_config DROP CONSTRAINT IF EXISTS nec_sectors_config_pkey;
--   ALTER TABLE payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_pkey;
--   ALTER TABLE payment_batch_details DROP CONSTRAINT IF EXISTS payment_batch_details_pkey;
--   ALTER TABLE payment_batches DROP CONSTRAINT IF EXISTS payment_batches_pkey;
--   ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_pkey;
--   ALTER TABLE payroll_allowances DROP CONSTRAINT IF EXISTS payroll_allowances_pkey;
--   ALTER TABLE payroll_attendance_imports DROP CONSTRAINT IF EXISTS payroll_attendance_imports_pkey;
--   ALTER TABLE payroll_calculation_audits DROP CONSTRAINT IF EXISTS payroll_calculation_audits_pkey;
--   ALTER TABLE payroll_deduction_types DROP CONSTRAINT IF EXISTS payroll_deduction_types_pkey;
--   ALTER TABLE payroll_deductions DROP CONSTRAINT IF EXISTS payroll_deductions_pkey;
--   ALTER TABLE payroll_earning_types DROP CONSTRAINT IF EXISTS payroll_earning_types_pkey;
--   ALTER TABLE payroll_elements DROP CONSTRAINT IF EXISTS payroll_elements_pkey;
--   ALTER TABLE payroll_import_batches DROP CONSTRAINT IF EXISTS payroll_import_batches_pkey;
--   ALTER TABLE payroll_import_rows DROP CONSTRAINT IF EXISTS payroll_import_rows_pkey;
--   ALTER TABLE payroll_integration_events DROP CONSTRAINT IF EXISTS payroll_integration_events_pkey;
--   ALTER TABLE payroll_pay_grade_steps DROP CONSTRAINT IF EXISTS payroll_pay_grade_steps_pkey;
--   ALTER TABLE payroll_recurring_items DROP CONSTRAINT IF EXISTS payroll_recurring_items_pkey;
--   ALTER TABLE payroll_remittances DROP CONSTRAINT IF EXISTS payroll_remittances_pkey;
--   ALTER TABLE payroll_report_exports DROP CONSTRAINT IF EXISTS payroll_report_exports_pkey;
--   ALTER TABLE payroll_report_validation_issues DROP CONSTRAINT IF EXISTS payroll_report_validation_issues_pkey;
--   ALTER TABLE payroll_salary_structures DROP CONSTRAINT IF EXISTS payroll_salary_structures_pkey;
--   ALTER TABLE payroll_statutory_deadlines DROP CONSTRAINT IF EXISTS payroll_statutory_deadlines_pkey;
--   ALTER TABLE payroll_statutory_reports DROP CONSTRAINT IF EXISTS payroll_statutory_reports_pkey;
--   ALTER TABLE payroll_statutory_rules DROP CONSTRAINT IF EXISTS payroll_statutory_rules_pkey;
--   ALTER TABLE payroll_tax_brackets DROP CONSTRAINT IF EXISTS payroll_tax_brackets_pkey;
--   ALTER TABLE payroll_tax_tables DROP CONSTRAINT IF EXISTS payroll_tax_tables_pkey;
--   ALTER TABLE payslip_documents DROP CONSTRAINT IF EXISTS payslip_documents_pkey;
--   ALTER TABLE pos_holds DROP CONSTRAINT IF EXISTS pos_holds_pkey;
--   ALTER TABLE pos_shift_transactions DROP CONSTRAINT IF EXISTS pos_shift_transactions_pkey;
--   ALTER TABLE price_adjustments DROP CONSTRAINT IF EXISTS price_adjustments_pkey;
--   ALTER TABLE product_batches DROP CONSTRAINT IF EXISTS product_batches_pkey;
--   ALTER TABLE product_categories DROP CONSTRAINT IF EXISTS product_categories_pkey;
--   ALTER TABLE product_serial_numbers DROP CONSTRAINT IF EXISTS product_serial_numbers_pkey;
--   ALTER TABLE product_variations DROP CONSTRAINT IF EXISTS product_variations_pkey;
--   ALTER TABLE production_run_consumptions DROP CONSTRAINT IF EXISTS production_run_consumptions_pkey;
--   ALTER TABLE production_runs DROP CONSTRAINT IF EXISTS production_runs_pkey;
--   ALTER TABLE provisions DROP CONSTRAINT IF EXISTS provisions_pkey;
--   ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_pkey;
--   ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_pkey;
--   ALTER TABLE purchase_return_items DROP CONSTRAINT IF EXISTS purchase_return_items_pkey;
--   ALTER TABLE purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_pkey;
--   ALTER TABLE quotation_items DROP CONSTRAINT IF EXISTS quotation_items_pkey;
--   ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_pkey;
--   ALTER TABLE recipe_items DROP CONSTRAINT IF EXISTS recipe_items_pkey;
--   ALTER TABLE recurring_invoices DROP CONSTRAINT IF EXISTS recurring_invoices_pkey;
--   ALTER TABLE reset_tokens DROP CONSTRAINT IF EXISTS reset_tokens_pkey;
--   ALTER TABLE restaurant_sections DROP CONSTRAINT IF EXISTS restaurant_sections_pkey;
--   ALTER TABLE restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_pkey;
--   ALTER TABLE revenue_contracts DROP CONSTRAINT IF EXISTS revenue_contracts_pkey;
--   ALTER TABLE sales_order_audit_logs DROP CONSTRAINT IF EXISTS sales_order_audit_logs_pkey;
--   ALTER TABLE sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_pkey;
--   ALTER TABLE sales_order_settings DROP CONSTRAINT IF EXISTS sales_order_settings_pkey;
--   ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_pkey;
--   ALTER TABLE scheduled_reports DROP CONSTRAINT IF EXISTS scheduled_reports_pkey;
--   ALTER TABLE standard_costs DROP CONSTRAINT IF EXISTS standard_costs_pkey;
--   ALTER TABLE stock_allocations DROP CONSTRAINT IF EXISTS stock_allocations_pkey;
--   ALTER TABLE stock_reservations DROP CONSTRAINT IF EXISTS stock_reservations_pkey;
--   ALTER TABLE stock_take_items DROP CONSTRAINT IF EXISTS stock_take_items_pkey;
--   ALTER TABLE stock_takes DROP CONSTRAINT IF EXISTS stock_takes_pkey;
--   ALTER TABLE stock_transfer_items DROP CONSTRAINT IF EXISTS stock_transfer_items_pkey;
--   ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_pkey;
--   ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_pkey;
--   ALTER TABLE supplier_invoice_items DROP CONSTRAINT IF EXISTS supplier_invoice_items_pkey;
--   ALTER TABLE supplier_invoices DROP CONSTRAINT IF EXISTS supplier_invoices_pkey;
--   ALTER TABLE supplier_payment_allocations DROP CONSTRAINT IF EXISTS supplier_payment_allocations_pkey;
--   ALTER TABLE supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_pkey;
--   ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_pkey;
--   ALTER TABLE tax_categories DROP CONSTRAINT IF EXISTS tax_categories_pkey;
--   ALTER TABLE tax_obligations DROP CONSTRAINT IF EXISTS tax_obligations_pkey;
--   ALTER TABLE tax_rate_history DROP CONSTRAINT IF EXISTS tax_rate_history_pkey;
--   ALTER TABLE tax_tables_config DROP CONSTRAINT IF EXISTS tax_tables_config_pkey;
--   ALTER TABLE tenant_integration_credentials DROP CONSTRAINT IF EXISTS tenant_integration_credentials_pkey;
--   ALTER TABLE time_confirmations DROP CONSTRAINT IF EXISTS time_confirmations_pkey;
--   ALTER TABLE validation_errors DROP CONSTRAINT IF EXISTS validation_errors_pkey;
--   ALTER TABLE warranty_claims DROP CONSTRAINT IF EXISTS warranty_claims_pkey;
--   ALTER TABLE withholding_tax_certificates DROP CONSTRAINT IF EXISTS withholding_tax_certificates_pkey;
--   ALTER TABLE withholding_tax_rates DROP CONSTRAINT IF EXISTS withholding_tax_rates_pkey;
--   ALTER TABLE zimra_logs DROP CONSTRAINT IF EXISTS zimra_logs_pkey;
