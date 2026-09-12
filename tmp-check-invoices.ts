import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./shared/schema";
import { invoices } from "./shared/schema";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(pool, { schema });

async function checkInvoices() {
    try {
        const res = await db.select().from(invoices).limit(50);
        console.error(`### RESULT: ${res.length} invoices found.`);
        res.forEach(inv => {
            console.error(`ID: ${inv.id}, CoID: ${inv.companyId}, BrID: ${inv.branchId}, Status: ${inv.status}, Type: ${inv.transactionType}`);
        });
    } catch (err) {
        console.error("Error fetching invoices:", err);
    }
    process.exit(0);
}

checkInvoices();
