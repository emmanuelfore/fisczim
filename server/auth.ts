import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage.js";
import { User as DbUser } from "../shared/schema.js";
import { verifyAccessToken } from "./lib/jwt.js";

// Augment Express Request type
declare global {
  namespace Express {
    interface User extends DbUser { }
    interface Request {
      user?: User;
      isAuthenticated(): boolean;
    }
  }
}

// Short-lived cache for the per-request user lookup. The JWT is already
// verified before this runs, so identity is proven; caching only skips a
// repeat DB round-trip (seconds on a high-latency link) for attributes like
// name/role. Trade-off: profile/role edits take up to USER_CACHE_TTL_MS to
// reflect in subsequent requests.
const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map<string, { user: DbUser; expiresAt: number }>();

function getCachedUser(userId: string): DbUser | undefined {
  const entry = userCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return undefined;
  }
  return entry.user;
}

function setCachedUser(user: DbUser): void {
  if (userCache.size > 1000) {
    const now = Date.now();
    for (const [key, entry] of userCache) {
      if (now > entry.expiresAt) userCache.delete(key);
    }
  }
  userCache.set(user.id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

export function setupAuth(app: Express) {
  // NOTE: This middleware is PASSIVE — it attaches req.user if a valid token exists
  // but does NOT reject requests without tokens. Each route must check
  // req.isAuthenticated() or use requireAuth/requireAuthOrApiKey middleware.
  app.use(async (req: any, res: Response, next: NextFunction) => {
    // Skip auth for public endpoints and health checks
    if (!req.path.startsWith("/api") ||
        req.path.startsWith("/api/health") || 
        req.path.startsWith("/api/auth")) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      // Passive middleware: don't block the request, just skip user attachment.
      // Individual routes must check req.isAuthenticated() to enforce auth.
      return next();
    }

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    try {
      // Verify JWT token
      const payload = verifyAccessToken(token);
      if (!payload) {
        return next();
      }

      // Get user from database (cached briefly to avoid a repeat
      // multi-second round-trip on every request of a dashboard burst).
      const cached = getCachedUser(payload.userId);
      const user = cached ?? await storage.getUser(payload.userId);
      if (user && !cached) setCachedUser(user);

      if (user) {
        req.user = user;
        req.isAuthenticated = () => true;
      } else {
        req.user = undefined;
      }
      next();
    } catch (err: any) {
      console.error("Auth middleware error:", err);
      const databaseUnavailable =
        /connection (terminated|timeout)|ECONNRESET|ETIMEDOUT/i.test(String(err?.message || err));
      return res.status(databaseUnavailable ? 503 : 500).json({
        message: databaseUnavailable
          ? "Database is temporarily unavailable. Please retry shortly."
          : "Auth middleware failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.use((req: any, res, next) => {
    if (typeof req.isAuthenticated !== "function") req.isAuthenticated = () => false;
    next();
  });
}
