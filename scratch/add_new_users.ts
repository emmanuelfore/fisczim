import { db } from "../server/db";
import { users, companyUsers } from "../shared/schema";
import { supabaseAdmin } from "../server/supabase";
import "dotenv/config";
import { eq } from "drizzle-orm";

async function addUser(email: string, roleName: string, roleValue: string, companyRoleId: number) {
    console.log(`Adding ${email}...`);
    
    // First, check if user exists in db
    let [existingUser] = await db.select().from(users).where(eq(users.email, email));
    let userId = existingUser?.id;

    if (!userId) {
        // Create in Supabase
        if (supabaseAdmin) {
            console.log(`Creating ${email} in Supabase...`);
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
                email,
                password: "password123",
                email_confirm: true,
                user_metadata: { name: email.split("@")[0] }
            });
            if (error) {
                if (error.code === 'email_exists') {
                    console.log("Email already exists in Supabase, trying to fetch...");
                    const listResponse = await supabaseAdmin.auth.admin.listUsers();
                    const supaUser = listResponse.data.users.find(u => u.email === email);
                    if (supaUser) userId = supaUser.id;
                    else throw new Error("Could not find user in Supabase list");
                } else {
                    console.error("Supabase create error:", error);
                    process.exit(1);
                }
            } else {
                userId = data.user.id;
            }
        }
        
        // Ensure userId is valid, if Supabase not configured we might mock one or fail
        if (!userId) throw new Error("No userId from Supabase");

        console.log(`Creating ${email} in Postgres (ID: ${userId})...`);
        await db.insert(users).values({
            id: userId,
            email,
            username: email.split("@")[0],
            name: email.split("@")[0],
            password: "password123",
            passwordChanged: true,
        });
    } else {
        console.log(`User ${email} already exists in DB (ID: ${userId})`);
    }

    // Assign to company
    const [existingCompanyUser] = await db.select()
        .from(companyUsers)
        .where(eq(companyUsers.userId, userId));
        
    if (existingCompanyUser) {
        console.log(`User ${email} is already linked to a company, skipping link.`);
    } else {
        console.log(`Linking ${email} to company 87 as ${roleName}...`);
        await db.insert(companyUsers).values({
            userId,
            companyId: 87,
            role: roleValue,
            companyRoleId,
        });
        console.log(`Successfully linked ${email}`);
    }
}

async function main() {
    await addUser("justin@appollos.co.zw", "Administrator", "admin", 63);
    await addUser("dadirai@appollos.co.zw", "Accountant", "accountant", 119);
    console.log("Done.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
