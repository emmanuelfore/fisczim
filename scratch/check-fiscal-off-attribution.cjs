const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const r = await client.query(`
    SELECT CASE WHEN j.id IS NULL THEN 'no job row (signed pre-jobs / other path)'
                ELSE 'job ' || j.status END AS origin,
           count(*)::int AS n,
           min(i.created_at)::date AS first_invoice,
           max(i.created_at)::date AS last_invoice
      FROM invoices i
      LEFT JOIN fiscalization_jobs j ON j.invoice_id = i.id
     WHERE i.is_pos = true
       AND COALESCE(i.is_fiscalized, true) = false
       AND i.fiscal_code IS NOT NULL
     GROUP BY 1 ORDER BY n DESC
  `);
  console.table(r.rows);

  const recent = await client.query(`
    SELECT date_trunc('day', i.created_at)::date AS d,
           count(*)::int AS fiscal_off_sales,
           count(*) FILTER (WHERE i.fiscal_code IS NOT NULL)::int AS signed_anyway
      FROM invoices i
     WHERE i.is_pos = true AND COALESCE(i.is_fiscalized, true) = false
       AND i.created_at >= NOW() - INTERVAL '10 days'
     GROUP BY 1 ORDER BY 1 DESC
  `);
  console.table(recent.rows);
  await client.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
