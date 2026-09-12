INSERT INTO payment_allocations (company_id, payment_id, invoice_id, amount, allocated_at)
SELECT
  p.company_id,
  p.id,
  p.invoice_id,
  p.amount,
  COALESCE(p.created_at, p.payment_date, now())
FROM payments p
WHERE p.invoice_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM payment_allocations pa
    WHERE pa.payment_id = p.id
      AND pa.invoice_id = p.invoice_id
      AND pa.reversed_at IS NULL
  );
