import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log("Checking failed invoices for today (2026-08-03)...");
    
    // We will look for invoices that have failed or have error statuses
    const result = await client.query(`
      SELECT id, invoice_number, status, fdms_status, validation_status, created_at, customer_name, total 
      FROM invoices 
      WHERE (DATE(created_at) = CURRENT_DATE OR DATE(created_at) = CURRENT_DATE - 1)
        AND (status = 'failed' OR fdms_status = 'failed' OR validation_status = 'failed' OR fdms_status = 'error')
      ORDER BY created_at DESC 
      LIMIT 20
    `);
      
    console.log("Failed Invoices (status/fdms_status/validation_status):", JSON.stringify(result.rows, null, 2));

    // Also check api logs for errors today regarding invoices
    const logsResult = await client.query(`
      SELECT id, endpoint, status_code, response_payload, created_at 
      FROM api_logs 
      WHERE (DATE(created_at) = CURRENT_DATE OR DATE(created_at) = CURRENT_DATE - 1)
        AND status_code >= 400
        AND endpoint LIKE '%invoice%'
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log("Recent API Logs with errors:", JSON.stringify(logsResult.rows, null, 2));

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}
main();
