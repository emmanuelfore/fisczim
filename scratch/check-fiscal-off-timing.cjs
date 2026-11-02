const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const r = await client.query(`
    SELECT j.status,
           count(*)::int AS n,
           min(j.completed_at) AS first_signed,
           max(j.completed_at) AS last_signed
      FROM fiscalization_jobs j
      JOIN invoices i ON i.id = j.invoice_id
     WHERE i.is_pos = true AND COALESCE(i.is_fiscalized, true) = false
     GROUP BY 1 ORDER BY n DESC
  `);
  console.table(r.rows);

  const byDay = await client.query(`
    SELECT date_trunc('day', j.completed_at)::date AS d, count(*)::int AS signed
      FROM fiscalization_jobs j
      JOIN invoices i ON i.id = j.invoice_id
     WHERE i.is_pos = true AND COALESCE(i.is_fiscalized, true) = false
       AND j.completed_at IS NOT NULL
     GROUP BY 1 ORDER BY 1 DESC LIMIT 12
  `);
  console.table(byDay.rows);

  const queued = await client.query(`
    SELECT j.id, j.invoice_id, i.company_id, j.status, j.created_at AS queued_at, j.next_attempt_at
      FROM fiscalization_jobs j
      JOIN invoices i ON i.id = j.invoice_id
     WHERE i.is_pos = true AND COALESCE(i.is_fiscalized, true) = false
       AND j.status IN ('pending','processing')
     ORDER BY j.id
  `);
  console.log('Still queued (would sign):', queued.rows);
  await client.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
