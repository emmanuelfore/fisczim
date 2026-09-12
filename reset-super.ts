import "dotenv/config";
import { pool } from "./server/db.js";
import bcrypt from "bcrypt";
async function run(){
  const hash = await bcrypt.hash("Admin123!", 10);
  await pool.query(`UPDATE users SET password=$1, is_super_admin=true, username=COALESCE(username, split_part(email,'@',1)) WHERE email IN ('admin@zimra.co.zw','admin@fiscalstake.co.zw')`, [hash]);
  console.log("reset");
  const r = await pool.query(`SELECT email,username,is_super_admin FROM users WHERE email IN ('admin@zimra.co.zw','admin@fiscalstake.co.zw')`);
  console.log(r.rows);
  await pool.end();
}
run();
