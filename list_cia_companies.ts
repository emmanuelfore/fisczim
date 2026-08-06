import { db, pool } from './server/db';
import { companies } from './shared/schema';
import { ilike } from 'drizzle-orm';

async function run() {
  try {
    const res = await db.select({ id: companies.id, name: companies.name }).from(companies).where(ilike(companies.name, '%CIA%'));
    const res2 = await db.select({ id: companies.id, name: companies.name }).from(companies).where(ilike(companies.name, '%CLAMP%'));
    console.log("Companies with CIA:", res);
    console.log("Companies with CLAMP:", res2);
  } finally {
    await pool.end();
  }
}
run();
