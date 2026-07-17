import "dotenv/config";
import { pool } from "./server/db.js";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_allocations (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER NOT NULL REFERENCES customer_stock(id),
        sales_order_line_id INTEGER NOT NULL REFERENCES sales_order_items(id),
        quantity_allocated NUMERIC(10, 2) NOT NULL,
        allocated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        released_at TIMESTAMP
      );
    `);
    
    console.log("Stock allocations migration successful!");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
