import pg from "pg";
import { config } from "dotenv";

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
    const sql = process.argv[2] || "SELECT 1";
    const res = await pool.query(sql);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await pool.end();
  }
}

run();
