import { createHmac } from "crypto";
import { describe, expect, test } from "vitest";
import {
  applyMetaLeadFields,
  isSocialPlatform,
  parseInstagramCommentWebhook,
  parseMetaFeedWebhook,
  parseMetaLeadNotification,
  parseTikTokLeadEvent,
  socialChatterText,
  verifyMetaSignature,
  verifyTikTokSignature,
} from "../social-inbound.js";

const SECRET = "app-secret-abc";

/** Meta posts the raw bytes, so the tests sign a string and pass the same string. */
function metaSigned(body: string, secret = SECRET, algorithm = "sha256") {
  return `${algorithm}=${createHmac(algorithm, secret).update(body, "utf8").digest("hex")}`;
}

const LEADGEN_BODY = JSON.stringify({
  object: "page",
  entry: [
    {
      id: "1784",
      time: 1730000000,
      changes: [
        {
          field: "leadgen",
          value: { leadgen_id: "112233", form_id: "9911", page_id: "1784", created_time: 1730000000 },
        },
      ],
    },
  ],
});

describe("Meta webhook signature", () => {
  test("accepts both hub signature versions", () => {
    expect(verifyMetaSignature(LEADGEN_BODY, metaSigned(LEADGEN_BODY), SECRET, {})).toBe(true);
    expect(verifyMetaSignature(LEADGEN_BODY, metaSigned(LEADGEN_BODY, SECRET, "sha1"), SECRET, {})).toBe(true);
  });

  test("rejects a payload edited in flight", () => {
    const tampered = LEADGEN_BODY.replace("112233", "999999");
    expect(verifyMetaSignature(tampered, metaSigned(LEADGEN_BODY), SECRET, {})).toBe(false);
  });

  test("rejects the wrong secret, a missing header and a malformed header", () => {
    expect(verifyMetaSignature(LEADGEN_BODY, metaSigned(LEADGEN_BODY), "other-secret", {})).toBe(false);
    expect(verifyMetaSignature(LEADGEN_BODY, undefined, SECRET, {})).toBe(false);
    expect(verifyMetaSignature(LEADGEN_BODY, "deadbeef", SECRET, {})).toBe(false);
  });

  test("fails closed when no app secret is on file", () => {
    expect(verifyMetaSignature(LEADGEN_BODY, metaSigned(LEADGEN_BODY), "", {})).toBe(false);
  });

  test("verifies against the raw body even when Express already parsed it", () => {
    const parsed = JSON.parse(LEADGEN_BODY);
    expect(verifyMetaSignature(Buffer.from(LEADGEN_BODY), metaSigned(LEADGEN_BODY), SECRET, parsed)).toBe(true);
  });
});

describe("TikTok webhook signature", () => {
  const body = JSON.stringify({
    event: "tt4b_business_leadgen",
    message: { id: "4455", advertiser_id: "adv-1", create_time: 1730000000000 },
  });

  test("accepts a fresh timestamp + nonce + body envelope", () => {
    const timestamp = "1730000000";
    const nonce = "abc123";
    const signature = createHmac("sha256", SECRET)
      .update(`${timestamp}${nonce}${body}`)
      .digest("hex");
    expect(
      verifyTikTokSignature(body, signature, timestamp, nonce, SECRET, {}, 1730000010_000),
    ).toBe(true);
  });

  test("rejects a delivery replayed outside the freshness window", () => {
    const timestamp = "1730000000";
    const nonce = "abc123";
    const signature = createHmac("sha256", SECRET)
      .update(`${timestamp}${nonce}${body}`)
      .digest("hex");
    expect(
      verifyTikTokSignature(body, signature, timestamp, nonce, SECRET, {}, 1730000900_000),
    ).toBe(false);
  });

  test("rejects a missing timestamp or nonce", () => {
    expect(verifyTikTokSignature(body, "whatever", undefined, "n", SECRET, {}, 0)).toBe(false);
    expect(verifyTikTokSignature(body, "whatever", "1730000000", undefined, SECRET, {}, 0)).toBe(false);
  });
});

describe("Meta leadgen notification", () => {
  test("pulls the ids a lead row is keyed on", () => {
    const parsed = parseMetaLeadNotification(JSON.parse(LEADGEN_BODY));
    expect(parsed.pageId).toBe("1784");
    expect(parsed.leads).toHaveLength(1);
    expect(parsed.leads[0]).toMatchObject({
      platform: "facebook",
      externalLeadId: "112233",
      externalAccountId: "1784",
      formId: "9911",
    });
  });

  test("ignores changes that are not leadgen and leads with no id", () => {
    const parsed = parseMetaLeadNotification({
      entry: [
        {
          id: "1",
          changes: [
            { field: "feed", value: { comment_id: "c1", post_id: "p1" } },
            { field: "leadgen", value: { form_id: "no-lead-id" } },
          ],
        },
      ],
    });
    expect(parsed.leads).toEqual([]);
  });

  test("tolerates a payload with no entry array", () => {
    expect(parseMetaLeadNotification(undefined)).toEqual({ pageId: null, leads: [] });
  });

  test("fills contact details from the Graph API answer set", () => {
    const lead = parseMetaLeadNotification(JSON.parse(LEADGEN_BODY)).leads[0];
    const filled = applyMetaLeadFields(lead, {
      form_id: "9911",
      form_name: "Home visit bookings",
      campaign_name: "Autumn push",
      created_time: "1730000000",
      field_data: [
        { name: "full_name", answer: "Rudo Moyo" },
        { name: "phone_number", answer: "+263 77 123 4567" },
        { name: "work_email", answer: "rudo@example.com" },
        { name: "when_is_your_move", answer: "December" },
      ],
    });
    expect(filled).toMatchObject({
      fullName: "Rudo Moyo",
      phone: "+263 77 123 4567",
      email: "rudo@example.com",
      formName: "Home visit bookings",
      campaignName: "Autumn push",
    });
    expect(filled.answers).toEqual({
      full_name: "Rudo Moyo",
      phone_number: "+263 77 123 4567",
      work_email: "rudo@example.com",
      when_is_your_move: "December",
    });
  });

  test("keeps the notification values when the API returns nothing useful", () => {
    const lead = parseMetaLeadNotification(JSON.parse(LEADGEN_BODY)).leads[0];
    const filled = applyMetaLeadFields(lead, { field_data: [] });
    expect(filled.externalLeadId).toBe("112233");
    expect(filled.formId).toBe("9911");
    expect(filled.fullName).toBeNull();
    expect(filled.answers).toBeNull();
  });
});

