const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  const off = await client.query(`
    SELECT count(*)::int AS pos_sales_fiscal_off,
           count(*) FILTER (WHERE i.fiscal_code IS NOT NULL)::int AS wrongly_signed,
           count(*) FILTER (WHERE j.id IS NOT NULL)::int AS has_job_row,
           count(*) FILTER (WHERE j.status IN ('pending','processing'))::int AS job_will_sign_next_tick,
           count(DISTINCT i.company_id)::int AS companies
      FROM invoices i
      LEFT JOIN fiscalization_jobs j ON j.invoice_id = i.id
     WHERE i.is_pos = true
       AND COALESCE(i.is_fiscalized, true) = false
  `);
  console.log('Fiscal-OFF POS sales:', off.rows[0]);

  const sweepHit = await client.query(`
    SELECT count(*)::int AS would_be_queued_by_old_sweep
      FROM invoices i
      JOIN companies c ON c.id = i.company_id
     WHERE i.is_pos = true
       AND i.fiscal_code IS NULL
       AND c.vat_registered = true
       AND COALESCE(i.status, '') <> 'cancelled'
       AND i.created_at >= NOW() - INTERVAL '7 days'
       AND COALESCE(i.is_fiscalized, true) = false
       AND NOT EXISTS (SELECT 1 FROM fiscalization_jobs j WHERE j.invoice_id = i.id)
  `);
  console.log('Picked up by sweep despite Fiscal OFF:', sweepHit.rows[0]);

  const detail = await client.query(`
    SELECT i.company_id AS cid, c.name, c.vat_registered,
           count(*)::int AS n,
           count(*) FILTER (WHERE i.fiscal_code IS NOT NULL)::int AS signed,
           max(i.created_at) AS latest
      FROM invoices i
      JOIN companies c ON c.id = i.company_id
     WHERE i.is_pos = true
       AND COALESCE(i.is_fiscalized, true) = false
     GROUP BY 1,2,3
     ORDER BY n DESC LIMIT 15
  `);
  console.table(detail.rows);

  await client.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
