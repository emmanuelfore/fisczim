import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        console.log("Analyzing all non-fiscalized invoices for company 12 (Hillend Trading)...");
        
        const res = await pool.query(
            `SELECT id, invoice_number, fdms_status, receipt_global_no, receipt_counter, created_at, validation_status 
             FROM invoices 
             WHERE company_id = 12 
               AND (fdms_status IS NULL OR LOWER(fdms_status) != 'fiscalized')
             ORDER BY created_at DESC`
        );
        
        console.log(`Found ${res.rows.length} non-fiscalized invoices.`);
        
        for (const inv of res.rows) {
            console.log(`\n----------------------------------------`);
            console.log(`Invoice ID: ${inv.id}`);
            console.log(`Invoice Number: ${inv.invoice_number}`);
            console.log(`FDMS Status: ${inv.fdms_status}`);
            console.log(`Validation Status: ${inv.validation_status}`);
            console.log(`Receipt Global No: ${inv.receipt_global_no}`);
            console.log(`Receipt Counter: ${inv.receipt_counter}`);
            console.log(`Created At: ${inv.created_at}`);
            
            // Query latest zimra log for this invoice
            const logRes = await pool.query(
                `SELECT id, status_code, error_message, response_payload, created_at 
                 FROM zimra_logs 
                 WHERE invoice_id = $1 
                 ORDER BY created_at DESC LIMIT 1`,
                [inv.id]
            );
            
            if (logRes.rows.length > 0) {
                const log = logRes.rows[0];
                console.log(`Latest ZIMRA Log (ID: ${log.id}, Status: ${log.status_code}, Date: ${log.created_at}):`);
                console.log(`Error Message: ${log.error_message}`);
                console.log(`Response Payload:`, typeof log.response_payload === 'string' 
                    ? log.response_payload 
                    : JSON.stringify(log.response_payload)
                );
            } else {
                console.log(`No ZIMRA log found for this invoice.`);
            }
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
