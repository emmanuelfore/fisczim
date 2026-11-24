import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { db } from "../../db.js";
import { products } from "../../../shared/schema.js";
import { baseCurrencyOf } from "../../../shared/currency.js";
import { eq, and, ne, isNotNull } from "drizzle-orm";
import { logAction } from "../../audit.js";
import {
  assertEditableDraft,
  assertUserCompanyAccess,
  createAuthoritativeInvoice,
  enforceIssueApproval,
  fiscalizeIssuedInvoice,
  resolveInvoiceContext,
  toErrorBody,
} from "./invoice-authority.js";

// --- Zod Schemas ---

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  productId: z.number().int().positive().optional(),
  taxRate: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
});

/** Client-supplied totals are accepted only to be checked against our own arithmetic. */
const declaredAmounts = {
  subtotal: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
};

export const createInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).min(1),
  customerId: z.number().int().positive().optional(),
  issueDate: z.string().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE", "TRANSFER"]).optional(),
  splitPayments: z.array(z.object({ method: z.string(), amount: z.number() })).optional(),
  notes: z.string().optional(),
  relatedInvoiceId: z.number().int().positive().optional(),
  transactionType: z.enum(["FiscalInvoice", "CreditNote", "DebitNote"]).optional(),
  ...declaredAmounts,
  salesOrderId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  costCenterId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
});

export const updateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).min(1).optional(),
  customerId: z.number().int().positive().optional(),
  issueDate: z.string().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE", "TRANSFER"]).optional(),
  splitPayments: z.array(z.object({ method: z.string(), amount: z.number() })).optional(),
  notes: z.string().optional(),
  relatedInvoiceId: z.number().int().positive().optional(),
  transactionType: z.enum(["FiscalInvoice", "CreditNote", "DebitNote"]).optional(),
  ...declaredAmounts,
  salesOrderId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  costCenterId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
});

// --- Router ---

const router = Router();

