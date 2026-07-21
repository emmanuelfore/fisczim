import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { companyRoles } from "../shared/schema";
import "dotenv/config";

async function main() {
    const roles = await db.select().from(companyRoles).where(eq(companyRoles.companyId, 87));
    console.log("Roles for company 87:");
    console.log(roles);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
