import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users, companyUsers } from "../shared/schema";
import { supabaseAdmin } from "../server/supabase";
import "dotenv/config";

async function main() {
    const oldEmail = "kua@appollos.co.zw";
    const newEmail = "kuda@appollos.co.zw";
    
    console.log(`Deleting existing ${newEmail} if it's empty...`);
    const [kuda] = await db.select().from(users).where(eq(users.email, newEmail));
    
    if (kuda) {
        console.log(`Found kuda with ID: ${kuda.id}`);
        // delete from supabase
        if (supabaseAdmin) {
            console.log(`Deleting ${newEmail} from Supabase...`);
            const { error } = await supabaseAdmin.auth.admin.deleteUser(kuda.id);
            if (error) {
                console.error("Error deleting from Supabase:", error);
            } else {
                console.log("Deleted from Supabase.");
            }
        }
        
        // delete from DB
        console.log(`Deleting ${newEmail} from Postgres...`);
        await db.delete(users).where(eq(users.id, kuda.id));
        console.log("Deleted from Postgres.");
    }

    console.log(`Updating ${oldEmail} to ${newEmail}...`);
    const [kua] = await db.select().from(users).where(eq(users.email, oldEmail));
    
    if (kua) {
        // update in supabase
        if (supabaseAdmin) {
            console.log("Updating in Supabase...");
            const { error } = await supabaseAdmin.auth.admin.updateUserById(kua.id, {
                email: newEmail,
            });
            if (error) {
                console.error("Error updating in Supabase:", error);
                process.exit(1);
            } else {
                console.log("Updated in Supabase.");
            }
        }
        
        // update in DB
        console.log("Updating in Postgres...");
        await db.update(users)
            .set({ email: newEmail, username: "kuda" })
            .where(eq(users.id, kua.id));
        console.log("Updated in Postgres.");
    } else {
        console.log(`${oldEmail} not found!`);
    }

    console.log("Done.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
