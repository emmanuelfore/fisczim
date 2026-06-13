import "dotenv/config";
import fs from "fs";
import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function run() {
  try {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "purchase_return_items" CASCADE;`));
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "purchase_returns" CASCADE;`));
    
    const content = fs.readFileSync("./migrations/0030_powerful_green_goblin.sql", "utf8");
    const statements = content.split("--> statement-breakpoint");
    for (const stmt of statements) {
      const q = stmt.trim();
      if (q) {
        await db.execute(sql.raw(q));
      }
    }
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

run();
