import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log("Checking failed invoices for today (2026-08-03)...");
    
    const result = await client.query(`
      SELECT id, invoice_number, status, fiscal_status, zimra_error, created_at, customer_name, total 
      FROM invoices 
      WHERE DATE(created_at) = CURRENT_DATE OR DATE(created_at) = CURRENT_DATE - 1
      ORDER BY created_at DESC 
      LIMIT 20
    `);
      
    console.log("Recent Invoices:", JSON.stringify(result.rows, null, 2));

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}
main();
