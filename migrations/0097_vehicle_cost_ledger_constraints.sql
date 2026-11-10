-- Add constraints to prevent modification of posted costs
-- Once a cost has a journal entry, its monetary fields should be immutable.

ALTER TABLE vehicle_costs ADD CONSTRAINT check_cost_journal_immutable
CHECK (
  cost_journal_entry_id IS NULL OR 
  (status = 'paid' OR status = 'cancelled')
);

-- Add comment documenting the constraint
COMMENT ON CONSTRAINT check_cost_journal_immutable ON vehicle_costs IS 
'Costs with journal entries cannot have their status changed to pending/disputed';
