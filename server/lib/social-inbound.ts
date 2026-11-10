import crypto from "crypto";

/**
 * Pure inbound-payload handling for the social webhooks: no database, no Express.
 * Both platforms retry deliveries aggressively and both sign with a shared app
 * secret, so the two things worth testing in isolation are the signature check and
 * the translation from a platform's own shape into one normalised record.
 */

export type NormalisedLead = {
  platform: "facebook" | "instagram" | "tiktok";
  externalLeadId: string;
  externalAccountId: string | null;
  formId: string | null;
  formName: string | null;
  adId: string | null;
  campaignName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  answers: Record<string, string> | null;
  createdOnPlatformAt: Date | null;
};

export type NormalisedComment = {
  platform: "facebook" | "instagram" | "tiktok";
  externalAccountId: string | null;
  postId: string;
  externalCommentId: string;
  parentCommentId: string | null;
  fromName: string | null;
  fromExternalId: string | null;
  message: string | null;
  postPermalink: string | null;
  likes: number;
  createdOnPlatformAt: Date | null;
};

function text(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // Meta sends epoch seconds, TikTok milliseconds, the import path ISO strings.
  const raw = Number(value);
  const millis = Number.isFinite(raw)
    ? raw < 1e12
      ? raw * 1000
      : raw
    : Date.parse(String(value));
  return Number.isFinite(millis) ? new Date(millis) : null;
}

/** Length-checked constant-time compare, so a secret is never compared with ===. */
export function safeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function rawBodyString(rawBody: unknown, fallback: unknown): string {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString("utf8");
  if (typeof rawBody === "string") return rawBody;
  return JSON.stringify(fallback ?? {});
}

/**
 * Meta signs with `X-Hub-Signature`, prefixed `sha1=` or `sha256=` depending on how
 * the subscription was created, so both prefixes are honoured rather than assumed.
 */
export function verifyMetaSignature(
  rawBody: unknown,
  signatureHeader: string | undefined,
  appSecret: string,
  body: unknown,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [algorithm, digest] = signatureHeader.split("=");
  if (!digest) return false;
  const algorithmName = algorithm === "sha256" ? "sha256" : "sha1";
  const expected = crypto
    .createHmac(algorithmName, appSecret)
    .update(rawBodyString(rawBody, body), "utf8")
    .digest("hex");
  return safeCompare(expected, digest.trim());
}

/**
 * TikTok signs `timestamp + nonce + body` with the app secret and expects the
 * receiver to reject anything outside a short freshness window, which is what stops
 * a captured payload being replayed later.
 */
export function verifyTikTokSignature(
  rawBody: unknown,
  signatureHeader: string | undefined,
  timestamp: string | undefined,
  nonce: string | undefined,
  appSecret: string,
  body: unknown,
  nowMs: number = Date.now(),
): boolean {
  if (!signatureHeader || !timestamp || !nonce || !appSecret) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  const seconds = sent < 1e12 ? sent : sent / 1000;
  if (Math.abs(nowMs / 1000 - seconds) > 300) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(`${timestamp}${nonce}${rawBodyString(rawBody, body)}`, "utf8")
    .digest("hex");
  return safeCompare(expected, signatureHeader.trim());
}

/**
 * The lead notification carries only ids; field_data is present on some versions of
 * the payload and absent on most, so ingestion fills the gaps from the Graph API
 * before storing the row. This parses what the notification does give.
 */
export function parseMetaLeadNotification(
  payload: any,
): { pageId: string | null; leads: NormalisedLead[] } {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const leads: NormalisedLead[] = [];
  let pageId: string | null = null;

  for (const entry of entries) {
    const entryPage = text(entry?.id);
    if (entryPage) pageId = entryPage;
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "leadgen") continue;
      const value = change.value ?? {};
      const externalLeadId = text(value.leadgen_id ?? value.lead_id);
      if (!externalLeadId) continue;
      leads.push({
        platform: "facebook",
        externalLeadId,
        externalAccountId: text(value.page_id) ?? entryPage,
        formId: text(value.form_id),
        formName: null,
        adId: text(value.ad_id),
        campaignName: null,
        fullName: null,
        phone: null,
        email: null,
        answers: null,
        createdOnPlatformAt: asDate(value.created_time ?? entry?.time),
      });
    }
  }

  return { pageId, leads };
}

/** Meta's page feed webhook: comments and reactions on posts and on photos. */
export function parseMetaFeedWebhook(payload: any): NormalisedComment[] {
  const comments: NormalisedComment[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    const pageId = text(entry?.id);
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "feed") continue;
      const value = change.value ?? {};
      if (value.item && value.item !== "comment") continue;
      const externalCommentId = text(value.comment_id ?? value.post_id);
      const postId = text(value.post_id);
      if (!externalCommentId || !postId) continue;
      comments.push({
        platform: "facebook",
        externalAccountId: pageId,
        postId,
        externalCommentId,
        parentCommentId:
          value.comment_id && value.post_id ? text(value.parent_id ?? value.post_id) : null,
        fromName: text(value.from?.name ?? value.from),
        fromExternalId: text(value.from?.id),
        message: text(value.text ?? value.message),
        postPermalink: text(value.permalink_url ?? value.post?.permalink),
        likes: Number(value.like_count ?? 0) || 0,
        createdOnPlatformAt: asDate(value.created_time),
      });
    }
  }
  return comments;
}

