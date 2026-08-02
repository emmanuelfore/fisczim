import "dotenv/config";
import { pool } from "../server/db.js";

const q = async (label: string, sql: string, params: any[] = []) => {
  const r = await pool.query(sql, params);
  console.log(`\n=== ${label} ===`);
  console.table(r.rows);
  return r.rows;
};

await q("RCPT041 sample messages", `
  SELECT error_message, COUNT(*) AS cnt
  FROM validation_errors
  WHERE error_code = 'RCPT041'
  GROUP BY error_message
  ORDER BY cnt DESC
  LIMIT 5`);

await q("RCPT011 grey sample", `
  SELECT error_message, COUNT(*) AS cnt
  FROM validation_errors
  WHERE error_code = 'RCPT011' AND error_color = 'Gray'
  GROUP BY error_message
  ORDER BY cnt DESC
  LIMIT 3`);

await q("RCPT020 red sample messages", `
  SELECT error_message, COUNT(*) AS cnt
  FROM validation_errors
  WHERE error_code = 'RCPT020' AND error_color IN ('Red','Gray')
  GROUP BY error_message
  ORDER BY cnt DESC
  LIMIT 5`);

await q("RCPT026 sample", `
  SELECT error_message, COUNT(*) AS cnt
  FROM validation_errors
  WHERE error_code = 'RCPT026'
  GROUP BY error_message
  ORDER BY cnt DESC
  LIMIT 3`);

await q("Hillend 12: recent RCPT012 invoices with their counters", `
  SELECT ve.created_at, i.invoice_number, i.receipt_counter, i.receipt_global_no,
         i.fiscal_day_no, i.validation_status
  FROM validation_errors ve
  JOIN invoices i ON i.id = ve.invoice_id
  WHERE ve.error_code = 'RCPT012' AND i.company_id = 12
  ORDER BY ve.created_at DESC
  LIMIT 12`);

await q("Hillend 12: last 10 zimra_logs submit receipts", `
  SELECT created_at, status_code, error_message,
         request_payload->'receipt'->>'receiptCounter' AS counter,
         request_payload->'receipt'->>'receiptGlobalNo' AS globalno,
         request_payload->'receipt'->>'invoiceNo' AS invoiceno
  FROM zimra_logs
  WHERE company_id = 12 AND endpoint LIKE '%Submission%'
  ORDER BY created_at DESC
  LIMIT 10`);

await q("Hillend 12: company counters", `
  SELECT last_receipt_global_no, daily_receipt_count, current_fiscal_day_no,
         fiscal_day_open, last_fiscal_day_status, last_fiscal_hash IS NOT NULL AS has_hash
  FROM companies WHERE id = 12`);

await q("Yellow/grey invoices by company (top 8)", `
  SELECT i.company_id, c.name, i.validation_status, COUNT(*) AS cnt
  FROM invoices i
  JOIN companies c ON c.id = i.company_id
  WHERE i.validation_status IN ('yellow','grey') AND i.synced_with_fdms = true
  GROUP BY i.company_id, c.name, i.validation_status
  ORDER BY cnt DESC
  LIMIT 8`);

await pool.end();
