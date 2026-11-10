import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db.js";
import {
  socialComments,
  socialConnections,
  socialLeads,
  socialWebhookEvents,
  type SocialComment,
  type SocialConnection,
  type SocialLead,
  type SocialWebhookEvent,
} from "../../shared/schema.js";
import { decryptField, encryptField } from "./vault.js";
import { captureLead, type LeadCaptureResult } from "./lead-capture.js";
import {
  fetchMetaLead,
  fetchMetaLeadForms,
  fetchMetaFormLeads,
  fetchMetaPage,
  fetchMetaPageComments,
} from "./social-graph.js";
import {
  safeCompare,
  socialChatterText,
  type NormalisedComment,
  type NormalisedLead,
} from "./social-inbound.js";

/**
 * Everything that moves a platform submission into (or out of) the CRM: webhook
 * processing, the inbox, capture, discard and the manual sync share these calls so
 * the rules cannot drift apart.
 */

export type InboxKind = "lead" | "comment";
export type InboxRef = { kind: InboxKind; id: number };

const SYNC_LOOKBACK_DAYS = 30;

/** Vault-decrypted, and null instead of throwing when COMPANY_VAULT_KEY is absent. */
function secret(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptField(stored);
  } catch (err: any) {
    console.warn(`[Social] A stored secret could not be decrypted: ${err.message}`);
    return null;
  }
}

export function encryptSecret(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? encryptField(trimmed) : null;
}

/** Never handed to a client: the API only says whether a secret is on file. */
export function connectionView(connection: SocialConnection) {
  return {
    id: connection.id,
    platform: connection.platform,
    externalAccountId: connection.externalAccountId,
    accountName: connection.accountName,
    appId: connection.appId,
    hasAccessToken: Boolean(connection.accessToken),
    hasAppSecret: Boolean(connection.appSecret),
    hasWebhookToken: Boolean(connection.webhookToken),
    tokenExpiresAt: connection.tokenExpiresAt,
    lastSyncAt: connection.lastSyncAt,
    lastError: connection.lastError,
    active: connection.active,
    createdAt: connection.createdAt,
  };
}

/** Connections that claim one of the accounts a delivery names. */
export async function findCandidateConnections(
  accountIds: Array<string | null>,
  platforms: string[],
): Promise<SocialConnection[]> {
  const ids = accountIds.filter((id): id is string => Boolean(id));
  if (!ids.length) return [];
  return db
    .select()
    .from(socialConnections)
    .where(
      and(
        inArray(socialConnections.externalAccountId, ids),
        inArray(socialConnections.platform, platforms),
        eq(socialConnections.active, true),
      ),
    );
}

/**
 * A delivery is signed with the app secret of the app that owns the account, so the
 * signature decides the tenant: a page linked by two companies only routes to the
 * one whose secret signed this payload. No secret on file means no verification, and
 * an unverified payload is never ingested.
 *
 * The connections that claimed the account but failed to verify come back tagged
 * `signed: false` rather than being dropped, because "your app secret does not match
 * this page" is the one thing a customer has to be shown, not left in a log file.
 */
export async function findDeliveryTargets(
  accountIds: Array<string | null>,
  platforms: string[],
  verify: (appSecret: string) => boolean,
): Promise<Array<{ connection: SocialConnection; signed: boolean }>> {
  const candidates = await findCandidateConnections(accountIds, platforms);
  return candidates.map((connection) => {
    const appSecret = secret(connection.appSecret);
    return { connection, signed: appSecret ? verify(appSecret) : false };
  });
}

/**
 * One row per delivery per connection it was routed to. The webhook has already
 * answered by the time this runs, so a failed insert must never cost a lead: the
 * log writes what it can and reports what it could not.
 */
