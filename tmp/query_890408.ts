import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const inv = await pool.query(
    `SELECT id, invoice_number AS "invoiceNumber", company_id AS "companyId", total, subtotal, tax_amount AS "taxAmount", tax_inclusive AS "taxInclusive", currency,
            transaction_type AS "transactionType", related_invoice_id AS "relatedInvoiceId", receipt_counter AS "receiptCounter", receipt_global_no AS "receiptGlobalNo", fiscal_day_no AS "fiscalDayNo",
            validation_status AS "validationStatus", fdms_status AS "fdmsStatus", issue_date AS "issueDate", offline_date AS "offlineDate"
     FROM invoices WHERE invoice_number = $1`, ["INV-890408"]);
  if (inv.rows.length === 0) {
    console.log("INVOICE NOT FOUND");
    return;
  }
  const row = inv.rows[0];
  console.log("INVOICE:", JSON.stringify(row, null, 2));

  const items = await pool.query(
    `SELECT * FROM invoice_items WHERE invoice_id = $1`, [row.id]);
  console.log("ITEMS:", JSON.stringify(items.rows, null, 2));

  const logs = await pool.query(
    `SELECT id, invoice_id AS "invoiceId", endpoint, request_payload AS "requestPayload", response_payload AS "responsePayload", status_code AS "statusCode", error_message AS "errorMessage", created_at AS "createdAt"
     FROM zimra_logs WHERE invoice_id = $1 ORDER BY id DESC LIMIT 5`, [row.id]);
  for (const l of logs.rows) {
    console.log("LOG:", l.id, l.endpoint, l.statusCode, "createdAt:", l.createdAt);
    console.log("  REQUEST:", typeof l.requestPayload === "string" ? l.requestPayload.slice(0, 6000) : JSON.stringify(l.requestPayload).slice(0, 6000));
    console.log("  RESPONSE:", typeof l.responsePayload === "string" ? l.responsePayload.slice(0, 4000) : JSON.stringify(l.responsePayload).slice(0, 4000));
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
