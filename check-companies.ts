import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  const c = await pool.query(`SELECT id,name FROM companies LIMIT 5`);
  console.log("companies", c.rows);
  const cu = await pool.query(`SELECT count(*) FROM company_users`);
  console.log("company_users count", cu.rows[0].count);
  const sample = await pool.query(`SELECT user_id,company_id,role FROM company_users LIMIT 10`);
  console.log("sample links", sample.rows);
  const users = await pool.query(`SELECT count(*) FROM users`);
  console.log("users", users.rows[0].count);
  // check specific user that should have company
  const u = await pool.query(`SELECT id,email FROM users WHERE email='manuchidovi@gmail.com'`);
  console.log("manuchidovi", u.rows);
  if(u.rows[0]) {
    const links = await pool.query(`SELECT * FROM company_users WHERE user_id=$1`, [u.rows[0].id]);
    console.log("links for manuchidovi", links.rows);
  }
  await pool.end();
}
run();
