-- Unique VIN index per company
-- Prevents duplicate VINs within the same company.

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_company_vin_unique 
ON vehicles(company_id, vin) 
WHERE vin IS NOT NULL AND vin != '';
