
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
  // A remote/local database outage must not hold the browser on its sign-in
  // screen for 15 seconds per request. Production retains the longer grace
  // period; development fails promptly and makes the real issue visible.
  connectionTimeoutMillis: isDevelopment ? 4_000 : 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

pool.on("error", (err) => {
  // Prevent the Node process from crashing on unexpected connection drops.
  // pg-pool emits this for idle clients that error.
  console.error("[db] Unexpected pg pool error:", err);
});

export const db = drizzle(pool, { schema, logger: true });
