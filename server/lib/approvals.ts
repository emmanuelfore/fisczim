import {
  ApprovalType,
  APPROVAL_TYPE_PERMISSION,
  DIRECT_ACTION_PERMISSION,
} from "../../shared/permissions.js";
import { storage } from "../storage.js";
import { userHasPermission } from "./permissions.js";

export interface CreateApprovalInput {
  companyId: number;
  type: ApprovalType;
  title: string;
  description?: string;
  payload: Record<string, unknown>;
  referenceType?: string;
  referenceId?: string;
  requestedBy: string;
}

export async function createApprovalRequest(input: CreateApprovalInput) {
  return storage.createApprovalRequest({
    companyId: input.companyId,
    type: input.type,
    status: "pending",
    title: input.title,
    description: input.description || null,
    payload: input.payload,
    referenceType: input.referenceType || null,
    referenceId: input.referenceId || null,
    requestedBy: input.requestedBy,
  });
}

export async function approveRequest(
  requestId: number,
  companyId: number,
  reviewerId: string,
  isSuperAdmin: boolean,
  reviewNotes?: string
) {
  const request = await storage.getApprovalRequest(requestId, companyId);
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") throw new Error("This request has already been processed");

  const approvePerm = APPROVAL_TYPE_PERMISSION[request.type as ApprovalType];
  const canApprove = isSuperAdmin || await userHasPermission(reviewerId, companyId, approvePerm, false);
  if (!canApprove) throw new Error("You do not have permission to approve this request");

  const resultData = await executeApprovalAction(request.type as ApprovalType, companyId, request.payload as Record<string, unknown>, reviewerId);

  return storage.updateApprovalRequest(requestId, companyId, {
    status: "approved",
    reviewedBy: reviewerId,
    reviewedAt: new Date(),
    reviewNotes: reviewNotes || null,
    resultData,
  });
}

export async function rejectRequest(
  requestId: number,
  companyId: number,
  reviewerId: string,
  isSuperAdmin: boolean,
  reviewNotes?: string
) {
  const request = await storage.getApprovalRequest(requestId, companyId);
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") throw new Error("This request has already been processed");

  const approvePerm = APPROVAL_TYPE_PERMISSION[request.type as ApprovalType];
  const canApprove = isSuperAdmin || await userHasPermission(reviewerId, companyId, approvePerm, false);
  if (!canApprove) throw new Error("You do not have permission to reject this request");

  return storage.updateApprovalRequest(requestId, companyId, {
    status: "rejected",
    reviewedBy: reviewerId,
    reviewedAt: new Date(),
    reviewNotes: reviewNotes || null,
  });
}

