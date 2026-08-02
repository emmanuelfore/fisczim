import "dotenv/config";
import { pool } from "../server/db.js";

const q = async (label: string, sql: string, params: any[] = []) => {
  const r = await pool.query(sql, params);
  console.log(`\n=== ${label} ===`);
  console.table(r.rows);
  return r.rows;
};

await q("Validation errors by code (all colors)", `
  SELECT error_code, error_color, COUNT(*) AS cnt
  FROM validation_errors
  GROUP BY error_code, error_color
  ORDER BY cnt DESC
  LIMIT 30`);

await q("Red errors by code", `
  SELECT error_code, COUNT(*) AS cnt
  FROM validation_errors
  WHERE error_color = 'Red'
  GROUP BY error_code
  ORDER BY cnt DESC
  LIMIT 30`);

await q("Red errors sample messages", `
  SELECT error_code, error_message, COUNT(*) AS cnt
  FROM validation_errors
  WHERE error_color = 'Red'
  GROUP BY error_code, error_message
  ORDER BY cnt DESC
  LIMIT 15`);

await q("Invoices by validation status", `
  SELECT validation_status, COUNT(*) AS cnt
  FROM invoices
  WHERE synced_with_fdms = true
  GROUP BY validation_status
  ORDER BY cnt DESC`);

await q("Red invoices per company (top 10)", `
  SELECT i.company_id, c.name, COUNT(*) AS red_count
  FROM invoices i
  JOIN companies c ON c.id = i.company_id
  WHERE i.validation_status = 'red'
  GROUP BY i.company_id, c.name
  ORDER BY red_count DESC
  LIMIT 10`);

await q("Red by company x code", `
  SELECT i.company_id, c.name, ve.error_code, COUNT(*) AS cnt
  FROM validation_errors ve
  JOIN invoices i ON i.id = ve.invoice_id
  JOIN companies c ON c.id = i.company_id
  WHERE ve.error_color = 'Red'
  GROUP BY i.company_id, c.name, ve.error_code
  HAVING COUNT(*) >= 3
  ORDER BY cnt DESC
  LIMIT 25`);

await q("Most recent red errors (last 10)", `
  SELECT ve.created_at, ve.error_code, ve.error_message, i.invoice_number, c.name
  FROM validation_errors ve
  JOIN invoices i ON i.id = ve.invoice_id
  JOIN companies c ON c.id = i.company_id
  WHERE ve.error_color = 'Red'
  ORDER BY ve.created_at DESC
  LIMIT 10`);

await pool.end();
