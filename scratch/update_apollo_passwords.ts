import { eq, ilike } from "drizzle-orm";
import { db } from "../server/db";
import { companies, companyUsers, users } from "../shared/schema";
import { supabaseAdmin } from "../server/supabase";
import "dotenv/config";

async function main() {
    console.log("Searching for Apollo companies...");
    const apolloCompanies = await db.select().from(companies).where(ilike(companies.name, "%apollo%"));
    const appolloCompanies = await db.select().from(companies).where(ilike(companies.name, "%appollo%"));
    
    // De-duplicate if needed
    const map = new Map();
    for (const c of apolloCompanies) map.set(c.id, c);
    for (const c of appolloCompanies) map.set(c.id, c);
    
    const allApolloCompanies = Array.from(map.values());
    console.log(`Found ${allApolloCompanies.length} companies.`);
    
    for (const company of allApolloCompanies) {
        console.log(`- ${company.id}: ${company.name}`);
        const cUsers = await db.select({
            userId: users.id,
            email: users.email,
        })
        .from(companyUsers)
        .innerJoin(users, eq(companyUsers.userId, users.id))
        .where(eq(companyUsers.companyId, company.id));

        console.log(`  Found ${cUsers.length} users for ${company.name}`);
        
        for (const u of cUsers) {
            console.log(`  Updating password for user ${u.email} (${u.userId})...`);
            
            // Try supabase update if available
            if (supabaseAdmin) {
                const { error } = await supabaseAdmin.auth.admin.updateUserById(u.userId, {
                    password: "password123",
                    user_metadata: { password_changed: false } // optional
                });
                if (error) {
                    console.error(`  [Supabase Error] for ${u.email}:`, error);
                } else {
                    console.log(`  [Supabase] Success for ${u.email}`);
                }
            } else {
                console.log(`  [Supabase] Admin client not configured.`);
            }

            // Update in DB just in case
            await db.update(users)
                .set({ password: "password123" }) // Drizzle table
                .where(eq(users.id, u.userId));
                
            console.log(`  [DB] Success for ${u.email}`);
        }
    }
    
    console.log("Done.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
