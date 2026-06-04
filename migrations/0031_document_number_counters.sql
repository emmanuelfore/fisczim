CREATE TABLE IF NOT EXISTS document_number_counters (
  company_id integer NOT NULL,
  prefix text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (company_id, prefix)
);
