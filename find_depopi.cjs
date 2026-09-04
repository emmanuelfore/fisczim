require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const res = await pool.query(`SELECT id, name, trading_name, fdms_device_id, zimra_environment, last_receipt_global_no, daily_receipt_count, last_fiscal_hash, current_fiscal_day_no, fiscal_day_open FROM companies WHERE name ILIKE '%depopi%' OR name ILIKE '%depo%' OR trading_name ILIKE '%depopi%' OR trading_name ILIKE '%depo%'`);
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

main().catch(console.error);
