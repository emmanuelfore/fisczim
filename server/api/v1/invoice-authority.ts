/**
 * Local authoritative gate for the v1 invoice entry points.
 *
 * These routers are reached with an API key, so the company is always taken
 * from the verified key context (`req.company`). Nothing in the request body
 * can select a tenant. All business records issued through these routes go
 * through `createAuthoritativeInvoice` so approval, dimensions, SO de-dupe and
 * fiscalisation cannot be skipped by a caller.
 */
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage.js";
import { logAction } from "../../audit.js";
import { APPROVAL_TYPES } from "../../../shared/permissions.js";
import {
  fiscalizationJobs,
  invoices,
  journalEntries,
  payments,
  salesOrders,
  salesOrderItems,
  salesPickLists,
  salesPickListItems,
} from "../../../shared/schema.js";
import { requireApprovalOrContinue } from "../../lib/approval-gate.js";
import { resolveInvoiceAnalytics } from "../../lib/departmental.js";
import { processInvoiceFiscalization } from "../../lib/fiscalization.js";
import {
  CORRECTABLE_INVOICE_STATUSES,
  DRAFT_INVOICE_STATUSES,
  invoiceImmutableReasons,
} from "../../lib/invoice-lifecycle.js";

export class InvoiceAuthorityError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "InvoiceAuthorityError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function toErrorBody(err: unknown) {
  if (err instanceof InvoiceAuthorityError) {
    return {
      error: err.code,
      message: err.message,
      statusCode: err.statusCode,
      ...(err.details === undefined ? {} : { details: err.details }),
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { error: "INTERNAL_ERROR", message, statusCode: 500 };
}

export type InvoicePrincipal = {
  userId: string | null;
  isSuperAdmin: boolean;
  isApiKey: boolean;
};

export type InvoiceContext = {
  companyId: number;
  company: any;
  principal: InvoicePrincipal;
};

/** Company and actor are resolved from the request context, never from the body. */
export function resolveInvoiceContext(req: any, _bodyCompanyId?: unknown): InvoiceContext {
  const company = req?.company;
  const companyId = Number(company?.id);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new InvoiceAuthorityError(
      "AUTHENTICATION_REQUIRED",
      "An authenticated company context is required",
      401,
    );
  }

  // Any `companyId` in the body is deliberately ignored: only the verified API
  // key / membership context above can select the tenant.

  const user = req?.user;
  const userId = user?.id ? String(user.id) : null;

  return {
    companyId,
    company,
    principal: {
      userId,
      isSuperAdmin: !!user?.isSuperAdmin,
      isApiKey: !!user?.isApiKey && !userId,
    },
  };
}

/** Checks membership for session users. API keys are already bound to a company. */
export async function assertUserCompanyAccess(context: InvoiceContext, req: any): Promise<void> {
  const user = req?.user;
  if (!context.principal.userId || user?.isSuperAdmin) return;
  const memberships = await storage.getCompanies(context.principal.userId);
  if (!memberships?.some((membership: any) => Number(membership.id) === context.companyId)) {
    throw new InvoiceAuthorityError(
      "COMPANY_ACCESS_DENIED",
      "You do not have access to this company",
      403,
    );
  }
}

export type ApprovalOutcome =
  | { requiresApproval: false; request: null }
  | { requiresApproval: true; request: any };

async function gateInvoiceAction(
  action: "invoice_issue" | "discount",
  context: InvoiceContext,
  input: {
    amount: number;
    title: string;
    description: string;
    payload: Record<string, unknown>;
    referenceType: string;
    referenceId?: string;
  },
): Promise<ApprovalOutcome> {
  // A verified company API key authorizes the integration to act for that company.
  if (context.principal.isApiKey) {
    return { requiresApproval: false, request: null };
  }

  if (!context.principal.userId) {
    throw new InvoiceAuthorityError(
      "AUTHENTICATION_REQUIRED",
      "An authenticated user or company API key is required",
      401,
    );
  }

  try {
    const gate = await requireApprovalOrContinue({
      userId: context.principal.userId,
      companyId: context.companyId,
      isSuperAdmin: context.principal.isSuperAdmin,
      type: action === "invoice_issue" ? APPROVAL_TYPES.INVOICE_ISSUE : APPROVAL_TYPES.DISCOUNT,
      amount: input.amount,
      title: input.title,
      description: input.description,
      payload: input.payload,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    });
    return gate as ApprovalOutcome;
  } catch (err: any) {
    if (err?.statusCode) {
      throw new InvoiceAuthorityError(
        err.code || "APPROVAL_DENIED",
        err.message,
        Number(err.statusCode),
      );
    }
    throw err;
  }
}