// POST / — create an issued invoice through the authoritative gate
router.post("/", async (req, res) => {
  try {
    // 1. Validate request body
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Request body validation failed",
        statusCode: 400,
        details: parsed.error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
    }

    const body = parsed.data;
    // Company comes from the authenticated API key (or verified user membership),
    // never from the body. Any `companyId` in the body is deliberately ignored.
    const context = resolveInvoiceContext(req, (req.body as any)?.companyId);
    await assertUserCompanyAccess(context, req);
    const company = context.company;

    // 2. Resolve per-item tax rate and hsCode; compute lineTotals server-side
    const mappedItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      hsCode: string | null;
      lineTotal: number;
      discountAmount: number;
      productId?: number;
    }> = [];

    for (const item of body.items) {
      let taxRate: number;
      let hsCode: string | null = null;

      if (item.productId) {
        const [product] = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.id, item.productId),
              eq(products.companyId, company.id)
            )
          );

        if (!product) {
          return res.status(400).json({
            error: "VALIDATION_ERROR",
            message: `Product with id ${item.productId} not found`,
            statusCode: 400,
          });
        }

        taxRate = parseFloat(product.taxRate ?? "15.5");
        hsCode = product.hsCode ?? null;

        if (!hsCode || hsCode === "0000.00.00") {
          const categoryMatch = await db
            .select()
            .from(products)
            .where(
              and(
                eq(products.companyId, company.id),
                product.category ? eq(products.category, product.category) : eq(products.name, product.name),
                isNotNull(products.hsCode),
                ne(products.hsCode, "0000.00.00")
              )
            )
            .limit(1);

          if (categoryMatch.length > 0) {
            hsCode = categoryMatch[0].hsCode;
          } else {
            hsCode = "99999999";
          }
        }
      } else {
        taxRate = item.taxRate ?? company.defaultTaxRate ?? 15.5;
        hsCode = "99999999";
      }

      const discountAmount = item.discountAmount ?? 0;
      const grossLine = item.quantity * item.unitPrice;
      if (discountAmount > grossLine) {
        return res.status(422).json({
          error: "DISCOUNT_EXCEEDS_LINE_TOTAL",
          message: "A line discount cannot exceed the line total",
          statusCode: 422,
        });
      }
      const lineTotal = grossLine - discountAmount;
      mappedItems.push({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate,
        hsCode,
        lineTotal,
        discountAmount,
        productId: item.productId,
      });
    }

    // 3. Compute invoice-level totals (Req 3.5)
    const subtotal = mappedItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const taxAmount = mappedItems.reduce(
      (sum, i) => sum + i.lineTotal * (i.taxRate / 100),
      0
    );
    const total = subtotal + taxAmount;
    const discountAmount = mappedItems.reduce((sum, i) => sum + i.discountAmount, 0);

    // 4. Generate invoice number
    let invoiceNumber: string;
    try {
      const prefix =
        body.transactionType === "CreditNote"
          ? "CN"
          : body.transactionType === "DebitNote"
          ? "DN"
          : "INV";
      invoiceNumber = await storage.getNextInvoiceNumber(company.id, prefix);
    } catch {
      invoiceNumber = "INV-" + Date.now();
    }

    const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();

    // 5. Approve, dimension-resolve, de-duplicate, create and fiscalize in one gate.
    // No invoice row is written when an approval submission is returned.
    const result = await createAuthoritativeInvoice(
      context,
      {
        customerId: body.customerId ?? null,
        invoiceNumber,
        issueDate,
        dueDate: issueDate,
        currency: baseCurrencyOf(company),
        taxInclusive: company.taxInclusive ?? false,
        paymentMethod: body.paymentMethod ?? "CASH",
        splitPayments: body.splitPayments ?? null,
        transactionType: body.transactionType ?? "FiscalInvoice",
        relatedInvoiceId: body.relatedInvoiceId ?? null,
        notes: body.notes ?? null,
        subtotal,
        taxAmount,
        total,
        discountAmount,
        salesOrderId: body.salesOrderId,
        departmentId: body.departmentId,
        costCenterId: body.costCenterId,
        locationId: body.locationId,
        items: mappedItems.map((item) => ({
          productId: item.productId ?? null,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          taxRate: item.taxRate.toString(),
          lineTotal: item.lineTotal.toFixed(2),
          discountAmount: item.discountAmount.toFixed(2),
          hsCode: item.hsCode,
        })),
      },
      { subtotal: body.subtotal, taxAmount: body.taxAmount, total: body.total },
    );

    if (result.kind === "approval") {
      return res.status(202).json({
        status: "pending_approval",
        requiresApproval: true,
        approvalType: result.type,
        approvalId: result.approval?.id ?? null,
        approval: result.approval ?? null,
        message:
          result.type === "discount"
            ? "Discount submitted for approval; no invoice was created"
            : "Invoice issuance submitted for approval; no invoice was created",
      });
    }

    const { invoice, fiscalization } = result;
    // 6. Respond 201 with InvoiceResponse (Req 3.1)
    return res.status(201).json({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      transactionType: invoice.transactionType,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      fiscalCode: invoice.fiscalCode ?? null,
      qrCodeData: invoice.qrCodeData ?? null,
      receiptGlobalNo: invoice.receiptGlobalNo ?? null,
      receiptCounter: invoice.receiptCounter ?? null,
      fiscalDayNo: invoice.fiscalDayNo ?? null,
      companyId: invoice.companyId,
      customerId: invoice.customerId ?? null,
      notes: invoice.notes ?? null,
      fiscalizationStatus: fiscalization.status,
      ...(fiscalization.status === "retry_pending"
        ? { fiscalizationError: fiscalization.error, retryable: true }
        : {}),
    });
  } catch (err: any) {
    const body = toErrorBody(err);
    return res.status(body.statusCode).json(body);
  }
});

// GET / — list invoices (paginated) (Task 5.3, Req 3.7)
router.get("/", async (req, res) => {
  const company = req.company as any;

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
  const rawLimit = parseInt((req.query.limit as string) ?? "20", 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));

  try {
    const result = await storage.getInvoicesPaginated(company.id, page, limit);
    return res.status(200).json({
      data: result.data.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        transactionType: inv.transactionType,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        subtotal: inv.subtotal,
        taxAmount: inv.taxAmount,
        total: inv.total,
        fiscalCode: inv.fiscalCode ?? null,
        qrCodeData: inv.qrCodeData ?? null,
        receiptGlobalNo: inv.receiptGlobalNo ?? null,
        receiptCounter: inv.receiptCounter ?? null,
        fiscalDayNo: inv.fiscalDayNo ?? null,
        companyId: inv.companyId,
        customerId: inv.customerId ?? null,
        relatedInvoiceId: inv.relatedInvoiceId ?? null,
        relatedInvoiceNumber: inv.relatedInvoiceNumber ?? null,
        linkedDocuments: inv.linkedDocuments ?? [],
        notes: inv.notes ?? null,
      })),
      total: result.total,
      pages: result.pages,
      page,
      limit,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to list invoices: " + err.message,
      statusCode: 500,
    });
  }
});

