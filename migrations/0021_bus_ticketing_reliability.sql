ALTER TABLE "bus_trips" ADD COLUMN IF NOT EXISTS "actual_arrival" timestamp;

ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "shift_id" integer;
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "device_id" text;
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "local_ticket_id" text;
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD';
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active';
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "accounting_status" text DEFAULT 'unposted';
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "accounting_error" text;
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "posted_journal_entry_id" integer REFERENCES "journal_entries"("id");
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "posted_at" timestamp;
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "voided_at" timestamp;
ALTER TABLE "bus_tickets" ADD COLUMN IF NOT EXISTS "void_reason" text;

ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending';
ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "signed_off_by" uuid REFERENCES "users"("id");
ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "signed_off_at" timestamp;
ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "accounting_status" text DEFAULT 'unposted';
ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "accounting_error" text;
ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "posted_journal_entry_id" integer REFERENCES "journal_entries"("id");
ALTER TABLE "bus_reconciliations" ADD COLUMN IF NOT EXISTS "posted_at" timestamp;

UPDATE "bus_tickets" SET "currency" = 'USD' WHERE "currency" IS NULL;
UPDATE "bus_tickets" SET "status" = 'active' WHERE "status" IS NULL;
UPDATE "bus_tickets" SET "accounting_status" = 'unposted' WHERE "accounting_status" IS NULL;

ALTER TABLE "bus_tickets" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "bus_tickets" ALTER COLUMN "status" SET DEFAULT 'active';
ALTER TABLE "bus_tickets" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "bus_tickets" ALTER COLUMN "accounting_status" SET DEFAULT 'unposted';
ALTER TABLE "bus_tickets" ALTER COLUMN "accounting_status" SET NOT NULL;
UPDATE "bus_reconciliations" SET "status" = 'pending' WHERE "status" IS NULL;
UPDATE "bus_reconciliations" SET "accounting_status" = 'unposted' WHERE "accounting_status" IS NULL;
ALTER TABLE "bus_reconciliations" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "bus_reconciliations" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "bus_reconciliations" ALTER COLUMN "accounting_status" SET DEFAULT 'unposted';
ALTER TABLE "bus_reconciliations" ALTER COLUMN "accounting_status" SET NOT NULL;

INSERT INTO "accounts" ("company_id", "code", "name", "type", "category", "is_system", "is_active")
SELECT c."id", v."code", v."name", v."type", v."category", true, true
FROM "companies" c
CROSS JOIN (
  VALUES
    ('1060', 'Conductor Cash Clearing', 'ASSET', 'Current Assets'),
    ('1070', 'Mobile Money Clearing', 'ASSET', 'Current Assets'),
    ('4110', 'Passenger Transport Revenue', 'REVENUE', 'Revenue'),
    ('4920', 'Cash Overage Income', 'REVENUE', 'Other Income'),
    ('5920', 'Cash Shortage Expense', 'EXPENSE', 'Other Expenses')
) AS v("code", "name", "type", "category")
ON CONFLICT ("company_id", "code") DO UPDATE
SET "name" = EXCLUDED."name",
    "type" = EXCLUDED."type",
    "category" = EXCLUDED."category",
    "is_system" = true,
    "is_active" = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bus_tickets_shift_id_bus_shifts_id_fk'
  ) THEN
    ALTER TABLE "bus_tickets"
      ADD CONSTRAINT "bus_tickets_shift_id_bus_shifts_id_fk"
      FOREIGN KEY ("shift_id") REFERENCES "bus_shifts"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "bus_trips_company_status_idx" ON "bus_trips" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "bus_trips_vehicle_status_idx" ON "bus_trips" ("vehicle_id", "status");
CREATE INDEX IF NOT EXISTS "bus_trips_conductor_status_idx" ON "bus_trips" ("conductor_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bus_tickets_company_ticket_number_idx'
  ) THEN
    ALTER TABLE "bus_tickets"
      ADD CONSTRAINT "bus_tickets_company_ticket_number_idx"
      UNIQUE ("company_id", "ticket_number");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bus_tickets_company_device_local_idx'
  ) THEN
    ALTER TABLE "bus_tickets"
      ADD CONSTRAINT "bus_tickets_company_device_local_idx"
      UNIQUE ("company_id", "device_id", "local_ticket_id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "bus_tickets_trip_active_seat_idx"
  ON "bus_tickets" ("trip_id", "seat_number")
  WHERE "seat_number" IS NOT NULL AND "status" = 'active';
CREATE INDEX IF NOT EXISTS "bus_tickets_company_timestamp_idx" ON "bus_tickets" ("company_id", "timestamp");
CREATE INDEX IF NOT EXISTS "bus_tickets_trip_id_idx" ON "bus_tickets" ("trip_id");
CREATE INDEX IF NOT EXISTS "bus_tickets_shift_id_idx" ON "bus_tickets" ("shift_id");
CREATE INDEX IF NOT EXISTS "bus_tickets_posting_idx" ON "bus_tickets" ("company_id", "accounting_status");
CREATE INDEX IF NOT EXISTS "bus_reconciliations_company_date_idx" ON "bus_reconciliations" ("company_id", "date");
CREATE INDEX IF NOT EXISTS "bus_reconciliations_company_status_idx" ON "bus_reconciliations" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "bus_reconciliations_posting_idx" ON "bus_reconciliations" ("company_id", "accounting_status");