export function enforceIssueApproval(
  context: InvoiceContext,
  input: Omit<Parameters<typeof gateInvoiceAction>[2], never>,
): Promise<ApprovalOutcome> {
  return gateInvoiceAction("invoice_issue", context, input);
}

export function enforceDiscountApproval(
  context: InvoiceContext,
  input: Omit<Parameters<typeof gateInvoiceAction>[2], never>,
): Promise<ApprovalOutcome> {
  return gateInvoiceAction("discount", context, input);
}

export function assertDeclaredTotals(
  declared: { subtotal?: unknown; taxAmount?: unknown; total?: unknown },
  computed: { subtotal: number; taxAmount: number; total: number },
): void {
  const mismatches: Array<{ field: string; expected: string; received: string }> = [];
  const check = (field: "subtotal" | "taxAmount" | "total", received: unknown, expected: number) => {
    if (received === undefined || received === null || received === "") return;
    const value = Number(received);
    if (!Number.isFinite(value) || Math.abs(value - expected) > 0.011) {
      mismatches.push({ field, expected: expected.toFixed(2), received: String(received) });
    }
  };
  check("subtotal", declared.subtotal, computed.subtotal);
  check("taxAmount", declared.taxAmount, computed.taxAmount);
  check("total", declared.total, computed.total);

  if (mismatches.length) {
    throw new InvoiceAuthorityError(
      "AMOUNT_MISMATCH",
      "Client-supplied amounts do not match the server-computed invoice amounts",
      422,
      mismatches,
    );
  }
}

/** One active invoice per sales order; mirrors the DB partial unique index. */
export async function assertSalesOrderAvailable(
  companyId: number,
  salesOrderId: number | null | undefined,
): Promise<void> {
  if (!salesOrderId || !Number.isFinite(Number(salesOrderId))) return;

  let existing: any[];
  try {
    existing = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          eq(invoices.salesOrderId, Number(salesOrderId)),
          ne(invoices.status, "cancelled"),
        ),
      );
  } catch (err: any) {
    if (err instanceof InvoiceAuthorityError) throw err;
    throw new InvoiceAuthorityError(
      "SALES_ORDER_CHECK_FAILED",
      err?.message || "Could not verify sales order invoice uniqueness",
      500,
    );
  }

  if (existing.length > 0) {
    throw new InvoiceAuthorityError(
      "DUPLICATE_SALES_ORDER_INVOICE",
      "An active invoice already exists for this sales order",
      409,
      { invoice: existing[0], salesOrderId: Number(salesOrderId) },
    );
  }
}

export async function resolveInvoiceDimensions(
  context: InvoiceContext,
  input: { departmentId?: unknown; costCenterId?: unknown; locationId?: unknown },
  items: Array<{ productId?: unknown }>,
): Promise<{ departmentId: number | null; costCenterId: number | null } | null> {
  try {
    const dimensions = await resolveInvoiceAnalytics(
      context.companyId,
      {
        departmentId: input.departmentId as any,
        costCenterId: input.costCenterId as any,
        locationId: input.locationId as any,
      },
      items.map((item) => ({ productId: item.productId as any })),
    );
    return dimensions ?? null;
  } catch (err: any) {
    throw new InvoiceAuthorityError(
      "DIMENSION_REQUIRED",
      err?.message || "Department and cost centre are required for this transaction",
      Number(err?.statusCode) || 422,
    );
  }
}

export type AuthoritativeInvoiceInput = {
  invoiceNumber?: string | null;
  customerId: number | null;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  taxInclusive: boolean;
  paymentMethod: string;
  splitPayments?: unknown;
  transactionType: string;
  relatedInvoiceId?: number | null;
  notes?: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  discountAmount: number;
  items: any[];
  salesOrderId?: number | null;
  departmentId?: number | null;
  costCenterId?: number | null;
  locationId?: number | null;
  /** Additional storage columns (buyer data, offline fields, etc.). */
  extra?: Record<string, unknown>;
};