export async function logWebhookEvent(entry: {
  connection: SocialConnection;
  signed: boolean;
  leadsSeen?: number;
  commentsSeen?: number;
  leadsStored?: number;
  commentsStored?: number;
  reason?: string | null;
}): Promise<void> {
  const seen = (entry.leadsSeen ?? 0) + (entry.commentsSeen ?? 0);
  const stored = (entry.leadsStored ?? 0) + (entry.commentsStored ?? 0);
  const reason = entry.reason ?? (stored ? null : entry.signed && seen ? "Already in the inbox" : null);
  try {
    await db.insert(socialWebhookEvents).values({
      companyId: entry.connection.companyId,
      connectionId: entry.connection.id,
      platform: entry.connection.platform,
      externalAccountId: entry.connection.externalAccountId,
      signed: entry.signed,
      leadsSeen: entry.leadsSeen ?? 0,
      commentsSeen: entry.commentsSeen ?? 0,
      leadsStored: entry.leadsStored ?? 0,
      commentsStored: entry.commentsStored ?? 0,
      reason: reason ? reason.slice(0, 900) : null,
    });
  } catch (err: any) {
    console.warn(`[Social] Could not record a webhook delivery: ${err.message}`);
  }
}

export async function loadDeliveries(companyId: number, limit: number): Promise<SocialWebhookEvent[]> {
  return db
    .select()
    .from(socialWebhookEvents)
    .where(eq(socialWebhookEvents.companyId, companyId))
    .orderBy(desc(socialWebhookEvents.receivedAt), desc(socialWebhookEvents.id))
    .limit(limit);
}

/**
 * Meta's one-time subscription check echoes the verify token we chose, and that
 * token is stored vaulted - so no SQL equality against the plaintext can ever match
 * it and the comparison has to happen after decryption. This runs when a developer
 * saves a webhook, not on every delivery, so scanning the connections that have one
 * costs less than keeping the token in a searchable, dump-readable column.
 *
 * It answers with the connections that share the token rather than a boolean, so a
 * successful handshake can be recorded against the tenant that asked for it.
 */
export async function findVerifiedConnections(token: string): Promise<SocialConnection[]> {
  if (!token) return [];
  const rows = await db
    .select()
    .from(socialConnections)
    .where(and(eq(socialConnections.active, true), isNotNull(socialConnections.webhookToken)));
  return rows.filter((row) => {
    const stored = secret(row.webhookToken);
    return stored !== null && safeCompare(stored, token);
  });
}

async function markError(connectionId: number, message: string): Promise<void> {
  await db
    .update(socialConnections)
    .set({ lastError: message.slice(0, 900), updatedAt: new Date() })
    .where(eq(socialConnections.id, connectionId));
}

async function markSynced(connectionId: number): Promise<void> {
  await db
    .update(socialConnections)
    .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(socialConnections.id, connectionId));
}

/** Idempotent on (company, platform, platform id): returns null when already stored. */
export async function storeLead(
  companyId: number,
  lead: NormalisedLead,
  fallbackAccountId: string | null,
): Promise<SocialLead | null> {
  const [row] = await db
    .insert(socialLeads)
    .values({
      companyId,
      platform: lead.platform,
      externalAccountId: lead.externalAccountId ?? fallbackAccountId,
      externalLeadId: lead.externalLeadId,
      formId: lead.formId,
      formName: lead.formName,
      adId: lead.adId,
      campaignName: lead.campaignName,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      answers: lead.answers,
      createdOnPlatformAt: lead.createdOnPlatformAt,
    })
    .onConflictDoNothing({
      target: [socialLeads.companyId, socialLeads.platform, socialLeads.externalLeadId],
    })
    .returning();
  return row ?? null;
}

export async function storeComment(
  companyId: number,
  comment: NormalisedComment,
  fallbackAccountId: string | null,
): Promise<SocialComment | null> {
  const [row] = await db
    .insert(socialComments)
    .values({
      companyId,
      platform: comment.platform,
      externalAccountId: comment.externalAccountId ?? fallbackAccountId,
      postId: comment.postId,
      postPermalink: comment.postPermalink,
      externalCommentId: comment.externalCommentId,
      parentCommentId: comment.parentCommentId,
      fromName: comment.fromName,
      fromExternalId: comment.fromExternalId,
      message: comment.message,
      likes: comment.likes,
      createdOnPlatformAt: comment.createdOnPlatformAt,
    })
    .onConflictDoNothing({
      target: [socialComments.companyId, socialComments.platform, socialComments.externalCommentId],
    })
    .returning();
  return row ?? null;
}

