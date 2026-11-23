-- 0107_configurable_statutory_engine.sql
--
-- Effective-dated, tenant-scoped statutory configuration for Zimbabwe payroll.
-- Seeds verified 2026 USD values for new and existing companies. APWCS has no
-- default rate: it is resolved from an employer-specific industrial code and
-- effective-dated NSSA premium schedule.

BEGIN;

ALTER TABLE public.payroll_statutory_rules
  ALTER COLUMN employee_rate DROP NOT NULL,
  ALTER COLUMN employer_rate DROP NOT NULL;

ALTER TABLE public.payroll_statutory_rules
  ADD COLUMN IF NOT EXISTS calculation_type text NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'EMPLOYEE_DEDUCTION',
  ADD COLUMN IF NOT EXISTS responsible_party text NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN IF NOT EXISTS statutory_authority text,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS is_capped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ceiling_period text,
  ADD COLUMN IF NOT EXISTS annual_amount numeric(15, 2),
  ADD COLUMN IF NOT EXISTS requires_industry_rate boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS payroll_statutory_rules_category_idx
  ON public.payroll_statutory_rules (company_id, category, effective_from);

CREATE TABLE IF NOT EXISTS public.payroll_industry_codes (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  statutory_authority text NOT NULL DEFAULT 'NSSA',
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  source_reference text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_industry_codes_company_code_idx
  ON public.payroll_industry_codes (company_id, code);

CREATE TABLE IF NOT EXISTS public.payroll_industry_premium_rates (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  industry_code_id integer NOT NULL REFERENCES public.payroll_industry_codes(id) ON DELETE CASCADE,
  rate numeric(8, 6) NOT NULL,
  ceiling_amount numeric(15, 2),
  effective_from date NOT NULL,
  effective_to date,
  statutory_authority text NOT NULL DEFAULT 'NSSA',
  source_reference text NOT NULL,
  gazette_reference text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_industry_premium_rates_company_period_idx
  ON public.payroll_industry_premium_rates (company_id, industry_code_id, effective_from);

CREATE TABLE IF NOT EXISTS public.payroll_employee_tax_credits (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  statutory_rule_id integer REFERENCES public.payroll_statutory_rules(id),
  credit_code text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  tax_year integer NOT NULL,
  qualifying_expenses numeric(15, 2) NOT NULL DEFAULT 0.00,
  annual_amount_override numeric(15, 2),
  documentation_reference text,
  approval_status text NOT NULL DEFAULT 'PENDING',
  approved_by uuid REFERENCES public.users(id),
  approved_at timestamp,
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_employee_tax_credits_employee_period_idx
  ON public.payroll_employee_tax_credits (company_id, employee_id, tax_year, effective_from);

CREATE INDEX IF NOT EXISTS payroll_employee_tax_credits_approval_idx
  ON public.payroll_employee_tax_credits (company_id, approval_status);

ALTER TABLE public.payroll_run_employees
  ADD COLUMN IF NOT EXISTS apwcs_amount numeric(15, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS zimdef_amount numeric(15, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS standards_levy_amount numeric(15, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS employer_cost_total numeric(15, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS statutory_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Verified 2026 tenant statutory rules ────────────────────────────────────
-- Inserted per company only when that company has no rule of the same code.
-- Existing tenant edits are never overwritten.

INSERT INTO public.payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, ceiling_amount, calculation_basis,
  calculation_type, category, responsible_party, statutory_authority,
  source_reference, is_capped, ceiling_period, annual_amount,
  requires_industry_rate, effective_from, version, is_active, is_system_locked, metadata
)
SELECT c.id, 'ZW', 'AIDS_LEVY', 'AIDS Levy', 'USD', 'MONTHLY',
  0.030000, 0.000000, NULL, 'PAYE_AFTER_CREDITS',
  'PERCENTAGE', 'EMPLOYEE_DEDUCTION', 'EMPLOYEE', 'ZIMRA',
  'ZIMRA 2026 USD PAYE tables / PAYE guidance', false, NULL, NULL,
  false, '2026-01-01', 1, true, false,
  jsonb_build_object('notes', '3% of PAYE payable after approved tax credits.')
FROM public.companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  AND NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.company_id = c.id AND r.rule_code = 'AIDS_LEVY'
);

INSERT INTO public.payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, ceiling_amount, calculation_basis,
  calculation_type, category, responsible_party, statutory_authority,
  source_reference, is_capped, ceiling_period, annual_amount,
  requires_industry_rate, effective_from, version, is_active, is_system_locked, metadata
)
SELECT c.id, 'ZW', 'NSSA_POBS_EMPLOYEE', 'NSSA POBS — Employee', 'USD', 'MONTHLY',
  0.045000, 0.000000, 700.00, 'INSURABLE_EARNINGS',
  'PERCENTAGE', 'EMPLOYEE_DEDUCTION', 'EMPLOYEE', 'NSSA',
  'NSSA POBS contribution notice — USD insurable earnings ceiling', true, 'MONTHLY', NULL,
  false, '2026-01-01', 1, true, false,
  jsonb_build_object('notes', 'Applies to eligible employees below 65. Ceiling is gazetted quarterly.')
FROM public.companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  AND NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.company_id = c.id AND r.rule_code = 'NSSA_POBS_EMPLOYEE'
);

INSERT INTO public.payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, ceiling_amount, calculation_basis,
  calculation_type, category, responsible_party, statutory_authority,
  source_reference, is_capped, ceiling_period, annual_amount,
  requires_industry_rate, effective_from, version, is_active, is_system_locked, metadata
)
SELECT c.id, 'ZW', 'NSSA_POBS_EMPLOYER', 'NSSA POBS — Employer', 'USD', 'MONTHLY',
  0.000000, 0.045000, 700.00, 'INSURABLE_EARNINGS',
  'PERCENTAGE', 'EMPLOYER_CONTRIBUTION', 'EMPLOYER', 'NSSA',
  'NSSA POBS contribution notice — USD insurable earnings ceiling', true, 'MONTHLY', NULL,
  false, '2026-01-01', 1, true, false,
  jsonb_build_object('notes', 'Employer cost only; never deducted from net pay.')
FROM public.companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  AND NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.company_id = c.id AND r.rule_code = 'NSSA_POBS_EMPLOYER'
);

INSERT INTO public.payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, ceiling_amount, calculation_basis,
  calculation_type, category, responsible_party, statutory_authority,
  source_reference, is_capped, ceiling_period, annual_amount,
  requires_industry_rate, effective_from, version, is_active, is_system_locked, metadata
)
SELECT c.id, 'ZW', 'ZIMDEF', 'ZIMDEF Training Levy', 'USD', 'MONTHLY',
  0.000000, 0.010000, NULL, 'GROSS_WAGE_BILL',
  'PERCENTAGE', 'EMPLOYER_CONTRIBUTION', 'EMPLOYER', 'ZIMDEF',
  'ZIMDEF employer FAQs — 1% of gross wage bill, monthly', false, NULL, NULL,
  false, '2026-01-01', 1, true, false,
  jsonb_build_object('notes', 'Includes bonuses, commissions, allowances, employer pension/medical contributions, benefits in kind and directors'' emoluments.')
