ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "superadmin_visible" boolean DEFAULT true NOT NULL;

UPDATE "companies"
SET "superadmin_visible" = false
WHERE lower(coalesce("name", '')) IN ('clamp', 'intel', 'apache')
   OR lower(coalesce("trading_name", '')) IN ('clamp', 'intel', 'apache')
   OR lower(coalesce("name", '')) LIKE '%clamp%'
   OR lower(coalesce("name", '')) LIKE '%intel%'
   OR lower(coalesce("name", '')) LIKE '%apache%'
   OR lower(coalesce("trading_name", '')) LIKE '%clamp%'
   OR lower(coalesce("trading_name", '')) LIKE '%intel%'
   OR lower(coalesce("trading_name", '')) LIKE '%apache%';
