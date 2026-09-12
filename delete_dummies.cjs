const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Delete invoices INV-044 to INV-060
    const res = await client.query(`
        DELETE FROM invoices 
        WHERE company_id = 84 
        AND invoice_number IN (
            'INV-044', 'INV-045', 'INV-046', 'INV-047', 'INV-048', 
            'INV-049', 'INV-050', 'INV-051', 'INV-052', 'INV-053', 
            'INV-054', 'INV-055', 'INV-056', 'INV-057', 'INV-058', 
            'INV-059', 'INV-060'
        )
        RETURNING invoice_number
    `);
    
    console.log("Deleted invoices:", res.rows.map(r => r.invoice_number));

    // Restore receipt_global_no for INV-043 to what it was? It was 19 before I changed it to 21.
    // The user probably wants it restored to 19 if I messed it up, but they only asked to delete the inserted ones.
    // I will just restore INV-043 to 19 to be fully safe, as they didn't ask for that change originally.
    await client.query(`UPDATE invoices SET receipt_global_no = 19 WHERE company_id = 84 AND invoice_number = 'INV-043'`);
    console.log("Restored INV-043 receipt_global_no to 19");

    await client.end();
}
main();
