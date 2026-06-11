CREATE TABLE IF NOT EXISTS "inventory_cost_components" (
  "id" serial PRIMARY KEY,
  "inventory_transaction_id" integer NOT NULL,
  "type" text NOT NULL,
  "unit_cost" numeric(15, 4) NOT NULL,
  "total_cost" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD',
  "exchange_rate" numeric(15, 6) DEFAULT '1',
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "landed_cost_documents" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "supplier_id" integer,
  "reference" text NOT NULL,
  "date" timestamp DEFAULT now() NOT NULL,
  "total_amount" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "exchange_rate" numeric(15, 6) DEFAULT '1',
  "status" text DEFAULT 'PENDING' NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "landed_cost_allocations" (
  "id" serial PRIMARY KEY,
  "landed_cost_document_id" integer NOT NULL,
  "inventory_transaction_id" integer NOT NULL,
  "allocated_amount" numeric(15, 2) NOT NULL,
  "created_at" timestamp DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_cost_components_inventory_transaction_id_inventory_transactions_id_fk'
  ) THEN
    ALTER TABLE "inventory_cost_components"
      ADD CONSTRAINT "inventory_cost_components_inventory_transaction_id_inventory_transactions_id_fk"
      FOREIGN KEY ("inventory_transaction_id") REFERENCES "inventory_transactions"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'landed_cost_documents_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE "landed_cost_documents"
      ADD CONSTRAINT "landed_cost_documents_company_id_companies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'landed_cost_documents_supplier_id_suppliers_id_fk'
  ) THEN
    ALTER TABLE "landed_cost_documents"
      ADD CONSTRAINT "landed_cost_documents_supplier_id_suppliers_id_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'landed_cost_allocations_landed_cost_document_id_landed_cost_documents_id_fk'
  ) THEN
    ALTER TABLE "landed_cost_allocations"
      ADD CONSTRAINT "landed_cost_allocations_landed_cost_document_id_landed_cost_documents_id_fk"
      FOREIGN KEY ("landed_cost_document_id") REFERENCES "landed_cost_documents"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'landed_cost_allocations_inventory_transaction_id_inventory_transactions_id_fk'
  ) THEN
    ALTER TABLE "landed_cost_allocations"
      ADD CONSTRAINT "landed_cost_allocations_inventory_transaction_id_inventory_transactions_id_fk"
      FOREIGN KEY ("inventory_transaction_id") REFERENCES "inventory_transactions"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "inv_cost_comp_trans_id_idx" ON "inventory_cost_components" ("inventory_transaction_id");
CREATE INDEX IF NOT EXISTS "landed_cost_alloc_doc_id_idx" ON "landed_cost_allocations" ("landed_cost_document_id");
CREATE INDEX IF NOT EXISTS "landed_cost_alloc_trans_id_idx" ON "landed_cost_allocations" ("inventory_transaction_id");
CREATE INDEX IF NOT EXISTS "landed_cost_doc_company_id_idx" ON "landed_cost_documents" ("company_id");
