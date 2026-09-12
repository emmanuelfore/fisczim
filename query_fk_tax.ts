import 'dotenv/config';
import { db } from './server/db';
import { products, invoiceItems } from './shared/schema';
import { eq, or } from 'drizzle-orm';

async function run() {
  const pCount = await db.select({ id: products.id }).from(products).where(eq(products.taxId, 72)).limit(1);
  console.log("Products using tax 72:", pCount);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