// GET /:id — get single invoice (Task 5.4, Req 3.8, 3.9)
router.get("/:id", async (req, res) => {
  const company = req.company as any;
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Invoice not found",
      statusCode: 404,
    });
  }

  const invoice = await storage.getInvoice(id);

  if (!invoice || invoice.companyId !== company.id) {
    return res.status(404).json({
      error: "NOT_FOUND",
      message: "Invoice not found",
      statusCode: 404,
    });
  }

  return res.status(200).json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    transactionType: invoice.transactionType,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    fiscalCode: invoice.fiscalCode ?? null,
    qrCodeData: invoice.qrCodeData ?? null,
    receiptGlobalNo: invoice.receiptGlobalNo ?? null,
    receiptCounter: invoice.receiptCounter ?? null,
    fiscalDayNo: invoice.fiscalDayNo ?? null,
    companyId: invoice.companyId,
    customerId: invoice.customerId ?? null,
    notes: invoice.notes ?? null,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      lineTotal: item.lineTotal,
      productId: item.productId ?? null,
    })),
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          email: invoice.customer.email ?? null,
          phone: invoice.customer.phone ?? null,
          vatNumber: invoice.customer.vatNumber ?? null,
          tin: invoice.customer.tin ?? null,
        }
      : undefined,
  });
});

// PUT /:id — update only a true draft/unposted invoice
router.put("/:id", async (req, res) => {
  try {
    const context = resolveInvoiceContext(req, (req.body as any)?.companyId);
    await assertUserCompanyAccess(context, req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Invoice not found",
        statusCode: 404,
      });
    }

    const invoice = await storage.getInvoice(id);

    if (!invoice || invoice.companyId !== context.companyId) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Invoice not found",
        statusCode: 404,
      });
    }

    // Draft-only guard: rejects issued/paid/fiscalized/posted invoices.
    await assertEditableDraft(context.companyId, invoice);

    const parsed = updateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Request body validation failed",
        statusCode: 400,
        details: parsed.error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
    }

    const body = parsed.data;

    const updated = await storage.updateInvoice(id, {
      customerId: body.customerId,
      issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
      dueDate: body.issueDate ? new Date(body.issueDate) : undefined,
      paymentMethod: body.paymentMethod,
      transactionType: body.transactionType,
      relatedInvoiceId: body.relatedInvoiceId,
      notes: body.notes,
    } as any);

    await logAction(
      context.companyId,
      context.principal.userId || "system",
      "INVOICE_DRAFT_UPDATED",
      "invoice",
      String(id),
      { fields: Object.keys(body) },
      (req as any).ip,
    );

    return res.status(200).json({
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      status: updated.status,
      transactionType: updated.transactionType,
      issueDate: updated.issueDate,
      dueDate: updated.dueDate,
      currency: updated.currency,
      subtotal: updated.subtotal,
      taxAmount: updated.taxAmount,
      total: updated.total,
      fiscalCode: updated.fiscalCode ?? null,
      qrCodeData: updated.qrCodeData ?? null,
      receiptGlobalNo: updated.receiptGlobalNo ?? null,
      receiptCounter: updated.receiptCounter ?? null,
      fiscalDayNo: updated.fiscalDayNo ?? null,
      companyId: updated.companyId,
      customerId: updated.customerId ?? null,
      notes: updated.notes ?? null,
    });
  } catch (err: any) {
    const body = toErrorBody(err);
    return res.status(body.statusCode).json(body);
  }
});

