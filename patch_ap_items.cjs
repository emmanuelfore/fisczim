const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add columns to supplier_invoice_items
    console.log("Adding columns to supplier_invoice_items...");
    await client.query(`
      ALTER TABLE supplier_invoice_items
      ADD COLUMN IF NOT EXISTS account_code text,
      ADD COLUMN IF NOT EXISTS tax_type_id integer REFERENCES tax_types(id),
      ADD COLUMN IF NOT EXISTS is_recoverable boolean DEFAULT true;
    `);

    await client.query('COMMIT');
    console.log("Migration successful!");
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

main();
