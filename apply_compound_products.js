import pg from "pg";
import { config } from "dotenv";
import fs from "fs";

config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    const sql = fs.readFileSync("apply_compound_products.sql", "utf8");
    const res = await pool.query(sql);
    console.log("Migration executed successfully!");
    console.log(res);
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await pool.end();
  }
}

run();
