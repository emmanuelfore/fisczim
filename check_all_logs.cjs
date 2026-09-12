require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const companyId = 32;
  
  // Get all zimra_logs with company_id directly
  const logsRes = await pool.query(`
    SELECT * FROM zimra_logs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 50
  `, [companyId]);
  
  console.log("=== ALL ZIMRA LOGS (direct company_id) ===");
  logsRes.rows.forEach(log => {
    console.log(`\n--- Log ID: ${log.id}, Endpoint: ${log.endpoint}, Created: ${log.created_at} ---`);
    if (log.response_payload) {
      console.log("Response keys:", Object.keys(log.response_payload));
      // Check if it has lastReceiptGlobalNo or similar
      if (log.response_payload.lastReceiptGlobalNo !== undefined) {
        console.log("LAST RECEIPT GLOBAL NO FROM ZIMRA:", log.response_payload.lastReceiptGlobalNo);
      }
      if (log.response_payload.lastReceiptHash !== undefined) {
        console.log("LAST RECEIPT HASH FROM ZIMRA:", log.response_payload.lastReceiptHash);
      }
      if (log.response_payload.serverHash !== undefined) {
        console.log("SERVER HASH FROM ZIMRA:", log.response_payload.serverHash);
      }
    }
  });
  
  await pool.end();
}

main().catch(console.error);
