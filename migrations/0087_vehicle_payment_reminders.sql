-- 0087_vehicle_payment_reminders.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0087_vehicle_payment_reminders.sql
--
-- Reminder history for vehicle payment schedules. `last_reminder_at` already
-- exists on the schedule line (0079); this table keeps the channel, message
-- and outcome so the UI can show what was sent and when.

BEGIN;

CREATE TABLE IF NOT EXISTS "vehicle_reminders" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "vehicle_id" integer NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "status" text NOT NULL DEFAULT 'logged',
  "schedule_ids" jsonb,
  "amount" numeric(15,2),
  "message" text,
  "error" text,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vehicle_reminders_vehicle_idx" ON "vehicle_reminders" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "vehicle_reminders_company_idx" ON "vehicle_reminders" ("company_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS "vehicle_reminders";
-- COMMIT;
