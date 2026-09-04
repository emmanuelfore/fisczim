require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const companyId = 32;
  
  // Get zimra_logs for this company
  const logsRes = await pool.query(`
    SELECT zl.*, i.invoice_number, i.fiscal_day_no, i.receipt_counter, i.receipt_global_no, i.fiscal_code, i.fdms_status, i.validation_status
    FROM zimra_logs zl
    JOIN invoices i ON zl.invoice_id = i.id
    WHERE i.company_id = $1
    ORDER BY zl.created_at DESC
    LIMIT 20
  `, [companyId]);
  
  console.log("=== ZIMRA LOGS (latest 20) ===");
  console.log(JSON.stringify(logsRes.rows, null, 2));
  
  // Get invoices for this company
  const invRes = await pool.query(`
    SELECT id, invoice_number, fiscal_day_no, receipt_counter, receipt_global_no, fiscal_code, fdms_status, validation_status, synced_with_fdms, created_at
    FROM invoices
    WHERE company_id = $1 AND is_fiscalized = true
    ORDER BY receipt_global_no DESC NULLS LAST
    LIMIT 20
  `, [companyId]);
  
  console.log("\n=== FISCALIZED INVOICES (latest 20) ===");
  console.log(JSON.stringify(invRes.rows, null, 2));
  
  await pool.end();
}

main().catch(console.error);
