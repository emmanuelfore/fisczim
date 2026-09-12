import "dotenv/config";
import { db, pool } from "../server/db";
import { companyUsers, users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function check() {
    const cu = await db.select({ email: users.email, role: companyUsers.role, id: users.id })
        .from(companyUsers)
        .innerJoin(users, eq(users.id, companyUsers.userId))
        .where(eq(companyUsers.companyId, 2));
    console.log("Users in company 2 (Rhymy):", cu);
    pool.end();
}
check();
