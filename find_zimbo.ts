import { db } from "./server/db";
import { companies } from "./shared/schema";
import { ilike } from "drizzle-orm";

async function main() {
  const matchingCompanies = await db.select().from(companies).where(ilike(companies.name, "%Zimbo%"));
  console.log("Matching companies for 'Zimbo':", matchingCompanies.map(c => ({ id: c.id, name: c.name })));
  
  const matchingLable = await db.select().from(companies).where(ilike(companies.name, "%Lable%"));
  console.log("Matching companies for 'Lable':", matchingLable.map(c => ({ id: c.id, name: c.name })));

  const matchingLabel = await db.select().from(companies).where(ilike(companies.name, "%Label%"));
  console.log("Matching companies for 'Label':", matchingLabel.map(c => ({ id: c.id, name: c.name })));

  process.exit(0);
}

main().catch(console.error);
