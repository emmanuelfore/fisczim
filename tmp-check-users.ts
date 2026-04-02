import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./shared/schema";
import { companyUsers, users, companies } from "./shared/schema";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(pool, { schema });

async function checkUserCompany() {
    try {
        const uRes = await db.select().from(users).limit(5);
        console.error("Users:", JSON.stringify(uRes.map(u => ({ id: u.id, email: u.email })), null, 2));

        const cuRes = await db.select().from(companyUsers);
        console.error("Company Users Mapping:", JSON.stringify(cuRes, null, 2));

        const coRes = await db.select().from(companies);
        console.error("Companies:", JSON.stringify(coRes.map(c => ({ id: c.id, name: c.name })), null, 2));
    } catch (err) {
        console.error("Error:", err);
    }
    process.exit(0);
}

checkUserCompany();
