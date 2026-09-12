import { db } from "./server/db";
import { suppliers } from "./shared/schema";
import { sql } from "drizzle-orm";

const q = db.select({
  id: suppliers.id,
  companyId: suppliers.companyId,
  name: suppliers.name
}).from(suppliers)
  .groupBy(
    suppliers.id,
    suppliers.companyId,
    suppliers.name
  );

console.log(q.toSQL());
