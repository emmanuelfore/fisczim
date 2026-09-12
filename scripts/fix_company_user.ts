import "dotenv/config";
import { db, pool } from "../server/db";
import { companies, users, companyUsers } from "../shared/schema";
import { eq, ilike, and } from "drizzle-orm";

async function fix() {
  const c = await db.select().from(companies).where(ilike(companies.name, "Rhymy digital")).limit(1).then(r => r[0]);
  const u = await db.select().from(users).where(ilike(users.email, "conductor@rhymy.com")).limit(1).then(r => r[0]);
  
  if (c && u) {
    const existing = await db.select().from(companyUsers).where(and(eq(companyUsers.userId, u.id), eq(companyUsers.companyId, c.id))).limit(1).then(r => r[0]);
    if (!existing) {
      await db.insert(companyUsers).values({
        userId: u.id,
        companyId: c.id,
        role: "admin"
      });
      console.log("Linked user to company!");
    } else {
      console.log("User already linked!");
    }
  } else {
    console.log("Not found:", { c: !!c, u: !!u });
  }
  pool.end();
}
fix();
