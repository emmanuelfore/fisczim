-- Vehicle stock number counter table
-- Replaces COUNT(*) + 1 with a proper sequence to avoid race conditions.

CREATE TABLE IF NOT EXISTS vehicle_stock_counters (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize counters for existing companies
INSERT INTO vehicle_stock_counters (company_id, next_number)
SELECT 
  id, 
  COALESCE(
    (SELECT COUNT(*) + 1 FROM vehicles WHERE company_id = companies.id),
    1
  )
FROM companies
WHERE NOT EXISTS (SELECT 1 FROM vehicle_stock_counters WHERE company_id = companies.id);
