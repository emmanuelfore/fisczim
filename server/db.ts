
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";

const { Pool } = pg;
const isDevelopment = process.env.NODE_ENV === "development";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Database connection pool for Drizzle ORM
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: isDevelopment ? 5 : 15,
  idleTimeoutMillis: 30000,
  // This app connects to a remote PostgreSQL host in development. New TCP/TLS
  // connections can take several seconds, so keep a reliability-first window
  // rather than falsely declaring the database unavailable during a slow
  // handshake.
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  // Prevent the Node process from crashing on unexpected connection drops.
  // pg-pool emits this for idle clients that error.
  console.error("[db] Unexpected pg pool error:", err);
});

// Query logging printed every dashboard query (including sensitive user fields)
// and obscured actionable startup/auth errors. Enable it only when explicitly
// diagnosing SQL with DRIZZLE_LOG_QUERIES=true.
export const db = drizzle(pool, {
  schema,
  logger: process.env.DRIZZLE_LOG_QUERIES === "true",
});
