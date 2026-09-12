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
      console.log(`[AUTH] Processing token for ${req.path}`);
      
      // Verify JWT token
      const payload = verifyAccessToken(token);
      if (!payload) {
        console.log(`[AUTH] Token verification failed for ${req.path}`);
        return next();
      }

      console.log("[AUTH] Token verified successfully for user:", payload.userId);

      // Get user from database
      let user;
      let retries = 3;
      while (retries > 0) {
        try {
          user = await storage.getUser(payload.userId);
          break;
        } catch (err) {
          console.warn(`Failed to fetch user (attempt ${4 - retries}/3):`, err);
          retries--;
          if (retries === 0) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (user) {
        console.log(`[AUTH] Authenticated: ${user.email} (isSuperAdmin: ${user.isSuperAdmin}) for ${req.method} ${req.path}`);
        req.user = user;
        req.isAuthenticated = () => true;
      } else {
        console.log(`[AUTH] User not found for ID: ${payload.userId}`);
        req.user = undefined;
      }
      next();
    } catch (err) {
      console.error("Auth middleware error:", err);
      return res.status(500).json({ message: "Auth middleware failed", error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.use((req: any, res, next) => {
    if (typeof req.isAuthenticated !== "function") req.isAuthenticated = () => false;
    next();
  });
}