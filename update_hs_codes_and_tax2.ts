import { db, pool } from './server/db';
import { products } from './shared/schema';
import { eq } from 'drizzle-orm';

const companyId = 60;

async function run() {
  try {
    const allProducts = await db.select().from(products).where(eq(products.companyId, companyId));
    
    // update in a single transaction to avoid connection timeout due to multiple sequential requests
    await db.transaction(async (tx) => {
        for (const product of allProducts) {
          if (product.productType === "service") {
             const isDeposit = product.name?.toLowerCase().includes('deposit');
             const hsCode = isDeposit ? "99003000" : "99001000";
             const taxTypeId = isDeposit ? 81 : 82; 
             const taxRate = isDeposit ? "0.00" : "15.50";
             
             await tx.update(products).set({ 
               hsCode,
               taxTypeId,
               taxRate
             }).where(eq(products.id, product.id));
          } else {
             await tx.update(products).set({ 
               taxRate: "15.50",
               taxTypeId: 82
             }).where(eq(products.id, product.id));
          }
        }
    });
    console.log("Updated HS codes for services and linked tax types (15.5%).");
  } catch (e) {
    console.error("Error updating:", e);
  } finally {
    await pool.end();
  }
}
run();
