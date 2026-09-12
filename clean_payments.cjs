const { Client } = require("pg");
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  
  console.log("Checking payments...");
  
  const queries = [
    `DELETE FROM payment_allocations WHERE payment_id IN (SELECT p.id FROM payments p LEFT JOIN companies c ON p.company_id = c.id WHERE c.id IS NULL);`,
    `DELETE FROM payments WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = payments.company_id);`,
    
    `DELETE FROM payment_allocations WHERE payment_id IN (SELECT p.id FROM payments p LEFT JOIN invoices i ON p.invoice_id = i.id WHERE i.id IS NULL AND p.invoice_id IS NOT NULL);`,
    `DELETE FROM payments WHERE invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id);`,
    
    `DELETE FROM payment_allocations WHERE payment_id IN (SELECT p.id FROM payments p LEFT JOIN branches b ON p.branch_id = b.id WHERE b.id IS NULL AND p.branch_id IS NOT NULL);`,
    `DELETE FROM payments WHERE branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = payments.branch_id);`,
    
    `DELETE FROM payment_allocations WHERE payment_id IN (SELECT p.id FROM payments p LEFT JOIN users u ON p.created_by = u.id WHERE u.id IS NULL AND p.created_by IS NOT NULL);`,
    `DELETE FROM payments WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = payments.created_by);`
  ];

  let totalDeleted = 0;
  for (const q of queries) {
    try {
      const res = await client.query(q);
      if (!q.includes("payment_allocations")) {
        console.log(`Deleted ${res.rowCount} invalid payments`);
        totalDeleted += res.rowCount;
      }
    } catch (e) {
      console.error("Error executing:", q);
      console.error(e.message);
    }
  }

  console.log(`Total invalid payments deleted: ${totalDeleted}`);
  await client.end();
}

run().catch(console.error);
