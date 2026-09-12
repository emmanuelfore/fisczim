-- Add correction period and fiscal day staleness settings to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS correction_period_months INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS fiscal_day_staleness_hours INTEGER DEFAULT 24;

-- Add same settings to branches table for override capability
ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS correction_period_months INTEGER,
ADD COLUMN IF NOT EXISTS fiscal_day_staleness_hours INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN companies.correction_period_months IS 'Number of months allowed for credit/debit note corrections (default 12)';
COMMENT ON COLUMN companies.fiscal_day_staleness_hours IS 'Hours before a fiscal day is considered stale (default 24)';
COMMENT ON COLUMN branches.correction_period_months IS 'Override company correction period at branch level';
COMMENT ON COLUMN branches.fiscal_day_staleness_hours IS 'Override company fiscal day staleness threshold at branch level';