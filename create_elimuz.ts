import { db } from "./server/db";
import { companies } from "./shared/schema";

async function createCompany() {
    try {
        const result = await db.insert(companies).values({
            name: "ELIMUZ INVESTMENTS",
            address: "TBD",
            city: "Harare",
            phone: "0000000000",
            email: "info@elimuz.com",
            country: "Zimbabwe",
            currency: "USD",
        }).returning();
        console.log("Company created successfully:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error creating company:", error);
    } finally {
        process.exit(0);
    }
}

createCompany();
