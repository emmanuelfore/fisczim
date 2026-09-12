import { db } from './server/db';
import { products } from './shared/schema';

async function run() {
  try {
    const inserted = await db.insert(products).values({
      companyId: 60,
      name: "Test Product",
      price: "10.00",
      category: "TEST",
      productType: "good",
      isTracked: true,
      isForSale: true,
      isActive: true,
    }).returning();
    console.log(`Inserted ${inserted.length} products.`);
  } catch(e) {
    console.error("DB Error:", e);
  }
  process.exit(0);
}
run();
