import {
  ApprovalType,
  APPROVAL_TYPES,
  APPROVAL_TYPE_PERMISSION,
  DIRECT_ACTION_PERMISSION,
} from "../../shared/permissions.js";
import { storage } from "../storage.js";
import { userHasPermission } from "./permissions.js";
import { sendApprovalRequestEmail } from "../email.js";
import { sanitizeManualJournalPayload } from "./accounting-guards.js";
import { assertCanApproveType, assertNotSelfApproval, canUserApproveType } from "./approval-policies.js";
import { logAction } from "../audit.js";
import { executeDeferredApprovalAction } from "./approval-executors.js";

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
  const request = await storage.createApprovalRequest({
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

  await logAction(
    input.companyId,
    input.requestedBy,
    "APPROVAL_REQUEST_CREATED",
    "approval_request",
    String(request.id),
    { type: input.type, referenceType: input.referenceType || null, referenceId: input.referenceId || null },
  );

  // Dispatch email notifications asynchronously
  setTimeout(async () => {
    try {
      const company = await storage.getCompany(input.companyId);
      const requester = await storage.getUser(input.requestedBy);
      const requesterName = requester?.name || requester?.username || "A user";
      const companyName = company?.name || "Your Company";

      const companyUsers = await storage.getCompanyUsers(input.companyId);

      for (const u of companyUsers) {
        if (!u.email || u.id === input.requestedBy) continue;
        // Honour the type's named approvers/roles as well as the permission.
        const canApprove = await canUserApproveType(
          u.id,
          input.companyId,
          input.type,
          (u as any).isSuperAdmin || false,
        );
        if (canApprove) {
          await sendApprovalRequestEmail(
            u.email,
            u.name || "Approver",
            input.title,
            requesterName,
            companyName
          ).catch(e => console.error("Email err", e));
        }
      }
    } catch (err) {
      console.error("Failed to process approval notifications:", err);
    }
  }, 0);

  return request;
}

function isApprovalType(value: string): value is ApprovalType {
  return (Object.values(APPROVAL_TYPES) as string[]).includes(value);
}

async function assertReviewReady(request: { id: number; type: string; status: string; requestedBy: string; resultData?: unknown }, companyId: number, reviewerId: string, isSuperAdmin: boolean) {
  if (!isApprovalType(request.type)) throw new Error("Unsupported approval request type");
  await assertNotSelfApproval(request.requestedBy, reviewerId, companyId, request.type);
  await assertCanApproveType(reviewerId, companyId, request.type, isSuperAdmin);

  // Replaying an approved request must return its original result rather than
  // executing the side effect a second time.
  if (request.status === "approved" || request.status === "rejected") {
    throw new Error("This request has already been processed");
  }
  if (request.status !== "pending") {
    throw new Error("This request is already being processed");
  }
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
  await assertReviewReady(request, companyId, reviewerId, isSuperAdmin);

  // Claim before executing the action. Two approvers must never both run the
  // posting; the conditional UPDATE makes exactly one of them win.
  const claimed = await storage.claimApprovalRequest(requestId, companyId, reviewerId);
  if (!claimed) throw new Error("This request has already been processed");

  try {
    const type = request.type as ApprovalType;
    const resultData = type === "sales_commission" && request.referenceType === "crm_commission" && request.referenceId
      ? await (async () => {
          const { applyCommissionDecision } = await import("./commissions.js");
          const commission = await applyCommissionDecision(companyId, Number(request.referenceId), "approve", reviewerId, reviewNotes);
          return { commissionId: commission.id, netAmount: commission.netAmount, status: commission.status, message: "Commission approved" };
        })()
      : await executeApprovalAction(
          type,
          companyId,
          request.payload as Record<string, unknown>,
          reviewerId,
          reviewNotes,
          requestId,
        );

    const updated = await storage.updateApprovalRequest(requestId, companyId, {
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
      resultData,
    });
    await logAction(companyId, reviewerId, "APPROVAL_REQUEST_APPROVED", "approval_request", String(requestId), {
      type: request.type,
      resultData,
    });
    return updated;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await storage.failApprovalRequest(requestId, companyId, errorMessage);
    await logAction(companyId, reviewerId, "APPROVAL_EXECUTION_FAILED", "approval_request", String(requestId), {
      type: request.type,
      error: errorMessage,
    });
    throw err;
  }
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
  await assertReviewReady(request, companyId, reviewerId, isSuperAdmin);

  const claimed = await storage.claimApprovalRequest(requestId, companyId, reviewerId);
  if (!claimed) throw new Error("This request has already been processed");

  try {
    if (request.type === "sales_commission" && request.referenceType === "crm_commission" && request.referenceId) {
      const { applyCommissionDecision } = await import("./commissions.js");
      await applyCommissionDecision(companyId, Number(request.referenceId), "reject", reviewerId, reviewNotes);
    }

    const updated = await storage.updateApprovalRequest(requestId, companyId, {
      status: "rejected",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
    });
    await logAction(companyId, reviewerId, "APPROVAL_REQUEST_REJECTED", "approval_request", String(requestId), {
      type: request.type,
      reviewNotes: reviewNotes || null,
    });
    return updated;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await storage.failApprovalRequest(requestId, companyId, errorMessage);
    await logAction(companyId, reviewerId, "APPROVAL_REJECT_FAILED", "approval_request", String(requestId), {
      type: request.type,
      error: errorMessage,
    });
    throw err;
  }
}

async function executeApprovalAction(
  type: ApprovalType,
  companyId: number,
  payload: Record<string, unknown>,
  userId: string,
  reviewNotes?: string,
  requestId?: number,
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
      // Reuse the interactive confirmation path so approval cannot bypass
      // draft-line checks, PO limits, quantity caps, serials or added lines.
      // That helper owns its own transaction for GDN-based receipts.
      if (!payload.batchStockIn) {
        const { confirmGdnReceipt } = await import("./gdn-confirmation.js");
        return await confirmGdnReceipt(companyId, {
          gdnId: Number(payload.gdnId),
          items: payload.items as any[],
          notes: typeof payload.notes === "string" ? payload.notes : undefined,
          landedCosts: payload.landedCosts ? Number(payload.landedCosts) : 0,
          allocationMethod: (payload.allocationMethod as "value" | "quantity" | "manual" | undefined) || "value",
          grvNumber: typeof payload.grvNumber === "string" ? payload.grvNumber : undefined,
          userId,
        });
      }

      const { recordBatchStockIn } = await import("./inventory.js");
      const { db } = await import("../db.js");

      // One transaction covers stock movements and the GL posting.
      return await db.transaction(async (tx) => {
        const result = await recordBatchStockIn(
          companyId,
          payload.items as any[],
          payload.supplierId ? Number(payload.supplierId) : undefined,
          typeof payload.notes === "string" ? payload.notes : undefined,
          payload.landedCosts ? Number(payload.landedCosts) : 0,
          (payload.allocationMethod as "value" | "quantity" | "manual" | undefined) || "value",
          typeof payload.grvNumber === "string" ? payload.grvNumber : undefined,
          userId,
          undefined,
          undefined,
          undefined,
          tx
        );
        return { grvNumber: result.grvNumber, message: "Batch stock received" };
      });
    }
    case "journal_post": {
      if (payload.manualEntry) {
        // Approval payloads are persisted from an earlier client request, so
        // they are just as untrusted as req.body at the time of execution.
        const entry = await storage.postToLedger(companyId, {
          ...sanitizeManualJournalPayload(payload.manualEntry),
          referenceType: "MANUAL",
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
        issueDate: invoiceData.issueDate ? new Date(invoiceData.issueDate as string) : undefined,
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate as string) : undefined,
        companyId,
        status: "issued",
        items,
      } as any);
      return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, message: "Invoice issued" };
    }
    case "sales_commission": {
      const commissionId = Number(payload.commissionId);
      if (!commissionId) throw new Error("The approval request has no commission attached");
      const { applyCommissionDecision } = await import("./commissions.js");
      const commission = await applyCommissionDecision(companyId, commissionId, "approve", userId, reviewNotes);
      return {
        commissionId,
        netAmount: commission.netAmount,
        status: commission.status,
        message: "Commission approved",
      };
    }
    default:
      return await executeDeferredApprovalAction(type, companyId, payload, userId, reviewNotes, requestId);
  }
}

export { DIRECT_ACTION_PERMISSION, APPROVAL_TYPE_PERMISSION };
