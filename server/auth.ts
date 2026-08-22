import { Express, Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual, createVerify } from "crypto";
import { storage } from "./storage.js";
import { User as DbUser } from "../shared/schema.js";
import { supabaseServer } from "./supabase.js";

function base64UrlDecode(part: string): string {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

interface JWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  crv?: string;
  x?: string;
  y?: string;
}

interface JWKS {
  keys: JWK[];
}

let jwksCache: JWKS | null = null;
let jwksCacheTime = 0;
const JWKS_TTL = 60 * 60 * 1000;

async function fetchJWKS(): Promise<JWKS> {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_TTL) return jwksCache;
  const supabaseUrl = process.env.SUPABASE_URL || "https://nopztclveukecdabuist.supabase.co";
  console.log("[AUTH] Fetching JWKS from", supabaseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Failed to fetch JWKS: ${response.status}`);
    const jwks = await response.json() as JWKS;
    console.log("[AUTH] JWKS fetched, keys:", jwks.keys.length);
    jwksCache = jwks;
    jwksCacheTime = Date.now();
    return jwks;
  } catch (e) {
    clearTimeout(timeout);
    console.error("[AUTH] JWKS fetch failed:", e);
    throw e;
  }
}

function rawToDerSignature(raw: Buffer): Buffer {
  // Convert raw r||s (64 bytes) to DER format
  if (raw.length !== 64) return Buffer.alloc(0);
  const r = raw.subarray(0, 32);
  const s = raw.subarray(32, 64);
  // Remove leading zeros for DER INTEGER encoding
  const trim = (buf: Buffer) => {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0) i++;
    return buf.subarray(i);
  };
  const rTrim = trim(r);
  const sTrim = trim(s);
  // Add leading zero if high bit set (to indicate positive)
  const rFinal = (rTrim[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), rTrim]) : rTrim;
  const sFinal = (sTrim[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), sTrim]) : sTrim;
  const der = Buffer.concat([
    Buffer.from([0x30]), // SEQUENCE
    Buffer.from([2 + rFinal.length + 2 + sFinal.length]),
    Buffer.from([0x02]), Buffer.from([rFinal.length]), rFinal,
    Buffer.from([0x02]), Buffer.from([sFinal.length]), sFinal,
  ]);
  return der;
}

async function verifyToken(token: string, jwtSecret: string): Promise<Pick<DbUser, "id"> & { email?: string; user_metadata?: Record<string, any> } | null> {
  try {
    console.log("[AUTH] verifyToken called, token length:", token?.length);
    const parts = token.split(".");
    console.log("[AUTH] Token parts:", parts.length);
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(base64UrlDecode(headerB64));
    console.log("[AUTH] Token header:", JSON.stringify(header));
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;

    if (header.alg === "HS256") {
      console.log("[AUTH] Verifying HS256 token");
      const expected = createHmac("sha256", jwtSecret).update(`${headerB64}.${payloadB64}`).digest();
      const actual = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    } else if (header.alg === "ES256") {
      console.log("[AUTH] Verifying ES256 token, kid:", header.kid);
      try {
        const jwks = await fetchJWKS();
        const jwk = jwks.keys.find(k => k.kid === header.kid && k.alg === "ES256" && k.crv === "P-256");
        if (!jwk || !jwk.x || !jwk.y) {
          console.log("[AUTH] JWK not found for kid:", header.kid);
          return null;
        }
        console.log("[AUTH] JWK found, verifying signature");
        const x = Buffer.from(jwk.x.replace(/-/g, "+").replace(/_/g, "/"), "base64");
        const y = Buffer.from(jwk.y.replace(/-/g, "+").replace(/_/g, "/"), "base64");
        const pubKey = Buffer.concat([Buffer.from([0x04]), x, y]);
        const pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.concat([Buffer.from([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00]), pubKey]).toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
        const verify = createVerify("SHA256");
        verify.update(`${headerB64}.${payloadB64}`);
        const rawSig = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
        const derSig = rawToDerSignature(rawSig);
        console.log("[AUTH] DER signature length:", derSig.length);
        if (!verify.verify(pem, derSig)) {
          console.log("[AUTH] ES256 verification FAILED");
          return null;
        }
        console.log("[AUTH] ES256 verification SUCCESS");
      } catch (e) {
        console.error("[AUTH] ES256 verification error:", e);
        return null;
      }
    } else {
      console.warn("[AUTH] Unsupported token algorithm:", header.alg);
      return null;
    }

    console.log("[AUTH] Token verified successfully");
    return {
      id: payload.sub as string,
      email: payload.email as string | undefined,
      user_metadata: payload.user_metadata as Record<string, any> | undefined,
    };
  } catch {
    return null;
  }
}

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
  app.use(async (req: any, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api") || req.path.startsWith("/api/health")) {
      return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }
    const token = authHeader.split(" ")[1];
    if (!token) return next();

    try {
      console.log(`[AUTH] Processing token for ${req.path}`);
      let supabaseUser: Awaited<ReturnType<typeof verifyToken>>;
      const jwtSecret = process.env.SUPABASE_JWT_SECRET;
      if (jwtSecret) {
        console.log("[AUTH] Using local token verification");
        supabaseUser = await verifyToken(token, jwtSecret);
        console.log("[AUTH] verifyToken result:", supabaseUser ? "success" : "failed");
        if (!supabaseUser) {
          console.log(`[AUTH] Token verification failed for ${req.path}`);
          return next();
        }
      } else {
        console.warn("[AUTH] SUPABASE_JWT_SECRET not set — falling back to remote getUser()");
        const { data, error } = await supabaseServer.auth.getUser(token);
        if (error || !data.user) {
          console.log(`[AUTH] Supabase verification failed for ${req.path}: ${error?.message || 'No user'}`);
          return next();
        }
        supabaseUser = data.user;
      }

      let user;
      let retries = 3;
      while (retries > 0) {
        try {
          user = await storage.getUser(supabaseUser.id);
          break;
        } catch (err) {
          console.warn(`Failed to fetch user (attempt ${4 - retries}/3):`, err);
          retries--;
          if (retries === 0) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!user && supabaseUser.email) {
        const baseUsername = supabaseUser.email.split('@')[0];
        let created = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
          const username = attempt === 1 ? baseUsername : `${baseUsername}_${attempt}`;
          try {
            user = await storage.createUser({
              id: supabaseUser.id,
              email: supabaseUser.email,
              password: "",
              name: supabaseUser.user_metadata?.name || supabaseUser.user_metadata?.full_name || "New User",
              username,
              passwordChanged: true,
            });
            created = true;
            break;
          } catch (err: any) {
            if (err?.code === '23505' && err?.constraint === 'users_username_unique') continue;
            console.error("Error creating user from Supabase token:", err);
            return next();
          }
        }
        if (!created) return next();
      }

      if (user) {
        console.log(`[AUTH] Authenticated: ${user.email} (isSuperAdmin: ${user.isSuperAdmin}) for ${req.method} ${req.path}`);
        req.user = user;
        req.isAuthenticated = () => true;
      } else {
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