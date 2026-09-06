import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  const r = await pool.query(`SELECT email,username,is_super_admin,password FROM users WHERE is_super_admin=true`);
  console.log(r.rows.map(u=>({email:u.email, username:u.username, is_super:u.is_super_admin, pw:u.password.slice(0,20)})));
  const r2 = await pool.query(`SELECT email,password FROM users WHERE email='admin@zimra.co.zw'`);
  console.log("admin@zimra", r2.rows);
  // also check admin@fiscalstake
  const r3 = await pool.query(`SELECT email,is_super_admin FROM users WHERE email='admin@fiscalstake.co.zw'`);
  console.log(r3.rows);
  await pool.end();
}
run();
