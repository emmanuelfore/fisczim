ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "feature_settings" jsonb;
