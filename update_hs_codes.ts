import { db, pool } from './server/db';
import { products } from './shared/schema';
import { eq, inArray } from 'drizzle-orm';

const companyId = 60;

const hsCodeMapping: Record<string, string> = {
  "DASH CAMS": "85258900",
  "PANIC BUTTONS": "85311000",
  "BEACONS": "85176200",
  "VEHICLE TRACKERS": "85269100",
  "FUEL TRACKERS": "90261000", // Measuring or checking flow or level of liquids
  "ASSET TRACKERS": "85269100",
  "CCTV CAMERAS": "85258900"
};

async function run() {
  try {
    const allProducts = await db.select().from(products).where(eq(products.companyId, companyId));
    
    for (const product of allProducts) {
      if (!product.category) continue;
      
      // If it's a service, maybe leave HS code empty or 00000000? Let's leave null for services, or set a dummy one.
      // Usually Zimra requires HS Code for goods.
      if (product.productType === "service") {
         await db.update(products).set({ hsCode: "00000000" }).where(eq(products.id, product.id));
         continue;
      }

      const hsCode = hsCodeMapping[product.category];
      if (hsCode) {
        // Also update tax rate to 15.00 if the user is complaining about 15.50
        await db.update(products).set({ 
          hsCode, 
          taxRate: "15.00" 
        }).where(eq(products.id, product.id));
      }
    }
    console.log("Updated HS codes and set VAT to 15.00% for goods.");
  } catch (e) {
    console.error("Error updating HS codes:", e);
  } finally {
    await pool.end();
  }
}
run();
