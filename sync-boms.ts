import { db } from "./server/db.js";
import { products, recipeItems, billOfMaterials, bomLines } from "./shared/schema.js";
import { eq, and } from "drizzle-orm";

async function syncRecipesToBoms() {
  console.log("Starting DB sync...");
  const allProducts = await db.select().from(products).where(eq(products.hasRecipe, true));
  
  for (const prod of allProducts) {
    const items = await db.select().from(recipeItems).where(eq(recipeItems.parentProductId, prod.id));
    if (items.length === 0) continue;
    
    const bomName = `${prod.name} Recipe`;
    let [bom] = await db.select().from(billOfMaterials).where(and(eq(billOfMaterials.productId, prod.id), eq(billOfMaterials.name, bomName)));
    
    if (!bom) {
       [bom] = await db.insert(billOfMaterials).values({
           companyId: prod.companyId,
           productId: prod.id,
           name: bomName,
           version: "1.0",
           isActive: true
       }).returning();
       console.log(`Created BOM for ${prod.name}`);
    } else {
       await db.update(billOfMaterials).set({ isActive: true }).where(eq(billOfMaterials.id, bom.id));
       console.log(`Updated BOM for ${prod.name}`);
    }
    
    await db.delete(bomLines).where(eq(bomLines.bomId, bom.id));
    
    const linesToInsert = items.map(item => ({
        bomId: bom.id,
        componentProductId: item.ingredientProductId,
        quantity: String(item.quantity),
        unitOfMeasure: item.unit
    }));
    await db.insert(bomLines).values(linesToInsert);
  }
  
  console.log("Finished syncing DB.");
  process.exit(0);
}

syncRecipesToBoms().catch(e => {
  console.error(e);
  process.exit(1);
});
