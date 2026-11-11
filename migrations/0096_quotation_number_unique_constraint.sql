-- Unique quotation number per company.
-- The allocator takes a transaction-scoped advisory lock before reading MAX(),
-- so concurrent quote creation cannot issue the same number.

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_quotation_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS quotations_company_number_unique
  ON quotations(company_id, quotation_number);
