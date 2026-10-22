import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { processInvoiceFiscalization, getCompanyZimraConfig } from "../../lib/fiscalization.js";

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
//  Validation rules from RevMax API v3.4.4:
//    - buyer.tin        → exactly 10 digits
//    - buyer.vatNumber  → exactly 9 digits
//    - buyer.phone      → valid phone, max 20 chars
//    - buyer.email      → valid email, max 100 chars
//    - hsCode           → max 8 characters (ITEMCODE limit)
// ─────────────────────────────────────────────────────────────────────────────

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
  currency:        z.enum(["USD", "ZWG"]).default("USD"),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  OPTIONAL — server computes or defaults from company profile
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Buyer — all optional, defaults to company's default customer
  buyer: z.object({
    // Display name (fallback — stored as customerName on invoice)
    name:            z.string().nullable().optional(),
    registeredName:  z.string().nullable().optional(),
    tradeName:       z.string().nullable().optional(),
    // Identifiers — validated per RevMax API rules
    vatNumber: z.string().regex(/^\d{9}$/, "VAT number must be exactly 9 digits").optional(),
    tin:       z.string().regex(/^\d{10}$/, "TIN must be exactly 10 digits").optional(),
    // Contact — max lengths per RevMax API
    email:  z.string().email("Invalid email address").max(100, "Email max 100 characters").optional(),
    phone:  z.string().max(20, "Phone number max 20 characters").optional(),
    // Address — granular fields (TransactMExt style)
    province: z.string().optional(),
    street:   z.string().optional(),
    houseNo:  z.string().optional(),
    city:     z.string().optional(),
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
  const companyCurrency = body.currency; // enum with default "USD"

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
  const dbTaxTypes = await storage.getTaxTypes(company.id);
  
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

  const processedItems = body.items.map((item) => {
    const taxRate = resolveTaxRate(item.taxType);
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
      lineTotal:    parseFloat(lineTotal.toFixed(2)),
      lineTax:      parseFloat(lineTax.toFixed(2)),
      displayPrice,
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
  // TEMPORARY: Always default to __walkin__ customer regardless of buyer details.
  // The actual buyer resolution / customer creation is commented out below.
  // TODO: Re-enable when buyer detail handling is finalised.
  let customerId: number;
  try {
    const allCustomers = await storage.getCustomers(company.id);

    // // ── COMMENTED OUT: match by TIN / VAT or create new customer from buyer data ──
    // const buyerTin = body.buyer?.tin?.trim();
    // const buyerVat = body.buyer?.vatNumber?.trim();
    // const matchedCustomer = buyerTin
    //   ? allCustomers.find((c: any) => c.tin === buyerTin)
    //   : buyerVat
    //     ? allCustomers.find((c: any) => c.vatNumber === buyerVat)
    //     : null;
    // if (matchedCustomer) {
    //   customerId = matchedCustomer.id;
    // } else if (body.buyer && (body.buyer.name || body.buyer.registeredName || body.buyer.tradeName || body.buyer.tin || body.buyer.vatNumber || body.buyer.email || body.buyer.phone)) {
    //   const created = await storage.createCustomer({
    //     companyId: company.id,
    //     name: body.buyer.registeredName || body.buyer.tradeName || body.buyer.name || (buyerTin ? `Customer ${buyerTin}` : "Unknown Customer"),
    //     vatNumber: buyerVat || null,
    //     tin: buyerTin || null,
    //     phone: body.buyer.phone || null,
    //     email: body.buyer.email || null,
    //     address: [body.buyer.houseNo, body.buyer.street, body.buyer.city, body.buyer.province].filter(Boolean).join(", ") || null,
    //   } as any);
    //   customerId = created.id;
    // } else {

    // Always use / create the default walk-in customer
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

    // // ── END COMMENTED OUT ──
    // }
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
      })),
    } as any);
  } catch (err: any) {
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to save invoice: " + err.message,
      statusCode: 500,
    });
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

    // TEMPORARY: Always send no buyerData to ZIMRA — default customer only.
    // The actual buyerData construction from buyer details is commented out below.
    // TODO: Re-enable when buyer detail handling is finalised.
    const buyerData = undefined;

    // // ── COMMENTED OUT: build ZIMRA buyerData from provided buyer fields ──
    // const buyerTin = body.buyer?.tin?.trim();
    // // ZIMRA buyerData is optional, but buyerTIN is mandatory when buyerData is submitted.
    // const fallbackName = buyerDisplayName ?? (buyerTin ? "Customer" : null);
    // const buyerData = fallbackName && buyerTin ? {
    //   buyerRegisterName: body.buyer?.registeredName ?? fallbackName,
    //   buyerTradeName:    body.buyer?.tradeName      ?? fallbackName,
    //   ...(body.buyer?.vatNumber ? { vatNumber: body.buyer.vatNumber } : {}),
    //   buyerTIN: buyerTin,
    //   ...((body.buyer?.phone || body.buyer?.email) ? {
    //     buyerContacts: {
    //       ...(body.buyer?.phone ? { phoneNo: body.buyer.phone } : {}),
    //       ...(body.buyer?.email ? { email:   body.buyer.email } : {}),
    //     }
    //   } : {}),
    //   ...(buyerAddress ? {
    //     buyerAddress: {
    //       ...(body.buyer?.street   ? { street:   body.buyer.street   } : {}),
    //       ...(body.buyer?.houseNo  ? { houseNo:  body.buyer.houseNo  } : {}),
    //       ...(body.buyer?.city     ? { city:     body.buyer.city     } : {}),
    //       ...(body.buyer?.province ? { province: body.buyer.province } : {}),
    //     }
    //   } : {}),
    // } : undefined;
    // // ── END COMMENTED OUT ──

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
        ? "Ensure your ZIMRA device is registered and the fiscal day is open."
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
