-- Add configurable NHIF and WCIF rule definitions to existing Zimbabwe tenants.
-- Rates are intentionally NULL: no statutory rate is invented. Payroll produces
-- zero plus an explicit warning until the client configures the effective rate.

INSERT INTO payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, calculation_basis, calculation_type,
  category, responsible_party, statutory_authority, source_reference,
  is_capped, requires_industry_rate, metadata, effective_from, version,
  is_active, is_system_locked
)
SELECT
  c.id, 'ZW', 'NHIF', 'NHIF Contribution', 'USD', 'MONTHLY',
  NULL, 0, 'GROSS_WAGE_BILL', 'PERCENTAGE',
  'EMPLOYEE_DEDUCTION', 'EMPLOYEE', 'NHIF',
  'National Health Insurance Fund contribution schedule / applicable tier',
  false, true, '{}'::jsonb, '2026-01-01', 1, true, false
FROM companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zw', 'zimbabwe')
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_rules r
    WHERE r.company_id = c.id AND r.rule_code = 'NHIF'
  );

INSERT INTO payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, calculation_basis, calculation_type,
  category, responsible_party, statutory_authority, source_reference,
  is_capped, requires_industry_rate, metadata, effective_from, version,
  is_active, is_system_locked
)
SELECT
  c.id, 'ZW', 'WCIF', 'Workers'' Compensation Levy', 'USD', 'MONTHLY',
  0, NULL, 'GROSS_WAGE_BILL', 'PERCENTAGE',
  'EMPLOYER_CONTRIBUTION', 'EMPLOYER',
  'Workers'' Compensation Insurance Fund',
  'Compensation for Injuries and Diseases Act - industry class premium schedule',
  false, true, '{}'::jsonb, '2026-01-01', 1, true, false
FROM companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zw', 'zimbabwe')
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_rules r
    WHERE r.company_id = c.id AND r.rule_code = 'WCIF'
  );
