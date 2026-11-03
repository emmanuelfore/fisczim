-- Loti as a real currency for every Lesotho tenant.
-- Company seeding only knew USD and ZWG, so LSL rows were added by hand for some
-- tenants and never at all for others, and a tenant whose documents are all issued
-- in loti can still have USD marked as its base currency.
WITH loti AS (
  SELECT c.id AS company_id
  FROM "companies" c
  WHERE lower(trim(coalesce(c.country, ''))) = 'lesotho'
     OR upper(trim(coalesce(c.fiscal_provider, ''))) IN ('LEKUKA', 'LEKAKU')
     OR upper(trim(coalesce(c.currency, ''))) = 'LSL'
)
INSERT INTO "currencies" ("company_id", "code", "name", "symbol", "exchange_rate", "is_base", "is_active")
SELECT l.company_id, 'LSL', 'Lesotho Loti', 'M', '1.000000', true, true
FROM loti l
WHERE NOT EXISTS (
  SELECT 1 FROM "currencies" cu WHERE cu.company_id = l.company_id AND upper(cu.code) = 'LSL'
)
ON CONFLICT DO NOTHING;

-- Exchange rates on the other rows are left alone: a rate is the tenant's to set in
-- Currency Settings, and a guessed conversion misstates the books.

-- The loti is the base of a Lesotho tenant; the other rows stay active as non-base.
WITH loti AS (
  SELECT c.id AS company_id
  FROM "companies" c
  WHERE lower(trim(coalesce(c.country, ''))) = 'lesotho'
     OR upper(trim(coalesce(c.fiscal_provider, ''))) IN ('LEKUKA', 'LEKAKU')
     OR upper(trim(coalesce(c.currency, ''))) = 'LSL'
)
UPDATE "currencies" cu SET "is_base" = false
FROM loti l
WHERE cu.company_id = l.company_id
  AND cu.is_base = true
  AND upper(cu.code) <> 'LSL';

-- Any loti row that predates the symbol table may carry the code or a dollar sign.
WITH loti AS (
  SELECT c.id AS company_id
  FROM "companies" c
  WHERE lower(trim(coalesce(c.country, ''))) = 'lesotho'
     OR upper(trim(coalesce(c.fiscal_provider, ''))) IN ('LEKUKA', 'LEKAKU')
     OR upper(trim(coalesce(c.currency, ''))) = 'LSL'
)
UPDATE "currencies" cu SET "symbol" = 'M', "name" = 'Lesotho Loti'
FROM loti l
WHERE cu.company_id = l.company_id
  AND upper(cu.code) = 'LSL'
  AND (cu.symbol IS DISTINCT FROM 'M' OR cu.name IS DISTINCT FROM 'Lesotho Loti');
