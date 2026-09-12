import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from "../server/db.js";
import { users } from "../shared/schema.js";
import { eq } from "drizzle-orm";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Supabase uses PBKDF2-SHA256 for password hashing
// Format: $pbkdf2-sha256$i=4096$<salt>$<hash>
function verifySupabasePassword(password: string, hash: string): boolean {
  try {
    if (!hash.startsWith('$pbkdf2-sha256$')) {
      return false;
    }

    const parts = hash.split('$');
    if (parts.length !== 5) return false;

    const iterations = parseInt(parts[2].split('=')[1], 10);
    const salt = parts[3];
    const storedHash = parts[4];

    const derivedKey = crypto.pbkdf2Sync(
      password,
      Buffer.from(salt, 'base64'),
      iterations,
      32,
      'sha256'
    );

    const derivedHash = derivedKey.toString('base64');
    return derivedHash === storedHash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

async function migratePasswords() {
  console.log("Starting password migration from Supabase...");

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
        // Get the user from our database
        const existingUser = await db.select().from(users).where(eq(users.id, supabaseUser.id)).limit(1);
        
        if (!existingUser || existingUser.length === 0) {
          console.log(`Skipping user ${supabaseUser.email} - not found in database`);
          skipped++;
          continue;
        }

        const user = existingUser[0];

        // Check if user already has a bcrypt password (already migrated)
        if (user.password && !user.password.startsWith('$pbkdf2-sha256$')) {
          console.log(`Skipping user ${supabaseUser.email} - already has bcrypt password`);
          skipped++;
          continue;
        }

        // Get the encrypted password from Supabase metadata
        // Note: Supabase doesn't expose the password hash directly through the API
        // We need to get it from the auth.users table via SQL
        console.log(`⚠️  Cannot migrate password for ${supabaseUser.email} - Supabase doesn't expose password hashes via API`);
        console.log(`    User will need to reset their password`);
        skipped++;
        
      } catch (error) {
        console.error(`✗ Failed to migrate password for user ${supabaseUser.email}:`, error);
        errors++;
      }
    }

    console.log("\n=== Password Migration Summary ===");
    console.log(`Total users in Supabase: ${supabaseUsers.length}`);
    console.log(`Successfully migrated: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);

    console.log("\n⚠️  IMPORTANT: Supabase does not expose password hashes via their API.");
    console.log("   To migrate passwords, you need to:");
    console.log("   1. Access the Supabase database directly via SQL");
    console.log("   2. Export the auth.users table");
    console.log("   3. Use the provided SQL script to migrate passwords");
    console.log("   4. Or require all users to reset their passwords");

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
migratePasswords().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
