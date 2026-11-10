-- Add customer deposits liability account to system accounts
-- This account holds deposits received before invoice issuance.

INSERT INTO system_account_defaults (company_id, account_code, account_name, account_type)
SELECT 
  id, 
  '2010', 
  'Customer Deposits', 
  'LIABILITY'
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM system_account_defaults 
  WHERE company_id = companies.id AND account_code = '2010'
);
