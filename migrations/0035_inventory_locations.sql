CREATE TABLE IF NOT EXISTS "inventory_locations" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "type" text DEFAULT 'WAREHOUSE' NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "address" text,
  "branch_id" integer REFERENCES "branches"("id"),
  "is_default_receiving" boolean DEFAULT false NOT NULL,
  "is_default_dispatch" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inventory_locations_company_idx"
  ON "inventory_locations" ("company_id");
CREATE INDEX IF NOT EXISTS "inventory_locations_branch_idx"
  ON "inventory_locations" ("branch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_locations_company_code_idx"
  ON "inventory_locations" ("company_id", "code");

CREATE TABLE IF NOT EXISTS "inventory_location_stocks" (
  "id" serial PRIMARY KEY,
  "location_id" integer NOT NULL REFERENCES "inventory_locations"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "stock_level" numeric(10, 2) DEFAULT '0.00' NOT NULL,
  "reserved_quantity" numeric(10, 2) DEFAULT '0.00' NOT NULL,
  "available_quantity" numeric(10, 2) DEFAULT '0.00' NOT NULL,
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_location_stocks_location_product_idx"
  ON "inventory_location_stocks" ("location_id", "product_id");
CREATE INDEX IF NOT EXISTS "inventory_location_stocks_location_idx"
  ON "inventory_location_stocks" ("location_id");
CREATE INDEX IF NOT EXISTS "inventory_location_stocks_product_idx"
  ON "inventory_location_stocks" ("product_id");

ALTER TABLE "stock_transfers"
  ADD COLUMN IF NOT EXISTS "from_location_id" integer REFERENCES "inventory_locations"("id"),
  ADD COLUMN IF NOT EXISTS "to_location_id" integer REFERENCES "inventory_locations"("id");

ALTER TABLE "inventory_transactions"
  ADD COLUMN IF NOT EXISTS "location_id" integer REFERENCES "inventory_locations"("id");

INSERT INTO "inventory_locations" (
  "company_id",
  "type",
  "name",
  "code",
  "address",
  "is_default_receiving",
  "is_default_dispatch",
  "is_active"
)
SELECT
  c."id",
  'WAREHOUSE',
  'Main Warehouse',
  'MAIN-WAREHOUSE',
  c."address",
  true,
  true,
  true
FROM "companies" c
WHERE NOT EXISTS (
  SELECT 1
  FROM "inventory_locations" l
  WHERE l."company_id" = c."id"
    AND l."type" = 'WAREHOUSE'
    AND l."branch_id" IS NULL
);

INSERT INTO "inventory_locations" (
  "company_id",
  "type",
  "name",
  "code",
  "address",
  "branch_id",
  "is_active"
)
SELECT
  b."company_id",
  'BRANCH',
  b."name",
  COALESCE(b."code", 'BRANCH-' || b."id"),
  b."address",
  b."id",
  COALESCE(b."is_active", true)
FROM "branches" b
WHERE NOT EXISTS (
  SELECT 1
  FROM "inventory_locations" l
  WHERE l."company_id" = b."company_id"
    AND l."branch_id" = b."id"
);

INSERT INTO "inventory_location_stocks" (
  "location_id",
  "product_id",
  "stock_level",
  "reserved_quantity",
  "available_quantity"
)
SELECT
  l."id",
  p."id",
  COALESCE(p."stock_level", 0),
  0,
  COALESCE(p."stock_level", 0)
FROM "products" p
JOIN "inventory_locations" l
  ON l."company_id" = p."company_id"
 AND l."type" = 'WAREHOUSE'
 AND l."branch_id" IS NULL
WHERE COALESCE(p."stock_level", 0) <> 0
ON CONFLICT ("location_id", "product_id") DO UPDATE
SET
  "stock_level" = EXCLUDED."stock_level",
  "available_quantity" = EXCLUDED."available_quantity",
  "updated_at" = now();

INSERT INTO "inventory_location_stocks" (
  "location_id",
  "product_id",
  "stock_level",
  "reserved_quantity",
  "available_quantity"
)
SELECT
  l."id",
  bs."product_id",
  COALESCE(bs."stock_level", 0),
  0,
  COALESCE(bs."stock_level", 0)
FROM "branch_stocks" bs
JOIN "inventory_locations" l
  ON l."branch_id" = bs."branch_id"
WHERE COALESCE(bs."stock_level", 0) <> 0
ON CONFLICT ("location_id", "product_id") DO UPDATE
SET
  "stock_level" = EXCLUDED."stock_level",
  "available_quantity" = EXCLUDED."available_quantity",
  "updated_at" = now();

UPDATE "stock_transfers" st
SET "from_location_id" = l."id"
FROM "inventory_locations" l
WHERE st."from_location_id" IS NULL
  AND (
    (st."from_branch_id" IS NULL AND l."company_id" = st."company_id" AND l."type" = 'WAREHOUSE' AND l."branch_id" IS NULL)
    OR (st."from_branch_id" = l."branch_id")
  );

UPDATE "stock_transfers" st
SET "to_location_id" = l."id"
FROM "inventory_locations" l
WHERE st."to_location_id" IS NULL
  AND (
    (st."to_branch_id" IS NULL AND l."company_id" = st."company_id" AND l."type" = 'WAREHOUSE' AND l."branch_id" IS NULL)
    OR (st."to_branch_id" = l."branch_id")
  );
