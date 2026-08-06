import { db, pool } from './server/db';
import { companies } from './shared/schema';

async function run() {
  try {
    await db.update(companies).set({ approvalSettings: null });
    console.log("Wiped approval settings for all companies");
  } catch(e) {
    console.error("DB Error:", e);
  } finally {
    await pool.end(); // close pool properly
  }
}
run();
