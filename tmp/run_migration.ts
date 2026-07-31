import "dotenv/config";
import { readFileSync } from "node:fs";
import { Client } from "pg";

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) { console.error("usage: tsx tmp/run_migration.ts <sql file...>"); process.exit(1); }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  for (const f of files) {
    const sql = readFileSync(f, "utf8");
    console.log(`Applying ${f} ...`);
    await c.query(sql);
    console.log("OK");
  }
  await c.end();
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
