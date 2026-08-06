import { db } from './server/db';
import { companyRoles } from './shared/schema';
import { eq } from 'drizzle-orm';

async function run() {
  const roles = await db.query.companyRoles.findMany({
    where: eq(companyRoles.companyId, 60)
  });
  console.log("Roles for company 60:", roles.map(r => r.name));
  process.exit(0);
}
run().catch(console.error);
