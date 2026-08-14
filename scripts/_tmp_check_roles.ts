import { db } from "../server/db.js";
import { companyUsers, users } from "../shared/schema.js";
import { ilike, eq } from "drizzle-orm";

const rows = await db
  .select({
    id: users.id,
    email: users.email,
    role: companyUsers.role,
    companyRoleId: companyUsers.companyRoleId,
    companyId: companyUsers.companyId,
  })
  .from(companyUsers)
  .innerJoin(users, eq(users.id, companyUsers.userId))
  .where(eq(companyUsers.companyId, 2));

console.log(JSON.stringify(rows, null, 2));
process.exit(0);