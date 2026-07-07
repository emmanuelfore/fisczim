import "dotenv/config";
import pg from "pg";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const blockers = await pool.query(`
    SELECT pid, state, query_start, left(query, 100) AS query
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND state = 'idle in transaction'
  `);
  console.log("Idle transactions:", blockers.rows);
  for (const row of blockers.rows) {
    const res = await pool.query("SELECT pg_terminate_backend($1) AS ok", [row.pid]);
    console.log("Terminated", row.pid, res.rows[0].ok);
  }
  await pool.end();
}

main();
