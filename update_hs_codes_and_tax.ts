import { db, pool } from './server/db';
import { products } from './shared/schema';
import { eq } from 'drizzle-orm';

const companyId = 60;
const vatTaxTypeId = 82; // VAT 15.50%

async function run() {
  try {
    const allProducts = await db.select().from(products).where(eq(products.companyId, companyId));
    
    for (const product of allProducts) {
      if (product.productType === "service") {
         const isDeposit = product.name?.toLowerCase().includes('deposit');
         // Use 99003000 for exempt deposits, else 99001000 for 15.5% taxable services
         const hsCode = isDeposit ? "99003000" : "99001000";
         const taxTypeId = isDeposit ? 81 : 82; // 81 is EXE, 82 is VAT
         const taxRate = isDeposit ? "0.00" : "15.50";
         
         await db.update(products).set({ 
           hsCode,
           taxTypeId,
           taxRate
         }).where(eq(products.id, product.id));
      } else {
         // It's a good
         await db.update(products).set({ 
           taxRate: "15.50",
           taxTypeId: vatTaxTypeId
         }).where(eq(products.id, product.id));
      }
    }
    console.log("Updated HS codes for services and linked tax types (15.5%).");
  } catch (e) {
    console.error("Error updating:", e);
  } finally {
    await pool.end();
  }
}
run();
