import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const file = process.argv[2];

if (!file) {
  console.error("Usage: node scripts/run-single-migration.mjs <migration.sql>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf8");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied ${file}`);
} finally {
  await client.end();
}
