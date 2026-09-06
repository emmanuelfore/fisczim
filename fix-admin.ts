import "dotenv/config";
import { pool } from "./server/db.js";
import bcrypt from "bcrypt";
async function run(){
  const hash = await bcrypt.hash("Admin123!", 10);
  // Update the existing row that has name admin@zimra to be the real superuser
  const r = await pool.query(`UPDATE public.users SET email='admin@zimra.co.zw', password=$1, is_super_admin=true, username='admin_zimra', name='System Admin' WHERE id='9482b181-9109-4012-8d65-291488268746' RETURNING id,email,username,is_super_admin`, [hash]);
  console.log("updated manuchidovi3 -> admin:", r.rows);
  // Also ensure no duplicate email conflict: check
  const r2 = await pool.query(`SELECT id,email,is_super_admin FROM public.users WHERE lower(email)='admin@zimra.co.zw'`);
  console.log("admin now:", r2.rows);
  await pool.end();
}
run();
