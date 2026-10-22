-- Investigate invoice INV-659108 fiscalization failure

-- 1. Find the invoice
SELECT 
    i.id,
    i.invoice_number,
    i.company_id,
    c.name as company_name,
    c.vat_registered,
    i.status,
    i.fdms_status,
    i.validation_status,
    i.fiscal_code,
    i.fiscal_day_no,
    i.created_at,
    i.is_pos,
    i.total,
    i.currency
FROM invoices i
JOIN companies c ON c.id = i.company_id
WHERE i.invoice_number = 'INV-659108';

-- 2. Find fiscalization jobs for this invoice
SELECT 
    id,
    invoice_id,
    status,
    attempt_count,
    last_error_code,
    last_error_message,
    next_attempt_at,
    completed_at,
    created_at,
    updated_at
FROM fiscalization_jobs
WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-659108')
ORDER BY created_at DESC;

-- 3. Find ZIMRA logs for this invoice
SELECT 
    id,
    company_id,
    invoice_id,
    endpoint,
    status_code,
    error_message,
    created_at,
    LEFT(request_payload::text, 500) as request_preview,
    LEFT(response_payload::text, 500) as response_preview
FROM zimra_logs
WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-659108')
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check for other failed invoices from same company (last 7 days)
SELECT 
    i.invoice_number,
    i.status,
    i.fdms_status,
    i.fiscal_code,
    i.created_at,
    fj.status as job_status,
    fj.last_error_message,
    fj.attempt_count
FROM invoices i
LEFT JOIN fiscalization_jobs fj ON i.id = fj.invoice_id
WHERE i.company_id = (SELECT company_id FROM invoices WHERE invoice_number = 'INV-659108')
  AND i.fiscal_code IS NULL
  AND COALESCE(i.status, '') <> 'cancelled'
  AND i.created_at >= NOW() - INTERVAL '7 days'
ORDER BY i.created_at DESC
LIMIT 20;
