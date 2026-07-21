import { eq, ilike, or } from "drizzle-orm";
import { db } from "../server/db";
import { products } from "../shared/schema";
import "dotenv/config";

async function main() {
    const appolloCompanyId = 87;
    const petroProducts = await db.select().from(products)
        .where(
            or(
                ilike(products.name, "%petroleum%"),
                ilike(products.name, "%jelly%")
            )
        );

    // Filter by company 87 specifically in case there are other companies
    const filtered = petroProducts.filter(p => p.companyId === appolloCompanyId);
    
    console.log(`Found ${filtered.length} products related to petroleum/jelly in company 87:`);
    for (const p of filtered) {
        console.log(`- ID: ${p.id} | Name: ${p.name} | Category: ${p.category}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
