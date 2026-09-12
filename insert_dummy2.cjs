const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // The receipt counters we submitted to ZIMRA but are missing in DB
    const missingCounters = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,21,22,23,24,25];

    let currentInvNum = 44; // Start from INV-044 since INV-043 is the highest

    for (const num of missingCounters) {
        const invStr = `INV-${currentInvNum.toString().padStart(3, '0')}`;
        await client.query(`
            INSERT INTO invoices (
                company_id, invoice_number, fiscal_day_no, receipt_counter, receipt_global_no,
                is_fiscalized, fdms_status, total, subtotal, tax_amount, issue_date, created_at, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'paid'
            )
        `, [
            84, 
            invStr, 
            2, 
            num, 
            num, 
            true, 
            'Fiscalized', 
            0.01, 
            0.01, 
            0, 
            '2026-07-15T08:00:00Z', 
            '2026-07-15T08:00:00Z'
        ]);
        console.log(`Inserted DB dummy for receipt ${num} as ${invStr}`);
        currentInvNum++;
    }

    await client.end();
}

main().catch(console.error);
