const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // 1. Get the max global number from Day 1
    const day1Res = await client.query("SELECT MAX(receipt_global_no) as max_global FROM invoices WHERE company_id = 84 AND fiscal_day_no = 1 AND is_fiscalized = true");
    const lastGlobal = parseInt(day1Res.rows[0].max_global || '0');
    console.log("Last global from Day 1:", lastGlobal); // Should be 2

    // 2. We need to update all Day 2 invoices so that receipt_global_no = lastGlobal + receipt_counter
    const day2Invoices = await client.query("SELECT id, invoice_number, receipt_counter, receipt_global_no FROM invoices WHERE company_id = 84 AND fiscal_day_no = 2 ORDER BY receipt_counter ASC");
    
    for (const inv of day2Invoices.rows) {
        const expectedGlobal = lastGlobal + parseInt(inv.receipt_counter);
        
        if (parseInt(inv.receipt_global_no) !== expectedGlobal) {
            await client.query("UPDATE invoices SET receipt_global_no = $1 WHERE id = $2", [expectedGlobal, inv.id]);
            console.log(`Updated ${inv.invoice_number} (Counter ${inv.receipt_counter}): Global No ${inv.receipt_global_no} -> ${expectedGlobal}`);
        }
    }

    await client.end();
}

main().catch(console.error);
