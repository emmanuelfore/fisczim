ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "paid_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;

UPDATE "invoices" i
SET "paid_amount" = COALESCE(p.total_paid, 0)
FROM (
  SELECT "invoice_id", SUM("amount")::numeric(15, 2) AS total_paid
  FROM "payments"
  GROUP BY "invoice_id"
) p
WHERE i."id" = p."invoice_id";
