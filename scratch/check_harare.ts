import "dotenv/config";
import { db } from "../server/db";
import { companies, branches, inventoryLocations } from "../shared/schema";
import { eq, ilike } from "drizzle-orm";

async function main() {
  try {
    console.log("Searching for 'Harare North' in companies, branches, and locations...");
    
    // Search branches
    const dbBranches = await db.select().from(branches).where(ilike(branches.name, "%Harare%"));
    console.log("Matching Branches:", dbBranches);

    // Search locations
    const dbLocations = await db.select().from(inventoryLocations).where(ilike(inventoryLocations.name, "%Harare%"));
    console.log("Matching Locations:", dbLocations);

    // Let's see the active company or companies
    const allCompanies = await db.select().from(companies);
    console.log("All Companies count:", allCompanies.length);
    const demoCompany = allCompanies.find(c => c.name.toLowerCase().includes("demo"));
    console.log("Demo Company:", demoCompany);

    // Let's query details for company 59
    const targetCompanyId = 59;
    const company59 = await db.select().from(companies).where(eq(companies.id, targetCompanyId));
    console.log("Company 59:", company59);

    if (company59.length > 0) {
      const branches59 = await db.select().from(branches).where(eq(branches.companyId, targetCompanyId));
      console.log("Branches for Company 59:", branches59);

      const locations59 = await db.select().from(inventoryLocations).where(eq(inventoryLocations.companyId, targetCompanyId));
      console.log("Locations for Company 59:", locations59);
    }
  } catch (err: any) {
    console.error("Error executing query:", err);
  }
  process.exit(0);
}

main();
