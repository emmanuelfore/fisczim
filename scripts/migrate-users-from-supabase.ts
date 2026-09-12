import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt";
import { db } from "../server/db.js";
import { storage } from "../server/storage.js";
import { users } from "../shared/schema.js";
import { eq } from "drizzle-orm";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateUsers() {
  console.log("Starting user migration from Supabase...");

  try {
    // Fetch all users from Supabase Auth
    const { data: { users: supabaseUsers }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error("Failed to fetch users from Supabase:", error);
      process.exit(1);
    }

    console.log(`Found ${supabaseUsers.length} users in Supabase`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const supabaseUser of supabaseUsers) {
      try {
        // Check if user already exists in our database
        const existingUser = await storage.getUser(supabaseUser.id);
        
        if (existingUser) {
          console.log(`Skipping user ${supabaseUser.email} - already exists`);
          skipped++;
          continue;
        }

        // Generate username from email
        const baseUsername = supabaseUser.email?.split('@')[0] || 'user';
        let username = baseUsername;
        let counter = 1;

        while (true) {
          const existingByUsername = await storage.getUserByUsername(username);
          if (!existingByUsername) break;
          username = `${baseUsername}_${counter}`;
          counter++;
        }

        // Create user with a temporary password (they'll need to reset it)
        const tempPassword = await bcrypt.hash('ChangeMe123!', 10);

        const newUser = await storage.createUser({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          password: tempPassword,
          name: supabaseUser.user_metadata?.name || 
                supabaseUser.user_metadata?.full_name || 
                supabaseUser.email?.split('@')[0] || 
                'Migrated User',
          username,
          passwordChanged: false, // Force password change on first login
        });

        console.log(`✓ Migrated user: ${newUser.email} (${newUser.username})`);
        migrated++;
      } catch (error) {
        console.error(`✗ Failed to migrate user ${supabaseUser.email}:`, error);
        errors++;
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Total users in Supabase: ${supabaseUsers.length}`);
    console.log(`Successfully migrated: ${migrated}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Errors: ${errors}`);

    if (errors > 0) {
      console.log("\n⚠️  Some users failed to migrate. Please check the errors above.");
      process.exit(1);
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\n⚠️  IMPORTANT: All migrated users have temporary password 'ChangeMe123!'");
    console.log("   They will be required to change their password on first login.");

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
migrateUsers().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
