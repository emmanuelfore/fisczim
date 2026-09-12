import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    console.log("Adding customer_id to inventory_transactions and goods_delivery_notes...");
    await pool.query(`
      ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
      ALTER TABLE goods_delivery_notes ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
    `);
    
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Error running migration:", error);
  } finally {
    await pool.end();
  }
}

main();
