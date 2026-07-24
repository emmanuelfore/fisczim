import { db } from "../server/db.js";
import { companies } from "../shared/schema.js";
import { eq } from "drizzle-orm";

async function run() {
  const allCompanies = await db.select().from(companies);
  const elimuz = allCompanies.find(c => c.name.toLowerCase().includes('elimuz'));
  
  if (!elimuz) {
    console.error("Could not find ELIMUZ company.");
    process.exit(1);
  }
  
  console.log(`Found ELIMUZ company ID: ${elimuz.id}, API Key configured: ${elimuz.apiKey}`);
  process.exit(0);
}
run();
