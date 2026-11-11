-- Vehicle stock number counter table
-- Replaces COUNT(*) + 1 with a proper sequence to avoid race conditions.

CREATE TABLE IF NOT EXISTS vehicle_stock_counters (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed from the highest numeric VH-#### already issued. COUNT(*) is not safe:
-- deleted vehicles leave gaps and re-use numbers that were already printed.
INSERT INTO vehicle_stock_counters (company_id, next_number)
SELECT
  c.id,
  COALESCE(
    (
      SELECT MAX(NULLIF(regexp_replace(v.stock_number, '\D', '', 'g'), '')::int)
      FROM vehicles v
      WHERE v.company_id = c.id
    ),
    0
  ) + 1
FROM companies c
ON CONFLICT (company_id) DO NOTHING;
