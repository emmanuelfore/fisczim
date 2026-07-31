-- Add response time, IP address, and user agent columns to api_logs table
ALTER TABLE api_logs 
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Make JSON fields nullable to handle cases where they might not be available
ALTER TABLE api_logs 
ALTER COLUMN request_payload DROP NOT NULL,
ALTER COLUMN response_payload DROP NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN api_logs.response_time_ms IS 'Response time in milliseconds';
COMMENT ON COLUMN api_logs.ip_address IS 'Client IP address';
COMMENT ON COLUMN api_logs.user_agent IS 'Client user agent string';