import "dotenv/config";
import { db } from "../server/db.js";
import { inventoryLocations, inventoryLocationStocks, products } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";

async function run() {
  try {
    const locations = await db
      .select()
      .from(inventoryLocations)
      .where(eq(inventoryLocations.companyId, 59));

    console.log("Locations for Company 59:");
    console.log(JSON.stringify(locations, null, 2));

    // Also look for stocks in these locations
    for (const loc of locations) {
      const stocks = await db
        .select()
        .from(inventoryLocationStocks)
        .where(eq(inventoryLocationStocks.locationId, loc.id));
      console.log(`Stocks for Location ${loc.name} (ID: ${loc.id}):`, stocks.length);
    }
  } catch (error) {
    console.error("Error fetching locations:", error);
  } finally {
    process.exit(0);
  }
}

run();
