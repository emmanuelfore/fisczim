import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function debugSparesArena() {
    console.log("Connecting...");
    const pool = new Pool({ connectionString });
    try {
        // Company info
        const compRes = await pool.query("SELECT id, name, trading_name FROM companies WHERE id = 54");
        console.log("=== Company ===");
        console.log(compRes.rows);

        // GRVs
        const gdnRes = await pool.query(
            "SELECT id, company_id, gdn_number, confirmed_grv_number, status, created_at FROM goods_delivery_notes WHERE company_id = 54"
        );
        console.log("\n=== GRVs (Goods Delivery Notes) ===");
        console.log(gdnRes.rows);

        // GRV Items using actual column names
        const itemRes = await pool.query(
            "SELECT id, gdn_id, product_id, description, quantity_received, unit_cost FROM goods_delivery_note_items WHERE gdn_id = ANY($1::int[])",
            [gdnRes.rows.map(r => r.id)]
        );
        console.log("\n=== GRV Items ===");
        console.log(`Found ${itemRes.rows.length} items`);
        console.log(itemRes.rows);

        // Products referenced in GRV items
        const grvProductIds = itemRes.rows.map(r => r.product_id).filter(Boolean);
        console.log("\nProduct IDs referenced in GRV items:", grvProductIds);

        if (grvProductIds.length > 0) {
            const prodRes = await pool.query(
                "SELECT id, company_id, name, sku, is_active, stock_level, created_at FROM products WHERE id = ANY($1::int[])",
                [grvProductIds]
            );
            console.log("\n=== Products referenced in GRV items ===");
            console.log(prodRes.rows);
        }

        // All products for company 54
        const allProdRes = await pool.query(
            "SELECT id, company_id, name, sku, is_active, stock_level FROM products WHERE company_id = 54 ORDER BY created_at DESC"
        );
        console.log("\n=== ALL Products for Company 54 (Spares Arena) ===");
        console.log(`Found ${allProdRes.rows.length} products total`);
        console.log(allProdRes.rows);

        // Inventory transactions for company 54
        const invTxRes = await pool.query(
            "SELECT id, company_id, product_id, type, quantity, reference_type, reference_id, created_at FROM inventory_transactions WHERE company_id = 54 ORDER BY created_at DESC LIMIT 20"
        );
        console.log("\n=== Inventory Transactions for Company 54 ===");
        console.log(`Found ${invTxRes.rows.length} transactions`);
        console.log(invTxRes.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

debugSparesArena();
