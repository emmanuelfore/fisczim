import { getUserPermissions } from "../server/lib/permissions.js";
import { companyUsers, users } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { db } from "../server/db.js";

const rows = await db
  .select({ id: users.id, email: users.email, role: companyUsers.role })
  .from(companyUsers)
  .innerJoin(users, eq(users.id, companyUsers.userId))
  .where(eq(companyUsers.companyId, 2));

for (const r of rows) {
  const perms = await getUserPermissions(r.id, 2, false);
  console.log(r.email, r.role, "bus.view:", perms.has("bus.view"), "bus.operations:", perms.has("bus.operations"));
}
process.exit(0);