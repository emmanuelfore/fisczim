import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});

const r = await pool.query(
  `select invoice_number, fiscal_signature is not null as signed,
          offline_date, receipt_global_no, receipt_counter, total, validation_status, fdms_status
   from invoices
   where company_id = 108 and fiscal_signature is not null
   order by id desc limit 5`
);
console.log(JSON.stringify(r.rows, null, 2));

const n = await pool.query(
  `select count(*) from invoices where company_id = 108 and fiscal_signature is not null`
);
console.log("offline-signed count:", n.rows[0].count);

const red = await pool.query(
  `select invoice_number, validation_status, total, tax_amount, subtotal from invoices
   where company_id = 108 and validation_status = 'red' order by id desc limit 10`
);
console.log("RED invoices:", JSON.stringify(red.rows, null, 2));
await pool.end();
