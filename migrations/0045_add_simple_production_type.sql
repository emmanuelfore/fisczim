-- Add SIMPLE production type support
-- This allows production runs without BOM for manual input/output (e.g., repackaging)

-- Update type field default and make bomId nullable
ALTER TABLE production_runs 
  ALTER COLUMN type SET DEFAULT 'RECIPE',
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN bom_id DROP NOT NULL;

-- Update existing records with type 'STANDARD' to 'RECIPE'
UPDATE production_runs SET type = 'RECIPE' WHERE type = 'STANDARD';
UPDATE production_runs SET type = 'RECIPE' WHERE type = 'REWORK';

-- Add check constraint for valid types
ALTER TABLE production_runs 
  ADD CONSTRAINT production_runs_type_check 
  CHECK (type IN ('RECIPE', 'SIMPLE'));
