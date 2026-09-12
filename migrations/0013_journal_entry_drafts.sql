CREATE TABLE IF NOT EXISTS "journal_entry_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "entry_date" timestamp DEFAULT now() NOT NULL,
  "description" text NOT NULL,
  "reference_type" text DEFAULT 'JOURNAL',
  "reference_id" text,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "posted_journal_entry_id" integer REFERENCES "journal_entries"("id"),
  "posted_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "journal_entry_draft_lines" (
  "id" serial PRIMARY KEY NOT NULL,
  "draft_id" integer NOT NULL REFERENCES "journal_entry_drafts"("id"),
  "account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "type" text NOT NULL,
  "amount" numeric(15, 2) NOT NULL,
  "memo" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "journal_entry_drafts_company_status_idx"
  ON "journal_entry_drafts" ("company_id", "status");

CREATE INDEX IF NOT EXISTS "journal_entry_draft_lines_draft_idx"
  ON "journal_entry_draft_lines" ("draft_id");

CREATE INDEX IF NOT EXISTS "journal_entry_draft_lines_account_idx"
  ON "journal_entry_draft_lines" ("account_id");
