import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        // Find the product
        const prod = await pool.query(`
            SELECT id, name, sku, stock_level, is_active 
            FROM products 
            WHERE company_id = 54 AND name ILIKE '%51611%'
        `);
        console.log('=== Product(s) matching 51611 ===');
        console.log(JSON.stringify(prod.rows, null, 2));

        const productId = prod.rows[0]?.id;
        if (!productId) { console.log('Product not found'); return; }

        // ALL inventory transactions for this product - chronological order
        const txs = await pool.query(`
            SELECT 
                it.id, it.type, it.quantity, it.unit_cost, it.total_cost,
                it.reference_type, it.reference_id, it.notes, it.created_at,
                u.username as created_by
            FROM inventory_transactions it
            LEFT JOIN users u ON u.id = it.created_by
            WHERE it.product_id = $1
            ORDER BY it.created_at ASC
        `, [productId]);

        console.log(`\n=== ALL Inventory Transactions for product ${productId} (chronological) ===`);
        console.log(JSON.stringify(txs.rows, null, 2));

        // Running balance
        console.log('\n=== Running Balance Reconstruction ===');
        let balance = 0;
        for (const tx of txs.rows) {
            const qty = Number(tx.quantity);
            balance += qty;
            console.log(`[${tx.created_at?.toISOString?.() || tx.created_at}] ${tx.type} ${qty > 0 ? '+' : ''}${qty}  →  Balance: ${balance.toFixed(2)}  | Ref: ${tx.reference_type}/${tx.reference_id}`);
        }
        console.log(`\nFinal computed balance: ${balance.toFixed(2)}`);
        console.log(`Stored stock_level: ${prod.rows[0]?.stock_level}`);

        // Now check all invoices referencing this product
        const invoiceItems = await pool.query(`
            SELECT 
                ii.id, ii.invoice_id, ii.quantity, ii.unit_price,
                i.invoice_number, i.status, i.issue_date, i.created_at
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            WHERE ii.product_id = $1
            ORDER BY i.issue_date ASC
        `, [productId]);

        console.log(`\n=== Invoice Items for product ${productId} ===`);
        console.log(JSON.stringify(invoiceItems.rows, null, 2));

        // Check GRV items for this product
        const grvItems = await pool.query(`
            SELECT 
                gi.id, gi.gdn_id, gi.quantity_received, gi.unit_cost,
                gdn.gdn_number, gdn.status, gdn.confirmed_grv_number, gdn.created_at
            FROM goods_delivery_note_items gi
            JOIN goods_delivery_notes gdn ON gdn.id = gi.gdn_id
            WHERE gi.product_id = $1
            ORDER BY gdn.created_at ASC
        `, [productId]);

        console.log(`\n=== GRV Items for product ${productId} ===`);
        console.log(JSON.stringify(grvItems.rows, null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
