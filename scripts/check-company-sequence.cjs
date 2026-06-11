const { Pool } = require("pg");
require("dotenv").config();

const companyId = Number(process.argv[2] || 3);

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const company = await pool.query(
      `select id, last_receipt_global_no, daily_receipt_count, last_fiscal_hash, fiscal_day_open, last_fiscal_day_status
       from companies
       where id = $1`,
      [companyId],
    );

    const latest = await pool.query(
      `select id, invoice_number, currency, fiscal_day_no, receipt_counter, receipt_global_no, validation_status
       from invoices
       where company_id = $1
         and receipt_global_no is not null
       order by receipt_global_no desc
       limit 5`,
      [companyId],
    );

    const invoiceIds = latest.rows.map((row) => row.id);
    const errors = invoiceIds.length === 0
      ? { rows: [] }
      : await pool.query(
        `select invoice_id, error_code, error_color
         from validation_errors
         where invoice_id = any($1::int[])
         order by invoice_id desc, error_code`,
        [invoiceIds],
      );

    console.log(JSON.stringify({
      company: company.rows,
      latest: latest.rows,
      errors: errors.rows,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
