-- Vehicle cost bank account, payment journal, and supplier bill linkage
-- Costs can be paid from specific bank accounts or linked to supplier bills (AP).

ALTER TABLE vehicle_costs ADD COLUMN IF NOT EXISTS bank_account_id INTEGER REFERENCES accounts(id);
ALTER TABLE vehicle_costs ADD COLUMN IF NOT EXISTS payment_journal_entry_id INTEGER REFERENCES journal_entries(id);
ALTER TABLE vehicle_costs ADD COLUMN IF NOT EXISTS supplier_invoice_id INTEGER REFERENCES supplier_invoices(id);
ALTER TABLE vehicle_costs ADD COLUMN IF NOT EXISTS settlement_method TEXT DEFAULT 'cash'; -- cash, bank_transfer, supplier_bill
ALTER TABLE vehicle_costs ADD COLUMN IF NOT EXISTS input_vat_amount DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE vehicle_costs ADD COLUMN IF NOT EXISTS input_vat_type_id INTEGER REFERENCES tax_types(id);

-- Index for finding costs by settlement method
CREATE INDEX IF NOT EXISTS vehicle_costs_settlement_idx ON vehicle_costs(vehicle_id, settlement_method, status);
