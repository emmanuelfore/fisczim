import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});

const r = await pool.query(
  `select id, name, zimra_environment, fdms_device_id, fiscal_day_open, current_fiscal_day_no,
          last_receipt_global_no, daily_receipt_count, last_fiscal_day_status,
          (last_fiscal_hash is not null) as has_hash
   from companies where id = 108`
);
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
