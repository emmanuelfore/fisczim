import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { processInvoiceFiscalization, getCompanyZimraConfig } from "../../lib/fiscalization.js";
import { baseCurrencyOf, canonicalCurrency, isLotiFiscalAccount } from "../../../shared/currency.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Schema
//
//  Design principles:
//    1. Only `items` is REQUIRED. Everything else defaults intelligently.
//    2. Totals are always computed server-side — client NEVER sends subtotal/tax/total.
//    3. taxType enum maps to correct ZIMRA taxID automatically.
//    4. HS codes default by tax type from database (fallback to STANDARD=99001000, ZERO_RATED=99002000, EXEMPT=99003000).
//    5. Tax-inclusive pricing supported — we strip the tax before storing.
//    6. RCPT022: Credit note item prices are auto-negated (ZIMRA requires this).
//    7. Response mirrors the ZIMRA receipt structure for easy receipt rendering.
//
//  Field limits from RevMax API v3.4.4:
//    - buyer.phone      → max 20 chars
//    - buyer.email      → valid email, max 100 chars
//    - hsCode           → max 8 characters (ITEMCODE limit)
//  Buyer TIN / VAT number are NOT format-validated here: ZIMRA and Lekuka/RSL
//  use different identifier formats and the authority rejects bad ones itself.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tax identifier shape: letters, digits and the separators real issuers use
//    (RSL TINs look like "200053040-8"). Length bound protects the column only.
const TAX_IDENTIFIER = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z][0-9A-Za-z\s\-/.]*$/, "Tax identifier may only contain letters, digits and - / . separators")
  .min(4, "Tax identifier looks too short — check for a truncated value")
  .max(20, "Tax identifier max 20 characters");

// ── Item-level tax type enum
//    Maps to ZIMRA taxID automatically — client never needs to know tax IDs.
//    STANDARD → company VAT rate (usually 15%)
//    ZERO_RATED → 0% (taxable, zero rated)
//    EXEMPT → 0% (not subject to VAT)

const TAX_TYPE = z.enum(["STANDARD", "ZERO_RATED", "EXEMPT"]).default("STANDARD");

const itemSchema = z.object({
  // ── REQUIRED ─────────────────────────────────────────────────────────────
  name:      z.string().min(1, "Item name cannot be empty"),
  quantity:  z.number().positive("Quantity must be greater than 0"),
  unitPrice: z.number().min(0, "Unit price cannot be negative"),

  // ── DEFAULTS (preselected list or company config) ─────────────────────────
  taxType:      TAX_TYPE,
  taxInclusive: z.boolean().default(false),  // true = unitPrice already includes VAT
  hsCode:       z.string().max(8, "HS code must be 8 characters or less").nullable().optional(),

  // ── OPTIONAL (client reference only — not sent to ZIMRA) ──────────────────
  sku:      z.string().nullable().optional(),
  discount: z.number().min(0).nullable().optional(),
  // ── LEKUKA additional taxes (levies) — pass-through ───────────────────────
  additionalTaxes: z.array(z.object({
    taxID: z.number(),
    taxType: z.enum(["PercentageLevy", "FixedValueLevy", "WithholdingTax"]),
    taxRate: z.number(),
    appliedForQuantity: z.number().optional(),
  })).optional(),
});

