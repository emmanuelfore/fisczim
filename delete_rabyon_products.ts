import { db } from "./server/db";
import { sql } from "drizzle-orm";

const COMPANY_ID = 91;

async function run() {
  try {
    console.log(`Deleting all products for RABYON INVESTMENTS (company ${COMPANY_ID})...`);

    await db.transaction(async (tx) => {
      // 1. Get all product IDs for this company
      const productRows = await tx.execute(
        sql`SELECT id FROM products WHERE company_id = ${COMPANY_ID}`
      );
      const productIds = (productRows.rows as any[]).map((r) => r.id);
      console.log(`  Found ${productIds.length} products to delete.`);

      if (productIds.length === 0) return;

      // Use a CTE for the product IDs
      const idList = productIds.join(",");

      // 2. Delete / null-out all child rows referencing these products

      // price_adjustments (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM price_adjustments WHERE product_id IN (${idList})`));
      console.log("  Cleaned price_adjustments");

      // branch_stocks (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM branch_stocks WHERE product_id IN (${idList})`));
      console.log("  Cleaned branch_stocks");

      // inventory_location_stocks (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM inventory_location_stocks WHERE product_id IN (${idList})`));
      console.log("  Cleaned inventory_location_stocks");

      // product_variations (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM product_variations WHERE product_id IN (${idList})`));
      console.log("  Cleaned product_variations");

      // product_batches (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM product_batches WHERE product_id IN (${idList})`));
      console.log("  Cleaned product_batches");

      // inventory_transactions (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM inventory_transactions WHERE product_id IN (${idList})`));
      console.log("  Cleaned inventory_transactions");

      // layby_items (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM layby_items WHERE product_id IN (${idList})`));
      console.log("  Cleaned layby_items");

      // stock_transfer_items (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM stock_transfer_items WHERE product_id IN (${idList})`));
      console.log("  Cleaned stock_transfer_items");

      // recipe_items (notNull parentProductId or ingredientProductId)
      await tx.execute(sql.raw(`DELETE FROM recipe_items WHERE parent_product_id IN (${idList}) OR ingredient_product_id IN (${idList})`));
      console.log("  Cleaned recipe_items");

      // bom_items (componentProductId notNull)
      await tx.execute(sql.raw(`DELETE FROM bom_items WHERE component_product_id IN (${idList})`));
      console.log("  Cleaned bom_items");

      // bill_of_materials (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM bill_of_materials WHERE product_id IN (${idList})`));
      console.log("  Cleaned bill_of_materials");

      // manufacturing_routings (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM manufacturing_routings WHERE product_id IN (${idList})`));
      console.log("  Cleaned manufacturing_routings");

      // production_run_consumptions (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM production_run_consumptions WHERE product_id IN (${idList})`));
      console.log("  Cleaned production_run_consumptions");

      // manufacturing_material_transactions (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM manufacturing_material_transactions WHERE product_id IN (${idList})`));
      console.log("  Cleaned manufacturing_material_transactions");

      // goods_issues (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM goods_issues WHERE product_id IN (${idList})`));
      console.log("  Cleaned goods_issues");

      // goods_receipts (notNull productId)
      await tx.execute(sql.raw(`DELETE FROM goods_receipts WHERE product_id IN (${idList})`));
      console.log("  Cleaned goods_receipts");

      // stock_take_items (nullable productId)
      await tx.execute(sql.raw(`DELETE FROM stock_take_items WHERE product_id IN (${idList})`));
      console.log("  Cleaned stock_take_items");

      // Nullable FK tables — just NULL them out to preserve history
      // invoice_items (nullable productId)
      await tx.execute(sql.raw(`UPDATE invoice_items SET product_id = NULL WHERE product_id IN (${idList})`));
      console.log("  Nulled invoice_items.product_id");

      // quotation_items (nullable productId)
      await tx.execute(sql.raw(`UPDATE quotation_items SET product_id = NULL WHERE product_id IN (${idList})`));
      console.log("  Nulled quotation_items.product_id");

      // goods_delivery_note_items (nullable productId)
      await tx.execute(sql.raw(`UPDATE goods_delivery_note_items SET product_id = NULL WHERE product_id IN (${idList})`));
      console.log("  Nulled goods_delivery_note_items.product_id");

      // purchase_order_items (nullable productId)
      await tx.execute(sql.raw(`UPDATE purchase_order_items SET product_id = NULL WHERE product_id IN (${idList})`));
      console.log("  Nulled purchase_order_items.product_id");

      // purchase_return_items (nullable productId)
      await tx.execute(sql.raw(`UPDATE purchase_return_items SET product_id = NULL WHERE product_id IN (${idList})`));
      console.log("  Nulled purchase_return_items.product_id");

      // supplier_invoice_items (nullable productId)
      await tx.execute(sql.raw(`UPDATE supplier_invoice_items SET product_id = NULL WHERE product_id IN (${idList})`));
      console.log("  Nulled supplier_invoice_items.product_id");

      // 3. Finally delete the products
      const result = await tx.execute(
        sql.raw(`DELETE FROM products WHERE company_id = ${COMPANY_ID} RETURNING id`)
      );
      console.log(`\n✅ Done! Deleted ${(result.rows as any[]).length} products for RABYON INVESTMENTS.`);
    });
  } catch (e) {
    console.error("Error:", e);
  } finally {
    process.exit(0);
  }
}

run();
