import { db } from "../server/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function main() {
  try {
    const migrationPath = path.join(process.cwd(), "./migrations/0031_strong_komodo.sql");
    console.log("Reading migration file:", migrationPath);
    const content = fs.readFileSync(migrationPath, "utf-8");
    
    // Split statements by Drizzle's breakpoint delimiter
    const statements = content.split("--> statement-breakpoint");
    
    console.log(`Executing ${statements.length} SQL statements...`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      console.log(`Executing statement ${i + 1}/${statements.length}:`);
      console.log(stmt);
      try {
        await db.execute(sql.raw(stmt));
        console.log("Success.");
      } catch (stmtErr: any) {
        if (stmtErr.message.includes("already exists")) {
          console.warn(`Warning (ignoring): ${stmtErr.message}`);
        } else {
          throw stmtErr;
        }
      }
    }
    
    console.log("All migration statements applied successfully!");
  } catch (err: any) {
    console.error("Migration error:", err.message);
  }
  process.exit(0);
}

main();
