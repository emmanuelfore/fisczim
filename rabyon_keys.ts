import "dotenv/config";
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    const [c] = await db.select().from(companies).where(eq(companies.id, 91));
    const keys = Object.keys(c).filter(k => /key|cert|device|qr/i.test(k));
    for (const k of keys) {
        const v: any = (c as any)[k];
        console.log(`${k} = ${v ? String(v).slice(0, 40) + "..." : "null"}`);
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
