import { db } from "./server/db";
import { customers } from "./shared/schema";
import { eq } from "drizzle-orm";

async function copyCustomers() {
    try {
        const sourceId = 84;
        const targetId = 86;

        console.log(`Copying customers from company ${sourceId} to ${targetId}...`);

        const sourceCustomers = await db.select().from(customers).where(eq(customers.companyId, sourceId));
        console.log(`Found ${sourceCustomers.length} customers to copy.`);

        for (const cust of sourceCustomers) {
            const { id, createdAt, ...data } = cust;
            await db.insert(customers).values({
                ...data,
                companyId: targetId
            });
        }

        console.log(`Successfully copied ${sourceCustomers.length} customers.`);
    } catch (error) {
        console.error("Error during customer copy:", error);
    } finally {
        process.exit(0);
    }
}

copyCustomers();
