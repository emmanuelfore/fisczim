import "dotenv/config";
import { db } from "../server/db.js";
import { inventoryLocations } from "../shared/schema.js";
import { inArray } from "drizzle-orm";

async function run() {
  try {
    const duplicateIds = [6, 8, 10];
    console.log(`Deleting duplicate inventory location IDs: ${duplicateIds.join(", ")}`);
    
    const result = await db
      .delete(inventoryLocations)
      .where(inArray(inventoryLocations.id, duplicateIds));
      
    console.log("Deleted successfully.");
  } catch (error) {
    console.error("Error deleting duplicates:", error);
  } finally {
    process.exit(0);
  }
}

run();
