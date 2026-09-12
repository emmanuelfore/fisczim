import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { supabaseAdmin } from "../server/supabase";
import "dotenv/config";

async function main() {
    const oldEmail = "kua@appollos.co.zw";
    const newEmail = "kuda@appollos.co.zw";
    const newUsername = "kuda";

    console.log(`Searching for user with email ${oldEmail}...`);
    const [user] = await db.select().from(users).where(eq(users.email, oldEmail));
    
    if (!user) {
        console.error(`User with email ${oldEmail} not found in the database.`);
        process.exit(1);
    }
    
    console.log(`Found user: ${user.id}`);
    
    // Update in Supabase
    if (supabaseAdmin) {
        console.log("Updating email in Supabase...");
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            email: newEmail,
        });
        if (error) {
            console.error("[Supabase Error]:", error);
            process.exit(1);
        }
        console.log("[Supabase] Email updated successfully.");
    } else {
        console.log("[Supabase] Admin client not configured. Skipping Supabase update.");
    }

    // Update in Database
    console.log("Updating email in Postgres database...");
    await db.update(users)
        .set({ email: newEmail, username: newUsername })
        .where(eq(users.id, user.id));
        
    console.log("[DB] Email updated successfully.");

    console.log("Done.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