async function executeApprovalAction(
  type: ApprovalType,
  companyId: number,
  payload: Record<string, unknown>,
  userId: string
): Promise<Record<string, unknown>> {
  switch (type) {
    case "stock_adjustment": {
      await storage.adjustInventory(companyId, {
        productId: Number(payload.productId),
        variationId: payload.variationId ? Number(payload.variationId) : undefined,
        branchId: payload.branchId ? Number(payload.branchId) : undefined,
        quantity: String(payload.quantity),
        type: String(payload.type || "ADJUSTMENT"),
        notes: String(payload.notes || "Approved stock adjustment"),
        userId,
      });
      return { message: "Stock adjustment applied" };
    }
    case "grn_confirm": {
      if (payload.batchStockIn) {
        const { recordBatchStockIn } = await import("./inventory.js");
        const result = await recordBatchStockIn(
          companyId,
          payload.items as any[],
          payload.supplierId ? Number(payload.supplierId) : undefined,
          typeof payload.notes === "string" ? payload.notes : undefined,
          payload.landedCosts ? Number(payload.landedCosts) : 0,
          (payload.allocationMethod as "value" | "quantity" | undefined) || "value",
          typeof payload.grvNumber === "string" ? payload.grvNumber : undefined,
          userId
        );
        return { grvNumber: result.grvNumber, message: "Batch stock received" };
      }

      const gdnId = Number(payload.gdnId);
      const items = payload.items as any[];
      const { recordBatchStockIn } = await import("./inventory.js");
      const { db } = await import("../db.js");
      const { goodsDeliveryNotes, goodsDeliveryNoteItems } = await import("../../shared/schema.js");
      const { eq, and, sql } = await import("drizzle-orm");

      const [gdn] = await db
        .select()
        .from(goodsDeliveryNotes)
        .where(and(eq(goodsDeliveryNotes.id, gdnId), eq(goodsDeliveryNotes.companyId, companyId)))
        .limit(1);

      if (!gdn) throw new Error("GDN not found");
      if (gdn.status !== "DRAFT") throw new Error("GDN already processed");

      const stockItems = items.map((raw: any) => ({
        productId: raw.productId ? Number(raw.productId) : null,
        accountCode: raw.accountCode || null,
        description: raw.description || null,
        quantity: Number(raw.quantity ?? raw.quantityAccepted ?? raw.quantityReceived),
        unitCost: Number(raw.unitCost),
        landedCost: Number(raw.landedCost || 0),
        taxTypeId: raw.taxTypeId ? Number(raw.taxTypeId) : null,
        taxRate: Number(raw.taxRate || 0),
        taxAmount: Number(raw.taxAmount || 0),
        isRecoverable: raw.isRecoverable !== false,
      }));

      const result = await recordBatchStockIn(
        companyId,
        stockItems,
        gdn.supplierId || undefined,
        String(payload.notes || gdn.notes || `Confirmed from GDN ${gdn.gdnNumber}`),
        payload.landedCosts ? Number(payload.landedCosts) : 0,
        (payload.allocationMethod as "value" | "quantity" | undefined) || "value",
        typeof payload.grvNumber === "string" ? payload.grvNumber : undefined,
        userId,
        gdn.purchaseOrderId || undefined,
        gdn.id
      );

      await db.transaction(async (tx) => {
        for (const item of stockItems) {
          if (item.productId) {
            await tx
              .update(goodsDeliveryNoteItems)
              .set({
                unitCost: item.unitCost.toString(),
                quantityAccepted: item.quantity.toString(),
                quantityRejected: "0",
                taxTypeId: item.taxTypeId,
                taxRate: item.taxRate.toString(),
                taxAmount: item.taxAmount.toString(),
                isRecoverable: item.isRecoverable
              })
              .where(and(eq(goodsDeliveryNoteItems.gdnId, gdnId), eq(goodsDeliveryNoteItems.productId, item.productId)));
          } else {
            await tx
              .update(goodsDeliveryNoteItems)
              .set({
                unitCost: item.unitCost.toString(),
                quantityAccepted: item.quantity.toString(),
                quantityRejected: "0",
                taxTypeId: item.taxTypeId,
                taxRate: item.taxRate.toString(),
                taxAmount: item.taxAmount.toString(),
                isRecoverable: item.isRecoverable
              })
              .where(and(eq(goodsDeliveryNoteItems.gdnId, gdnId), sql`${goodsDeliveryNoteItems.productId} IS NULL`, eq(goodsDeliveryNoteItems.description, item.description || "")));
          }
        }
        await tx
          .update(goodsDeliveryNotes)
          .set({
            status: "CONFIRMED",
            confirmedBy: userId,
            confirmedAt: new Date(),
            confirmedGrvNumber: result.grvNumber,
          })
          .where(eq(goodsDeliveryNotes.id, gdnId));
      });

      return { grvNumber: result.grvNumber, message: "GDN confirmed and stock received" };
    }
    case "journal_post": {
      if (payload.manualEntry) {
        const entry = await storage.postToLedger(companyId, {
          ...(payload.manualEntry as Record<string, unknown>),
          createdBy: userId,
        } as any);
        return { journalEntryId: entry.id, message: "Journal entry posted" };
      }
      const draftId = Number(payload.draftId);
      const entry = await storage.postJournalEntryDraft(companyId, draftId, userId);
      return { journalEntryId: entry.id, message: "Journal entry posted" };
    }
    case "invoice_issue": {
      const invoiceData = payload.invoiceData as Record<string, unknown>;
      const items = (payload.items as any[]) || (invoiceData.items as any[]) || [];
      const invoice = await storage.createInvoice({
        ...invoiceData,
        companyId,
        status: "issued",
        items,
      } as any);
      return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, message: "Invoice issued" };
    }
    default:
      throw new Error(`Unknown approval type: ${type}`);
  }
}

export { DIRECT_ACTION_PERMISSION, APPROVAL_TYPE_PERMISSION };
