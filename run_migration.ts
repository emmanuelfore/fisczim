import "dotenv/config";
import fs from "fs";
import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function run() {
  try {
    const content = fs.readFileSync("./migrations/0044_job_logs.sql", "utf8");
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
