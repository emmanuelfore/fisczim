import { applyMetaLeadFields, type NormalisedLead } from "./social-inbound.js";

/**
 * Outbound calls to the platforms. Kept apart from social-inbound.ts so the pure
 * parsing stays testable without stubbing the network.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Lead fields worth keeping; a form's questions are free text, so everything else stays in field_data. */
const META_LEAD_FIELDS = "id,created_time,ad_id,form_id,form_name,campaign_name,full_name,email,phone_number,field_data";

function clean(value: string): string {
  return encodeURIComponent(value);
}

async function graphJson(url: string): Promise<any> {
  const response = await fetch(url);
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON body, handled below */
  }
  if (!response.ok || parsed?.error) {
    const message =
      parsed?.error?.message ||
      parsed?.error?.error_message ||
      `Graph API responded HTTP ${response.status}`;
    const error: Error & { graphCode?: number } = new Error(message);
    error.graphCode = parsed?.error?.code;
    throw error;
  }
  return parsed;
}

/**
 * Proves a pasted token before it is saved, and returns the page name so the
 * connection row is labelled by something a person recognises.
 */
export async function fetchMetaPage(accessToken: string, pageId: string): Promise<{ name: string | null }> {
  const json = await graphJson(
    `${GRAPH_BASE}/${clean(pageId)}?fields=name&access_token=${clean(accessToken)}`,
  );
  return { name: json?.name ? String(json.name) : null };
}

/** The forms a Page is running; a sync pulls leads from each of them. */
export async function fetchMetaLeadForms(
  accessToken: string,
  pageId: string,
): Promise<Array<{ id: string; name: string | null }>> {
  const params = new URLSearchParams({ fields: "id,name", limit: "50", access_token: accessToken });
  const json = await graphJson(`${GRAPH_BASE}/${clean(pageId)}/leadgen_forms?${params.toString()}`);
  const rows: Array<any> = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((form: any) => ({
      id: String(form?.id ?? ""),
      name: form?.name ? String(form.name) : null,
    }))
    .filter((form) => form.id);
}

function placeholderLead(externalLeadId: string, formId: string | null): NormalisedLead {
  return {
    platform: "facebook",
    externalLeadId,
    externalAccountId: null,
    formId,
    formName: null,
    adId: null,
    campaignName: null,
    fullName: null,
    phone: null,
    email: null,
    answers: null,
    createdOnPlatformAt: null,
  };
}

/** One lead by id, already flattened onto the columns we keep. */
export async function fetchMetaLead(accessToken: string, leadId: string): Promise<NormalisedLead> {
  const json = await graphJson(
    `${GRAPH_BASE}/${clean(leadId)}?fields=${clean(META_LEAD_FIELDS)}&access_token=${clean(accessToken)}`,
  );
  return applyMetaLeadFields(placeholderLead(String(json?.id ?? leadId), null), json);
}

/**
 * Backfill for a form: notifications can be lost while an app is still in
 * development mode, and this is the only way to pick them up afterwards.
 * `since` is a unix second, matching what the API filters on.
 */
export async function fetchMetaFormLeads(
  accessToken: string,
  formId: string,
  options: { since?: number; limit?: number } = {},
): Promise<NormalisedLead[]> {
  const params = new URLSearchParams({
    fields: META_LEAD_FIELDS,
    limit: String(options.limit ?? 100),
    access_token: accessToken,
  });
  if (options.since) params.set("since", String(options.since));

  const json = await graphJson(`${GRAPH_BASE}/${clean(formId)}/leadgen?${params.toString()}`);
  const rows: Array<any> = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((lead: any) =>
      applyMetaLeadFields(
        {
          platform: "facebook",
          externalLeadId: String(lead?.id ?? ""),
          externalAccountId: null,
          formId,
          formName: null,
          adId: null,
          campaignName: null,
          fullName: null,
          phone: null,
          email: null,
          answers: null,
          createdOnPlatformAt: null,
        },
        lead,
      ),
    )
    .filter((lead) => lead.externalLeadId);
}

/** Comments left on a page's posts, for the same backfill on the comment queue. */
export async function fetchMetaPageComments(
  accessToken: string,
  pageId: string,
): Promise<Array<{ postId: string; commentId: string; fromName: string | null; message: string | null; permalink: string | null; createdAt: Date | null }>> {
  const params = new URLSearchParams({
    fields: "id,permalink,created_time,comments.limit(25).fields(id,message,from,created_time)",
    limit: "25",
    access_token: accessToken,
  });
  const json = await graphJson(`${GRAPH_BASE}/${clean(pageId)}/posts?${params.toString()}`);
  const rows: Array<any> = [];
  for (const post of Array.isArray(json?.data) ? json.data : []) {
    for (const comment of Array.isArray(post?.comments?.data) ? post.comments.data : []) {
      if (!comment?.id || !post?.id) continue;
      rows.push({
        postId: String(post.id),
        commentId: String(comment.id),
        fromName: comment?.from?.name ? String(comment.from.name) : null,
        message: comment?.message ? String(comment.message) : null,
        permalink: post?.permalink ? String(post.permalink) : null,
        createdAt: comment?.created_time ? new Date(String(comment.created_time)) : null,
      });
    }
  }
  return rows;
}
