import "dotenv/config";
import { pool } from "./server/db.js";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_order_audit_logs (
        id SERIAL PRIMARY KEY,
        sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
        field_changed TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by UUID REFERENCES users(id),
        changed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      ALTER TABLE customer_products ADD COLUMN IF NOT EXISTS negotiated_price NUMERIC(10, 2);
    `);
    
    console.log("Migration successful!");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