export type FiscalizationOutcome =
  | { status: "completed"; result: any }
  | { status: "retry_pending"; error: string; jobId?: number }
  | { status: "deferred" };

export type CreationResult =
  | { kind: "approval"; type: "invoice_issue" | "discount"; approval: any }
  | { kind: "invoice"; invoice: any; fiscalization: FiscalizationOutcome };

function isUniqueViolation(err: any): boolean {
  const code = String(err?.code || "");
  return code === "23505" || /unique|duplicate/i.test(String(err?.message || ""));
}

/** Creates an issued invoice only after all local and central gates succeed. */
export async function createAuthoritativeInvoice(
  context: InvoiceContext,
  input: AuthoritativeInvoiceInput,
  declaredTotals: { subtotal?: unknown; taxAmount?: unknown; total?: unknown } = {},
  options: { deferFiscalization?: boolean } = {},
): Promise<CreationResult> {
  assertDeclaredTotals(declaredTotals, {
    subtotal: input.subtotal,
    taxAmount: input.taxAmount,
    total: input.total,
  });

  const dimensions = await resolveInvoiceDimensions(context, input, input.items);
  await assertSalesOrderAvailable(context.companyId, input.salesOrderId);

  if (input.salesOrderId) {
    const [order] = await db.select().from(salesOrders).where(and(
      eq(salesOrders.id, input.salesOrderId),
      eq(salesOrders.companyId, context.companyId),
    )).limit(1);
    if (!order || ["pending", "rejected"].includes(order.approvalStatus || "") ||
        order.status !== "dispatched" || order.customerId !== input.customerId) {
      throw new InvoiceAuthorityError("INVALID_SALES_ORDER", "An approved, dispatched order for this customer is required", 422);
    }
    const picked = await db.select({
      productId: salesOrderItems.productId,
      quantity: salesPickListItems.pickedQuantity,
      invoicedQuantity: salesOrderItems.invoicedQuantity,
    }).from(salesPickLists)
      .innerJoin(salesPickListItems, eq(salesPickListItems.pickListId, salesPickLists.id))
      .innerJoin(salesOrderItems, and(
        eq(salesOrderItems.id, salesPickListItems.salesOrderItemId),
        eq(salesOrderItems.salesOrderId, salesPickLists.salesOrderId),
      ))
      .where(and(
        eq(salesPickLists.companyId, context.companyId),
        eq(salesPickLists.salesOrderId, order.id),
        eq(salesPickLists.status, "DISPATCHED"),
      ));
    const dispatched = new Map<number | null, number>();
    for (const item of picked) {
      const quantity = Math.max(0, Number(item.quantity) - Number(item.invoicedQuantity));
      dispatched.set(item.productId, (dispatched.get(item.productId) ?? 0) + quantity);
    }
    for (const item of input.items) {
      const productId = item.productId ?? null;
      const quantity = Number(item.quantity);
      const remaining = (dispatched.get(productId) ?? 0) - quantity;
      if (!Number.isFinite(quantity) || quantity <= 0 || remaining < -0.000001) {
        throw new InvoiceAuthorityError("QUANTITY_EXCEEDS_DISPATCH", "Invoice quantities must be covered by the dispatched pick list", 422);
      }
      dispatched.set(productId, remaining);
    }
  }

  const invoiceData: Record<string, any> = {
    ...(input.extra || {}),
    companyId: context.companyId,
    createdBy: context.principal.userId,
    customerId: input.customerId,
    invoiceNumber: input.invoiceNumber ?? undefined,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency,
    taxInclusive: input.taxInclusive,
    paymentMethod: input.paymentMethod,
    splitPayments: input.splitPayments ?? null,
    transactionType: input.transactionType,
    relatedInvoiceId: input.relatedInvoiceId ?? null,
    notes: input.notes ?? null,
    subtotal: input.subtotal.toFixed(2),
    taxAmount: input.taxAmount.toFixed(2),
    total: input.total.toFixed(2),
    discountAmount: input.discountAmount.toFixed(2),
    salesOrderId: input.salesOrderId ?? null,
    ...(dimensions || {}),
    status: "issued",
    // Client `isPos` flags are ignored: they are not an approval bypass.
    isPos: false,
    isFiscalized: false,
    items: input.items,
  };

  const approvalPayload = {
    invoiceData: { ...invoiceData, issueDate: input.issueDate.toISOString(), dueDate: input.dueDate.toISOString() },
    items: input.items,
  };

  const issueGate = await enforceIssueApproval(context, {
    amount: input.total,
    title: `Invoice issuance${input.invoiceNumber ? `: ${input.invoiceNumber}` : ""}`,
    description: input.notes || "Invoice issuance requested through the v1 API",
    payload: approvalPayload,
    referenceType: "invoice_draft",
  });
  if (issueGate.requiresApproval) {
    await logAction(
      context.companyId,
      context.principal.userId || "system",
      "INVOICE_ISSUE_SUBMITTED",
      "invoice",
      undefined,
      { approvalId: issueGate.request?.id, total: input.total },
    );
    return { kind: "approval", type: "invoice_issue", approval: issueGate.request };
  }

  if (input.discountAmount > 0) {
    const discountGate = await enforceDiscountApproval(context, {
      amount: input.discountAmount,
      title: `Approve discount of ${input.discountAmount.toFixed(2)}`,
      description: "A discount was applied and must be authorised before the invoice is issued.",
      payload: approvalPayload,
      referenceType: "discount",
    });
    if (discountGate.requiresApproval) {
      await logAction(
        context.companyId,
        context.principal.userId || "system",
        "INVOICE_DISCOUNT_SUBMITTED",
        "invoice",
        undefined,
        { approvalId: discountGate.request?.id, discountAmount: input.discountAmount },
      );
      return { kind: "approval", type: "discount", approval: discountGate.request };
    }
  }

  let invoice: any;
  try {
    invoice = await storage.createInvoice(invoiceData as any);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw new InvoiceAuthorityError(
        "DUPLICATE_SALES_ORDER_INVOICE",
        "An active invoice already exists for this sales order",
        409,
      );
    }
    throw new InvoiceAuthorityError(
      "INVOICE_CREATE_FAILED",
      err?.message || "Failed to create invoice",
      500,
    );
  }

  await logAction(
    context.companyId,
    context.principal.userId || "system",
    "INVOICE_ISSUED",
    "invoice",
    String(invoice.id),
    { invoiceNumber: invoice.invoiceNumber, total: invoice.total, salesOrderId: input.salesOrderId },
  );

  const fiscalization: FiscalizationOutcome = options.deferFiscalization
    ? { status: "deferred" }
    : await fiscalizeIssuedInvoice(context, invoice.id);
  return { kind: "invoice", invoice, fiscalization };
}