/**
 * A lead notification usually carries ids only, so the answers come from the Graph
 * API. If that call fails - an expired token, a permission not approved yet - the
 * submission is still stored with whatever the notification gave, because losing
 * the lead is worse than losing the phone number.
 */
async function fillLeadFromGraph(
  connection: SocialConnection,
  lead: NormalisedLead,
): Promise<NormalisedLead> {
  const accessToken = secret(connection.accessToken);
  if (!accessToken || lead.fullName || lead.phone || lead.email) return lead;
  try {
    return await fetchMetaLead(accessToken, lead.externalLeadId);
  } catch (err: any) {
    await markError(
      connection.id,
      `Stored lead ${lead.externalLeadId} without its answers: ${err.message}`,
    );
    return lead;
  }
}

/** Store one parsed delivery for one tenant. Counts only genuinely new rows. */
export async function ingestParsed(
  connection: SocialConnection,
  parsed: { leads?: NormalisedLead[]; comments?: NormalisedComment[] },
): Promise<{ leads: number; comments: number }> {
  let leads = 0;
  let comments = 0;

  for (const lead of parsed.leads ?? []) {
    const filled =
      lead.platform === "facebook" ? await fillLeadFromGraph(connection, lead) : lead;
    if (await storeLead(connection.companyId, filled, connection.externalAccountId)) leads += 1;
  }
  for (const comment of parsed.comments ?? []) {
    if (await storeComment(connection.companyId, comment, connection.externalAccountId)) {
      comments += 1;
    }
  }

  if (leads || comments) await markSynced(connection.id);
  return { leads, comments };
}

/**
 * A lead stored from a notification only - the Graph call failed at delivery time -
 * looks like junk until its answers are fetched again. This retries that one call
 * for one stored lead, once the token or permission has been fixed.
 */
export async function refetchLead(
  companyId: number,
  leadId: number,
): Promise<{ ok: true; lead: SocialLead } | { ok: false; status: number; error: string }> {
  const [row] = await db
    .select()
    .from(socialLeads)
    .where(and(eq(socialLeads.id, leadId), eq(socialLeads.companyId, companyId)));
  if (!row) return { ok: false, status: 404, error: "Lead not found" };
  if (row.platform !== "facebook") {
    return { ok: false, status: 400, error: "Only Facebook leads can be re-fetched from the Graph API" };
  }
  const [connection] = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.companyId, companyId),
        eq(socialConnections.platform, row.platform),
        eq(socialConnections.externalAccountId, row.externalAccountId ?? ""),
      ),
    )
    .limit(1);
  if (!connection) return { ok: false, status: 400, error: "Connect the page this lead came from first" };
  const accessToken = secret(connection.accessToken);
  if (!accessToken) return { ok: false, status: 400, error: "That connection has no page token to fetch with" };

  let fetched: NormalisedLead;
  try {
    fetched = await fetchMetaLead(accessToken, row.externalLeadId);
  } catch (err: any) {
    await markError(connection.id, `Re-fetching lead ${row.externalLeadId} failed: ${err.message}`);
    return { ok: false, status: 502, error: `The platform refused the fetch: ${err.message}` };
  }
  const [updated] = await db
    .update(socialLeads)
    .set({
      fullName: fetched.fullName ?? row.fullName,
      phone: fetched.phone ?? row.phone,
      email: fetched.email ?? row.email,
      answers: fetched.answers ?? row.answers,
      formName: fetched.formName ?? row.formName,
      adId: fetched.adId ?? row.adId,
      campaignName: fetched.campaignName ?? row.campaignName,
      createdOnPlatformAt: fetched.createdOnPlatformAt ?? row.createdOnPlatformAt,
    })
    .where(eq(socialLeads.id, row.id))
    .returning();
  // A successful fetch proves the token works again, so the old error goes.
  await markSynced(connection.id);
  return { ok: true, lead: updated };
}

