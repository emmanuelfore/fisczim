import { and, eq, ne } from "drizzle-orm";
import {
  invoices,
  insertExpenseSchema,
  insertPaymentSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertQuotationSchema,
  insertQuotationItemSchema,
  insertSupplierPaymentSchema,
  insertSupplierSchema,
  leaveBalances,
  leaveRequests,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequisitions,
  quotations,
  salesOrderItems,
  salesOrders,
} from "../../shared/schema.js";
import { type ApprovalType } from "../../shared/permissions.js";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { requireDepartmentalDimensions } from "./departmental.js";
import { enqueueApprovedInvoiceFiscalization } from "./approved-invoice-fiscalization.js";

type Payload = Record<string, unknown>;

function obj(value: unknown, field: string): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Approval payload.${field} is required`);
  }
  return value as Payload;
}

function arr(value: unknown, field: string): Payload[] {
  if (!Array.isArray(value)) throw new Error(`Approval payload.${field} must be an array`);
  return value as Payload[];
}

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function finalizeQuotation(companyId: number, payload: Payload, referenceId?: string) {
  if (referenceId) {
    const [updated] = await db.update(quotations)
      .set({ status: "approved" })
      .where(and(eq(quotations.id, Number(referenceId)), eq(quotations.companyId, companyId)))
      .returning();
    if (!updated) throw new Error("Quotation not found");
    return { quotationId: updated.id, quotationNumber: updated.quotationNumber, message: "Quotation approved" };
  }

  const data = obj(payload.quotationData, "quotationData");
  const analytics = await requireDepartmentalDimensions(companyId, data);
  const quotation = await storage.createQuotation({
    ...insertQuotationSchema.parse({ ...data, companyId, ...(analytics || {}) }),
    items: arr(payload.items, "items").map((item) => insertQuotationItemSchema.parse(item)),
  } as any);
  return { quotationId: quotation.id, quotationNumber: quotation.quotationNumber, message: "Quotation created" };
}

async function finalizeSalesOrder(companyId: number, payload: Payload, referenceId?: string, userId?: string) {
  if (referenceId) {
    const [updated] = await db.update(salesOrders)
      .set({
        status: "confirmed",
        approvalStatus: "approved",
        approvedBy: userId || null,
        approvedAt: new Date(),
        approvalNotes: typeof payload.reviewNotes === "string" ? payload.reviewNotes : null,
      })
      .where(and(eq(salesOrders.id, Number(referenceId)), eq(salesOrders.companyId, companyId)))
      .returning();
    if (!updated) throw new Error("Sales order not found");
    return { salesOrderId: updated.id, orderNumber: updated.orderNumber, message: "Sales order approved" };
  }

  const orderData = obj(payload.orderData, "orderData");
  const items = arr(payload.items, "items");
  const analytics = await requireDepartmentalDimensions(companyId, orderData);
  const orderCustomerId = orderData.customerId ? Number(orderData.customerId) : undefined;
  const orderTotal = Number(orderData.total || 0);
  if (Number.isFinite(orderCustomerId) && orderTotal > 0) {
    await storage.assertCustomerCreditWithinLimit(companyId, orderCustomerId!, orderTotal);
  }
  const created = await db.transaction(async (tx) => {
    const [order] = await tx.insert(salesOrders).values({
      ...orderData,
      ...(analytics || {}),
      companyId,
      orderNumber: String(orderData.orderNumber || `SO-${Date.now()}`),
      status: "confirmed",
      approvalStatus: "approved",
      approvedBy: userId || null,
      approvedAt: new Date(),
    } as any).returning();
    if (items.length) {
      await tx.insert(salesOrderItems).values(items.map((item) => ({ ...item, salesOrderId: order.id })) as any);
    }
    return order;
  });
  return { salesOrderId: created.id, orderNumber: created.orderNumber, message: "Sales order created" };
}

async function markRequisitionConverted(
  companyId: number,
  requisitionId: unknown,
  purchaseOrderId: number,
) {
  const id = Number(requisitionId);
  if (!Number.isInteger(id) || id <= 0) return;
  await db.update(purchaseRequisitions)
    .set({ status: "CONVERTED", purchaseOrderId, updatedAt: new Date() })
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.companyId, companyId)));
}

async function finalizePurchaseOrder(companyId: number, payload: Payload, referenceId?: string, userId?: string) {
  // A requisition-originated PO carries a symbolic reference id so the approval
  // inbox can link it back; only a numeric reference means an existing PO is
  // being approved after the fact.
  const purchaseOrderId = Number(referenceId);
  if (referenceId && Number.isInteger(purchaseOrderId) && purchaseOrderId > 0) {
    const [updated] = await db.update(purchaseOrders)
      .set({ status: "SENT", updatedAt: new Date() })
      .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
      .returning();
    if (!updated) throw new Error("Purchase order not found");
    await markRequisitionConverted(companyId, payload.requisitionId, updated.id);
    return { purchaseOrderId: updated.id, poNumber: updated.poNumber, message: "Purchase order approved" };
  }

  const data = obj(payload.purchaseOrderData, "purchaseOrderData");
  const items = arr(payload.items, "items");
  const analytics = await requireDepartmentalDimensions(companyId, data);
  const created = await db.transaction(async (tx) => {
    const [order] = await tx.insert(purchaseOrders).values(insertPurchaseOrderSchema.parse({
      ...data,
      ...(analytics || {}),
      companyId,
      createdBy: userId,
      status: "SENT",
      poNumber: String(data.poNumber || `PO-${Date.now()}`),
    })).returning();
    await tx.insert(purchaseOrderItems).values(items.map((item) => insertPurchaseOrderItemSchema.parse({
      ...item,
      purchaseOrderId: order.id,
    })));
    return order;
  });
  await markRequisitionConverted(companyId, payload.requisitionId, created.id);
  return { purchaseOrderId: created.id, poNumber: created.poNumber, message: "Purchase order created" };
}

async function registerSupplier(companyId: number, payload: Payload) {
  const data = obj(payload.supplierData, "supplierData");
  const supplier = await storage.createSupplier(insertSupplierSchema.parse({ ...data, companyId }) as any);
  return { supplierId: supplier.id, message: "Supplier registered" };
}

export async function createInvoiceFromApproval(
  companyId: number,
  payload: Payload,
  userId?: string,
  transactionType?: string,
) {
  const data = obj(payload.invoiceData, "invoiceData");
  const items = Array.isArray(payload.items) && payload.items.length > 0
    ? payload.items as Payload[]
    : Array.isArray(data.items) ? data.items as Payload[] : [];

  const isImmediateCashSale = data.isPos === true && String(data.paymentMethod || "").toUpperCase() !== "CREDIT";
  const customerId = data.customerId ? Number(data.customerId) : undefined;
  const invoiceTotal = Number(data.total || 0);
  if (!isImmediateCashSale && Number.isFinite(customerId) && invoiceTotal > 0) {
    await storage.assertCustomerCreditWithinLimit(companyId, customerId!, invoiceTotal);
  }

  const salesOrderId = data.salesOrderId ? Number(data.salesOrderId) : undefined;
  if (Number.isFinite(salesOrderId)) {
    const [existing] = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.salesOrderId, salesOrderId!),
        ne(invoices.status, "cancelled"),
      ))
      .limit(1);
    if (existing) {
      throw new Error(`An active invoice (${existing.invoiceNumber}) already exists for this sales order`);
    }
  }

  const analytics = await requireDepartmentalDimensions(companyId, data);
  const invoice = await storage.createInvoice({
    ...data,
    ...(analytics || {}),
    companyId,
    createdBy: userId,
    status: "issued",
    transactionType: transactionType || data.transactionType || undefined,
    issueDate: dateOrNull(data.issueDate) || new Date(),
    dueDate: dateOrNull(data.dueDate) || new Date(),
    items,
  } as any);

  await enqueueApprovedInvoiceFiscalization(invoice.id, companyId, userId);

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    message: "Invoice issued and queued for fiscalization",
  };
}

async function createCreditNote(companyId: number, payload: Payload, userId?: string) {
  const invoice = await createInvoiceFromApproval(companyId, payload, userId, "CreditNote");
  return { creditNoteId: invoice.invoiceId, invoiceNumber: invoice.invoiceNumber, message: "Credit note issued" };
}

async function executePayment(companyId: number, payload: Payload, userId?: string) {
  const data = obj(payload.paymentData, "paymentData");
  const analytics = await requireDepartmentalDimensions(companyId, data);
  const payment = await storage.createPayment({
    ...insertPaymentSchema.parse({ ...data, ...(analytics || {}) }),
    companyId,
    createdBy: userId,
    paymentDate: dateOrNull(data.paymentDate) || new Date(),
    amount: String(data.amount),
    exchangeRate: data.exchangeRate ? String(data.exchangeRate) : "1.000000",
  } as any);
  return { paymentId: payment.id, message: "Payment executed" };
}

async function executeSupplierPayment(companyId: number, payload: Payload, userId?: string) {
  const data = obj(payload.supplierPaymentData, "supplierPaymentData");
  const analytics = await requireDepartmentalDimensions(companyId, data);
  const payment = await storage.createSupplierPayment(insertSupplierPaymentSchema.parse({
    ...data,
    ...(analytics || {}),
    paymentDate: dateOrNull(data.paymentDate) || new Date(),
    createdBy: userId || null,
  }) as any);
  return { supplierPaymentId: payment.id, message: "Supplier payment executed" };
}

async function postExpense(companyId: number, payload: Payload) {
  const data = obj(payload.expenseData, "expenseData");
  const analytics = await requireDepartmentalDimensions(companyId, data);
  const expense = await storage.createExpense(insertExpenseSchema.parse({
    ...data,
    ...(analytics || {}),
    companyId,
    expenseDate: dateOrNull(data.expenseDate) || new Date(),
    amount: String(data.amount),
  }) as any);
  return { expenseId: expense.id, message: "Expense posted" };
}

async function approveLeave(companyId: number, payload: Payload, referenceId?: string, userId?: string) {
  const leaveId = Number(referenceId || payload.leaveRequestId);
  if (!leaveId) throw new Error("The approval request has no leave request attached");
  const [request] = await db.select().from(leaveRequests)
    .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.companyId, companyId)))
    .limit(1);
  if (!request) throw new Error("Leave request not found");

  return await db.transaction(async (tx) => {
    const [updated] = await tx.update(leaveRequests)
      .set({ status: "APPROVED", approvedBy: userId || null, approvedAt: new Date() })
      .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.companyId, companyId)))
      .returning();
    const [balance] = await tx.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, request.employeeId), eq(leaveBalances.leaveType, request.leaveType)))
      .limit(1);
    if (balance) {
      const used = Number(balance.usedDays) + request.totalDays;
      const available = Number(balance.accruedDays) - used;
      await tx.update(leaveBalances)
        .set({ usedDays: used.toFixed(2), availableDays: available.toFixed(2) })
        .where(eq(leaveBalances.id, balance.id));
    }
    return { leaveRequestId: updated.id, status: updated.status, message: "Leave approved" };
  });
}

async function requisitionIdFrom(payload: Payload, referenceId?: string): Promise<number> {
  const id = Number(referenceId || payload.requisitionId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Purchase requisition not found in approval payload");
  return id;
}

async function decidePurchaseRequisition(
  companyId: number,
  payload: Payload,
  referenceId: string | undefined,
  userId: string,
  decision: "APPROVED" | "REJECTED",
  reviewNotes?: string,
) {
  const id = await requisitionIdFrom(payload, referenceId);
  const [updated] = await db.update(purchaseRequisitions)
    .set({
      status: decision,
      approvedBy: decision === "APPROVED" ? userId : null,
      approvedAt: decision === "APPROVED" ? new Date() : null,
      rejectionReason: decision === "REJECTED" ? reviewNotes || "Rejected by approver" : null,
      updatedAt: new Date(),
    })
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.companyId, companyId)))
    .returning();
  if (!updated) throw new Error("Purchase requisition not found");
  return {
    requisitionId: updated.id,
    requisitionNumber: updated.requisitionNumber,
    status: updated.status,
    message: decision === "APPROVED" ? "Purchase requisition approved" : "Purchase requisition rejected",
  };
}

export async function approvePurchaseRequisition(
  companyId: number,
  payload: Payload,
  referenceId: string | undefined,
  userId: string,
) {
  return decidePurchaseRequisition(companyId, payload, referenceId, userId, "APPROVED");
}

export async function rejectPurchaseRequisition(
  companyId: number,
  payload: Payload,
  referenceId: string | undefined,
  userId: string,
  reviewNotes?: string,
) {
  return decidePurchaseRequisition(companyId, payload, referenceId, userId, "REJECTED", reviewNotes);
}

export async function resetRequisitionAfterPoRejection(
  companyId: number,
  payload: Payload,
  reviewNotes?: string,
) {
  const id = Number(payload.requisitionId);
  if (!Number.isInteger(id) || id <= 0) return;
  await db.update(purchaseRequisitions)
    .set({ status: "QUOTE_SELECTED", rejectionReason: reviewNotes || "Purchase order approval rejected", updatedAt: new Date() })
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.companyId, companyId)));
}

/**
 * Executes the side effect for approval types that are not handled by the
 * original workflow executors in approvals.ts.
 */
export async function executeDeferredApprovalAction(
  type: ApprovalType,
  companyId: number,
  payload: Payload,
  userId: string,
  _reviewNotes?: string,
  _requestId?: number,
): Promise<Payload> {
  const referenceId = typeof payload.referenceId === "string" ? payload.referenceId : undefined;

  switch (type) {
    case "quotation":
      return finalizeQuotation(companyId, payload, referenceId);
    case "sales_order":
      return finalizeSalesOrder(companyId, payload, referenceId, userId);
    case "purchase_order":
      return finalizePurchaseOrder(companyId, payload, referenceId, userId);
    case "supplier_registration":
      return registerSupplier(companyId, payload);
    case "requisition":
      return approvePurchaseRequisition(companyId, payload, referenceId, userId);
    case "credit_note":
      return createCreditNote(companyId, payload, userId);
    case "payment_execution":
      if (payload.supplierPaymentData) {
        return executeSupplierPayment(companyId, payload, userId);
      }
      return executePayment(companyId, payload, userId);
    case "leave":
      return approveLeave(companyId, payload, referenceId, userId);
    case "expense":
      return postExpense(companyId, payload);
    case "discount": {
      if (!payload.invoiceData) return { message: "Discount approved", approvedBy: userId };
      const invoice = await createInvoiceFromApproval(companyId, payload, userId);
      return { ...invoice, message: "Discount approved and invoice issued" };
    }
    default:
      throw new Error(`No executor registered for approval type: ${type}`);
  }
}
