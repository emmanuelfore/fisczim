import { db } from "./server/db.js";
import { companies } from "./shared/schema.js";
import { eq } from "drizzle-orm";
async function run() {
  const c = await db.query.companies.findFirst({
    where: eq(companies.name, "ELIMUZ INVESTMENTS")
  });
  console.log(JSON.stringify(c, null, 2));
  process.exit(0);
}
run();