export async function loadInbox(companyId: number, limit: number) {
  const [leads, comments] = await Promise.all([
    db
      .select()
      .from(socialLeads)
      .where(
        and(
          eq(socialLeads.companyId, companyId),
          isNull(socialLeads.enquiryId),
          isNull(socialLeads.ignoredAt),
        ),
      )
      .orderBy(desc(socialLeads.receivedAt))
      .limit(limit),
    db
      .select()
      .from(socialComments)
      .where(
        and(
          eq(socialComments.companyId, companyId),
          isNull(socialComments.enquiryId),
          isNull(socialComments.ignoredAt),
        ),
      )
      .orderBy(desc(socialComments.receivedAt))
      .limit(limit),
  ]);
  return { leads, comments };
}

async function loadPending(companyId: number, ref: InboxRef): Promise<SocialLead | SocialComment | null> {
  const [row] = ref.kind === "lead"
    ? await db
        .select()
        .from(socialLeads)
        .where(and(eq(socialLeads.id, ref.id), eq(socialLeads.companyId, companyId)))
        .limit(1)
    : await db
        .select()
        .from(socialComments)
        .where(and(eq(socialComments.id, ref.id), eq(socialComments.companyId, companyId)))
        .limit(1);
  return (row as SocialLead | SocialComment | undefined) ?? null;
}

function answerLines(answers: Record<string, string> | null): string {
  if (!answers) return "";
  return Object.entries(answers)
    .map(([question, answer]) => `${question}: ${answer}`)
    .join("\n");
}

/**
 * What a submission contributes to an enquiry. Both platforms hand over free-form
 * answers, so the questions travel as notes instead of being forced into columns.
 */
function captureInput(row: SocialLead | SocialComment) {
  if ("externalLeadId" in row) {
    return {
      // A form that only asks for a number still identifies a person by it.
      name: row.fullName || row.phone || row.email,
      phone: row.phone,
      email: row.email,
      interest: row.formName || row.campaignName,
      notes: answerLines(row.answers) || null,
      utmSource: row.platform,
      utmMedium: "paid_social",
      utmCampaign: row.campaignName,
      activityBody: socialChatterText(row),
      activityMetadata: {
        platform: row.platform,
        externalLeadId: row.externalLeadId,
        formId: row.formId,
        adId: row.adId,
      },
    };
  }
  return {
    name: row.fromName,
    phone: null,
    email: null,
    interest: null,
    notes: row.message,
    utmSource: row.platform,
    utmMedium: "comment",
    utmCampaign: null,
    activityBody: socialChatterText(row),
    activityMetadata: {
      platform: row.platform,
      externalCommentId: row.externalCommentId,
      postId: row.postId,
      permalink: row.postPermalink,
    },
  };
}

export async function captureFromInbox(
  companyId: number,
  ref: InboxRef,
): Promise<LeadCaptureResult & { alreadyCaptured?: boolean }> {
  const row = await loadPending(companyId, ref);
  if (!row) return { ok: false, status: 404, error: "Nothing in the queue matches that id" };
  if (row.enquiryId) {
    return {
      ok: true,
      id: row.enquiryId,
      returning: false,
      reusedExisting: false,
      alreadyCaptured: true,
    };
  }

  const input = captureInput(row);
  if (!input.name) {
    return {
      ok: false,
      status: 400,
      error: "This submission carries no name, phone or email to build an enquiry from.",
    };
  }

  const result = await captureLead({ companyId, ...input });
  if (!result.ok) return result;

  if (ref.kind === "lead") {
    await db.update(socialLeads).set({ enquiryId: result.id }).where(eq(socialLeads.id, ref.id));
  } else {
    await db.update(socialComments).set({ enquiryId: result.id }).where(eq(socialComments.id, ref.id));
  }
  return result;
}