/** Enqueues a durable job and processes it with the shared fiscalization engine. */
export async function fiscalizeIssuedInvoice(
  context: InvoiceContext,
  invoiceId: number,
  options: { isPos?: boolean } = {},
): Promise<{ status: "completed"; result: any } | { status: "retry_pending"; error: string; jobId?: number }> {
  const now = new Date();
  let jobId: number | undefined;
  try {
    const [latest] = await db
      .select({ id: fiscalizationJobs.id, status: fiscalizationJobs.status })
      .from(fiscalizationJobs)
      .where(eq(fiscalizationJobs.invoiceId, invoiceId))
      .orderBy(desc(fiscalizationJobs.id));

    if (latest?.id) {
      jobId = latest.id;
      await db
        .update(fiscalizationJobs)
        .set({
          status: "processing",
          leaseUntil: new Date(Date.now() + 5 * 60 * 1000),
          lastErrorMessage: null,
          updatedAt: now,
        })
        .where(eq(fiscalizationJobs.id, latest.id));
    } else {
      const [created] = await db
        .insert(fiscalizationJobs)
        .values({
          invoiceId,
          status: "processing",
          leaseUntil: new Date(Date.now() + 5 * 60 * 1000),
          nextAttemptAt: now,
        })
        .returning({ id: fiscalizationJobs.id });
      jobId = created?.id;
    }
  } catch (err: any) {
    // A missing job row must never silently skip fiscalization: surface it as a
    // retryable failure and let the worker sweep pick the invoice up.
    await logAction(
      context.companyId,
      context.principal.userId || "system",
      "FISCALIZATION_ENQUEUE_FAILED",
      "invoice",
      String(invoiceId),
      { error: err?.message || String(err) },
    );
    return { status: "retry_pending", error: err?.message || "Could not enqueue fiscalization" };
  }

  try {
    const result = await processInvoiceFiscalization(
      invoiceId,
      context.companyId,
      context.principal.userId ?? undefined,
      context.principal.isSuperAdmin,
      undefined,
      options.isPos ?? false,
    );
    await db
      .update(fiscalizationJobs)
      .set({ status: "completed", completedAt: new Date(), lastErrorMessage: null, updatedAt: new Date() })
      .where(eq(fiscalizationJobs.id, jobId!));
    await logAction(
      context.companyId,
      context.principal.userId || "system",
      "INVOICE_FISCALIZED",
      "invoice",
      String(invoiceId),
      { fiscalCode: (result as any)?.fiscalCode ?? null },
    );
    return { status: "completed", result };
  } catch (err: any) {
    const message = err?.message || String(err);
    // Device outage/contention: keep a durable pending job and a readable
    // invoice state. The worker retries; the invoice is never deleted.
    await db
      .update(fiscalizationJobs)
      .set({
        status: "pending",
        leaseUntil: null,
        lastErrorMessage: message,
        nextAttemptAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      })
      .where(eq(fiscalizationJobs.id, jobId!));
    try {
      await storage.updateInvoice(invoiceId, {
        fdmsStatus: "Pending",
        lastValidationAttempt: new Date(),
      } as any);
    } catch {
      // Job row is the authoritative retry state; invoice status is best-effort.
    }
    await logAction(
      context.companyId,
      context.principal.userId || "system",
      "FISCALIZATION_RETRY_PENDING",
      "invoice",
      String(invoiceId),
      { error: message, jobId },
    );
    return { status: "retry_pending", error: message, jobId };
  }
}

