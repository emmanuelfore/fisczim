import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { socialConnections } from "../../shared/schema.js";
import type { PermissionKey } from "../../shared/permissions.js";
import { userHasPermission } from "../lib/permissions.js";
import { resolvePublicBaseUrl } from "../lib/zoho-books.js";
import { SOCIAL_PLATFORM_VALUES } from "../lib/social-inbound.js";
import {
  captureFromInbox,
  checkMetaConnection,
  connectionView,
  encryptSecret,
  ignoreInbox,
  listConnections,
  loadDeliveries,
  loadInbox,
  refetchLead,
  syncConnection,
  type InboxRef,
} from "../lib/social-ingest.js";

/**
 * The social half of the CRM: which accounts a company has linked, and the queue of
 * submissions waiting to be captured. There is no OAuth dance here - the page token
 * and the app secret are pasted, because the platforms only hand those out inside
 * their own dashboards, to someone who already controls the account.
 */

const connectSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORM_VALUES),
  externalAccountId: z.string().trim().min(1).max(64),
  accountName: z.string().trim().max(160).optional().nullable(),
  appId: z.string().trim().max(64).optional().nullable(),
  accessToken: z.string().trim().max(4096).optional().nullable(),
  appSecret: z.string().trim().max(256).optional().nullable(),
  webhookToken: z.string().trim().max(128).optional().nullable(),
});

const updateSchema = connectSchema.partial().extend({ active: z.boolean().optional() });

const refsSchema = z.object({
  refs: z
    .array(z.object({ kind: z.enum(["lead", "comment"]), id: z.number().int().positive() }))
    .min(1)
    .max(100),
});

