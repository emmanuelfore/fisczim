import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        console.log("Searching for company 'hillend'...");
        const companyRes = await pool.query("SELECT id, name, last_receipt_global_no FROM companies WHERE name ILIKE '%hillend%'");
        console.log("Companies found:\n", JSON.stringify(companyRes.rows, null, 2));

        if (companyRes.rows.length === 0) {
            console.log("No companies found with name like 'hillend'");
            return;
        }

        for (const company of companyRes.rows) {
            console.log(`\nAnalyzing invoicing data for company: ${company.name} (ID: ${company.id})`);
            
            // Count invoices by fdms_status
            const statusRes = await pool.query(
                "SELECT fdms_status, count(*) as count FROM invoices WHERE company_id = $1 GROUP BY fdms_status",
                [company.id]
            );
            console.log("Invoice status counts:\n", JSON.stringify(statusRes.rows, null, 2));

            // Get some failing invoices
            const failingInvoicesRes = await pool.query(
                `SELECT id, invoice_number, fdms_status, receipt_global_no, created_at 
                 FROM invoices 
                 WHERE company_id = $1 AND fdms_status = 'failed' 
                 ORDER BY created_at DESC LIMIT 10`,
                [company.id]
            );
            console.log("Failing Invoices (First 10):\n", JSON.stringify(failingInvoicesRes.rows, null, 2));

            // Get recent zimra logs for this company/invoices
            const logsRes = await pool.query(
                `SELECT z.id, z.invoice_id, z.status_code, z.error_message, z.response_payload, z.created_at 
                 FROM zimra_logs z
                 JOIN invoices i ON z.invoice_id = i.id
                 WHERE i.company_id = $1
                 ORDER BY z.created_at DESC LIMIT 10`,
                [company.id]
            );
            console.log("Zimra Logs (First 10):\n", JSON.stringify(logsRes.rows.map(r => ({
                id: r.id,
                invoiceId: r.invoice_id,
                statusCode: r.status_code,
                errorMessage: r.error_message,
                createdAt: r.created_at,
                responsePayload: typeof r.response_payload === 'string' 
                    ? r.response_payload.substring(0, 300) 
                    : JSON.stringify(r.response_payload).substring(0, 300)
            })), null, 2));
        }

    } catch (err) {
        console.error("Error running query:", err);
    } finally {
        await pool.end();
    }
}

main();
