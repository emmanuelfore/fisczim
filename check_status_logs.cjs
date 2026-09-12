require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const companyId = 32;
  
  // Get all zimra_logs for this company - look for getStatus or similar
  const logsRes = await pool.query(`
    SELECT zl.*
    FROM zimra_logs zl
    JOIN invoices i ON zl.invoice_id = i.id
    WHERE i.company_id = $1
    ORDER BY zl.created_at DESC
    LIMIT 50
  `, [companyId]);
  
  console.log("=== ALL ZIMRA LOGS - looking for status checks ===");
  logsRes.rows.forEach(log => {
    if (log.endpoint && (log.endpoint.toLowerCase().includes('status') || log.endpoint.toLowerCase().includes('get'))) {
      console.log("\n--- Status-like endpoint ---");
      console.log("Endpoint:", log.endpoint);
      console.log("Created:", log.created_at);
      console.log("Response:", JSON.stringify(log.response_payload, null, 2));
    }
  });
  
  await pool.end();
}

main().catch(console.error);