// DELETE /:id — delete only a true draft/unposted invoice
router.delete("/:id", async (req, res) => {
  try {
    const context = resolveInvoiceContext(req, (req.body as any)?.companyId);
    await assertUserCompanyAccess(context, req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Invoice not found",
        statusCode: 404,
      });
    }

    const invoice = await storage.getInvoice(id);

    if (!invoice || invoice.companyId !== context.companyId) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Invoice not found",
        statusCode: 404,
      });
    }

    await assertEditableDraft(context.companyId, invoice);

    await storage.deleteInvoice(id);
    await logAction(
      context.companyId,
      context.principal.userId || "system",
      "INVOICE_DRAFT_DELETED",
      "invoice",
      String(id),
      { invoiceNumber: invoice.invoiceNumber },
      (req as any).ip,
    );
    return res.status(204).send();
  } catch (err: any) {
    const body = toErrorBody(err);
    return res.status(body.statusCode).json(body);
  }
});

// POST /:id/fiscalize — fiscalize invoice (Task 5.7, Req 4.1–4.5)
router.post("/:id/fiscalize", async (req, res) => {
  try {
    const context = resolveInvoiceContext(req, (req.body as any)?.companyId);
    await assertUserCompanyAccess(context, req);
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Invoice not found",
        statusCode: 404,
      });
    }

    const invoice = await storage.getInvoice(id);

    if (!invoice || invoice.companyId !== context.companyId) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Invoice not found",
        statusCode: 404,
      });
    }

    if (invoice.fiscalCode !== null) {
      return res.status(409).json({
        error: "ALREADY_FISCALIZED",
        message: "Invoice has already been fiscalized",
        statusCode: 409,
        fiscalCode: invoice.fiscalCode,
      });
    }

    // Fiscalization is an issuance action: the central gate must allow it first.
    // A 202 submission means nothing was fiscalized and no job was enqueued.
    const gate = await enforceIssueApproval(context, {
      amount: Number(invoice.total || 0),
      title: `Invoice issuance: ${invoice.invoiceNumber}`,
      description: "Fiscalization requested through the v1 API",
      payload: {
        invoiceData: {
          id: invoice.id,
          companyId: context.companyId,
          invoiceNumber: invoice.invoiceNumber,
          total: invoice.total,
        },
        invoiceId: invoice.id,
      },
      referenceType: "invoice_fiscalize",
      referenceId: String(invoice.id),
    });
    if (gate.requiresApproval) {
      await logAction(
        context.companyId,
        context.principal.userId || "system",
        "INVOICE_FISCALIZE_SUBMITTED",
        "invoice",
        String(invoice.id),
        { approvalId: gate.request?.id },
        (req as any).ip,
      );
      return res.status(202).json({
        status: "pending_approval",
        requiresApproval: true,
        approvalType: "invoice_issue",
        approvalId: gate.request?.id ?? null,
        approval: gate.request ?? null,
        message: "Fiscalization submitted for approval; no receipt was issued",
      });
    }

    const outcome = await fiscalizeIssuedInvoice(context, id);
    if (outcome.status === "retry_pending") {
      await logAction(
        context.companyId,
        context.principal.userId || "system",
        "FISCALIZATION_RETRY_REQUESTED",
        "invoice",
        String(id),
        { error: outcome.error, jobId: outcome.jobId },
        (req as any).ip,
      );
      return res.status(422).json({
        error: "FISCALIZATION_FAILED",
        message: outcome.error,
        statusCode: 422,
        retryable: true,
        fiscalizationStatus: "retry_pending",
        ...(outcome.jobId ? { jobId: outcome.jobId } : {}),
      });
    }

    const result = outcome.result;
    const fiscalized = await storage.getInvoice(id);

    return res.status(200).json({
      invoiceId: id,
      invoiceNumber: fiscalized?.invoiceNumber ?? invoice.invoiceNumber,
      fiscalCode: fiscalized?.fiscalCode ?? result?.fiscalCode ?? "",
      qrCodeData: fiscalized?.qrCodeData ?? result?.qrCodeData ?? "",
      receiptGlobalNo: fiscalized?.receiptGlobalNo ?? result?.receiptGlobalNo ?? null,
      receiptCounter: fiscalized?.receiptCounter ?? result?.receiptCounter ?? null,
      fiscalDayNo: fiscalized?.fiscalDayNo ?? result?.fiscalDayNo ?? null,
      fiscalizationStatus: "completed",
    });
  } catch (err: any) {
    const body = toErrorBody(err);
    return res.status(body.statusCode).json(body);
  }
});

export default router;
