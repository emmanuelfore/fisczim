-- Storage for CRM public lead submission tokens and rate limiting
-- Prevents abuse of the public lead submission endpoint.

CREATE TABLE IF NOT EXISTS crm_public_lead_tokens (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS crm_public_lead_tokens_company_idx ON crm_public_lead_tokens(company_id);
CREATE INDEX IF NOT EXISTS crm_public_lead_tokens_active_idx ON crm_public_lead_tokens(is_active, expires_at) WHERE is_active = TRUE;

-- Rate limiting table for public lead submissions
CREATE TABLE IF NOT EXISTS crm_public_lead_rate_limits (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  submission_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP DEFAULT NOW(),
  window_end TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS crm_public_lead_rate_limits_lookup_idx
  ON crm_public_lead_rate_limits(company_id, ip_address, window_end);
