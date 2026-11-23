-- 0106_payroll_element_rules.sql
--
-- Company-scoped allowance/deduction rules. These let HR apply a pay item to
-- every current and future employee, or to a selected list, without creating
-- one recurring row per employee. Payroll runs merge these rules with the
-- existing per-employee recurring items.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payroll_element_rules (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  calculation_method text NOT NULL DEFAULT 'FIXED',
  amount numeric(15, 2),
  percentage_rate numeric(7, 4),
  is_taxable boolean NOT NULL DEFAULT true,
  is_tax_deductible boolean NOT NULL DEFAULT false,
  applies_to_all boolean NOT NULL DEFAULT false,
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT payroll_element_rules_type_check CHECK (type IN ('ALLOWANCE', 'DEDUCTION')),
  CONSTRAINT payroll_element_rules_method_check CHECK (calculation_method IN ('FIXED', 'PERCENTAGE')),
  CONSTRAINT payroll_element_rules_value_check CHECK (
    (calculation_method = 'FIXED' AND amount IS NOT NULL AND amount >= 0)
    OR
    (calculation_method = 'PERCENTAGE' AND percentage_rate IS NOT NULL AND percentage_rate > 0 AND percentage_rate <= 100)
  )
);

CREATE INDEX IF NOT EXISTS payroll_element_rules_company_idx
  ON public.payroll_element_rules (company_id, is_active, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.payroll_element_rule_employees (
  rule_id integer NOT NULL REFERENCES public.payroll_element_rules(id) ON DELETE CASCADE,
  employee_id integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, employee_id)
);

CREATE INDEX IF NOT EXISTS payroll_element_rule_employees_employee_idx
  ON public.payroll_element_rule_employees (employee_id, rule_id);

COMMIT;
