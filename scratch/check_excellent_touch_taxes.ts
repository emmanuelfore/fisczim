import { db } from "../server/db.js";
import { taxTypes, companies } from "../shared/schema.js";
import { eq, or, isNull } from "drizzle-orm";

async function main() {
  // What tax types does company 114 have?
  const companyTaxes = await db.select().from(taxTypes)
    .where(or(eq(taxTypes.companyId, 114), isNull(taxTypes.companyId)));

  console.log(`\n📋 Tax types visible to Company 114 (Excellent Touch):`);
  console.log(`Total: ${companyTaxes.length}`);
  for (const t of companyTaxes) {
    const scope = t.companyId ? `company ${t.companyId}` : "GLOBAL";
    console.log(`  [${t.id}] ${t.name} | rate=${t.rate} | zimraTaxId=${t.zimraTaxId} | code=${t.code} | active=${t.isActive} | scope=${scope}`);
  }

  // Also check company ZIMRA config
  const [company] = await db.select({
    id: companies.id,
    name: companies.name,
    fdmsDeviceId: companies.fdmsDeviceId,
    zimraEnvironment: companies.zimraEnvironment,
    fdmsApiKey: companies.fdmsApiKey,
  }).from(companies).where(eq(companies.id, 114));

  console.log(`\n🏢 Company ZIMRA config:`);
  console.log(`  fdmsDeviceId: ${company.fdmsDeviceId}`);
  console.log(`  zimraEnvironment: ${company.zimraEnvironment}`);
  console.log(`  fdmsApiKey: ${company.fdmsApiKey ? "SET ✅" : "NOT SET ❌"}`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
