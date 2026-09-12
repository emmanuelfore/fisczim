import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    console.log("Updating products.cost_price...");
    await pool.query("ALTER TABLE products ALTER COLUMN cost_price TYPE numeric(14,6);");
    console.log("Updating product_batches.cost_price...");
    await pool.query("ALTER TABLE product_batches ALTER COLUMN cost_price TYPE numeric(14,6);");
    console.log("Success!");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
