import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    console.log("Creating customer_stock_transactions table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_stock_transactions (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        type TEXT NOT NULL,
        quantity DECIMAL(10,2) NOT NULL,
        reference_type TEXT NOT NULL,
        reference_id TEXT,
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS cst_trans_customer_idx ON customer_stock_transactions(customer_id);
      CREATE INDEX IF NOT EXISTS cst_trans_product_idx ON customer_stock_transactions(product_id);
    `);
    
    console.log("Table created successfully!");
  } catch (error) {
    console.error("Error creating table:", error);
  } finally {
    await pool.end();
  }
}

main();
