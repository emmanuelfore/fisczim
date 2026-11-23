-- Persisted three-way match results and write guards for PO / GRV / supplier-bill matching.
-- Legacy duplicate supplier invoice numbers are deliberately left untouched; only new
-- duplicates are blocked.

CREATE TABLE IF NOT EXISTS "supplier_bill_matches" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "supplier_invoice_id" integer NOT NULL REFERENCES "supplier_invoices"("id"),
  "purchase_order_id" integer REFERENCES "purchase_orders"("id"),
  "goods_delivery_note_id" integer REFERENCES "goods_delivery_notes"("id"),
  "status" text NOT NULL,
  "approval_status" text DEFAULT 'NOT_REQUIRED' NOT NULL,
  "currency" text,
  "po_quantity" numeric(15, 4) DEFAULT '0' NOT NULL,
  "grv_quantity" numeric(15, 4) DEFAULT '0' NOT NULL,
  "invoice_quantity" numeric(15, 4) DEFAULT '0' NOT NULL,
  "quantity_variance" numeric(15, 4) DEFAULT '0' NOT NULL,
  "po_net_total" numeric(15, 2) DEFAULT '0' NOT NULL,
  "grv_net_total" numeric(15, 2) DEFAULT '0' NOT NULL,
  "invoice_net_total" numeric(15, 2) DEFAULT '0' NOT NULL,
  "price_variance" numeric(15, 2) DEFAULT '0' NOT NULL,
  "quantity_tolerance" numeric(15, 4) DEFAULT '0.0100' NOT NULL,
  "price_tolerance_rate" numeric(8, 4) DEFAULT '0.0500' NOT NULL,
  "waiver_reason" text,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "matched_by" uuid REFERENCES "users"("id"),
  "matched_at" timestamp DEFAULT now() NOT NULL,
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_bill_matches_company_invoice_unique" UNIQUE ("company_id", "supplier_invoice_id"),
  CONSTRAINT "supplier_bill_matches_status_check" CHECK (
    "status" IN ('MATCHED','QTY_MISMATCH','PRICE_VARIANCE','PENDING_INVOICE','NO_PO','WAIVED')
  ),
  CONSTRAINT "supplier_bill_matches_approval_status_check" CHECK (
    "approval_status" IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')
  )
);

CREATE INDEX IF NOT EXISTS "supplier_bill_matches_company_status_idx"
  ON "supplier_bill_matches" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "supplier_bill_matches_po_idx"
  ON "supplier_bill_matches" ("purchase_order_id");
CREATE INDEX IF NOT EXISTS "supplier_bill_matches_gdn_idx"
  ON "supplier_bill_matches" ("goods_delivery_note_id");

-- Null values are allowed in a Postgres unique index, so unconfirmed drafts remain unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "goods_delivery_notes_company_confirmed_grv_number_idx"
  ON "goods_delivery_notes" ("company_id", "confirmed_grv_number");

CREATE INDEX IF NOT EXISTS "supplier_invoices_company_number_lower_idx"
  ON "supplier_invoices" ("company_id", lower(btrim("invoice_number")));

CREATE OR REPLACE FUNCTION "prevent_new_duplicate_supplier_invoice_number"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Legacy duplicate numbers must remain editable (e.g. payment status changes).
  -- Only a new/active invoice number, company or transaction type is blocked.
  IF TG_OP = 'UPDATE'
     AND OLD."company_id" = NEW."company_id"
     AND lower(btrim(OLD."invoice_number")) = lower(btrim(NEW."invoice_number"))
     AND OLD."transaction_type" = NEW."transaction_type"
     AND NOT (OLD."status" IN ('cancelled', 'void') AND NEW."status" NOT IN ('cancelled', 'void'))
  THEN
    RETURN NEW;
  END IF;

  IF NEW."transaction_type" = 'Invoice'
     AND NEW."status" NOT IN ('cancelled', 'void')
     AND EXISTS (
       SELECT 1
       FROM "supplier_invoices" si
       WHERE si."company_id" = NEW."company_id"
         AND si."id" <> NEW."id"
         AND lower(btrim(si."invoice_number")) = lower(btrim(NEW."invoice_number"))
         AND si."transaction_type" = 'Invoice'
         AND si."status" NOT IN ('cancelled', 'void')
     )
  THEN
    RAISE EXCEPTION 'Duplicate supplier invoice number "%" for company %', NEW."invoice_number", NEW."company_id"
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "supplier_invoices_duplicate_number_guard" ON "supplier_invoices";
CREATE TRIGGER "supplier_invoices_duplicate_number_guard"
  BEFORE INSERT OR UPDATE OF "invoice_number", "company_id", "transaction_type", "status"
  ON "supplier_invoices"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_new_duplicate_supplier_invoice_number"();

-- Grant the new accounting permissions to existing roles so bill posting does not
-- break until role templates are re-seeded. Any role that could previously record
-- supplier payments should be able to post bills and approve match variances.
INSERT INTO "company_role_permissions" ("role_id", "permission")
SELECT cr."id", p."permission"
FROM "company_roles" cr
CROSS JOIN (VALUES ('accounting.bills.post'), ('accounting.bills.waive')) AS p("permission")
WHERE cr."legacy_role" IN ('owner', 'admin', 'accountant')
   OR EXISTS (
     SELECT 1 FROM "company_role_permissions" crp
     WHERE crp."role_id" = cr."id" AND crp."permission" = 'accounting.payments'
   )
ON CONFLICT DO NOTHING;