export const passThroughFiscalizeSchema = z.object({
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  REQUIRED
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  items: z.array(itemSchema).min(1, "At least one item is required"),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PRESELECTED LISTS — enum with default, client picks or omits
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  paymentMethod:   z.enum(["CASH", "CARD", "MOBILE", "TRANSFER", "BANK_TRANSFER", "ECOCASH", "ONE_MONEY", "EFT", "RTGS", "ZIPIT"]).default("CASH"),
  splitPayments:   z.array(z.object({ method: z.string(), amount: z.number() })).optional(),
  transactionType: z.enum(["FiscalInvoice", "CreditNote", "DebitNote"]).default("FiscalInvoice"),

  // Any ISO-4217 code. Which codes a device actually accepts is the fiscal
  // authority's call, not ours — an unknown code comes back as a readable 422.
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter ISO 4217 code, e.g. USD").optional(),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  OPTIONAL — server computes or defaults from company profile
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Buyer — all optional, defaults to company's default customer
  buyer: z.object({
    // Display name (fallback — stored as customerName on invoice)
    name:            z.string().nullable().optional(),
    registeredName:  z.string().nullable().optional(),
    tradeName:       z.string().nullable().optional(),
    // Identifiers — shape only. ZIMRA issues 10-digit TINs and 9-digit VAT
    // numbers; RSL issues e.g. "200053040-8" with 8-digit VAT, so digit-count
    // rules here would reject valid foreign identifiers. The authority checks them.
    tin:       TAX_IDENTIFIER.nullable().optional(),
    vatNumber: TAX_IDENTIFIER.nullable().optional(),
    // Contact — max lengths per RevMax API
    email:  z.string().trim().email("Invalid email address").max(100, "Email max 100 characters").nullable().optional(),
    phone:  z.string().trim().max(20, "Phone number max 20 characters").nullable().optional(),
    // Address — granular fields (TransactMExt style)
    province: z.string().nullable().optional(),
    street:   z.string().nullable().optional(),
    houseNo:  z.string().nullable().optional(),
    city:     z.string().nullable().optional(),
  }).optional(),

  invoiceNumber:        z.string().optional(), // Auto-generated (INV-XXXX / CN-XXXX) if absent
  date:                 z.string().optional(), // ISO date "YYYY-MM-DD"; defaults to today

  // ── Credit / Debit Note fields (required when transactionType ≠ FiscalInvoice) ──
  relatedInvoiceNumber: z.string().optional(), // Invoice number of the original (e.g. "INV-197")
  creditNoteReason:     z.string().optional(), // Why this correction is being issued

  // ── Offline Synchronization fields (used when bridging app signs offline) ──
  offlineSignature:            z.string().optional(),
  offlineReceiptCounter:       z.number().optional(),
  offlineGlobalReceiptCounter: z.number().optional(),
  offlinePreviousHash:         z.string().optional(),
  offlineFiscalDay:            z.number().optional(),
  offlineDate:                 z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/fiscalize
//
//  MINIMUM VIABLE REQUEST:
//    { "items": [{ "name": "Widget", "quantity": 1, "unitPrice": 100 }] }
//
//  CREDIT NOTE:
//    { "items": [...], "transactionType": "CreditNote",
//      "relatedInvoiceNumber": "INV-197", "creditNoteReason": "Goods returned" }
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  Lesotho lines quote the gateway's own tax table.
//
//  An RSL receipt names the taxID the device was registered against, and the
//  engine reads it from the tax type behind the line's product — a rate on the
//  line is not enough. ZIMRA takes the rate from the line instead, so none of
//  this runs for a Zimbabwe document.
// ─────────────────────────────────────────────────────────────────────────────

interface GatewayTaxRow {
  id: number;
  name: string;
  rate: string | number;
  lekukaTaxId?: string | null;
  lekukaTaxType?: string | null;
  lekukaEnvironment?: string | null;
}

type GatewayTaxRoles = Partial<Record<"VAT" | "NonVAT" | "Exempt", GatewayTaxRow>>;

const gatewayRate = (row: GatewayTaxRow) => Number(row.rate || 0);

/** Tax types the tenant synced from its gateway in this environment. */
function gatewayMappedRows(rows: GatewayTaxRow[], environment: string) {
  return rows.filter(
    (t) => t.lekukaTaxId && t.lekukaTaxType && (t.lekukaEnvironment || "test") === environment,
  );
}

function pickGatewayTaxRoles(rows: GatewayTaxRow[], environment: string): GatewayTaxRoles {
  const mapped = gatewayMappedRows(rows, environment);
  // Several gateway taxes can share a classification; the general rate is the
  // highest one, and for VAT that means goods rather than services.
  const byClassification = (kind: "VAT" | "NonVAT" | "Exempt") =>
    mapped
      .filter((t) => t.lekukaTaxType === kind)
      .sort((a, b) =>
        gatewayRate(b) - gatewayRate(a) ||
        Number(!/goods/i.test(a.name)) - Number(!/goods/i.test(b.name)) ||
        Number(a.lekukaTaxId) - Number(b.lekukaTaxId))[0];
  return { VAT: byClassification("VAT"), NonVAT: byClassification("NonVAT"), Exempt: byClassification("Exempt") };
}

const gatewayRoleFor = (taxType: "STANDARD" | "ZERO_RATED" | "EXEMPT"): "VAT" | "NonVAT" | "Exempt" =>
  taxType === "STANDARD" ? "VAT" : taxType === "ZERO_RATED" ? "NonVAT" : "Exempt";

const catalogueKey = (value?: string | null) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

router.post("/", async (req, res) => {
  // ── 1. Schema validation ─────────────────────────────────────────────────
  const parsed = passThroughFiscalizeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid request body",
      statusCode: 400,
      details: parsed.error.errors.map((e) => ({
        field:   e.path.join(".") || "(root)",
        message: e.message,
      })),
    });
  }

  const body    = parsed.data;
  const company = req.company as any;
  const isCorrectionNote = body.transactionType === "CreditNote" || body.transactionType === "DebitNote";

  // ── 2. Credit/Debit note early field validation ───────────────────────────
  if (isCorrectionNote) {
    if (!body.relatedInvoiceNumber) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `'relatedInvoiceNumber' is required for ${body.transactionType}. Provide the invoice number of the original invoice (e.g. "INV-197").`,
        statusCode: 400,
      });
    }
    if (!body.creditNoteReason) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `'creditNoteReason' is required for ${body.transactionType}. Describe why this correction is being issued.`,
        statusCode: 400,
      });
    }
  }

  // ── 3. Resolve company defaults and tax types ─────────────────────────────
  const companyTaxRate  = company.defaultTaxRate ?? 15.5;
  // An omitted currency is the company's own, not a hardcoded USD — otherwise a
  // ZWG/LSL company silently gets receipts issued in the wrong money. baseCurrencyOf
  // also catches a Lesotho tenant whose currency column is still the schema default.
  const companyCurrency = canonicalCurrency(body.currency) || canonicalCurrency(baseCurrencyOf(company));

  // A till may bill in a money its tenant keeps books in — nothing else. This code is
  // what the fiscal receipt carries, so an RSL device cannot be sent a currency the
  // gateway does not certify and a ZIMRA device not one FDMS rejects. A currency the
  // tenant switched off still counts: documents already issued in it must stay
  // correctable.
  const tenantCurrencies = await storage.getCurrencies(company.id);
  const accepted = Array.from(new Set([
    canonicalCurrency(baseCurrencyOf(company)),
    ...tenantCurrencies.map((c) => canonicalCurrency(c.code)),
  ])).filter(Boolean);

  // Loti is RSL money. Only an account on the Lesotho gateway fiscalises in it, so a
  // ZIMRA tenant cannot authorise loti by being handed a loti currency row.
  if (companyCurrency === "LSL" && !isLotiFiscalAccount(company)) {
    const local = accepted.filter((code) => code !== "LSL");
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `'LSL' is fiscalised only on a Lesotho (RSL) account and this is not one.${local.length ? ` Send ${local.join(", ")} or omit currency.` : ""} Move the sale to the Lesotho tenant if it was billed in loti.`,
      statusCode: 400,
      details: [{
        field:   "currency",
        message: "LSL requires a Lesotho account, received 'LSL'",
      }],
    });
  }

  if (body.currency && !accepted.includes(companyCurrency)) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: `This account fiscalises in ${accepted.join(", ")}. Send one of those or omit currency; '${companyCurrency}' is not one of the tenant's currencies.`,
      statusCode: 400,
      details: [{
        field:   "currency",
        message: `Expected one of ${accepted.join(", ")}, received '${companyCurrency}'`,
      }],
    });
  }

  // Declared here: referenced by the branch-settings lookup below before the
  // related-invoice resolution in step 6 (TDZ fix).
  let relatedInvoice:   any = null;

  // Fetch branch settings if applicable (for correction period override)
  let branchSettings: any = null;
  if (relatedInvoice?.branchId) {
    try {
      branchSettings = await storage.getBranch(relatedInvoice.branchId);
    } catch { /* non-fatal */ }
  }

  // Fetch actual tax types from database for proper tax ID mapping
  let dbTaxTypes = await storage.getTaxTypes(company.id);
  
  // Also fetch live ZIMRA config to avoid DB sync issues overriding rates
  const zimraConfig = await getCompanyZimraConfig(company.id, company, branchSettings);
  const liveTaxes = zimraConfig?.applicableTaxes || zimraConfig?.taxLevels || [];

  // Find tax types by zimraTaxId (ZIMRA standard IDs)
  const standardTax = dbTaxTypes.find(t => (t.zimraTaxId && ['3', '4', '515', '517'].includes(t.zimraTaxId) && Number(t.rate) > 0) || Number(t.rate) === 15.5);
  const zeroRatedTax = dbTaxTypes.find(t => (t.zimraTaxId && ['2'].includes(t.zimraTaxId)) || (Number(t.rate) === 0 && t.name.toLowerCase().includes('zero'))) || dbTaxTypes.find(t => Number(t.rate) === 0);
  const exemptTax = dbTaxTypes.find(t => (t.zimraTaxId && ['1', '3', '513'].includes(t.zimraTaxId) && Number(t.rate) === 0) || (Number(t.rate) === 0 && t.name.toLowerCase().includes('exempt'))) || dbTaxTypes.find(t => Number(t.rate) === 0);

  let standardTaxRate = standardTax?.rate ? Number(standardTax.rate) : companyTaxRate;
  let zeroRatedTaxRate = zeroRatedTax?.rate ? Number(zeroRatedTax.rate) : 0;
  let exemptTaxRate = exemptTax?.rate ? Number(exemptTax.rate) : 0;

  if (liveTaxes.length > 0) {
    const std = liveTaxes.find((t: any) => (t.taxID && [3, 4, 515, 517].includes(t.taxID) && Number(t.taxPercent) > 0) || Number(t.taxPercent) === 15.5);
    const zero = liveTaxes.find((t: any) => (t.taxID && [2].includes(t.taxID)) || (Number(t.taxPercent) === 0 && t.taxName?.toLowerCase().includes('zero'))) || liveTaxes.find((t: any) => Number(t.taxPercent) === 0);
    const exe = liveTaxes.find((t: any) => (t.taxID && [1, 3, 513].includes(t.taxID) && Number(t.taxPercent) === 0) || (Number(t.taxPercent) === 0 && t.taxName?.toLowerCase().includes('exempt'))) || liveTaxes.find((t: any) => Number(t.taxPercent) === 0);

    if (std?.taxPercent !== undefined) standardTaxRate = Number(std.taxPercent);
    if (zero?.taxPercent !== undefined) zeroRatedTaxRate = Number(zero.taxPercent);
    if (exe?.taxPercent !== undefined) exemptTaxRate = Number(exe.taxPercent);
  }

  // ── 3b. Lesotho documents take their rates from the RSL tax table ─────────
  //  The 15.5% default above is a Zimbabwe figure; an RSL receipt must carry the
  //  gateway's own rate against the gateway's own taxID or RCPT025 rejects it.
  let gatewayRoles: GatewayTaxRoles | null = null;
  const tenantGatewayRows = new Map<number, GatewayTaxRow>();
  if (isLotiFiscalAccount(company)) {
    const environment = company.zimraEnvironment === "production" ? "production" : "test";
    let roles = pickGatewayTaxRoles(dbTaxTypes, environment);

    if (!roles.VAT && company.fdmsDeviceId && company.zimraPrivateKey && company.zimraCertificate) {
      // Nothing on file names a taxID for this environment, so pull the gateway's
      // own table once — the same call "Sync Tax Config" makes.
      try {
        const { LekukaDevice } = await import("../../lekuka.js");
        const { getLekukaGatewayUrl } = await import("../../../shared/lekuka.js");
        const device = new LekukaDevice({
          baseUrl:     String(company.lekukaGatewayUrl || getLekukaGatewayUrl(environment as "test" | "production")).trim(),
          deviceId:    String(company.fdmsDeviceId).trim(),
          privateKey:  company.zimraPrivateKey,
          certificate: company.zimraCertificate,
        });
        const gatewayTaxes = (await device.getConfig())?.applicableTaxes || [];
        if (gatewayTaxes.length) {
          await storage.syncLekukaTaxes(company.id, gatewayTaxes, environment as "test" | "production");
          dbTaxTypes = await storage.getTaxTypes(company.id);
          roles = pickGatewayTaxRoles(dbTaxTypes, environment);
        }
      } catch { /* the readable refusal below is the fallback */ }
    }

    // VAT is always required: it is the general rate the receipt is bucketed by,
    // even on a document whose own lines are zero-rated or exempt.
    const needed = Array.from(new Set(["VAT" as const, ...body.items.map((i) => gatewayRoleFor(i.taxType))]));
    const missing = needed.filter((kind) => !roles[kind]);
    if (missing.length) {
      return res.status(422).json({
        error: "FISCAL_CONFIG_MISSING",
        message: `No ${missing.join(" / ")} tax from the ${environment} gateway is mapped for this account, so its lines cannot name a tax ID. Run "Sync Tax Config" for this environment (or re-register the device), then send the sale again.`,
        statusCode: 422,
        details: missing.map((kind) => ({ field: "items.taxType", message: `${kind} is not mapped to a gateway taxID` })),
      });
    }

    gatewayRoles = roles;
    for (const row of gatewayMappedRows(dbTaxTypes, environment)) tenantGatewayRows.set(row.id, row);
    standardTaxRate = gatewayRate(roles.VAT!);
    zeroRatedTaxRate = roles.NonVAT ? gatewayRate(roles.NonVAT) : 0;
    exemptTaxRate = roles.Exempt ? gatewayRate(roles.Exempt) : 0;
  }

  // taxType enum → numeric rate using database tax types
  const resolveTaxRate = (taxType: "STANDARD" | "ZERO_RATED" | "EXEMPT"): number => {
    if (taxType === "STANDARD") return standardTaxRate;
    if (taxType === "ZERO_RATED") return zeroRatedTaxRate;
    if (taxType === "EXEMPT") return exemptTaxRate;
    return companyTaxRate; // fallback
  };

  // taxType → default HS code using database tax types
  const resolveHsCode = (taxType: "STANDARD" | "ZERO_RATED" | "EXEMPT", override?: string | null): string => {
    if (override) return override.slice(0, 8); // enforce 8-char limit
    if (taxType === "ZERO_RATED") return zeroRatedTax?.defaultHsCode || "99002000";
    if (taxType === "EXEMPT")     return exemptTax?.defaultHsCode || "99003000";
    return standardTax?.defaultHsCode || "99001000"; // STANDARD
  };

  // ── 4. Process items ─────────────────────────────────────────────────────
  //  RCPT022: For CreditNotes, prices must be NEGATIVE.
  //  We store/submit the absolute value and let the fiscalization engine handle
  //  sign based on transactionType. The receiptLineType drives sign for ZIMRA.
  const priceSign = body.transactionType === "CreditNote" ? -1 : 1;

  // ── 3c. Fill in the catalogue an RSL document is issued against ───────────
  //  The till sends names and prices only, so each line needs a product — and
  //  that product's tax type has to be one of the gateway rows resolved above,
  //  because the engine reads the receipt's taxID off the line's product.
  const assignedTaxes: Array<{ productId: number; taxTypeId: number; taxRate: number }> = [];
  if (gatewayRoles) {
    const catalogue = new Map<string, any>();
    for (const p of await storage.getProducts(company.id)) {
      if (p.name) catalogue.set(catalogueKey(p.name), p);
      if (p.sku)  catalogue.set(catalogueKey(p.sku), p);
    }

    for (const item of body.items) {
      const declared = gatewayRoles[gatewayRoleFor(item.taxType)] as GatewayTaxRow;
      const known: any = (item.sku ? catalogue.get(catalogueKey(item.sku)) : undefined)
        || catalogue.get(catalogueKey(item.name));
      // A product the tenant already synced keeps its own tax: the catalogue
      // outranks the classification a foreign till guessed for it.
      const row = (known && tenantGatewayRows.get(Number(known.taxTypeId))) || declared;

      if (known) {
        if (!tenantGatewayRows.get(Number(known.taxTypeId))) {
          await storage.updateProduct(known.id, { taxTypeId: row.id, taxRate: gatewayRate(row).toFixed(2) });
        }
        assignedTaxes.push({ productId: known.id, taxTypeId: row.id, taxRate: gatewayRate(row) });
        continue;
      }

      const created = await storage.createProduct({
        companyId:   company.id,
        name:        item.name,
        sku:         item.sku ?? null,
        price:       Math.abs(item.unitPrice).toFixed(2),
        taxTypeId:   row.id,
        taxRate:     gatewayRate(row).toFixed(2),
        hsCode:      resolveHsCode(item.taxType, item.hsCode),
        productType: "good",
      } as any);
      catalogue.set(catalogueKey(item.name), created);
      if (item.sku) catalogue.set(catalogueKey(item.sku), created);
      assignedTaxes.push({ productId: created.id, taxTypeId: row.id, taxRate: gatewayRate(row) });
    }
  }

  const processedItems = body.items.map((item, index) => {
    const assigned = assignedTaxes[index];
    const taxRate = assigned ? assigned.taxRate : resolveTaxRate(item.taxType);
    const hsCode  = resolveHsCode(item.taxType, item.hsCode);

    let unitPriceExcl = Math.abs(item.unitPrice); // always work with positive internally

    if (item.taxInclusive && taxRate > 0) {
      unitPriceExcl = item.unitPrice / (1 + taxRate / 100);
    }

    let lineTotal = item.quantity * unitPriceExcl;

    if (item.discount && item.discount > 0) {
      lineTotal -= item.discount;
    }

    const lineTax     = lineTotal * (taxRate / 100);
    const displayPrice = item.unitPrice * priceSign; // negative for credit notes on receipt

    return {
      name:         item.name,
      quantity:     item.quantity,
      unitPrice:    parseFloat(unitPriceExcl.toFixed(4)),
      taxRate,
      taxType:      item.taxType,
      hsCode,
      sku:          item.sku,
      productId:    assigned?.productId,
      taxTypeId:    assigned?.taxTypeId,
      lineTotal:    parseFloat(lineTotal.toFixed(2)),
      lineTax:      parseFloat(lineTax.toFixed(2)),
      displayPrice,
      additionalTaxes: item.additionalTaxes,
    };
  });

  // ── 5. Server-authoritative totals ──────────────────────────────────────
  //  ZIMRA (RCPT027/RCPT037) computes tax per tax bucket on the aggregate net
  //  amount and rounds once per bucket. Rounding per line before summing
  //  produces totals that ZIMRA rejects as Red errors.
  const subtotal = processedItems.reduce((s, i) => s + i.lineTotal, 0);
  const taxByRate = new Map<number, number>();
  for (const item of processedItems) {
    taxByRate.set(item.taxRate, (taxByRate.get(item.taxRate) ?? 0) + item.lineTotal);
  }
  let taxAmount = 0;
  for (const [rate, bucketNet] of taxByRate.entries()) {
    taxAmount += Math.round(bucketNet * (rate / 100) * 100) / 100;
  }
  const total = parseFloat((subtotal + taxAmount).toFixed(2));

  // ── 6. Resolve related invoice (Credit/Debit Notes) ──────────────────────
  let relatedInvoiceId: number | undefined;
  if (isCorrectionNote && body.relatedInvoiceNumber) {
    const allInvoices = await storage.getInvoices(company.id);
    relatedInvoice = allInvoices.find(
      (inv: any) => inv.invoiceNumber === body.relatedInvoiceNumber
    );

    // A. Invoice must exist in this company
    if (!relatedInvoice) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: `Original invoice '${body.relatedInvoiceNumber}' not found. Ensure the invoice number is correct and belongs to your company.`,
        statusCode: 404,
      });
    }

    // B. Must be fiscalized
    if (!relatedInvoice.fiscalCode) {
      return res.status(422).json({
        error: "UNPROCESSABLE",
        message: `Original invoice '${body.relatedInvoiceNumber}' has not been fiscalized yet. Only fiscalized invoices can be corrected.`,
        statusCode: 422,
      });
    }

    // C. Currency must match (RCPT036 / RevMax error #50)
    if (relatedInvoice.currency && relatedInvoice.currency !== companyCurrency) {
      return res.status(422).json({
        error: "CURRENCY_MISMATCH",
        message: `${body.transactionType} currency (${companyCurrency}) does not match original invoice currency (${relatedInvoice.currency}). They must be the same.`,
        statusCode: 422,
      });
    }

    // D. Amount must not exceed original (RCPT035 / RevMax error #49)
    const originalTotal = parseFloat(relatedInvoice.total ?? "0");
    if (total > originalTotal) {
      return res.status(422).json({
        error: "AMOUNT_EXCEEDED",
        message: `${body.transactionType} amount (${total}) exceeds the original invoice amount (${originalTotal}). A correction cannot exceed the original value.`,
        statusCode: 422,
      });
    }

    // E. Must not be older than correction period (RCPT033)
    // Default to 12 months but can be configured via company/branch settings
    const correctionPeriodMonths = relatedInvoice.branchId 
      ? (await storage.getBranch(relatedInvoice.branchId))?.correctionPeriodMonths || company.correctionPeriodMonths || 12
      : company.correctionPeriodMonths || 12;
    const originalDate  = relatedInvoice.issueDate ? new Date(relatedInvoice.issueDate) : null;
    const correctionPeriodAgo = new Date();
    correctionPeriodAgo.setMonth(correctionPeriodAgo.getMonth() - correctionPeriodMonths);
    if (originalDate && originalDate < correctionPeriodAgo) {
      return res.status(422).json({
        error: "INVOICE_TOO_OLD",
        message: `Original invoice '${body.relatedInvoiceNumber}' is older than ${correctionPeriodMonths} months. Corrections cannot be issued after ${correctionPeriodMonths} months.`,
        statusCode: 422,
      });
    }

    relatedInvoiceId = relatedInvoice.id;
  }

  // ── 7. Resolve customer ─────────────────────────────────────────────────
  let customerId: number;
  try {
    const allCustomers = await storage.getCustomers(company.id);
    const buyerTin = body.buyer?.tin?.trim();
    const buyerVat = body.buyer?.vatNumber?.trim();

    const matchedCustomer = buyerTin
      ? allCustomers.find((c: any) => c.tin === buyerTin)
      : buyerVat
        ? allCustomers.find((c: any) => c.vatNumber === buyerVat)
        : null;

    if (matchedCustomer) {
      customerId = matchedCustomer.id;
    } else if (body.buyer && (body.buyer.name || body.buyer.registeredName || body.buyer.tradeName || body.buyer.tin || body.buyer.vatNumber || body.buyer.email || body.buyer.phone)) {
      const created = await storage.createCustomer({
        companyId: company.id,
        name: body.buyer.registeredName || body.buyer.tradeName || body.buyer.name || (buyerTin ? `Customer ${buyerTin}` : "Unknown Customer"),
        vatNumber: buyerVat || null,
        tin: buyerTin || null,
        phone: body.buyer.phone || null,
        email: body.buyer.email || null,
        address: [body.buyer.houseNo, body.buyer.street, body.buyer.city, body.buyer.province].filter(Boolean).join(", ") || null,
      } as any);
      customerId = created.id;
    } else {
      // Fallback to the default walk-in customer
      const existingWalkin = allCustomers.find((c: any) => c.name === "__walkin__");
      if (existingWalkin) {
        customerId = existingWalkin.id;
      } else {
        const created = await storage.createCustomer({
          companyId: company.id,
          name: "__walkin__",
          vatNumber: null, tin: null, phone: null, email: null, address: null,
        } as any);
        customerId = created.id;
      }
    }
  } catch {
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Could not resolve default customer",
      statusCode: 500,
    });
  }

  // ── 8. Invoice number ────────────────────────────────────────────────────
  let invoiceNumber: string;
  try {
    const prefix = body.transactionType === "CreditNote" ? "CN"
                 : body.transactionType === "DebitNote"  ? "DN"
                 : "INV";
    invoiceNumber = body.invoiceNumber ?? await storage.getNextInvoiceNumber(company.id, prefix);
  } catch {
    invoiceNumber = `${body.transactionType === "CreditNote" ? "CN" : body.transactionType === "DebitNote" ? "DN" : "INV"}-${Date.now()}`;
  }

  // ── 9. Duplicate invoice number check ────────────────────────────────────
  try {
    const allInvoices = await storage.getInvoices(company.id);
    const duplicate = allInvoices.find((inv: any) => inv.invoiceNumber === invoiceNumber);
    if (duplicate) {
      return res.status(409).json({
        error: "DUPLICATE_INVOICE",
        message: `Invoice number '${invoiceNumber}' already exists. Invoice numbers must be unique — provide a different 'invoiceNumber' or omit it to auto-generate.`,
        statusCode: 409,
      });
    }
  } catch { /* non-fatal, ZIMRA will reject duplicates anyway */ }

  // ── 10. Date ─────────────────────────────────────────────────────────────
  const issueDate    = body.date ? new Date(body.date) : new Date();
  const issueDateStr = issueDate.toISOString().split("T")[0];
  
  // Calculate due date based on company payment terms
  const calculateDueDate = (baseDate: Date, paymentTerms?: string | null): Date => {
    const dueDate = new Date(baseDate);
    if (!paymentTerms) return dueDate; // Default to same day if no terms
    
    // Parse payment terms (e.g., "NET 30", "NET 60", "EOM", "15 DAYS")
    const terms = paymentTerms.toUpperCase();
    const daysMatch = terms.match(/(\d+)\s*DAYS?/);
    const netMatch = terms.match(/NET\s*(\d+)/);
    
    let daysToAdd = 0;
    if (daysMatch) {
      daysToAdd = parseInt(daysMatch[1]);
    } else if (netMatch) {
      daysToAdd = parseInt(netMatch[1]);
    } else if (terms.includes('EOM')) {
      // End of month
      dueDate.setMonth(dueDate.getMonth() + 1);
      dueDate.setDate(0); // Last day of next month
      return dueDate;
    }
    
    if (daysToAdd > 0) {
      dueDate.setDate(dueDate.getDate() + daysToAdd);
    }
    
    return dueDate;
  };
  
  const dueDate = calculateDueDate(issueDate, company.defaultPaymentTerms);

  // ── 11. Build ZIMRA-aligned buyer data ───────────────────────────────────
  const buyerDisplayName = body.buyer?.registeredName ?? body.buyer?.tradeName ?? body.buyer?.name ?? null;
  const buyerAddress = (body.buyer?.street || body.buyer?.city || body.buyer?.province || body.buyer?.houseNo)
    ? [body.buyer?.houseNo, body.buyer?.street, body.buyer?.city, body.buyer?.province]
        .filter(Boolean).join(", ")
    : null;

  // ── 12. Persist invoice ──────────────────────────────────────────────────
  let invoice: any;
  try {
    invoice = await storage.createInvoice({
      companyId:        company.id,
      customerId,
      invoiceNumber,
      issueDate,
      dueDate:          dueDate,
      currency:         companyCurrency,
      taxInclusive:     false, // always store tax-exclusive after normalisation
      paymentMethod:    body.paymentMethod,
      splitPayments:    body.splitPayments ?? null,
      transactionType:  body.transactionType,
      subtotal:         subtotal.toFixed(2),
      taxAmount:        taxAmount.toFixed(2),
      total:            total.toFixed(2),
      status:           "pending",
      notes:            body.creditNoteReason ?? null,
      relatedInvoiceId: relatedInvoiceId ?? null,
      customerName:     buyerDisplayName,
      buyerVat:         body.buyer?.vatNumber ?? null,
      buyerTin:         body.buyer?.tin       ?? null,
      fiscalSignature:      body.offlineSignature ?? null,
      receiptCounter:       body.offlineReceiptCounter ?? null,
      receiptGlobalNo:      body.offlineGlobalReceiptCounter ?? null,
      fiscalDayNo:          body.offlineFiscalDay ?? null,
      offlinePreviousHash:  body.offlinePreviousHash ?? null,
      offlineDate:          body.offlineDate ?? null,
      items: processedItems.map((item) => ({
        description: item.name,
        quantity:    item.quantity.toString(),
        unitPrice:   item.unitPrice.toString(),
        taxRate:     item.taxRate.toString(),
        lineTotal:   item.lineTotal.toFixed(2),
        hsCode:      item.hsCode,
        // Only an RSL document carries a product and a gateway tax type; a
        // Zimbabwe line is stored exactly as before, rate on the line.
        ...(item.productId ? { productId: item.productId, taxTypeId: item.taxTypeId } : {}),
        modifiers:   item.additionalTaxes ? { additionalTaxes: item.additionalTaxes } : undefined,
      })),
    } as any);
  } catch (err: any) {
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to save invoice: " + err.message,
      statusCode: 500,
    });
  }

  // The number a till sends is the one already printed on its customer's receipt,
  // and it is what a later correction will be filed under. Storage keeps its own
  // sequence for every other caller, so the document takes the requested number
  // before anything is signed or submitted.
  if (body.invoiceNumber) {
    if (invoice.invoiceNumber !== invoiceNumber) {
      try {
        invoice = await storage.updateInvoice(invoice.id, { invoiceNumber } as any);
      } catch (err: any) {
        try { await storage.deleteInvoice(invoice.id); } catch { /* already unreachable */ }
        return res.status(500).json({
          error: "INTERNAL_ERROR",
          message: `Saved the document as '${invoice.invoiceNumber}' but could not rename it to '${invoiceNumber}': ${err.message}`,
          statusCode: 500,
        });
      }
    }
  } else {
    // Nothing was asked for, so the number storage drew from the company sequence
    // is the document's — the receipt, the response and the ledger must agree.
    invoiceNumber = invoice.invoiceNumber;
  }

  // ── 13. Fiscalize ────────────────────────────────────────────────────────
  try {
    const fiscal = await processInvoiceFiscalization(invoice.id, company.id, undefined, false, undefined, false);

    // Build ZIMRA-aligned receipt lines for response
    const receiptLineType = body.transactionType === "CreditNote" ? "Refund" : "Sale";
    const receiptLines = processedItems.map((item, idx) => ({
      receiptLineNo:       idx + 1,
      receiptLineName:     item.name,
      receiptLineType,
      receiptLineQuantity: item.quantity,
      receiptLinePrice:    item.displayPrice,  // signed (negative for credit notes)
      receiptLineTotal:    parseFloat((item.lineTotal * priceSign).toFixed(2)),
      receiptLineHSCode:   item.hsCode,
      taxPercent:          item.taxRate,
    }));

    const roundSignedMoney = (value: number) => {
      const sign = value < 0 ? -1 : 1;
      return sign * (Math.round(Math.abs(value) * 100) / 100);
    };

    // Aggregate taxes by rate from signed line totals to match ZIMRA rounding.
    const taxMap = new Map<number, number>();
    for (const item of processedItems) {
      taxMap.set(item.taxRate, (taxMap.get(item.taxRate) ?? 0) + (item.lineTotal * priceSign));
    }
    const receiptTaxes = Array.from(taxMap.entries()).map(([pct, signedSubtotal]) => {
      const taxAmount = roundSignedMoney(signedSubtotal * (pct / 100));
      return {
        taxPercent: pct,
        taxAmount,
        salesAmountWithTax: roundSignedMoney(signedSubtotal + taxAmount),
      };
    });

    const buyerTin = body.buyer?.tin?.trim();
    // ZIMRA buyerData is optional, but buyerTIN is mandatory when buyerData is submitted.
    const fallbackName = buyerDisplayName ?? (buyerTin ? "Customer" : null);
    const buyerData = fallbackName && buyerTin ? {
      buyerRegisterName: body.buyer?.registeredName ?? fallbackName,
      buyerTradeName:    body.buyer?.tradeName      ?? fallbackName,
      ...(body.buyer?.vatNumber ? { vatNumber: body.buyer.vatNumber } : {}),
      buyerTIN: buyerTin,
      ...((body.buyer?.phone || body.buyer?.email) ? {
        buyerContacts: {
          ...(body.buyer?.phone ? { phoneNo: body.buyer.phone } : {}),
          ...(body.buyer?.email ? { email:   body.buyer.email } : {}),
        }
      } : {}),
      ...(buyerAddress ? {
        buyerAddress: {
          ...(body.buyer?.street   ? { street:   body.buyer.street   } : {}),
          ...(body.buyer?.houseNo  ? { houseNo:  body.buyer.houseNo  } : {}),
          ...(body.buyer?.city     ? { city:     body.buyer.city     } : {}),
          ...(body.buyer?.province ? { province: body.buyer.province } : {}),
        }
      } : {}),
    } : undefined;

    const getZimraPaymentMethodCode = (methodName: string): 'Cash' | 'Card' | 'Other' | 'BankTransfer' | 'MobileWallet' => {
        const m = methodName.toUpperCase();
        if (['CASH'].includes(m)) return 'Cash';
        if (['CARD', 'SWIPE', 'POS', 'CREDIT_CARD', 'DEBIT_CARD'].includes(m)) return 'Card';
        if (['MOBILE', 'ECOCASH', 'ONE_MONEY', 'TELE_CASH', 'MOBILEWALLET', 'EcoCash', 'OneMoney'].includes(m)) return 'MobileWallet';
        if (['EFT', 'RTGS', 'TRANSFER', 'ZIPIT', 'BANKTRANSFER', 'BANK_TRANSFER', 'WIRE'].includes(m)) return 'BankTransfer';
        return 'Other';
    };

    let receiptPayments: Array<{ moneyTypeCode: string, paymentAmount: number }> = [];
    if (body.splitPayments && Array.isArray(body.splitPayments) && body.splitPayments.length > 0) {
        receiptPayments = body.splitPayments.map(p => ({
            moneyTypeCode: getZimraPaymentMethodCode(p.method),
            paymentAmount: parseFloat(p.amount.toFixed(2))
        }));
    } else {
        receiptPayments = [{
            moneyTypeCode: getZimraPaymentMethodCode(body.paymentMethod || 'CASH'),
            paymentAmount: total
        }];
    }

    return res.status(200).json({
      success: true,
      // ── Fiscal proof — store these permanently ────────────────────────────
      fiscalCode:    fiscal.fiscalCode,   // SHA-256 hash for verification
      qrCode:        fiscal.qrCodeData,   // Render this on the receipt
      receiptNumber: fiscal.receiptGlobalNo,
      // ── ZIMRA-aligned receipt — ready to render ───────────────────────────
      receipt: {
        invoiceNo:               invoiceNumber,
        receiptDate:             issueDateStr,
        receiptType:             body.transactionType,
        receiptCurrency:         companyCurrency,
        receiptTotal:            total * priceSign, // negative for credit notes
        receiptCounter:          fiscal.receiptCounter,
        receiptGlobalNo:         fiscal.receiptGlobalNo,
        fiscalDayNo:             fiscal.fiscalDayNo,
        receiptLinesTaxInclusive: false,
        buyerData,
        receiptLines,
        receiptTaxes,
        receiptPayments,
        ...(body.creditNoteReason ? { receiptNotes: body.creditNoteReason } : {}),
      },
    });

  } catch (err: any) {
    // Clean up orphaned invoice so client can retry safely
    try { await storage.deleteInvoice(invoice.id); } catch { /* ignore */ }

    if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
      return res.status(422).json({
        error:      "FISCALIZATION_FAILED",
        message:    err.message,
        statusCode: 422,
        issues:     err.issues,
        hint:       "Fix the listed preflight issues, then retry.",
      });
    }

    const hint =
      err.message?.includes("device") || err.message?.includes("ZIMRA") || err.message?.includes("fiscal day")
        ? "Ensure your fiscal device is registered and a fiscal day is open."
        : "Check your item data and retry.";

    return res.status(422).json({
      error:      "FISCALIZATION_FAILED",
      message:    err.message,
      statusCode: 422,
      hint,
    });
  }
});

export default router;
