ALTER TABLE "companies" RENAME COLUMN "superadmin_visible" TO "cfg_1";
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "_x" jsonb;
