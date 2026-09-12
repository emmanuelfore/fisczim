ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "credit_limit" numeric(15, 2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS "credit_days" integer DEFAULT 0;

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "credit_limit" numeric(15, 2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS "credit_days" integer DEFAULT 0;
