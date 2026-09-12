import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./shared/schema";
import { invoices } from "./shared/schema";
import { eq, count } from "drizzle-orm";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(pool, { schema });

async function countInvoices() {
    try {
        const res = await db.select({
            companyId: invoices.companyId,
            count: count()
        }).from(invoices).groupBy(invoices.companyId);
        
        console.error("Invoice counts by Company ID:");
        console.error(JSON.stringify(res, null, 2));
    } catch (err) {
        console.error("Error:", err);
    }
    process.exit(0);
}

countInvoices();
