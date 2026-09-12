import "dotenv/config";
import { db } from "../server/db.js";
import { companies } from "../shared/schema.js";
import { DatabaseStorage } from "../server/storage.js";

async function main() {
  const storage = new DatabaseStorage();
  console.log("Fetching all companies...");
  const companyList = await db.select({ id: companies.id, name: companies.name }).from(companies);
  console.log(`Found ${companyList.length} companies.`);

  for (const company of companyList) {
    console.log(`Updating/seeding accounts for company: ${company.name} (ID: ${company.id})...`);
    await storage.initializeCompanyAccounts(company.id);
    console.log(`Successfully updated/seeded accounts for company ID: ${company.id}`);
    
    const allAccounts = await storage.getAccounts(company.id);
    console.log(`Company ID: ${company.id} has ${allAccounts.length} accounts total.`);
  }

  console.log("All company accounts updated successfully!");
}

main().catch(console.error).finally(() => process.exit());
