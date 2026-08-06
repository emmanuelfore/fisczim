import { db, pool } from './server/db';
import { taxTypes } from './shared/schema';

async function run() {
  try {
    const taxes = await db.select().from(taxTypes);
    console.log("Tax Types in system:");
    taxes.forEach(t => console.log(`- ${t.code} (${t.name}): ${t.rate}% (ID: ${t.id}, Company: ${t.companyId})`));
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}
run();
