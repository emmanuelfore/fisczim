import { db } from "./server/db";
import { companies } from "./shared/schema";

async function listCompanies() {
    try {
        const allCompanies = await db.select({
            id: companies.id,
            name: companies.name
        }).from(companies);
        console.log("Companies:", JSON.stringify(allCompanies, null, 2));
    } catch (error) {
        console.error("Error listing companies:", error);
    } finally {
        process.exit(0);
    }
}

listCompanies();
