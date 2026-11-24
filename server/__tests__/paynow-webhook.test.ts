import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { verifyPaynowWebhookSignature } from "../lib/paynow-webhook";

const SECRET = "paynow-test-secret";

function sign(body: Buffer, secret = SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

afterEach(() => {
  delete process.env.PAYNOW_WEBHOOK_SECRET;
});

describe("Paynow IPN signature verification", () => {
  test("legacy requests pass when no signing secret is configured", () => {
    const result = verifyPaynowWebhookSignature({
      rawBody: Buffer.from('{"reference":"SUB-1"}'),
      body: { reference: "SUB-1" },
      headers: {},
    });
    expect(result).toEqual({ ok: true, configured: false });
  });

  test("accepts a valid HMAC signature", () => {
    const raw = Buffer.from(JSON.stringify({ reference: "SUB-1-ABC-123" }));
    const result = verifyPaynowWebhookSignature({
      rawBody: raw,
      body: { reference: "SUB-1-ABC-123" },
      headers: { "x-paynow-signature-256": `sha256=${sign(raw)}` },
      secret: SECRET,
    });
    expect(result).toEqual({ ok: true, configured: true });
  });

  test("accepts a bare hex signature from an alternate header", () => {
    const raw = Buffer.from(JSON.stringify({ reference: "SUB-1-ABC-123" }));
    const result = verifyPaynowWebhookSignature({
      rawBody: raw,
      body: { reference: "SUB-1-ABC-123" },
      headers: { "x-paynow-signature": sign(raw) },
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  test("rejects missing and invalid signatures", () => {
    const raw = Buffer.from(JSON.stringify({ reference: "SUB-1-ABC-123" }));
    const base = {
      rawBody: raw,
      body: { reference: "SUB-1-ABC-123" },
      secret: SECRET,
    };
    expect(verifyPaynowWebhookSignature({ ...base, headers: {} })).toMatchObject({
      ok: false,
      reason: "MISSING_SIGNATURE",
    });
    expect(verifyPaynowWebhookSignature({
      ...base,
      headers: { "x-paynow-signature-256": `sha256=${sign(raw, "wrong")}` },
    })).toMatchObject({ ok: false, reason: "INVALID_SIGNATURE" });
  });

  test("falls back to the parsed form body when raw bytes were not retained", () => {
    const body = { reference: "SUB-1-ABC-123", status: "Paid" };
    const raw = Buffer.from(new URLSearchParams(body as Record<string, string>).toString());
    const result = verifyPaynowWebhookSignature({
      rawBody: undefined,
      body,
      contentType: "application/x-www-form-urlencoded",
      headers: { "x-hub-signature-256": `sha256=${sign(raw)}` },
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });
});
