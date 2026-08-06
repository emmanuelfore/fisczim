import { db } from './server/db';
import { companyRoles } from './shared/schema';
import { eq, and, notInArray } from 'drizzle-orm';

async function run() {
  const companyId = 60;
  const keepRoles = ['admin', 'sales and marketing', 'control room'];
  
  const result = await db.delete(companyRoles).where(
    and(
      eq(companyRoles.companyId, companyId),
      notInArray(companyRoles.name, keepRoles)
    )
  ).returning();
  
  console.log(`Deleted ${result.length} roles.`);
  process.exit(0);
}
run().catch(console.error);
