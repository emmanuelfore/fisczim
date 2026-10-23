import { eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  zohoConnections,
  type Company,
  type ZohoConnection,
  type ZohoConnectionSettings,
} from "../../shared/schema.js";

export type ZohoInvoice = any;
export type ZohoContact = any;

export type FiscalizeResponse = {
  success?: boolean;
  fiscalCode?: string;
  qrCode?: string;
  receiptNumber?: number;
  receipt?: {
    receiptCounter?: number;
    receiptGlobalNo?: number;
    fiscalDayNo?: number;
    invoiceNo?: string;
    receiptDate?: string;
  };
};

const DEFAULT_SENT_STATUSES = [
  "sent",
  "viewed",
  "overdue",
  "unpaid",
  "partially_paid",
  "paid",
];

const ZIMRA_TAX_TYPES = ["STANDARD", "ZERO_RATED", "EXEMPT"] as const;
type ZimraTaxType = (typeof ZIMRA_TAX_TYPES)[number];

// ─── Custom field labels ─────────────────────────────────────────────────────

export const DEFAULT_CUSTOM_FIELD_LABELS: Record<string, string> = {
  fiscalCode: "Fiscal Code",
  qrImage: "Fiscal QR Image",
  qrData: "Fiscal QR Data",
  receiptCounter: "Fiscal Receipt Counter",
  receiptGlobalNo: "Fiscal Receipt Number",
  fiscalDay: "Fiscal Day",
  deviceId: "ZIMRA Device ID",
  verificationCode: "Verification Code",
  verifyUrl: "Fiscal Verify URL",
  status: "Fiscal Status",
  fiscalDate: "Fiscal Date",
};

const CUSTOM_FIELD_ALIASES: Record<string, string[]> = {
  fiscalCode: ["fiscal code", "zimra fiscal code", "fiscalcode", "fiscal hash"],
  qrImage: ["fiscal qr image", "qr image", "qr code image", "fiscal qr url", "qr code url"],
  qrData: ["fiscal qr data", "qr data", "qr code data", "qr code"],
  receiptCounter: ["fiscal receipt counter", "receipt counter"],
  receiptGlobalNo: ["fiscal receipt number", "receipt number", "receipt no", "global receipt no", "receipt global no"],
  fiscalDay: ["fiscal day", "fiscal day no", "fiscal day number"],
  deviceId: ["zimra device id", "device id", "fiscal device id"],
  verificationCode: ["verification code", "receipt verification code"],
  verifyUrl: ["fiscal verify url", "verify url", "verification url"],
  status: ["fiscal status", "zimra status"],
  fiscalDate: ["fiscal date", "fiscal invoice date"],
};

// ─── Token management ────────────────────────────────────────────────────────

function isTokenValid(connection: ZohoConnection): boolean {
  if (!connection.accessToken || !connection.tokenExpiresAt) return false;
  return new Date(connection.tokenExpiresAt).getTime() > Date.now() + 60_000;
}

export async function refreshZohoAccessToken(connection: ZohoConnection): Promise<string> {
  const params = new URLSearchParams({
    refresh_token: connection.refreshToken,
    client_id: connection.clientId,
    client_secret: connection.clientSecret,
    grant_type: "refresh_token",
  });

  const resp = await fetch(`${connection.accountsServer.replace(/\/+$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error || !data.access_token) {
    throw new Error(
      `Zoho token refresh failed (${resp.status}): ${data.error || data.message || "no access_token"}`,
    );
  }

  const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600;
  const tokenExpiresAt = new Date(Date.now() + Math.max(expiresIn - 60, 60) * 1000);

  await db
    .update(zohoConnections)
    .set({ accessToken: data.access_token, tokenExpiresAt, updatedAt: new Date() })
    .where(eq(zohoConnections.id, connection.id));

  connection.accessToken = data.access_token;
  connection.tokenExpiresAt = tokenExpiresAt;

  return data.access_token;
}

export async function getZohoAccessToken(connection: ZohoConnection): Promise<string> {
  if (isTokenValid(connection)) return connection.accessToken as string;
  return refreshZohoAccessToken(connection);
}

// ─── Zoho Books API client ───────────────────────────────────────────────────

async function zohoRequest(
  connection: ZohoConnection,
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<any> {
  const token = await getZohoAccessToken(connection);
  const url = path.startsWith("http")
    ? path
    : `${connection.apiRoot.replace(/\/+$/, "")}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };

  const resp = await fetch(url, { ...init, headers });
  const data: any = await resp.json().catch(() => ({}));

  if (resp.status === 401 && allowRetry) {
    await refreshZohoAccessToken(connection);
    return zohoRequest(connection, path, init, false);
  }

  if (!resp.ok) {
    throw new Error(
      `Zoho Books API ${resp.status} ${path}: ${data?.message || JSON.stringify(data)}`,
    );
  }

  return data;
}

