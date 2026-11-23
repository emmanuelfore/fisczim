-- Accounting integrity hardening.
--
-- Deliberate scope decision: the 692 duplicate ledger_entries.id values are NOT
-- repaired here. That needs a reviewed data-repair pass. New rows instead get a
-- stable (journal_entry_id, line_ordinal) identity and every new row is guarded
-- by balance, type and immutability triggers.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "posting_key" text;
ALTER TABLE "journal_entry_drafts" ADD COLUMN IF NOT EXISTS "posting_key" text;
ALTER TABLE "journal_entry_draft_lines"
  ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(10,6) DEFAULT 1;

ALTER TABLE "ledger_entries"
  ADD COLUMN IF NOT EXISTS "line_ordinal" integer,
  ADD COLUMN IF NOT EXISTS "base_amount" numeric(15,2) DEFAULT 0.00 NOT NULL;

ALTER TABLE "bus_tickets"
  ADD COLUMN IF NOT EXISTS "original_journal_entry_id" integer,
  ADD COLUMN IF NOT EXISTS "void_journal_entry_id" integer;

ALTER TABLE "bus_reconciliations"
  ADD COLUMN IF NOT EXISTS "original_journal_entry_id" integer,
  ADD COLUMN IF NOT EXISTS "void_journal_entry_id" integer;

ALTER TABLE "crm_commissions"
  ADD COLUMN IF NOT EXISTS "reversal_journal_entry_id" integer;

-- Historical valuation snapshots actually contain today's stock and cost.
-- Label them explicitly so reports cannot present them as reconstructed history.
ALTER TABLE "inventory_valuation_snapshots"
  ADD COLUMN IF NOT EXISTS "capture_type" text DEFAULT 'CURRENT_STATE' NOT NULL,
  ADD COLUMN IF NOT EXISTS "captured_at" timestamptz;

-- Base amount convention: base = foreign / exchangeRate.
-- Only zero placeholders are backfilled; non-zero values are treated as already resolved.
UPDATE "ledger_entries"
   SET "base_amount" = CASE
         WHEN COALESCE("exchange_rate", 1) > 0
           THEN ROUND("amount" / COALESCE("exchange_rate", 1), 2)
         ELSE "amount"
       END
 WHERE COALESCE("base_amount", 0) = 0;

UPDATE "ledger_entries" SET "currency" = 'USD' WHERE "currency" IS NULL;
UPDATE "ledger_entries" SET "exchange_rate" = 1 WHERE "exchange_rate" IS NULL;

-- Bring production nullability in line with the Drizzle schema.
UPDATE "journal_entries" SET "status" = 'DRAFT' WHERE "status" IS NULL;
UPDATE "journal_entries" SET "approval_status" = 'PENDING' WHERE "approval_status" IS NULL;
UPDATE "journal_entries" SET "row_version" = 1 WHERE "row_version" IS NULL;

ALTER TABLE "journal_entries"
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "approval_status" SET NOT NULL,
  ALTER COLUMN "row_version" SET NOT NULL;

-- Payroll now holds a journal draft in PENDING_GL / PENDING_GL_REVERSAL until
-- GL approval posts it. The legacy CHECK does not know those states.
ALTER TABLE "payroll_runs" DROP CONSTRAINT IF EXISTS "payroll_runs_status_check";
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_status_check"
  CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED',
                      'PENDING_GL', 'PENDING_GL_REVERSAL', 'REVERSED'));

