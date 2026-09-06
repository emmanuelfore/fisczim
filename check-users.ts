import "dotenv/config";
import { pool } from "./server/db.js";

async function checkUsers() {
  try {
    const users = await pool.query(`
      SELECT id, email, password, password_changed, created_at 
      FROM public.users 
      ORDER BY created_at
    `);
    console.log("public.users:", JSON.stringify(users.rows, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

checkUsers();