FROM public.companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  AND NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.company_id = c.id AND r.rule_code = 'ZIMDEF'
);

INSERT INTO public.payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, ceiling_amount, calculation_basis,
  calculation_type, category, responsible_party, statutory_authority,
  source_reference, is_capped, ceiling_period, annual_amount,
  requires_industry_rate, effective_from, version, is_active, is_system_locked, metadata
)
SELECT c.id, 'ZW', 'APWCS', 'NSSA APWCS Premium', 'USD', 'MONTHLY',
  0.000000, NULL, NULL, 'APWCS_INSURABLE_WAGE_BILL',
  'PERCENTAGE', 'EMPLOYER_CONTRIBUTION', 'EMPLOYER', 'NSSA',
  'NSSA APWCS industrial classification and gazetted premium schedule', false, NULL, NULL,
  true, '2026-01-01', 1, true, false,
  jsonb_build_object('notes', 'No default rate. Configure the employer NSSA industry code and effective premium rate.')
FROM public.companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  AND NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.company_id = c.id AND r.rule_code = 'APWCS'
);

INSERT INTO public.payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, ceiling_amount, calculation_basis,
  calculation_type, category, responsible_party, statutory_authority,
  source_reference, is_capped, ceiling_period, annual_amount,
  requires_industry_rate, effective_from, version, is_active, is_system_locked, metadata
)
SELECT c.id, 'ZW', seeds.code, seeds.name, 'USD', 'MONTHLY',
  NULL, NULL, NULL, 'QUALIFYING_INDIVIDUAL',
  'FIXED_ANNUAL', 'TAX_CREDIT', 'EMPLOYEE', 'ZIMRA', source_ref, false, NULL, 900.00,
  false, '2026-01-01', 1, true, false, jsonb_build_object('notes', notes)
