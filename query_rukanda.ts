import 'dotenv/config';
import { db } from './server/db';
import { companies } from './shared/schema';
import { ilike } from 'drizzle-orm';

async function run() {
  const res = await db.select().from(companies).where(ilike(companies.name, '%Rukanda%'));
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
