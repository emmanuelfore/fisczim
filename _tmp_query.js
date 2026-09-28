const pg = require('pg');
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:2512@localhost:5432/fisczim',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  // Find the companies
  const companies = await pool.query(
    `SELECT id, name, tin, vat_number, vat_registered, vat_enabled, fiscal_provider, zimra_environment
     FROM companies
     WHERE name ILIKE '%wash%' OR name ILIKE '%eximium%'`
  );
  console.log('=== COMPANIES ===');
  console.log(JSON.stringify(companies.rows, null, 2));

  // For each company, check their tax types
  for (const co of companies.rows) {
    const taxes = await pool.query(
      `SELECT id, company_id, name, rate, zimra_tax_id, zimra_tax_percent, is_active
       FROM tax_types WHERE company_id = $1 ORDER BY id`,
      [co.id]
    );
    console.log(`\n=== TAX TYPES for ${co.name} (company ${co.id}) ===`);
    console.log(JSON.stringify(taxes.rows, null, 2));
  }

  // Check recent failed invoices / fiscalization errors
  const recentErrors = await pool.query(
    `SELECT i.id, i.company_id, i.invoice_number, i.fiscal_status, i.fiscal_error,
            i.created_at, c.name as company_name
     FROM invoices i
     JOIN companies c ON c.id = i.company_id
     WHERE (c.name ILIKE '%wash%' OR c.name ILIKE '%eximium%')
       AND i.fiscal_status IN ('failed', 'error', 'rejected')
     ORDER BY i.created_at DESC LIMIT 10`
  );
  console.log('\n=== RECENT FISCAL ERRORS ===');
  console.log(JSON.stringify(recentErrors.rows, null, 2));

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
