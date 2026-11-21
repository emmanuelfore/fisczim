-- Sales agreements and line-level settlement state for vehicle instalment sales.
BEGIN;

ALTER TABLE vehicle_payment_schedules ADD COLUMN IF NOT EXISTS paid_amount numeric(15,2) NOT NULL DEFAULT '0.00';
ALTER TABLE vehicle_payment_schedules ADD COLUMN IF NOT EXISTS paid_at date;
ALTER TABLE vehicle_payment_schedules ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';

CREATE TABLE IF NOT EXISTS vehicle_sales_agreements (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id integer NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE CASCADE,
  agreement_number text NOT NULL,
  customer_id integer REFERENCES customers(id), salesperson_id uuid REFERENCES users(id),
  agreed_price numeric(15,2) NOT NULL, currency text NOT NULL DEFAULT 'USD', exchange_rate numeric(14,6) NOT NULL DEFAULT '1.000000',
  price_type text NOT NULL DEFAULT 'fixed', deposit_amount numeric(15,2) NOT NULL DEFAULT '0.00', months integer NOT NULL DEFAULT 1,
  interest_type text NOT NULL DEFAULT 'none', interest_rate numeric(8,4) NOT NULL DEFAULT '0.0000',
  admin_fee numeric(15,2) NOT NULL DEFAULT '0.00', late_fee numeric(15,2) NOT NULL DEFAULT '0.00',
  start_date date NOT NULL, estimated_delivery date, handover_at timestamp, handover_by uuid REFERENCES users(id), handover_notes text,
  status text NOT NULL DEFAULT 'draft', notes text, terms_text text, created_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  CONSTRAINT vsa_number_unique UNIQUE(company_id, agreement_number)
);
CREATE INDEX IF NOT EXISTS vsa_company_idx ON vehicle_sales_agreements(company_id);
CREATE INDEX IF NOT EXISTS vsa_status_idx ON vehicle_sales_agreements(company_id, status);
CREATE TABLE IF NOT EXISTS vehicle_agreement_counters (
  company_id integer PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  next_number integer NOT NULL DEFAULT 1, updated_at timestamp DEFAULT now()
);
COMMIT;
