import "dotenv/config";
import { pool } from "./server/db.js";

async function updatePasswords() {
  try {
    // Check all users
    const users = await pool.query(`
      SELECT id, email, password, password_changed 
      FROM public.users
    `);
    console.log("All users:", JSON.stringify(users.rows, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

updatePasswords();