async function assertInvoiceUnposted(companyId: number, invoice: any): Promise<void> {
  const immutableReasons = invoiceImmutableReasons(invoice);
  if (immutableReasons.length > 0) {
    throw new InvoiceAuthorityError(
      "INVOICE_ALREADY_FISCALIZED",
      "Cannot modify an invoice that has been fiscalized or posted",
      422,
      { reasons: immutableReasons },
    );
  }

  let postedJournal: any[] = [];
  let linkedPayments: any[] = [];
  try {
    postedJournal = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.companyId, companyId),
          eq(journalEntries.referenceType, "INVOICE"),
          eq(journalEntries.referenceId, String(invoice.id)),
          ne(journalEntries.status, "VOID"),
          ne(journalEntries.status, "CANCELLED"),
        ),
      );
    linkedPayments = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.companyId, companyId), eq(payments.invoiceId, invoice.id)));
  } catch (err: any) {
    throw new InvoiceAuthorityError(
      "INVOICE_POSTING_CHECK_FAILED",
      err?.message || "Could not verify that the invoice is unposted",
      500,
    );
  }

  if (postedJournal.length || linkedPayments.length) {
    throw new InvoiceAuthorityError(
      "INVOICE_HAS_POSTINGS",
      "Cannot modify an invoice with posted ledger entries or payments",
      409,
      { journalEntries: postedJournal.length, payments: linkedPayments.length },
    );
  }
}

/**
 * Issued invoices remain correctable until fiscal/ledger evidence exists. This
 * is what lets a failed ZIMRA preflight be repaired and submitted again.
 */
export async function assertEditableInvoice(companyId: number, invoice: any): Promise<void> {
  const status = String(invoice?.status || "").toLowerCase();
  if (!CORRECTABLE_INVOICE_STATUSES.has(status)) {
    throw new InvoiceAuthorityError(
      "INVOICE_NOT_EDITABLE",
      `Cannot modify an invoice in ${invoice?.status || "unknown"} status; only draft, quote or unposted issued invoices are editable`,
      422,
    );
  }
  await assertInvoiceUnposted(companyId, invoice);
}

/** Stricter guard for destructive operations: only true drafts may be deleted. */
export async function assertEditableDraft(companyId: number, invoice: any): Promise<void> {
  const status = String(invoice?.status || "").toLowerCase();
  if (!DRAFT_INVOICE_STATUSES.has(status)) {
    throw new InvoiceAuthorityError(
      "INVOICE_NOT_EDITABLE",
      `Cannot delete an invoice in ${invoice?.status || "unknown"} status; only drafts and quotations are deletable`,
      422,
    );
  }
  await assertInvoiceUnposted(companyId, invoice);
}
