import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        console.log("Synchronizing Hillend Trading (Company 12) Counters with last successful ZIMRA submission...");
        
        // 1. Get the most recent successfully fiscalized invoice
        const res = await pool.query(`
            SELECT id, invoice_number, receipt_global_no, receipt_counter, fiscal_code, created_at 
            FROM invoices 
            WHERE company_id = 12 AND LOWER(fdms_status) = 'fiscalized'
            ORDER BY receipt_global_no DESC NULLS LAST LIMIT 1
        `);
        
        if (res.rows.length === 0) {
            console.log("No fiscalized invoices found for company 12.");
            return;
        }

        const lastInv = res.rows[0];
        console.log(`Last Fiscalized Invoice: ${lastInv.invoice_number} (ID: ${lastInv.id})`);
        console.log(`  Global No: ${lastInv.receipt_global_no}`);
        console.log(`  Daily Counter: ${lastInv.receipt_counter}`);
        console.log(`  Fiscal Hash: ${lastInv.fiscal_code}`);

        // 2. Update company 12
        const updateRes = await pool.query(`
            UPDATE companies 
            SET last_receipt_global_no = $1, 
                daily_receipt_count = $2, 
                last_fiscal_hash = $3
            WHERE id = 12
            RETURNING id, last_receipt_global_no, daily_receipt_count
        `, [lastInv.receipt_global_no, lastInv.receipt_counter, lastInv.fiscal_code]);

        console.log(`Updated Company 12:`, updateRes.rows[0]);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
