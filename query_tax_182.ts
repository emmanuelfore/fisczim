import 'dotenv/config';
import { db } from './server/db';
import { taxTypes } from './shared/schema';
import { eq } from 'drizzle-orm';

async function run() {
  const tax = await db.select().from(taxTypes).where(eq(taxTypes.id, 182));
  console.log(JSON.stringify(tax, null, 2));
  process.exit(0);
}
run().catch(console.error);
