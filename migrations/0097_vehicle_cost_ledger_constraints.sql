-- Posted vehicle cost lines are immutable at the database level.
-- Status may still move (supplier bill: pending -> paid, or -> cancelled), but
-- monetary and settlement fields cannot be edited once a journal exists.

CREATE OR REPLACE FUNCTION prevent_posted_vehicle_cost_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.cost_journal_entry_id IS NOT NULL THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
       OR NEW.settlement_method IS DISTINCT FROM OLD.settlement_method
       OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.input_vat_amount IS DISTINCT FROM OLD.input_vat_amount
       OR NEW.input_vat_type_id IS DISTINCT FROM OLD.input_vat_type_id THEN
      RAISE EXCEPTION 'Posted vehicle cost lines are immutable; reverse the journal entry first';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vehicle_costs_posted_immutable ON vehicle_costs;
CREATE TRIGGER vehicle_costs_posted_immutable
  BEFORE UPDATE ON vehicle_costs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_vehicle_cost_changes();

-- The previous draft of this migration added a CHECK that made a posted
-- supplier bill (pending, with a journal) impossible. Remove it if present.
ALTER TABLE vehicle_costs DROP CONSTRAINT IF EXISTS check_cost_journal_immutable;