export async function fetchZohoInvoice(
  connection: ZohoConnection,
  invoiceId: string,
): Promise<ZohoInvoice> {
  const data = await zohoRequest(connection, `/invoices/${encodeURIComponent(invoiceId)}`);
  return data?.invoice ?? data;
}

export async function findZohoInvoiceByNumber(
  connection: ZohoConnection,
  invoiceNumber: string,
): Promise<ZohoInvoice | null> {
  const find = (rows: ZohoInvoice[]) =>
    rows.find(
      (row) => String(row?.invoice_number ?? "").trim() === String(invoiceNumber).trim(),
    );

  const byNumber = await zohoRequest(
    connection,
    `/invoices?invoice_number=${encodeURIComponent(invoiceNumber)}`,
  );
  const rows: ZohoInvoice[] = Array.isArray(byNumber?.invoices) ? byNumber.invoices : [];
  const exact = find(rows);
  if (exact) return exact;

  // Older Zoho Books regions do not support the invoice_number filter.
  const bySearch = await zohoRequest(
    connection,
    `/invoices?search_text=${encodeURIComponent(invoiceNumber)}`,
  );
  const searchRows: ZohoInvoice[] = Array.isArray(bySearch?.invoices)
    ? bySearch.invoices
    : [];
  return find(searchRows) ?? null;
}

export async function fetchZohoContact(
  connection: ZohoConnection,
  contactId: string,
): Promise<ZohoContact | null> {
  if (!contactId) return null;
  try {
    const data = await zohoRequest(connection, `/contacts/${encodeURIComponent(contactId)}`);
    return data?.contact ?? data ?? null;
  } catch (err: any) {
    console.warn(`[Zoho] Could not fetch contact ${contactId}: ${err.message}`);
    return null;
  }
}

