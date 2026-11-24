/**
 * Paynow IPN signature verification.
 *
 * Paynow deployments that provide a webhook signing secret should set
 * PAYNOW_WEBHOOK_SECRET. When it is set, the IPN is accepted only with a
 * matching HMAC-SHA256 signature. When it is absent, the legacy polling
 * behaviour remains so existing tenants are not broken while they wait for a
 * signing key from Paynow.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADERS = [
  "x-paynow-signature-256",
  "x-paynow-signature",
  "x-hub-signature-256",
] as const;

export interface PaynowWebhookInput {
  rawBody: unknown;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  contentType?: string | string[];
  secret?: string | null;
}

export type PaynowWebhookVerification =
  | { ok: true; configured: boolean }
  | { ok: false; configured: boolean; reason: "MISSING_SIGNATURE" | "INVALID_SIGNATURE" };

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractSignature(headers: Record<string, string | string[] | undefined>): string | undefined {
  for (const name of SIGNATURE_HEADERS) {
    const value = headerValue(headers, name);
    if (!value) continue;
    const trimmed = value.trim();
    // Common webhook convention: "sha256=<hex>". Accept a bare hex value too.
    return trimmed.toLowerCase().startsWith("sha256=") ? trimmed.slice(7) : trimmed;
  }
  return undefined;
}

function rawBodyOf(input: PaynowWebhookInput): Buffer {
  const { rawBody, body, contentType } = input;
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);

  const type = Array.isArray(contentType) ? contentType[0] : contentType;
  if (type?.includes("application/x-www-form-urlencoded") && body && typeof body === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      params.append(key, value === undefined || value === null ? "" : String(value));
    }
    return Buffer.from(params.toString(), "utf8");
  }
  return Buffer.from(body === undefined || body === null ? "" : JSON.stringify(body), "utf8");
}

/** Verify an IPN when a signing secret is configured. */
export function verifyPaynowWebhookSignature(input: PaynowWebhookInput): PaynowWebhookVerification {
  const secret = input.secret === undefined
    ? process.env.PAYNOW_WEBHOOK_SECRET
    : input.secret;
  if (!secret) return { ok: true, configured: false };

  const supplied = extractSignature(input.headers);
  if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied)) {
    return { ok: false, configured: true, reason: "MISSING_SIGNATURE" };
  }

  const expected = createHmac("sha256", secret).update(rawBodyOf(input)).digest();
  const received = Buffer.from(supplied, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false, configured: true, reason: "INVALID_SIGNATURE" };
  }
  return { ok: true, configured: true };
}
