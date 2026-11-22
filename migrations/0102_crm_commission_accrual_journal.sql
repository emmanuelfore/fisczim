-- crm_commissions.accrual_journal_entry_id is declared in shared/schema.ts and
-- used when a commission is posted to the GL, but no migration created it.
-- Add it explicitly so a fresh schema and the live database agree.
ALTER TABLE crm_commissions
  ADD COLUMN IF NOT EXISTS accrual_journal_entry_id INTEGER REFERENCES journal_entries(id);
