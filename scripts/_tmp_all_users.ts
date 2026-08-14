import { users, companyUsers } from "../shared/schema.js";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "../server/db.js";

const rows = await db.select().from(users).where(
  or(ilike(users.email, "%rhymy%"), ilike(users.email, "johnmoyo%"))
);
for (const u of rows) {
  const links = await db.select().from(companyUsers).where(eq(companyUsers.userId, u.id));
  console.log(u.id, u.email, "links:", links.length, links.map(l => `${l.companyId}:${l.role}:${l.companyRoleId}`).join(","));
}
process.exit(0);
