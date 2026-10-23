import { Router, type Request, type RequestHandler, type Response } from "express";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  zohoConnections,
  zohoFiscalEvents,
  type ZohoConnection,
} from "../../shared/schema.js";
import {
  allowedSentStatuses,
  buildCustomFieldWriteback,
  emailZohoInvoice,
  extractZohoInvoiceIdentifiers,
  fetchZohoContact,
  fetchZohoInvoice,
  findZohoInvoiceByNumber,
  fiscalizeInvoiceViaApi,
  mapZohoInvoiceToFiscalizePayload,
  parseZohoPayload,
  resolvePublicBaseUrl,
  updateZohoInvoiceCustomFields,
  type FiscalizeResponse,
} from "./zoho-books.js";
import { buildInvoiceQrUrl } from "./fiscal-qr.js";

const router = Router();

type EventStatus = "success" | "failed" | "skipped" | "duplicate";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function headerValue(req: Request, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0]) : String(value ?? "");
}

function rawBodyOf(req: Request): string {
  const raw = (req as any).rawBody;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (typeof raw === "string") return raw;
  return JSON.stringify(req.body ?? {});
}

/**
 * Verifies the `X-Zoho-Webhook-Signature` header. Zoho signs the sorted
 * query-string pairs concatenated with the raw request body.
 */
