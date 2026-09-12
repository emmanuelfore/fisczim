-- Add default HS code to tax_types for pass-through fiscalization
ALTER TABLE tax_types
ADD COLUMN IF NOT EXISTS default_hs_code TEXT;

-- Add comments for documentation
COMMENT ON COLUMN tax_types.default_hs_code IS 'Default HS code used when fiscalizing items with this tax type (e.g. 99001000 for standard)';
