import { eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../server/db";
import { taxTypes, taxCategories } from "../shared/schema";
import "dotenv/config";

async function main() {
    const types = await db.select().from(taxTypes).where(eq(taxTypes.companyId, 87));
    const categories = await db.select().from(taxCategories).where(eq(taxCategories.companyId, 87));
    
    console.log("Tax Types for 87:", types.length);
    console.log("Tax Categories for 87:", categories.length);
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