export async function ignoreInbox(companyId: number, ref: InboxRef): Promise<boolean> {
  if (ref.kind === "lead") {
    const [updated] = await db
      .update(socialLeads)
      .set({ ignoredAt: new Date() })
      .where(
        and(
          eq(socialLeads.id, ref.id),
          eq(socialLeads.companyId, companyId),
          isNull(socialLeads.enquiryId),
        ),
      )
      .returning({ id: socialLeads.id });
    return Boolean(updated);
  }

  const [updated] = await db
    .update(socialComments)
    .set({ ignoredAt: new Date() })
    .where(
      and(
        eq(socialComments.id, ref.id),
        eq(socialComments.companyId, companyId),
        isNull(socialComments.enquiryId),
      ),
    )
    .returning({ id: socialComments.id });
  return Boolean(updated);
}

export type SyncOutcome = { leads: number; comments: number; skipped?: string };

/**
 * Pull back what the webhook did not deliver. Meta only: a TikTok notification
 * already carries its answers, and Instagram comments arrive on their own
 * subscription, so there is nothing to repair for either.
 */
export async function syncConnection(connection: SocialConnection): Promise<SyncOutcome> {
  if (connection.platform !== "facebook") {
    return { leads: 0, comments: 0, skipped: "This platform delivers through the webhook only" };
  }
  const accessToken = secret(connection.accessToken);
  if (!accessToken) {
    await markError(connection.id, "A sync needs an access token on the connection");
    return { leads: 0, comments: 0, skipped: "No access token on this connection" };
  }

  const since = Math.floor(
    (connection.lastSyncAt?.getTime() ?? Date.now() - SYNC_LOOKBACK_DAYS * 86400000) / 1000,
  );
  const failures: string[] = [];
  let leads = 0;
  let comments = 0;

  try {
    const forms = await fetchMetaLeadForms(accessToken, connection.externalAccountId);
    for (const form of forms) {
      for (const lead of await fetchMetaFormLeads(accessToken, form.id, { since })) {
        if (await storeLead(connection.companyId, lead, connection.externalAccountId)) leads += 1;
      }
    }
  } catch (err: any) {
    failures.push(`forms: ${err.message}`);
  }

  try {
    const remote = await fetchMetaPageComments(accessToken, connection.externalAccountId);
    for (const comment of remote) {
      const normalised: NormalisedComment = {
        platform: "facebook",
        externalAccountId: connection.externalAccountId,
        postId: comment.postId,
        externalCommentId: comment.commentId,
        parentCommentId: null,
        fromName: comment.fromName,
        fromExternalId: null,
        message: comment.message,
        postPermalink: comment.permalink,
        likes: 0,
        createdOnPlatformAt: comment.createdAt,
      };
      if (await storeComment(connection.companyId, normalised, connection.externalAccountId)) {
        comments += 1;
      }
    }
  } catch (err: any) {
    failures.push(`comments: ${err.message}`);
  }

  if (failures.length) await markError(connection.id, failures.join("; "));
  else await markSynced(connection.id);

  return { leads, comments };
}

/**
 * Prove a pasted Page token without touching the inbox: the connect dialog uses it
 * so a company learns the token is wrong now, not three days into a campaign.
 */
export async function checkMetaConnection(
  connection: SocialConnection,
): Promise<{ ok: true; accountName: string | null } | { ok: false; error: string }> {
  const accessToken = secret(connection.accessToken);
  if (!accessToken) {
    return { ok: false, error: "No access token on this connection to check" };
  }
  try {
    const page = await fetchMetaPage(accessToken, connection.externalAccountId);
    const [saved] = await db
      .update(socialConnections)
      .set({ accountName: page.name ?? connection.accountName, lastError: null, updatedAt: new Date() })
      .where(eq(socialConnections.id, connection.id))
      .returning();
    return { ok: true, accountName: saved.accountName };
  } catch (err: any) {
    await markError(connection.id, err.message);
    return { ok: false, error: err.message };
  }
}

export async function listConnections(companyId: number): Promise<SocialConnection[]> {
  return db
    .select()
    .from(socialConnections)
    .where(eq(socialConnections.companyId, companyId))
    .orderBy(desc(socialConnections.active), socialConnections.platform);
}
