import { db } from '../server/db';
import { products, taxTypes } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function update() {
    console.log("Updating products...");
    await db.update(products).set({ name: 'TEST ZERO RATED' }).where(eq(products.sku, 'PRO-NON'));
    await db.update(taxTypes).set({ name: 'ZERO RATED' }).where(eq(taxTypes.code, 'NON'));
    console.log("Done");
    process.exit(0);
}
update().catch(console.error);
