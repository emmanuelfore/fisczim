import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { sageConnections } from "../../shared/schema.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Sage OAuth 2.0 Flow
//
//  GET  /api/sage/oauth/connect   — Redirect user to Sage login
//  GET  /api/sage/oauth/callback  — Exchange code → tokens, save to DB
//  GET  /api/sage/oauth/status    — Check if current company is connected
//  POST /api/sage/oauth/disconnect — Remove the connection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode state as base64 JSON so we can pass companyId + a CSRF nonce
 * through the OAuth redirect without storing server-side session state.
 */
function encodeState(companyId: number): string {
  return Buffer.from(
    JSON.stringify({ companyId, nonce: crypto.randomBytes(8).toString("hex") })
  ).toString("base64url");
}

function decodeState(state: string): { companyId: number; nonce: string } | null {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/sage/oauth/connect
//  Redirects the browser to Sage's OAuth consent screen.
//  Query param: ?companyId=<N>
// ─────────────────────────────────────────────────────────────────────────────
router.get("/connect", (req: Request, res: Response) => {
  const companyId = parseInt(req.query.companyId as string ?? "");

  if (!companyId || isNaN(companyId)) {
    return res.status(400).json({
      error: "Missing companyId query parameter",
    });
  }

  const clientId     = process.env.SAGE_CLIENT_ID;
  const callbackUrl  = process.env.SAGE_CALLBACK_URL;
  const authUrl      = process.env.SAGE_AUTH_URL ?? "https://www.sageone.com/oauth2/auth/central";

  if (!clientId || !callbackUrl) {
    return res.status(500).json({ error: "Sage OAuth is not configured on this server" });
  }

  // Build manually — URLSearchParams would encode the '/' in client_id as '%2F'
  // which some Sage auth servers reject. Keep it as a literal slash.
  const state = encodeState(companyId);
  const redirectUrl =
    `${authUrl}` +
    `?response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&scope=full_access` +
    `&state=${encodeURIComponent(state)}` +
    `&country=gb`;

  console.log("[SageOAuth] Redirecting to:", redirectUrl);
  res.redirect(redirectUrl);
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/sage/oauth/callback
//  Sage redirects here after the user grants access.
//  Exchanges the authorization code for tokens and saves to the application DB.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  // User denied access
  if (oauthError) {
    console.error("[SageOAuth] User denied access:", oauthError);
    return res.redirect(`/?sage_error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter");
  }

  // Decode state to get companyId
  const decoded = decodeState(state);
  if (!decoded) {
    return res.status(400).send("Invalid state parameter");
  }
  const { companyId } = decoded;

  const clientId     = process.env.SAGE_CLIENT_ID!;
  const clientSecret = process.env.SAGE_CLIENT_SECRET!;
  const callbackUrl  = process.env.SAGE_CALLBACK_URL!;
  const tokenUrl     = process.env.SAGE_TOKEN_URL ?? "https://oauth.accounting.sage.com/token";

  // Exchange code for tokens
  let tokenData: any;
  try {
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  callbackUrl,
        client_id:     clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[SageOAuth] Token exchange failed:", resp.status, errText);
      return res.redirect(`/?sage_error=${encodeURIComponent("Token exchange failed")}`);
    }

    tokenData = await resp.json();
  } catch (err: any) {
    console.error("[SageOAuth] Token exchange error:", err.message);
    return res.redirect(`/?sage_error=${encodeURIComponent(err.message)}`);
  }

  const { access_token, refresh_token, expires_in } = tokenData;

  // Fetch Sage business info so we can store the business ID
  let sageBusinessId: string | null = null;
  try {
    const businessResp = await fetch(
      `${process.env.SAGE_API_BASE_URL ?? "https://api.accounting.sage.com"}/v3.1/business`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    if (businessResp.ok) {
      const biz: any = await businessResp.json();
      sageBusinessId = biz?.id ?? biz?.data?.id ?? null;
    }
  } catch (err: any) {
    console.warn("[SageOAuth] Could not fetch business info:", err.message);
  }

  if (!sageBusinessId || !access_token || !refresh_token) {
    console.error("[SageOAuth] Sage did not return a business ID or complete token pair");
    return res.redirect(`/?sage_error=${encodeURIComponent("Sage returned incomplete connection data")}`);
  }

  const now = new Date();
  const tokenExpiresAt = new Date(
    now.getTime() + (Number(expires_in) || 3600) * 1000,
  );

  try {
    await db
      .insert(sageConnections)
      .values({
        companyId,
        sageBusinessId,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
        connectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sageConnections.companyId,
        set: {
          sageBusinessId,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt,
          connectedAt: now,
          updatedAt: now,
        },
      });
  } catch (err) {
    console.error("[SageOAuth] Failed to save connection:", err);
    return res.redirect(`/?sage_error=${encodeURIComponent("Failed to save connection")}`);
  }

  console.log(`[SageOAuth] Company ${companyId} connected to Sage business ${sageBusinessId}`);

  // Redirect back to the integrations page with a success flag
  res.redirect(`/settings/integrations?sage_connected=1`);
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/sage/oauth/status
//  Returns the Sage connection status for the authenticated company.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status", async (req: Request, res: Response) => {
  const companyId = parseInt(req.query.companyId as string ?? "");

  if (!companyId || isNaN(companyId)) {
    return res.status(400).json({ error: "Missing companyId" });
  }

  try {
    const [connection] = await db
      .select({
        sageBusinessId: sageConnections.sageBusinessId,
        connectedAt: sageConnections.connectedAt,
        tokenExpiresAt: sageConnections.tokenExpiresAt,
      })
      .from(sageConnections)
      .where(eq(sageConnections.companyId, companyId))
      .limit(1);

    if (!connection) return res.json({ connected: false });

    return res.json({
      connected: true,
      sageBusinessId: connection.sageBusinessId,
      connectedAt: connection.connectedAt,
      tokenExpired: connection.tokenExpiresAt < new Date(),
    });
  } catch (err) {
    console.error("[SageOAuth] Failed to read connection status:", err);
    return res.status(500).json({ error: "Failed to read Sage connection status" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/sage/oauth/disconnect
//  Removes the Sage connection for the given company.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/disconnect", async (req: Request, res: Response) => {
  const companyId = parseInt(req.body.companyId ?? req.query.companyId ?? "");

  if (!companyId || isNaN(companyId)) {
    return res.status(400).json({ error: "Missing companyId" });
  }

  try {
    await db
      .delete(sageConnections)
      .where(eq(sageConnections.companyId, companyId));
  } catch (err) {
    console.error("[SageOAuth] Failed to remove connection:", err);
    return res.status(500).json({ error: "Failed to remove Sage connection" });
  }

  console.log(`[SageOAuth] Company ${companyId} disconnected from Sage`);
  return res.json({ success: true, message: "Sage connection removed" });
});

export default router;
