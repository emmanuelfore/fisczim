-- Vehicle receipts must debit the actual bank/cash account used, not always the
-- company default cash account. The receipt route captures this on the payment.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bank_account_id INTEGER REFERENCES accounts(id);

CREATE INDEX IF NOT EXISTS payments_bank_account_idx
  ON payments(company_id, bank_account_id);
