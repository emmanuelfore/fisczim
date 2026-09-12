import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function run() {
  const id = 365;
  const fromStart = "2020-01-01 00:00:00";
  const toEnd = "2026-07-20 23:59:59.999";
  const ledgerResult = await db.execute(sql.raw(`
    SELECT
      i.issue_date AS date,
      i.invoice_number AS reference,
      'Invoice Issued' AS description,
      COALESCE(i.total, 0) AS debit,
      0 AS credit,
      'invoice' AS entry_type
    FROM invoices i
    WHERE i.customer_id = ${id}
      AND i.issue_date >= '${fromStart}'
      AND i.issue_date <= '${toEnd}'
      AND i.status NOT IN ('cancelled','quote')
    UNION ALL
    SELECT
      p.payment_date AS date,
      COALESCE(p.reference, 'PAY-' || p.id::text) AS reference,
      'Payment Received' AS description,
      0 AS debit,
      COALESCE(p.amount, 0) AS credit,
      'payment' AS entry_type
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE i.customer_id = ${id}
      AND p.payment_date >= '${fromStart}'
      AND p.payment_date <= '${toEnd}'
    ORDER BY date ASC, entry_type DESC
  `));
  console.log(ledgerResult.rows);
  process.exit(0);
}
run();
