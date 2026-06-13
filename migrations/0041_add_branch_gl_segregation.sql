-- Migration: Add branchId to GL tables and journalEntryId to payments
-- Date: 2026-06-11
-- Purpose:
--   1. Branch-level GL segregation: branchId on journal_entries, ledger_entries,
--      journal_entry_drafts, journal_entry_draft_lines
--   2. Payment GL audit trail: journalEntryId on payments table
--   All new columns are nullable to preserve backward compatibility with existing data.

-- 1. payments: add journalEntryId for GL audit trail linkage
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS journal_entry_id integer;

-- 2. journal_entries: add branchId for branch-level segregation
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS journal_entries_branch_idx
  ON journal_entries(branch_id);

CREATE INDEX IF NOT EXISTS journal_entries_company_branch_idx
  ON journal_entries(company_id, branch_id);

-- 3. ledger_entries: add branchId (denormalized for efficient branch queries)
ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS ledger_entries_branch_idx
  ON ledger_entries(branch_id);

-- 4. journal_entry_drafts: add branchId
ALTER TABLE journal_entry_drafts
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS journal_entry_drafts_company_branch_idx
  ON journal_entry_drafts(company_id, branch_id);

-- 5. journal_entry_draft_lines: add branchId
ALTER TABLE journal_entry_draft_lines
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS journal_entry_draft_lines_branch_idx
  ON journal_entry_draft_lines(branch_id);

-- Backfill: For existing ledger_entries, copy branch_id from their parent journal entry
-- (runs as a best-effort update; null branch = company-wide)
UPDATE ledger_entries le
SET branch_id = je.branch_id
FROM journal_entries je
WHERE le.journal_entry_id = je.id
  AND le.branch_id IS NULL
  AND je.branch_id IS NOT NULL;