export async function updateZohoInvoiceCustomFields(
  connection: ZohoConnection,
  invoiceId: string,
  updates: Array<{ customfield_id: string; value: string }>,
): Promise<void> {
  if (updates.length === 0) return;
  await zohoRequest(connection, `/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "PUT",
    body: JSON.stringify({ custom_fields: updates }),
  });
}

/**
 * Re-sends the Zoho invoice email. Used after write-back so the customer
 * receives a PDF containing the fiscal QR code and receipt fields.
 */
export async function emailZohoInvoice(
  connection: ZohoConnection,
  invoiceId: string,
): Promise<void> {
  await zohoRequest(connection, `/invoices/${encodeURIComponent(invoiceId)}/email`, {
    method: "POST",
    body: JSON.stringify({ send_from_org_email_id: true }),
  });
}

// ─── Webhook payload parsing ─────────────────────────────────────────────────

export function parseZohoPayload(body: any): any {
  let payload = body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  if (!payload || typeof payload !== "object") return {};

  if (typeof payload.JSONString === "string") {
    try {
      const parsed = JSON.parse(payload.JSONString);
      payload = { ...payload, ...parsed };
    } catch {
      /* ignore malformed JSONString */
    }
    delete payload.JSONString;
  }

  return payload;
}

function firstString(objects: any[], keys: string[]): string {
  for (const object of objects) {
    if (!object || typeof object !== "object") continue;
    for (const key of keys) {
      const value = object[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return "";
}

export function extractZohoInvoiceIdentifiers(payload: any): {
  invoiceId: string;
  invoiceNumber: string;
  orgId: string;
} {
  const invoice = payload?.invoice && typeof payload.invoice === "object" ? payload.invoice : null;
  const data = payload?.data && typeof payload.data === "object" ? payload.data : null;
  const dataInvoice =
    data?.invoice && typeof data.invoice === "object" ? data.invoice : null;

  const objects = [invoice, dataInvoice, data, payload];

  return {
    invoiceId: firstString(objects, ["invoice_id", "invoiceId", "invoiceid", "entity_id"]),
    invoiceNumber: firstString(objects, ["invoice_number", "invoiceNumber", "invoice_no"]),
    orgId: firstString(objects, [
      "organization_id",
      "org_id",
      "organizationId",
      "orgId",
    ]),
  };
}

export function resolvePublicBaseUrl(req: {
  protocol?: string;
  headers?: Record<string, any>;
}): string {
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const forwardedProto = req.headers?.["x-forwarded-proto"];
  const forwardedHost = req.headers?.["x-forwarded-host"];
  const host = String(forwardedHost || req.headers?.host || "").split(",")[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const proto = forwardedProto
    ? String(forwardedProto).split(",")[0].trim()
    : isLocal
      ? "http"
      : "https";

  return host ? `${proto}://${host}` : "https://fiscalstack.co.zw";
}

export function allowedSentStatuses(settings?: ZohoConnectionSettings | null): string[] {
  const configured = settings?.sentStatuses?.map((s) => s.toLowerCase());
  return configured && configured.length > 0 ? configured : DEFAULT_SENT_STATUSES;
}

// ─── Mapping Zoho invoice → FiscalStack /api/v1/fiscalize ────────────────────

function toNumber(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function digitsOnly(value: any): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normaliseLabel(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function customFieldValues(contact: ZohoContact): Array<{ label: string; value: string }> {
  const fields = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
  return fields
    .map((field: any) => ({
      label: String(field?.label ?? field?.placeholder ?? ""),
      value: String(field?.value ?? ""),
    }))
    .filter((field: { value: string }) => field.value.trim() !== "");
}

function extractBuyerTaxIds(contact: ZohoContact): { tin?: string; vatNumber?: string } {
  let tin: string | undefined;
  let vatNumber: string | undefined;

  const candidates: Array<{ label: string; value: string }> = [
    { label: "tin", value: digitsOnly(contact?.tin) },
    { label: "vat", value: digitsOnly(contact?.vat_number ?? contact?.vatNumber) },
    { label: "tax_reg_no", value: digitsOnly(contact?.tax_reg_no ?? contact?.tax_reg_number) },
    ...customFieldValues(contact),
  ];

  for (const candidate of candidates) {
    const label = normaliseLabel(candidate.label);
    const value = digitsOnly(candidate.value);
    if (!value) continue;

    if (!tin && (label.includes("tin") || label.includes("tax identification")) && value.length === 10) {
      tin = value;
    }
    if (
      !vatNumber &&
      (label.includes("vat") || label.includes("tax reg")) &&
      value.length === 9
    ) {
      vatNumber = value;
    }
  }

  if (!tin && !vatNumber) {
    const raw = digitsOnly(contact?.tax_reg_no);
    if (raw.length === 10) tin = raw;
    else if (raw.length === 9) vatNumber = raw;
  }

  return { tin, vatNumber };
}

function resolveTaxType(
  line: any,
  settings?: ZohoConnectionSettings | null,
): ZimraTaxType {
  const taxName = String(line?.tax_name ?? line?.taxName ?? "");
  const taxId = String(line?.tax_id ?? line?.taxId ?? "");
  const taxMap = settings?.taxMap || {};

  for (const key of [taxName, taxId]) {
    if (!key) continue;
    const mapped = taxMap[key] ?? taxMap[key.toLowerCase()] ?? taxMap[key.toUpperCase()];
    if (mapped && (ZIMRA_TAX_TYPES as readonly string[]).includes(mapped)) {
      return mapped as ZimraTaxType;
    }
  }

  const name = taxName.toLowerCase();
  if (name.includes("exempt")) return "EXEMPT";
  if (name.includes("zero") || name.includes("0%")) return "ZERO_RATED";

  const percentage = toNumber(line?.tax_percentage ?? line?.tax_percentage_total, 0);
  if (percentage > 0) return "STANDARD";
  return "EXEMPT";
}

function resolvePaymentMethod(
  invoice: ZohoInvoice,
  settings?: ZohoConnectionSettings | null,
): string {
  const configured = String(settings?.paymentMethod ?? "").trim().toUpperCase();
  if (configured) return configured;

  const fields = Array.isArray(invoice?.custom_fields) ? invoice.custom_fields : [];
  const paymentField = fields.find((field: any) =>
    normaliseLabel(field?.label).includes("payment method"),
  );
  const raw = String(paymentField?.value ?? "").toUpperCase();

  if (raw.includes("CASH")) return "CASH";
  if (raw.includes("CARD") || raw.includes("SWIPE") || raw.includes("POS")) return "CARD";
  if (raw.includes("ECO") || raw.includes("MOBILE") || raw.includes("WALLET")) return "MOBILE";
  if (raw.includes("TRANSFER") || raw.includes("EFT") || raw.includes("RTGS") || raw.includes("BANK")) {
    return "TRANSFER";
  }
  return "CASH";
}

function resolveCurrency(invoice: ZohoInvoice, company: Company): "USD" | "ZWG" {
  const code = String(invoice?.currency_code ?? invoice?.currency ?? "").toUpperCase();
  if (code === "ZWG" || code === "USD") return code;
  return String(company.currency ?? "").toUpperCase() === "ZWG" ? "ZWG" : "USD";
}

/**
 * Builds the payload for FiscalStack's `/api/v1/fiscalize` endpoint from a
 * Zoho Books invoice (and optional contact). Pure function — safe to unit test.
 */
export function mapZohoInvoiceToFiscalizePayload(
  invoice: ZohoInvoice,
  contact: ZohoContact,
  company: Company,
  settings?: ZohoConnectionSettings | null,
): Record<string, any> {
  const lineItems: any[] = Array.isArray(invoice?.line_items)
    ? invoice.line_items.filter((line: any) => line?.line_item_category !== "header")
    : [];

  const nets = lineItems.map((line) => {
    const quantity = toNumber(line?.quantity, 1);
    const rate = toNumber(line?.rate, 0);
    const percentage = toNumber(line?.tax_percentage, 0);
    const inclusive = Boolean(line?.is_inclusive_tax ?? invoice?.is_inclusive_tax);
    const divisor = inclusive && percentage > 0 ? 1 + percentage / 100 : 1;

    // Work in tax-exclusive amounts; /api/v1/fiscalize adds tax back per bucket.
    const netRate = rate / divisor;
    const netDiscount = toNumber(line?.discount_amount, 0) / divisor;
    return Math.max(quantity * netRate - netDiscount, 0);
  });

  // Align the sum of line nets with Zoho's sub_total so invoice-level
  // discounts/adjustments are preserved proportionally.
  const subTotal = toNumber(invoice?.sub_total, NaN);
  const netSum = nets.reduce((sum, net) => sum + net, 0);
  if (Number.isFinite(subTotal) && netSum > 0 && Math.abs(subTotal - netSum) > 0.01) {
    const factor = subTotal / netSum;
    for (let i = 0; i < nets.length; i += 1) nets[i] = nets[i] * factor;
  }

  const items = lineItems.map((line, index) => {
    const quantity = Math.max(toNumber(line?.quantity, 1), 0.0001);
    const net = nets[index] ?? 0;
    const unitPrice = quantity > 0 ? net / quantity : net;

    return {
      name: String(line?.name || line?.description || "Item").slice(0, 200),
      quantity,
      unitPrice: Math.round(unitPrice * 10000) / 10000,
      taxType: resolveTaxType(line, settings),
      taxInclusive: false,
      ...(line?.hsn_or_sac ? { hsCode: String(line.hsn_or_sac).slice(0, 8) } : {}),
    };
  });

  const prefix = String(settings?.invoiceNumberPrefix ?? "").trim();
  const rawNumber = String(
    invoice?.invoice_number || `ZOHO-${invoice?.invoice_id ?? Date.now()}`,
  ).trim();
  const invoiceNumber = prefix && !rawNumber.startsWith(prefix) ? `${prefix}${rawNumber}` : rawNumber;

  const buyerName =
    contact?.contact_name ||
    contact?.company_name ||
    contact?.display_name ||
    invoice?.customer_name ||
    undefined;

  const taxIds = extractBuyerTaxIds(contact);
  const billing = contact?.billing_address || invoice?.billing_address || {};
  const billingAddress =
    typeof billing?.address === "string" ? billing.address : undefined;
  const addressParts = [
    contact?.street_address || billingAddress,
    contact?.city || billing?.city,
    contact?.state || billing?.state,
    contact?.zip || billing?.zip,
    contact?.country || billing?.country,
  ]
    .filter(Boolean)
    .map((part: any) => String(part));

  const buyer = {
    ...(buyerName ? { name: String(buyerName) } : {}),
    ...(taxIds.tin ? { tin: taxIds.tin } : {}),
    ...(taxIds.vatNumber ? { vatNumber: taxIds.vatNumber } : {}),
    ...(contact?.email || invoice?.customer_email
      ? { email: String(contact?.email || invoice?.customer_email).slice(0, 100) }
      : {}),
    ...(contact?.phone || invoice?.customer_phone
      ? { phone: String(contact?.phone || invoice?.customer_phone).slice(0, 20) }
      : {}),
    ...(addressParts.length > 0 ? { street: addressParts.join(", ") } : {}),
  };

  const issueDate = String(invoice?.date || invoice?.created_time || "").slice(0, 10);

  return {
    items,
    invoiceNumber,
    ...(issueDate ? { date: issueDate } : {}),
    currency: resolveCurrency(invoice, company),
    paymentMethod: resolvePaymentMethod(invoice, settings),
    transactionType:
      String(invoice?.invoice_type ?? "").toLowerCase() === "creditnote"
        ? "CreditNote"
        : "FiscalInvoice",
    ...(Object.keys(buyer).length > 0 ? { buyer } : {}),
  };
}

// ─── Writing fiscal fields back to Zoho invoice custom fields ────────────────

export type CustomFieldWriteback = {
  updates: Array<{ customfield_id: string; value: string }>;
  values: Record<string, string>;
  missing: string[];
};

function findCustomField(
  customFields: any[],
  key: string,
  settings?: ZohoConnectionSettings | null,
): any | undefined {
  const override = settings?.customFieldLabels?.[key];
  const defaultLabel = DEFAULT_CUSTOM_FIELD_LABELS[key];
  const aliases = new Set(
    [override, defaultLabel, ...(CUSTOM_FIELD_ALIASES[key] || [])]
      .filter(Boolean)
      .map((label) => normaliseLabel(label)),
  );

  return customFields.find((field) => {
    const id = String(field?.customfield_id ?? "");
    if (override && id === override) return true;
    const label = normaliseLabel(field?.label ?? field?.placeholder);
    return aliases.has(label);
  });
}

export function buildCustomFieldWriteback(
  invoice: ZohoInvoice,
  fiscal: FiscalizeResponse,
  company: Pick<Company, "fdmsDeviceId">,
  qrImageUrl: string,
  settings?: ZohoConnectionSettings | null,
): CustomFieldWriteback {
  const receipt = fiscal?.receipt || {};
  const qrCode = String(fiscal?.qrCode ?? "");
  const receiptGlobalNo =
    fiscal?.receiptNumber ?? receipt?.receiptGlobalNo ?? undefined;

  const values: Record<string, string> = {
    fiscalCode: String(fiscal?.fiscalCode ?? ""),
    qrImage: qrImageUrl,
    qrData: qrCode,
    receiptCounter:
      receipt?.receiptCounter !== undefined && receipt?.receiptCounter !== null
        ? String(receipt.receiptCounter)
        : "",
    receiptGlobalNo:
      receiptGlobalNo !== undefined && receiptGlobalNo !== null
        ? String(receiptGlobalNo)
        : "",
    fiscalDay:
      receipt?.fiscalDayNo !== undefined && receipt?.fiscalDayNo !== null
        ? String(receipt.fiscalDayNo)
        : "",
    deviceId: String(company?.fdmsDeviceId ?? ""),
    verificationCode: qrCode ? qrCode.slice(-16) : "",
    verifyUrl: qrCode,
    status: fiscal?.fiscalCode ? "Fiscalised" : "",
    fiscalDate: String(receipt?.receiptDate ?? new Date().toISOString().slice(0, 10)),
  };

  const customFields: any[] = Array.isArray(invoice?.custom_fields)
    ? invoice.custom_fields
    : [];

  const updates: Array<{ customfield_id: string; value: string }> = [];
  const missing: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const field = findCustomField(customFields, key, settings);
    if (!field?.customfield_id) {
      missing.push(key);
      continue;
    }
    updates.push({ customfield_id: String(field.customfield_id), value });
  }

  return { updates, values, missing };
}

// ─── Fiscalise through the internal v1 API ───────────────────────────────────

export async function fiscalizeInvoiceViaApi(
  company: Pick<Company, "id" | "apiKey">,
  payload: Record<string, any>,
): Promise<{ status: number; data: any }> {
  if (!company.apiKey) {
    throw new Error(
      "Company has no API key configured — generate one in FiscalStack settings so the Zoho automation can fiscalise invoices.",
    );
  }

  const port = process.env.PORT || "5000";
  const base = (process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${port}`).replace(
    /\/+$/,
    "",
  );

  const resp = await fetch(`${base}/api/v1/fiscalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": company.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}