FROM public.companies c
CROSS JOIN (
  VALUES
    ('ELDERLY_CREDIT', 'Elderly Person Tax Credit', 'ZIMRA PAYE explained — elderly persons credit', 'USD 900 per year. Requires approved employee eligibility.'),
    ('BLIND_CREDIT', 'Blind Person Tax Credit', 'ZIMRA PAYE explained — blind persons credit', 'USD 900 per year. Requires approved employee eligibility.'),
    ('DISABLED_CREDIT', 'Disabled Person Tax Credit', 'ZIMRA PAYE explained — mentally or physically disabled persons credit', 'USD 900 per year. Requires approved employee eligibility.')
) AS seeds(code, name, source_ref, notes)
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  AND NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.company_id = c.id AND r.rule_code = seeds.code
);

INSERT INTO public.payroll_statutory_rules (
  company_id, country_code, rule_code, name, currency, pay_frequency,
  employee_rate, employer_rate, ceiling_amount, calculation_basis,
  calculation_type, category, responsible_party, statutory_authority,
  source_reference, is_capped, ceiling_period, annual_amount,
  requires_industry_rate, effective_from, version, is_active, is_system_locked, metadata
)
SELECT c.id, 'ZW', 'MEDICAL_CREDIT', 'Medical Expenses Tax Credit', 'USD', 'MONTHLY',
  0.500000, NULL, NULL, 'QUALIFYING_EXPENSE',
  'PERCENT_OF_QUALIFYING_EXPENSE', 'TAX_CREDIT', 'EMPLOYEE', 'ZIMRA',
  'ZIMRA PAYE explained — medical expenses and invalid appliances', false, NULL, NULL,
  false, '2026-01-01', 1, true, false,
  jsonb_build_object('notes', 'One credit for every USD 2 of qualifying expenditure. Requires documentation and approval.')
FROM public.companies c
WHERE lower(coalesce(c.country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  AND NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.company_id = c.id AND r.rule_code = 'MEDICAL_CREDIT'
);

-- ── Verified 2026 PAYE tax table ────────────────────────────────────────────
-- Company-specific table so tenants can add their own future effective-dated
-- versions without editing the global template.

DO $$
DECLARE
  company_row record;
  tax_table_id integer;
BEGIN
  FOR company_row IN
    SELECT id FROM public.companies
    WHERE lower(coalesce(country, 'Zimbabwe')) IN ('zimbabwe', 'zw')
  LOOP
    INSERT INTO public.payroll_tax_tables (
      company_id, country_code, currency, tax_year, pay_frequency,
      effective_from, effective_to, version, source_reference, is_active
    )
    SELECT
      company_row.id, 'ZW', 'USD', 2026, 'MONTHLY',
      '2026-01-01'::date, '2026-12-31'::date, 1,
      'ZIMRA 2026 USD PAYE tax tables — monthly column (verified 23 Nov 2026)', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payroll_tax_tables t
      WHERE t.company_id = company_row.id
        AND t.tax_year = 2026
        AND t.currency = 'USD'
        AND t.pay_frequency = 'MONTHLY'
    )
    RETURNING id INTO tax_table_id;

    IF tax_table_id IS NOT NULL THEN
      INSERT INTO public.payroll_tax_brackets (tax_table_id, bracket_order, min_income, max_income, rate, deduction, base_tax)
      VALUES
        (tax_table_id, 1, 0, 100, 0, 0, 0),
        (tax_table_id, 2, 100, 300, 20, 20, 0),
        (tax_table_id, 3, 300, 1000, 25, 35, 0),
        (tax_table_id, 4, 1000, 2000, 30, 85, 0),
        (tax_table_id, 5, 2000, 3000, 35, 185, 0),
        (tax_table_id, 6, 3000, NULL, 40, 335, 0);
      tax_table_id := NULL;
    END IF;
  END LOOP;
END $$;

COMMIT;
