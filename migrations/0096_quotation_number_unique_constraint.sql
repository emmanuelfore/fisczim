-- Unique quotation number per company
-- Prevents duplicate quotation numbers within the same company.

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_quotation_number_key;
CREATE UNIQUE INDEX quotations_company_number_unique ON quotations(company_id, quotation_number);
