
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
  max: isDevelopment ? 10 : 15,
  // Thirty seconds was too aggressive for a remote host over a high-latency
  // link: connections were torn down between login bursts, so the first
  // request after an idle period paid a fresh TCP + TLS handshake that could
  // exceed the connect timeout and surface as a 500 ("database connection").
  // Two minutes keeps the pool warm across the gaps without holding sockets
  // indefinitely.
  idleTimeoutMillis: 120_000,
  // Dashboard bursts fan out ~8 concurrent requests and every authenticated
  // request checks out a connection twice (auth getUser, then the handler).
  // On this high-latency link each acquisition takes seconds, so a max of 5
  // queued past the 15s connection timeout and surfaced as 500s from the
  // auth middleware. 10 absorbs the burst without hammering the server.
  // This app connects to a remote PostgreSQL host in development. New TCP/TLS
  // connections can take several seconds, so keep a reliability-first window
  // rather than falsely declaring the database unavailable during a slow
  // handshake.
  connectionTimeoutMillis: 30_000,
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

// A dropped or refused connection is worth retrying; a constraint or syntax
// error is not. Used sparingly on read paths that gate the whole app.
export function isTransientDbError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err);
  return /connection (terminated|timeout|refused)|timeout exceeded when trying to connect|ECONNRESET|ETIMEDOUT|ECONNREFUSED|server closed the connection|Connection terminated|57P0[123]/i.test(
    message,
  );
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 400,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts - 1 || !isTransientDbError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
    }
  }
}