export function createSocialRouter(
  requireAuth: any,
  requireCompanyAccess: any = (_q: any, _s: any, n: any) => n(),
) {
  const router = Router();

  async function can(req: any, companyId: number, permission: PermissionKey): Promise<boolean> {
    const userId = req.user?.id;
    if (!userId) return false;
    return userHasPermission(userId, companyId, permission, Boolean(req.user?.isSuperAdmin));
  }

  async function loadConnection(companyId: number, id: number) {
    const [row] = await db
      .select()
      .from(socialConnections)
      .where(and(eq(socialConnections.id, id), eq(socialConnections.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  router.get("/companies/:companyId/crm/social/connections", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.view"))) {
        return res.status(403).json({ error: "Social access required" });
      }
      const connections = await listConnections(companyId);
      res.json(connections.map(connectionView));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch social connections" });
    }
  });

  /** What to paste into the platform's webhook screen, plus the token it must echo. */
  router.get("/companies/:companyId/crm/social/setup", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.view"))) {
        return res.status(403).json({ error: "Social access required" });
      }
      const base = resolvePublicBaseUrl(req);
      res.json({
        metaCallbackUrl: `${base}/api/webhooks/social/meta`,
        tiktokCallbackUrl: `${base}/api/webhooks/social/tiktok`,
        // Meta wants a token of your choosing echoed back during verification; it is
        // stored on the connection so the callback can prove it was asked for.
        verifyTokenHint: "any string you keep, e.g. fs-social-<company>-<random>",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to build the setup information" });
    }
  });

  router.post("/companies/:companyId/crm/social/connections", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.manage"))) {
        return res.status(403).json({ error: "Managing social connections required" });
      }

      const data = connectSchema.parse(req.body);
      const [existing] = await db
        .select({ id: socialConnections.id })
        .from(socialConnections)
        .where(
          and(
            eq(socialConnections.companyId, companyId),
            eq(socialConnections.platform, data.platform),
            eq(socialConnections.externalAccountId, data.externalAccountId),
          ),
        )
        .limit(1);
      if (existing) {
        return res.status(409).json({ error: "That account is already connected" });
      }

      const [created] = await db
        .insert(socialConnections)
        .values({
          companyId,
          platform: data.platform,
          externalAccountId: data.externalAccountId,
          accountName: data.accountName ?? null,
          appId: data.appId ?? null,
          accessToken: encryptSecret(data.accessToken),
          appSecret: encryptSecret(data.appSecret),
          webhookToken: encryptSecret(data.webhookToken),
          connectedBy: req.user?.id ?? null,
        })
        .returning();

      res.status(201).json(connectionView(created));
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to connect that account" });
    }
  });

  router.patch("/companies/:companyId/crm/social/connections/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const id = parseInt(req.params.id);
      if (!(await can(req, companyId, "crm.social.manage"))) {
        return res.status(403).json({ error: "Managing social connections required" });
      }

      const existing = await loadConnection(companyId, id);
      if (!existing) return res.status(404).json({ error: "Unknown connection" });

      const data = updateSchema.parse(req.body ?? {});
      const [updated] = await db
        .update(socialConnections)
        .set({
          accountName: data.accountName ?? existing.accountName,
          appId: data.appId ?? existing.appId,
          externalAccountId: data.externalAccountId ?? existing.externalAccountId,
          active: data.active ?? existing.active,
          // A blank field means "leave it"; an explicit null clears a stored secret.
          accessToken:
            data.accessToken === undefined ? existing.accessToken : encryptSecret(data.accessToken),
          appSecret:
            data.appSecret === undefined ? existing.appSecret : encryptSecret(data.appSecret),
          webhookToken:
            data.webhookToken === undefined
              ? existing.webhookToken
              : encryptSecret(data.webhookToken),
          updatedAt: new Date(),
        })
        .where(eq(socialConnections.id, id))
        .returning();

      res.json(connectionView(updated));
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update that connection" });
    }
  });

  router.delete("/companies/:companyId/crm/social/connections/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const id = parseInt(req.params.id);
      if (!(await can(req, companyId, "crm.social.manage"))) {
        return res.status(403).json({ error: "Managing social connections required" });
      }
      const existing = await loadConnection(companyId, id);
      if (!existing) return res.status(404).json({ error: "Unknown connection" });

      // Submissions already stored stay: they are the company's own lead history,
      // and enquiries raised from them must keep pointing at something.
      await db.delete(socialConnections).where(eq(socialConnections.id, id));
      res.json({ deleted: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to disconnect that account" });
    }
  });

  router.post("/companies/:companyId/crm/social/connections/:id/test", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const id = parseInt(req.params.id);
      if (!(await can(req, companyId, "crm.social.manage"))) {
        return res.status(403).json({ error: "Managing social connections required" });
      }
      const existing = await loadConnection(companyId, id);
      if (!existing) return res.status(404).json({ error: "Unknown connection" });

      if (existing.platform !== "facebook") {
        return res.json({
          verified: false,
          message:
            "Only a Facebook Page token can be checked from here; Instagram and TikTok arrive through the webhook.",
        });
      }

      const result = await checkMetaConnection(existing);
      res.json(result.ok ? { verified: true, accountName: result.accountName } : { verified: false, message: result.error });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to check that connection" });
    }
  });

  router.post("/companies/:companyId/crm/social/connections/:id/sync", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const id = parseInt(req.params.id);
      if (!(await can(req, companyId, "crm.social.manage"))) {
        return res.status(403).json({ error: "Managing social connections required" });
      }
      const existing = await loadConnection(companyId, id);
      if (!existing) return res.status(404).json({ error: "Unknown connection" });

      res.json(await syncConnection(existing));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to sync that connection" });
    }
  });

  router.get("/companies/:companyId/crm/social/inbox", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.view"))) {
        return res.status(403).json({ error: "Social access required" });
      }
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50")) || 50));
      const { leads, comments } = await loadInbox(companyId, limit);
      res.json({
        leads: leads.map((lead) => ({ ...lead, kind: "lead" as const })),
        comments: comments.map((comment) => ({ ...comment, kind: "comment" as const })),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch the social inbox" });
    }
  });

  /**
   * What the platforms actually sent, newest first - including the deliveries that
   * were thrown out. A company only ever sees rows attributed to its own connections.
   */
  router.get("/companies/:companyId/crm/social/deliveries", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.view"))) {
        return res.status(403).json({ error: "Social access required" });
      }
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25")) || 25));
      res.json(await loadDeliveries(companyId, limit));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch the delivery log" });
    }
  });

  /** Retry the Graph fetch for one lead that arrived as ids only. */
  router.post("/companies/:companyId/crm/social/leads/:id/refetch", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.capture"))) {
        return res.status(403).json({ error: "Capturing social leads required" });
      }
      const result = await refetchLead(companyId, parseInt(req.params.id));
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.json(result.lead);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to re-fetch that lead" });
    }
  });

  router.post("/companies/:companyId/crm/social/capture", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.capture"))) {
        return res.status(403).json({ error: "Capturing social leads required" });
      }
      const { refs } = refsSchema.parse(req.body ?? {});
      const enquiryIds: number[] = [];
      const failures: Array<{ status: number; error: string }> = [];

      // One at a time: two submissions from the same phone number in one click must
      // not race past the returning-prospect check and raise two enquiries.
      for (const ref of refs) {
        const result = await captureFromInbox(companyId, ref);
        if (result.ok) enquiryIds.push(result.id);
        else failures.push({ status: result.status, error: result.error });
      }

      res.json({ captured: enquiryIds.length, failed: failures, enquiryIds });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to capture those submissions" });
    }
  });

  router.post("/companies/:companyId/crm/social/ignore", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.social.capture"))) {
        return res.status(403).json({ error: "Capturing social leads required" });
      }
      const { refs } = refsSchema.parse(req.body ?? {});
      const ignored = (await Promise.all(refs.map((ref: InboxRef) => ignoreInbox(companyId, ref)))).filter(
        Boolean,
      ).length;
      res.json({ ignored });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to discard those submissions" });
    }
  });

  return router;
}
