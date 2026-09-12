ALTER TABLE "companies" ALTER COLUMN "inventory_valuation_method" SET DEFAULT 'WAC';
UPDATE "companies"
SET "inventory_valuation_method" = 'WAC'
WHERE "inventory_valuation_method" IS NULL OR "inventory_valuation_method" = 'FIFO';
