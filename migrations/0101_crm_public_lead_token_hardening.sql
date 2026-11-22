-- Harden CRM public lead tokens and the public submission rate limiter.
-- Companion to shared/schema.ts (token_prefix + rate-limit window uniqueness).

-- A non-secret prefix lets admins identify a token without being able to use it.
ALTER TABLE crm_public_lead_tokens
  ADD COLUMN IF NOT EXISTS token_prefix TEXT;

-- Drizzle models ip_address as text. The old INET column made arbitrary
-- forwarded-header values fail with a cast error instead of being rejected.
ALTER TABLE crm_public_lead_rate_limits
  ALTER COLUMN ip_address TYPE TEXT USING ip_address::text;

-- Fixed hourly windows are incremented atomically through ON CONFLICT.
-- Collapse duplicate windows created by the old rolling-window algorithm first.
DELETE FROM crm_public_lead_rate_limits a
 USING crm_public_lead_rate_limits b
 WHERE a.id > b.id
   AND a.company_id = b.company_id
   AND a.ip_address = b.ip_address
   AND a.window_start = b.window_start;

CREATE UNIQUE INDEX IF NOT EXISTS crm_public_lead_rate_limits_window_unique
  ON crm_public_lead_rate_limits(company_id, ip_address, window_start);

-- Expired windows are never read; keep the table bounded.
DELETE FROM crm_public_lead_rate_limits
 WHERE window_end < now() - interval '1 day';
