import { db } from './server/db';
import { companies, companyRoles } from './shared/schema';
import { ilike } from 'drizzle-orm';

async function run() {
  const allCompanies = await db.query.companies.findMany({
    where: ilike(companies.name, '%CLAMP%'),
  });
  console.log('Companies found:', allCompanies.map(c => ({ id: c.id, name: c.name })));
  
  if (allCompanies.length === 0) {
    const all = await db.query.companies.findMany({
      where: ilike(companies.name, '%C.I.A%'),
    });
    console.log('Fallback C.I.A Companies found:', all.map(c => ({ id: c.id, name: c.name })));
  }
  process.exit(0);
}
run().catch(console.error);