export function verifyZohoSignature(
  req: Request,
  secret: string,
): boolean {
  const signature = headerValue(req, "x-zoho-webhook-signature");
  if (!signature) return false;

  const queryPairs = Object.entries(req.query || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${Array.isArray(value) ? value.join("") : String(value ?? "")}`)
    .join("");

  const signedPayload = `${queryPairs}${rawBodyOf(req)}`;
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  const expectedBase64 = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("base64");

  const provided = signature.trim();
  for (const expected of [expectedHex, expectedBase64]) {
    if (provided.length !== expected.length) continue;
    try {
      if (crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
        return true;
      }
    } catch {
      /* compare next encoding */
    }
  }
  return false;
}

async function logEvent(
  connection: ZohoConnection,
  zohoInvoiceId: string,
  invoiceNumber: string | null,
  status: EventStatus,
  details?: Record<string, any>,
): Promise<void> {
  try {
    await db.insert(zohoFiscalEvents).values({
      companyId: connection.companyId,
      orgId: connection.orgId,
      zohoInvoiceId,
      invoiceNumber,
      status,
      details: details ?? null,
    });
  } catch (err: any) {
    console.error(`[ZohoWebhook] Failed to log event (${status}):`, err.message);
  }
}

async function hasSuccessfulEvent(
  connection: ZohoConnection,
  zohoInvoiceId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: zohoFiscalEvents.id })
    .from(zohoFiscalEvents)
    .where(
      and(
        eq(zohoFiscalEvents.companyId, connection.companyId),
        eq(zohoFiscalEvents.zohoInvoiceId, zohoInvoiceId),
        eq(zohoFiscalEvents.status, "success"),
      ),
    )
    .limit(1);
  return Boolean(existing);
}

function fiscalFromLocalInvoice(invoice: any): FiscalizeResponse {
  return {
    success: true,
    fiscalCode: invoice.fiscalCode ?? undefined,
    qrCode: invoice.qrCodeData ?? undefined,
    receiptNumber: invoice.receiptGlobalNo ?? undefined,
    receipt: {
      receiptCounter: invoice.receiptCounter ?? undefined,
      receiptGlobalNo: invoice.receiptGlobalNo ?? undefined,
      fiscalDayNo: invoice.fiscalDayNo ?? undefined,
      invoiceNo: invoice.invoiceNumber ?? undefined,
      receiptDate: invoice.issueDate
        ? new Date(invoice.issueDate).toISOString().slice(0, 10)
        : undefined,
    },
  };
}

// ─── Orchestration ───────────────────────────────────────────────────────────

async function processZohoInvoiceSent(
  connection: ZohoConnection,
  payload: any,
  publicBaseUrl: string,
): Promise<void> {
  const identifiers = extractZohoInvoiceIdentifiers(payload);

  let invoiceId = identifiers.invoiceId;
  let invoiceNumber: string | null = identifiers.invoiceNumber || null;
  let invoice =
    payload?.invoice && typeof payload.invoice === "object" ? payload.invoice : null;

  if (!invoiceId && invoiceNumber) {
    const found = await findZohoInvoiceByNumber(connection, invoiceNumber);
    if (found) {
      invoice = found;
      invoiceId = String(found.invoice_id ?? "");
      invoiceNumber = String(found.invoice_number ?? invoiceNumber);
    }
  }

  if (!invoiceId && invoice?.invoice_id) invoiceId = String(invoice.invoice_id);
  if (!invoiceNumber && invoice?.invoice_number) {
    invoiceNumber = String(invoice.invoice_number);
  }

  if (!invoiceId) {
    await logEvent(connection, "unknown", invoiceNumber || null, "failed", {
      error: "Missing invoice_id / invoice_number in Zoho webhook payload",
    });
    return;
  }

  try {
    // Always fetch the full invoice so line items and custom fields are
    // available, even when the webhook sends a partial payload.
    try {
      invoice = await fetchZohoInvoice(connection, invoiceId);
    } catch (err: any) {
      if (!invoice) throw err;
      console.warn(
        `[ZohoWebhook] Could not fetch invoice ${invoiceId}, using webhook payload: ${err.message}`,
      );
    }
    invoiceNumber = String(invoice?.invoice_number ?? invoiceNumber ?? "") || null;

    const status = String(invoice?.status ?? payload?.status ?? "").toLowerCase();
    const allowed = allowedSentStatuses(connection.settings);
    if (!allowed.includes(status)) {
      await logEvent(connection, invoiceId, invoiceNumber, "skipped", {
        reason: `Invoice status "${status || "unknown"}" is not a sent status`,
        allowedStatuses: allowed,
      });
      return;
    }

    if (await hasSuccessfulEvent(connection, invoiceId)) {
      await logEvent(connection, invoiceId, invoiceNumber, "duplicate", {
        reason: "Invoice already fiscalised",
      });
      return;
    }

    const company = await storage.getCompany(connection.companyId);
    if (!company) {
      throw new Error(`Company ${connection.companyId} not found`);
    }

    const contact = invoice?.customer_id
      ? await fetchZohoContact(connection, String(invoice.customer_id))
      : null;

    const fiscalPayload = mapZohoInvoiceToFiscalizePayload(
      invoice,
      contact,
      company,
      connection.settings,
    );

    const result = await fiscalizeInvoiceViaApi(company, fiscalPayload);

    let fiscal: FiscalizeResponse;
    if (result.status === 409) {
      const existing = await storage.getInvoiceByNumber(
        company.id,
        fiscalPayload.invoiceNumber,
      );
      if (!existing?.fiscalCode) {
        throw new Error(
          `Invoice number "${fiscalPayload.invoiceNumber}" already exists in FiscalStack but is not fiscalised. Configure an invoice number prefix in the Zoho connection settings.`,
        );
      }
      fiscal = fiscalFromLocalInvoice(existing);
    } else if (!result.data?.success) {
      throw new Error(
        result.data?.message ||
          result.data?.error ||
          `FiscalStack fiscalization failed (HTTP ${result.status})`,
      );
    } else {
      fiscal = result.data as FiscalizeResponse;
    }

    const qrImageUrl = buildInvoiceQrUrl(
      publicBaseUrl,
      company.id,
      fiscalPayload.invoiceNumber,
    );
    const writeback = buildCustomFieldWriteback(
      invoice,
      fiscal,
      company,
      qrImageUrl,
      connection.settings,
    );

    await updateZohoInvoiceCustomFields(connection, invoiceId, writeback.updates);

    let documentEmailed = false;
    if (connection.settings?.resendEmail) {
      try {
        await emailZohoInvoice(connection, invoiceId);
        documentEmailed = true;
      } catch (err: any) {
        console.warn(
          `[ZohoWebhook] Fiscal fields written but invoice email failed: ${err.message}`,
        );
      }
    }

    await logEvent(connection, invoiceId, invoiceNumber, "success", {
      fiscalCode: fiscal.fiscalCode,
      receiptNumber: fiscal.receiptNumber ?? fiscal.receipt?.receiptGlobalNo,
      invoiceNumber: fiscalPayload.invoiceNumber,
      customFieldsUpdated: writeback.updates.length,
      missingCustomFields: writeback.missing,
      documentEmailed,
    });

    console.log(
      `[ZohoWebhook] Fiscalised ${invoiceNumber} (Zoho ${invoiceId}) → receipt ${fiscal.receiptNumber ?? fiscal.receipt?.receiptGlobalNo}`,
    );
  } catch (err: any) {
    console.error(`[ZohoWebhook] Failed to process invoice ${invoiceId}:`, err.message);
    await logEvent(connection, invoiceId, invoiceNumber, "failed", {
      error: err.message,
    });
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

const handler = (async (req: Request, res: Response) => {
  // Respond immediately so Zoho never retries because of our processing time.
  res.status(200).json({ received: true });

  const token = String(
    req.params?.token ||
      req.query?.token ||
      headerValue(req, "x-zoho-webhook-token") ||
      "",
  ).trim();

  if (!token) {
    console.warn("[ZohoWebhook] Missing webhook token");
    return;
  }

  const [connection] = await db
    .select()
    .from(zohoConnections)
    .where(eq(zohoConnections.webhookToken, token))
    .limit(1);

  if (!connection || !connection.active) {
    console.warn(`[ZohoWebhook] Unknown or inactive webhook token`);
    return;
  }

  if (connection.webhookSecret) {
    if (!verifyZohoSignature(req, connection.webhookSecret)) {
      console.warn(`[ZohoWebhook] Invalid signature for org ${connection.orgId}`);
      await logEvent(connection, "unknown", null, "failed", {
        error: "Invalid X-Zoho-Webhook-Signature",
      });
      return;
    }
  }

  const payload = parseZohoPayload(req.body);
  const identifiers = extractZohoInvoiceIdentifiers(payload);

  if (
    identifiers.orgId &&
    connection.orgId &&
    String(identifiers.orgId) !== String(connection.orgId)
  ) {
    console.warn(
      `[ZohoWebhook] Org mismatch: payload ${identifiers.orgId} vs connection ${connection.orgId}`,
    );
    await logEvent(connection, identifiers.invoiceId || "unknown", identifiers.invoiceNumber || null, "failed", {
      error: `Organization mismatch: ${identifiers.orgId}`,
    });
    return;
  }

  const publicBaseUrl = resolvePublicBaseUrl(req as any);

  void processZohoInvoiceSent(connection, payload, publicBaseUrl).catch((err) => {
    console.error("[ZohoWebhook] Unhandled processing error:", err);
  });
}) as RequestHandler;

router.post("/", handler);
router.post("/:token", handler);

export default router;
