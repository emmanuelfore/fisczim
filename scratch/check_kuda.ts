import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { supabaseAdmin } from "../server/supabase";
import "dotenv/config";

async function main() {
    const newEmail = "kuda@appollos.co.zw";

    console.log(`Searching for user with email ${newEmail}...`);
    const [user] = await db.select().from(users).where(eq(users.email, newEmail));
    
    if (user) {
        console.log(`User with email ${newEmail} already exists in DB with ID: ${user.id}`);
    } else {
        console.log(`User with email ${newEmail} does NOT exist in Postgres DB.`);
    }

    if (supabaseAdmin) {
        console.log("Checking Supabase...");
        try {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers();
            if (error) {
                console.error("Error listing users:", error);
            } else {
                const supaUser = data.users.find(u => u.email === newEmail);
                if (supaUser) {
                    console.log(`User exists in Supabase with ID: ${supaUser.id}`);
                } else {
                    console.log(`User does NOT exist in Supabase.`);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
