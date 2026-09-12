-- ============================================================
-- DELETE JUNE & JULY SALES FOR FLAWLESS BEAUTY
-- Does NOT reverse stock/inventory quantities
-- ============================================================

-- Step 1: Preview - find the company and invoices to be deleted
SELECT
  c.id   AS company_id,
  c.name AS company_name,
  COUNT(i.id) AS invoices_to_delete,
  MIN(i.issue_date) AS earliest_date,
  MAX(i.issue_date) AS latest_date,
  SUM(i.total::numeric) AS total_value_deleted
FROM companies c
JOIN invoices i ON i.company_id = c.id
WHERE
  c.name ILIKE '%flawless%beauty%'
  AND EXTRACT(MONTH FROM i.issue_date) IN (6, 7)
  AND EXTRACT(YEAR  FROM i.issue_date) = 2026
GROUP BY c.id, c.name;

-- ============================================================
-- STEP 2: Actual delete (run in a transaction for safety)
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_company_id INTEGER;
  v_invoice_ids INTEGER[];
BEGIN
  -- Get company id
  SELECT id INTO v_company_id
  FROM companies
  WHERE name ILIKE '%flawless%beauty%'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company "Flawless Beauty" not found';
  END IF;

  RAISE NOTICE 'Company ID: %', v_company_id;

  -- Collect invoice IDs for June & July 2026
  SELECT ARRAY_AGG(id) INTO v_invoice_ids
  FROM invoices
  WHERE
    company_id = v_company_id
    AND EXTRACT(MONTH FROM issue_date) IN (6, 7)
    AND EXTRACT(YEAR  FROM issue_date) = 2026;

  IF v_invoice_ids IS NULL OR array_length(v_invoice_ids, 1) = 0 THEN
    RAISE NOTICE 'No June/July 2026 invoices found for company %', v_company_id;
  ELSE
    RAISE NOTICE 'Deleting % invoices: %', array_length(v_invoice_ids, 1), v_invoice_ids;

    -- 1. Delete invoice items (FK)
    DELETE FROM invoice_items
    WHERE invoice_id = ANY(v_invoice_ids);

    -- 2. Delete validation errors (FK)
    DELETE FROM validation_errors
    WHERE invoice_id = ANY(v_invoice_ids);

    -- 3. Delete payments (FK)
    DELETE FROM payments
    WHERE invoice_id = ANY(v_invoice_ids);

    -- 4. Delete payment allocations (FK)
    DELETE FROM payment_allocations
    WHERE invoice_id = ANY(v_invoice_ids);

    -- 5. Nullify zimra_logs references (preserve logs, break FK)
    UPDATE zimra_logs
    SET invoice_id = NULL
    WHERE invoice_id = ANY(v_invoice_ids);

    -- 6. Finally delete the invoices themselves
    DELETE FROM invoices
    WHERE id = ANY(v_invoice_ids);

    RAISE NOTICE 'Done. % invoices deleted. Stock NOT reversed.', array_length(v_invoice_ids, 1);
  END IF;
END $$;

COMMIT;