/** Instagram arrives on its own object with a different change name and field set. */
export function parseInstagramCommentWebhook(payload: any): NormalisedComment[] {
  const comments: NormalisedComment[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    const igUserId = text(entry?.id);
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "comments" && change?.field !== "live_comments") continue;
      const value = change.value ?? {};
      const externalCommentId = text(value.id);
      if (!externalCommentId) continue;
      comments.push({
        platform: "instagram",
        externalAccountId: igUserId,
        postId: text(value.media_id) ?? externalCommentId,
        externalCommentId,
        parentCommentId: text(value.parent_id),
        fromName: text(value.username),
        fromExternalId: text(value.from?.id ?? value.user_id),
        message: text(value.text),
        postPermalink: text(value.permalink),
        likes: Number(value.like_count ?? 0) || 0,
        createdOnPlatformAt: asDate(value.timestamp),
      });
    }
  }
  return comments;
}

/** Graph API answer set for one lead, flattened onto the columns we keep. */
export function applyMetaLeadFields(
  lead: NormalisedLead,
  detail: any,
): NormalisedLead {
  const fieldData = Array.isArray(detail?.field_data) ? detail.field_data : [];
  const answers: Record<string, string> = {};
  let fullName: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;

  for (const field of fieldData) {
    const name = text(field?.name)?.toLowerCase();
    const value = text(field?.answer ?? field?.values?.[0]);
    if (!name || !value) continue;
    answers[name] = value;
    if (!fullName && (name === "full_name" || name === "name")) fullName = value;
    if (!phone && (name === "phone_number" || name === "phone")) phone = value;
    if (!email && (name === "email" || name === "work_email")) email = value;
  }

  const fallbackName = text(detail?.leadgen?.full_name) ?? text(detail?.user_name);
  return {
    ...lead,
    formId: text(detail?.form_id) ?? lead.formId,
    formName: text(detail?.form_name ?? detail?.leadgen?.form_name) ?? lead.formName,
    adId: text(detail?.ad_id) ?? lead.adId,
    campaignName:
      text(detail?.campaign_name ?? detail?.leadgen?.campaign_name) ?? lead.campaignName,
    fullName: fullName ?? fallbackName,
    phone: phone ?? text(detail?.leadgen?.phone_number),
    email: email ?? text(detail?.email),
    answers: Object.keys(answers).length ? answers : null,
    createdOnPlatformAt: asDate(detail?.created_time) ?? lead.createdOnPlatformAt,
  };
}

/**
 * TikTok lead events send the advertiser's id plus either the answers inline or only
 * the lead id, depending on the app's review level. Unknown keys are kept as answers
 * rather than dropped, because the questions are whatever the customer wrote.
 */
export function parseTikTokLeadEvent(payload: any): NormalisedLead[] {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [payload];
  const leads: NormalisedLead[] = [];

  for (const message of messages) {
    const data = message?.data ?? message ?? {};
    const externalLeadId = text(data.id ?? data.lead_id);
    if (!externalLeadId) continue;

    const rawAnswers = Array.isArray(data.user_info)
      ? data.user_info
      : Array.isArray(data.answers)
        ? data.answers
        : Array.isArray(data.field_data)
          ? data.field_data
          : [];
    const answers: Record<string, string> = {};
    for (const field of rawAnswers) {
      const name = text(field?.question_name ?? field?.name ?? field?.field_name)?.toLowerCase();
      const value = text(field?.answer ?? field?.value);
      if (name && value) answers[name] = value;
    }

    const answerValues = Object.values(answers);
    leads.push({
      platform: "tiktok",
      externalLeadId,
      externalAccountId: text(data.advertiser_id ?? message?.advertiser_id),
      formId: text(data.form_id ?? data.internal_form_id),
      formName: text(data.form_name ?? data.internal_form_name),
      adId: text(data.ad_id),
      campaignName: text(data.campaign_name ?? data.internal_campaign_name),
      fullName:
        text(data.full_name ?? data.name) ??
        answerValues.find((v) => /\s/.test(String(v))) ??
        answerValues[0] ??
        null,
      phone:
        text(data.phone_number ?? data.phone) ??
        answerValues.find((v) => /^[+0-9 ().-]{6,}$/.test(String(v))) ??
        null,
      email:
        text(data.email) ??
        answerValues.find((v) => /@/.test(String(v))) ??
        null,
      answers: Object.keys(answers).length ? answers : null,
      createdOnPlatformAt: asDate(data.create_time ?? data.creation_time ?? data.created_at),
    });
  }

  return leads;
}

/** Names used by the UI and by the enquiry source rule; also guards the connect route. */
export const SOCIAL_PLATFORM_VALUES = ["facebook", "instagram", "tiktok"] as const;

export function isSocialPlatform(value: unknown): value is NormalisedLead["platform"] {
  return (SOCIAL_PLATFORM_VALUES as readonly string[]).includes(String(value));
}

/** Narrow enough that a parsed payload and a stored row both satisfy it. */
type ChatterSource = {
  platform: string;
  postPermalink?: string | null;
  formName?: string | null;
  campaignName?: string | null;
  externalCommentId?: string;
};

export function socialChatterText(record: ChatterSource): string {
  if ("externalCommentId" in record) {
    const where = record.postPermalink ? ` ${record.postPermalink}` : "";
    return `Captured from a ${record.platform} comment.${where}`;
  }
  const campaign = record.campaignName || record.formName;
  return campaign
    ? `Captured from a ${record.platform} lead form (${campaign}).`
    : `Captured from a ${record.platform} lead form.`;
}
