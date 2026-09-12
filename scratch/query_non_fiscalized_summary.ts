import pg from 'pg';
import fs from 'fs';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        const res = await pool.query(
            `SELECT id, invoice_number, fdms_status, receipt_global_no, receipt_counter, created_at, validation_status 
             FROM invoices 
             WHERE company_id = 12 
               AND (fdms_status IS NULL OR LOWER(fdms_status) != 'fiscalized')
             ORDER BY created_at DESC`
        );
        
        let output = `Found ${res.rows.length} non-fiscalized invoices for Hillend Trading (ID: 12).\n\n`;
        
        for (const inv of res.rows) {
            output += `========================================\n`;
            output += `Invoice ID: ${inv.id}\n`;
            output += `Invoice Number: ${inv.invoice_number}\n`;
            output += `FDMS Status: ${inv.fdms_status}\n`;
            output += `Validation Status: ${inv.validation_status}\n`;
            output += `Receipt Global No: ${inv.receipt_global_no}\n`;
            output += `Receipt Counter: ${inv.receipt_counter}\n`;
            output += `Created At: ${inv.created_at.toISOString()}\n`;
            
            // Query items
            const itemsRes = await pool.query(
                `SELECT id, description, quantity, unit_price, line_total FROM invoice_items WHERE invoice_id = $1`,
                [inv.id]
            );
            output += `Items (${itemsRes.rows.length}):\n`;
            for (const item of itemsRes.rows) {
                output += `  - [ID: ${item.id}] Desc: "${item.description}", Qty: ${item.quantity}, Price: ${item.unit_price}, Total: ${item.line_total}\n`;
            }
            
            // Query latest zimra log
            const logRes = await pool.query(
                `SELECT id, status_code, error_message, response_payload, created_at 
                 FROM zimra_logs 
                 WHERE invoice_id = $1 
                 ORDER BY created_at DESC LIMIT 1`,
                [inv.id]
            );
            
            if (logRes.rows.length > 0) {
                const log = logRes.rows[0];
                output += `Latest ZIMRA Log (ID: ${log.id}, Status: ${log.status_code}, Date: ${log.created_at.toISOString()}):\n`;
                output += `  Error Message: ${log.error_message}\n`;
                output += `  Response Payload: ${typeof log.response_payload === 'string' ? log.response_payload : JSON.stringify(log.response_payload)}\n`;
            } else {
                output += `No ZIMRA log found.\n`;
            }
            output += `\n`;
        }
        
        fs.writeFileSync('non_fiscalized_summary.txt', output);
        console.log("Written summary to non_fiscalized_summary.txt successfully.");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
