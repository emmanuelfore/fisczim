-- Add the customer-deposits liability account to every company chart.
-- Deposits received before an invoice are held here (Dr bank/cash, Cr deposits)
-- and cleared against accounts receivable when the invoice is raised.

INSERT INTO accounts
  (company_id, code, name, type, sub_type, normal_balance, category, is_control_account, is_system, is_active)
SELECT
  c.id,
  '2010',
  'Customer Deposits',
  'LIABILITY',
  'Current',
  'CREDIT',
  'Current Liabilities',
  false,
  true,
  true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.company_id = c.id AND a.code = '2010'
);
