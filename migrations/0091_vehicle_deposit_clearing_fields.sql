-- Vehicle deposit journal IDs and clearing timestamp
-- When a deposit is received before invoice, it posts to a liability account.
-- At invoice time, the deposit is cleared against the invoice AR.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS clearing_journal_entry_id INTEGER REFERENCES journal_entries(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_deposit BOOLEAN DEFAULT FALSE;

-- Index for finding uncleared deposits
CREATE INDEX IF NOT EXISTS payments_deposit_clearing_idx ON payments(company_id, is_deposit, cleared_at) WHERE is_deposit = TRUE AND cleared_at IS NULL;
