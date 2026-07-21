import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users, companyUsers } from "../shared/schema";
import "dotenv/config";

async function main() {
    const kuaEmail = "kua@appollos.co.zw";
    const kudaEmail = "kuda@appollos.co.zw";

    const [kua] = await db.select().from(users).where(eq(users.email, kuaEmail));
    const [kuda] = await db.select().from(users).where(eq(users.email, kudaEmail));
    
    if (kua) {
        const cUsers = await db.select().from(companyUsers).where(eq(companyUsers.userId, kua.id));
        console.log("Kua company users:", cUsers);
    }
    
    if (kuda) {
        const cUsers = await db.select().from(companyUsers).where(eq(companyUsers.userId, kuda.id));
        console.log("Kuda company users:", cUsers);
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
