import "dotenv/config";
import pg from "pg";

const [tableName, columnName] = process.argv.slice(2);

if (!tableName || !columnName) {
  console.error("Usage: node scripts/check-db-column.mjs <table> <column>");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const result = await client.query(
    "select column_name, column_default from information_schema.columns where table_name = $1 and column_name = $2",
    [tableName, columnName],
  );
  console.log(JSON.stringify(result.rows));
} finally {
  await client.end();
}
