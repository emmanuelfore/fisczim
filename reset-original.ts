import "dotenv/config";
import { pool } from "./server/db.js";
import bcrypt from "bcrypt";
async function run(){
  const h1 = await bcrypt.hash("FiscalStakeAdmin123!", 10);
  const h2 = await bcrypt.hash("ndakapenga", 10);
  await pool.query(`UPDATE users SET password=$1 WHERE email='admin@fiscalstake.co.zw'`, [h1]);
  await pool.query(`UPDATE users SET password=$1 WHERE email='admin@zimra.co.zw'`, [h2]);
  console.log("reset to original");
  const r = await pool.query(`SELECT email FROM users WHERE email IN ('admin@fiscalstake.co.zw','admin@zimra.co.zw')`);
  console.log(r.rows);
  await pool.end();
}
run();
