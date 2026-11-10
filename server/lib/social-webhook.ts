import { Router, type Request, type Response } from "express";
import { guardMiddleware } from "./guard-middleware.js";
import {
  parseInstagramCommentWebhook,
  parseMetaFeedWebhook,
  parseMetaLeadNotification,
  parseTikTokLeadEvent,
  verifyMetaSignature,
  verifyTikTokSignature,
} from "./social-inbound.js";
import { findVerifiedConnections, findDeliveryTargets, ingestParsed, logWebhookEvent } from "./social-ingest.js";

/**
 * Inbound platform deliveries. Both platforms retry hard, so the response is sent
 * before any work happens; what protects the pipeline is not the timing but the
 * app secret, which is checked before a single row is written.
 *
 * Every delivery that names a linked account leaves a row in
 * social_webhook_events - including the ones thrown out for a bad signature - so
 * "the leads never arrive" has an answer instead of a guess.
 */

const router = Router();

function header(req: Request, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function entryIds(payload: any): Array<string | null> {
  return (Array.isArray(payload?.entry) ? payload.entry : []).map((entry: any) =>
    entry?.id ? String(entry.id) : null,
  );
}

/**
 * Meta calls this back once, when the subscription is saved: it asks us to echo
 * hub.challenge, but only if the verify token matches one of the connections on
 * file. Answering for an unknown token would let anyone confirm a callback URL.
 */
router.get(
  "/meta",
  guardMiddleware("socialVerify", async (req: Request, res: Response) => {
    const mode = String(req.query["hub.mode"] ?? "");
    const token = String(req.query["hub.verify_token"] ?? "");
    const challenge = String(req.query["hub.challenge"] ?? "");

    if (mode !== "subscribe" || !token) return res.status(400).send("Unsupported verification request");

    const verified = await findVerifiedConnections(token);
    if (!verified.length) {
      console.warn("[Social] Verification for an unknown webhook token");
      return res.status(403).send("Unknown verify token");
    }

    res.status(200).send(challenge);
    // The handshake is the step people get wrong - a connection saved after Meta
    // has already retried the check - so it belongs in the delivery log too.
    for (const connection of verified) {
      await logWebhookEvent({
        connection,
        signed: true,
        reason: "Confirmed the callback URL with the verify token",
      });
    }
  }),
);

router.post(
  "/meta",
  guardMiddleware("socialMeta", async (req: Request, res: Response) => {
    res.status(200).json({ received: true });

    const payload = req.body ?? {};
    const signature =
      header(req, "x-hub-signature-256") || header(req, "x-hub-signature");
    const accounts = entryIds(payload);

    const platforms = String(payload?.object ?? "page") === "instagram" ? ["instagram"] : ["facebook"];
    const targets = await findDeliveryTargets(
      accounts,
      platforms,
      (appSecret) => verifyMetaSignature(req.rawBody, signature, appSecret, payload),
    );

    if (!targets.length) {
      // Either a page nobody linked or a payload that is not signed by its app.
      console.warn(
        `[Social] Dropped a ${platforms[0]} delivery for ${accounts.join(", ") || "no account"}: no connection matches`,
      );
      return;
    }

    const notification = parseMetaLeadNotification(payload);
    // An Instagram form is delivered under the same leadgen change, so the object in
    // the envelope decides which platform a captured enquiry is credited to.
    const leads =
      platforms[0] === "instagram"
        ? notification.leads.map((lead) => ({ ...lead, platform: "instagram" as const }))
        : notification.leads;
    const comments =
      platforms[0] === "instagram"
        ? parseInstagramCommentWebhook(payload)
        : parseMetaFeedWebhook(payload);

    for (const target of targets) {
      if (!target.signed) {
        await logWebhookEvent({
          connection: target.connection,
          signed: false,
          leadsSeen: leads.length,
          commentsSeen: comments.length,
          reason: "Dropped: the signature does not match this account's app secret",
        });
        console.warn(
          `[Social] Dropped a ${platforms[0]} delivery for ${target.connection.externalAccountId}: signature did not match`,
        );
        continue;
      }
      if (!leads.length && !comments.length) {
        await logWebhookEvent({
          connection: target.connection,
          signed: true,
          reason: "Nothing in this delivery was a lead form or a comment",
        });
        continue;
      }

      const result = await ingestParsed(target.connection, { leads, comments });
      await logWebhookEvent({
        connection: target.connection,
        signed: true,
        leadsSeen: leads.length,
        commentsSeen: comments.length,
        leadsStored: result.leads,
        commentsStored: result.comments,
      });
      if (result.leads || result.comments) {
        console.log(
          `[Social] Stored ${result.leads} lead(s) and ${result.comments} comment(s) for company ${target.connection.companyId}`,
        );
      }
    }
  }),
);

/**
 * TikTok lead ads. The notification is signed over timestamp + nonce + body and is
 * rejected outside the platform's freshness window, so a captured payload cannot be
 * replayed later to invent leads.
 */
router.post(
  "/tiktok",
  guardMiddleware("socialTikTok", async (req: Request, res: Response) => {
    res.status(200).json({ received: true });

    const leads = parseTikTokLeadEvent(req.body ?? {});
    if (!leads.length) return;

    const targets = await findDeliveryTargets(
      leads.map((lead) => lead.externalAccountId),
      ["tiktok"],
      (appSecret) =>
        verifyTikTokSignature(
          req.rawBody,
          header(req, "x-signature"),
          header(req, "x-timestamp"),
          header(req, "x-nonce"),
          appSecret,
          req.body,
        ),
    );

    if (!targets.length) {
      console.warn("[Social] Dropped a TikTok delivery for an advertiser nobody linked");
      return;
    }

    for (const target of targets) {
      if (!target.signed) {
        // A stale client secret or a replay past the freshness window both land here.
        await logWebhookEvent({
          connection: target.connection,
          signed: false,
          leadsSeen: leads.length,
          reason: "Dropped: the signature or its timestamp does not match this account's client secret",
        });
        console.warn(
          `[Social] Dropped a TikTok delivery for ${target.connection.externalAccountId}: no signature match`,
        );
        continue;
      }

      const result = await ingestParsed(target.connection, { leads });
      await logWebhookEvent({
        connection: target.connection,
        signed: true,
        leadsSeen: leads.length,
        leadsStored: result.leads,
      });
      if (result.leads) {
        console.log(`[Social] Stored ${result.leads} TikTok lead(s) for company ${target.connection.companyId}`);
      }
    }
  }),
);

export default router;