describe("comment webhooks", () => {
  test("reads a Facebook page comment", () => {
    const [comment] = parseMetaFeedWebhook({
      entry: [
        {
          id: "1784",
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                comment_id: "1784_5001",
                post_id: "1784_4001",
                created_time: 1730000000,
                from: { name: "Tenda", id: "u-9" },
                text: "how much is a 2 seater?",
                permalink_url: "https://facebook.com/1784/posts/4001",
                like_count: 2,
              },
            },
          ],
        },
      ],
    });
    expect(comment).toMatchObject({
      platform: "facebook",
      externalAccountId: "1784",
      postId: "1784_4001",
      externalCommentId: "1784_5001",
      fromName: "Tenda",
      message: "how much is a 2 seater?",
      postPermalink: "https://facebook.com/1784/posts/4001",
      likes: 2,
    });
  });

  test("skips reactions and posts that are not comments", () => {
    expect(
      parseMetaFeedWebhook({
        entry: [
          { id: "1", changes: [{ field: "feed", value: { item: "reaction", post_id: "p" } }] },
          { id: "1", changes: [{ field: "feed", value: { item: "post", post_id: "p" } }] },
        ],
      }),
    ).toEqual([]);
  });

  test("reads an Instagram comment from its own envelope", () => {
    const [comment] = parseInstagramCommentWebhook({
      entry: [
        {
          id: "ig-77",
          changes: [
            {
              field: "comments",
              value: {
                id: "c-1",
                media_id: "m-1",
                username: "tenda",
                text: "price?",
                timestamp: 1730000000,
                permalink: "https://instagram.com/p/m-1",
              },
            },
          ],
        },
      ],
    });
    expect(comment).toMatchObject({
      platform: "instagram",
      externalAccountId: "ig-77",
      postId: "m-1",
      externalCommentId: "c-1",
      fromName: "tenda",
      message: "price?",
    });
  });
});

describe("TikTok lead events", () => {
  test("reads a delivery with the answers inline", () => {
    const [lead] = parseTikTokLeadEvent({
      event: "tt4b_business_leadgen",
      messages: [
        {
          data: {
            id: "4455",
            advertiser_id: "adv-1",
            form_id: "f-1",
            create_time: 1730000000000,
            user_info: [
              { question_name: "Full name", answer: "Tariro Chikafu" },
              { question_name: "Phone number", answer: "+263788000111" },
              { question_name: "Email", answer: "tariro@example.com" },
            ],
          },
        },
      ],
    });
    expect(lead).toMatchObject({
      platform: "tiktok",
      externalLeadId: "4455",
      externalAccountId: "adv-1",
      formId: "f-1",
      fullName: "Tariro Chikafu",
      phone: "+263788000111",
      email: "tariro@example.com",
    });
  });

  test("falls back to the bare id when the app has no answer access", () => {
    const [lead] = parseTikTokLeadEvent({ messages: [{ data: { id: "4456", advertiser_id: "adv-1" } }] });
    expect(lead.externalLeadId).toBe("4456");
    expect(lead.fullName).toBeNull();
    expect(lead.answers).toBeNull();
  });

  test("treats a single-message payload as one lead", () => {
    expect(parseTikTokLeadEvent({ data: { id: "4457", full_name: "Anon" } })).toHaveLength(1);
  });
});

describe("capture attribution text", () => {
  test("names the campaign for a lead form", () => {
    expect(
      socialChatterText({
        platform: "facebook",
        formName: null,
        campaignName: "Autumn push",
        postPermalink: null,
      }),
    ).toBe("Captured from a facebook lead form (Autumn push).");
  });

  test("links a comment back to the post", () => {
    expect(
      socialChatterText({
        platform: "instagram",
        externalCommentId: "c-1",
        postPermalink: "https://instagram.com/p/m-1",
      }),
    ).toBe("Captured from a instagram comment. https://instagram.com/p/m-1");
  });

  test("only accepts the three platforms", () => {
    expect(["facebook", "instagram", "tiktok"].every(isSocialPlatform)).toBe(true);
    expect(isSocialPlatform("linkedin")).toBe(false);
  });
});
