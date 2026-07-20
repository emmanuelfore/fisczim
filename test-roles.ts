import { db } from "./server/db.js";
import { companies } from "./shared/schema.js";
import { ilike } from "drizzle-orm";
import { storage } from "./server/storage.js";

async function run() {
  const [company] = await db.select().from(companies).where(ilike(companies.name, "%Appollos%")).limit(1);
  if (!company) {
    console.log("Company not found");
    process.exit(1);
  }
  console.log("Found company:", company.id, company.name);
  try {
    const roles = await storage.getCompanyRoles(company.id);
    console.log("Roles count:", roles.length);
  } catch (e) {
    console.error("Error getting roles:", e);
  }
  process.exit(0);
}

run();