-- ---------------------------------------------------------------------------
-- Foreign keys for the new traceability columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bus_tickets_original_journal_fk') THEN
    ALTER TABLE "bus_tickets" ADD CONSTRAINT "bus_tickets_original_journal_fk"
      FOREIGN KEY ("original_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bus_tickets_void_journal_fk') THEN
    ALTER TABLE "bus_tickets" ADD CONSTRAINT "bus_tickets_void_journal_fk"
      FOREIGN KEY ("void_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bus_reconciliations_original_journal_fk') THEN
    ALTER TABLE "bus_reconciliations" ADD CONSTRAINT "bus_reconciliations_original_journal_fk"
      FOREIGN KEY ("original_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bus_reconciliations_void_journal_fk') THEN
    ALTER TABLE "bus_reconciliations" ADD CONSTRAINT "bus_reconciliations_void_journal_fk"
      FOREIGN KEY ("void_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_commissions_reversal_journal_fk') THEN
    ALTER TABLE "crm_commissions" ADD CONSTRAINT "crm_commissions_reversal_journal_fk"
      FOREIGN KEY ("reversal_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Constraints and indexes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_type_check') THEN
    ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_type_check"
      CHECK ("type" IN ('DEBIT', 'CREDIT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_amount_check') THEN
    ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_check"
      CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_status_check') THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_status_check"
      CHECK ("status" IN ('DRAFT', 'POSTED', 'REVERSED', 'VOID', 'CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_approval_status_check') THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approval_status_check"
      CHECK ("approval_status" IN ('PENDING', 'APPROVED', 'REJECTED'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_company_posting_key_unique"
  ON "journal_entries" ("company_id", "posting_key")
  WHERE "posting_key" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entry_drafts_company_posting_key_unique"
  ON "journal_entry_drafts" ("company_id", "posting_key")
  WHERE "posting_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "journal_entries_company_entry_date_idx"
  ON "journal_entries" ("company_id", "entry_date");

CREATE INDEX IF NOT EXISTS "journal_entries_company_reference_idx"
  ON "journal_entries" ("company_id", "reference_type", "reference_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_journal_line_ordinal_unique"
  ON "ledger_entries" ("journal_entry_id", "line_ordinal")
  WHERE "line_ordinal" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ledger_entries_journal_account_idx"
  ON "ledger_entries" ("journal_entry_id", "account_id");

CREATE INDEX IF NOT EXISTS "ledger_entries_account_journal_idx"
  ON "ledger_entries" ("account_id", "journal_entry_id");

-- ---------------------------------------------------------------------------
-- Balance enforcement at COMMIT, so intermediate INSERTs are allowed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_journal_balances_fn() RETURNS trigger AS $$
DECLARE
  target_id integer;
  net numeric;
  line_count integer;
BEGIN
  target_id := COALESCE(NEW."journal_entry_id", OLD."journal_entry_id");
  IF target_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*),
         COALESCE(SUM(CASE "type"
                        WHEN 'DEBIT' THEN "amount"
                        WHEN 'CREDIT' THEN -"amount"
                        ELSE 0
                      END), 0)
    INTO line_count, net
    FROM "ledger_entries"
   WHERE "journal_entry_id" = target_id;

  IF line_count < 2 OR ABS(net) > 0.005 THEN
    RAISE EXCEPTION
      'Journal % is not balanced at commit (lines: %, net: %)', target_id, line_count, net;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ledger_entries_balance_check" ON "ledger_entries";
CREATE CONSTRAINT TRIGGER "ledger_entries_balance_check"
  AFTER INSERT OR UPDATE OR DELETE ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_balances_fn();

-- ---------------------------------------------------------------------------
-- Immutability. DRAFT journals remain editable; POSTED journals may only move
-- to REVERSED/VOID and gain a reversal link. Ledger monetary fields are frozen;
-- reconciliation is the one permitted mutation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_journal_immutability_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'Cannot delete a % journal entry (%)', OLD."status", OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'Cannot modify a REVERSED journal entry (%)', OLD."id";
  END IF;

  IF OLD."status" = 'POSTED' THEN
    -- Only status, the reversal link and optimistic-lock version may change.
    -- Compare the rest of the row as JSONB so a newly added column is frozen
    -- automatically instead of being silently editable.
    IF NEW."status" = OLD."status"
       AND (to_jsonb(NEW) - 'status' - 'reversal_of_journal_entry_id' - 'row_version')
       IS NOT DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'reversal_of_journal_entry_id' - 'row_version') THEN
      RETURN NEW;
    END IF;
    IF NEW."status" IN ('REVERSED', 'VOID', 'CANCELLED')
       AND (to_jsonb(NEW) - 'status' - 'reversal_of_journal_entry_id' - 'row_version')
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - 'status' - 'reversal_of_journal_entry_id' - 'row_version') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted journal entry (%) may only be reversed or voided', OLD."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "journal_entries_immutability" ON "journal_entries";
CREATE TRIGGER "journal_entries_immutability"
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_immutability_fn();

CREATE OR REPLACE FUNCTION enforce_ledger_immutability_fn() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger lines are append-only; cannot delete id %', OLD."id";
  END IF;

  IF ROW(NEW."journal_entry_id", NEW."account_id", NEW."type", NEW."amount",
         NEW."base_amount", NEW."currency", NEW."exchange_rate")
     IS NOT DISTINCT FROM
     ROW(OLD."journal_entry_id", OLD."account_id", OLD."type", OLD."amount",
         OLD."base_amount", OLD."currency", OLD."exchange_rate")
     AND NEW."is_reconciled" IS DISTINCT FROM OLD."is_reconciled" THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Ledger line % monetary fields are immutable; use a reversing journal', OLD."id";
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ledger_entries_immutability" ON "ledger_entries";
CREATE TRIGGER "ledger_entries_immutability"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION enforce_ledger_immutability_fn();

-- ---------------------------------------------------------------------------
-- Append-only audit evidence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "journal_audit_log" (
  "id" bigserial PRIMARY KEY,
  "company_id" integer,
  "journal_entry_id" integer,
  "operation" text NOT NULL,
  "actor" text NOT NULL DEFAULT current_user,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "before_data" jsonb,
  "after_data" jsonb
);

CREATE INDEX IF NOT EXISTS "journal_audit_log_company_time_idx"
  ON "journal_audit_log" ("company_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "journal_audit_log_entry_idx"
  ON "journal_audit_log" ("journal_entry_id", "occurred_at");

CREATE OR REPLACE FUNCTION record_journal_audit_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO "journal_audit_log" ("company_id", "journal_entry_id", "operation", "before_data", "after_data")
  VALUES (
    COALESCE(NEW."company_id", OLD."company_id"),
    COALESCE(NEW."id", OLD."id"),
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "journal_entries_audit" ON "journal_entries";
CREATE TRIGGER "journal_entries_audit"
  AFTER INSERT OR UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION record_journal_audit_fn();

CREATE TABLE IF NOT EXISTS "ledger_audit_log" (
  "id" bigserial PRIMARY KEY,
  "journal_entry_id" integer,
  "operation" text NOT NULL,
  "actor" text NOT NULL DEFAULT current_user,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "before_data" jsonb,
  "after_data" jsonb
);

CREATE INDEX IF NOT EXISTS "ledger_audit_log_entry_idx"
  ON "ledger_audit_log" ("journal_entry_id", "occurred_at");

CREATE OR REPLACE FUNCTION record_ledger_audit_fn() RETURNS trigger AS $$
BEGIN
  INSERT INTO "ledger_audit_log" ("journal_entry_id", "operation", "before_data", "after_data")
  VALUES (
    COALESCE(NEW."journal_entry_id", OLD."journal_entry_id"),
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ledger_entries_audit" ON "ledger_entries";
CREATE TRIGGER "ledger_entries_audit"
  AFTER INSERT OR UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION record_ledger_audit_fn();
