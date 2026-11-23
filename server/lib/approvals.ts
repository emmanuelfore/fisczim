import {
  ApprovalType,
  APPROVAL_TYPE_PERMISSION,
  DIRECT_ACTION_PERMISSION,
} from "../../shared/permissions.js";
import { storage } from "../storage.js";
import { userHasPermission } from "./permissions.js";
import { sendApprovalRequestEmail } from "../email.js";
import { sanitizeManualJournalPayload } from "./accounting-guards.js";

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

  // Dispatch email notifications asynchronously
  setTimeout(async () => {
    try {
      const company = await storage.getCompany(input.companyId);
      const requester = await storage.getUser(input.requestedBy);
      const requesterName = requester?.name || requester?.username || "A user";
      const companyName = company?.name || "Your Company";

      const approvePerm = APPROVAL_TYPE_PERMISSION[input.type];
      const companyUsers = await storage.getCompanyUsers(input.companyId);

      for (const u of companyUsers) {
        if (!u.email) continue;
        // Check if this specific user can approve
        const canApprove = await userHasPermission(u.id, input.companyId, approvePerm, (u as any).isSuperAdmin || false);
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

export async function approveRequest(
  requestId: number,
  companyId: number,
  reviewerId: string,
  isSuperAdmin: boolean,
  reviewNotes?: string
) {
  const request = await storage.getApprovalRequest(requestId, companyId);
  if (!request) throw new Error("Approval request not found");

  const approvePerm = APPROVAL_TYPE_PERMISSION[request.type as ApprovalType];
  const canApprove = isSuperAdmin || await userHasPermission(reviewerId, companyId, approvePerm, false);
  if (!canApprove) throw new Error("You do not have permission to approve this request");

  // Claim before executing the action. Two approvers must never both run the
  // posting; the conditional UPDATE makes exactly one of them win.
  const claimed = await storage.claimApprovalRequest(requestId, companyId, reviewerId);
  if (!claimed) throw new Error("This request has already been processed");

  try {
    const resultData = await executeApprovalAction(
      request.type as ApprovalType,
      companyId,
      request.payload as Record<string, unknown>,
      reviewerId,
      reviewNotes,
    );
    return await storage.updateApprovalRequest(requestId, companyId, {
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
      resultData,
    });
  } catch (err) {
    await storage.releaseApprovalRequest(requestId, companyId);
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

  const approvePerm = APPROVAL_TYPE_PERMISSION[request.type as ApprovalType];
  const canApprove = isSuperAdmin || await userHasPermission(reviewerId, companyId, approvePerm, false);
  if (!canApprove) throw new Error("You do not have permission to reject this request");

  const claimed = await storage.claimApprovalRequest(requestId, companyId, reviewerId);
  if (!claimed) throw new Error("This request has already been processed");

  try {
    if (request.referenceType === "crm_commission" && request.referenceId) {
      const { applyCommissionDecision } = await import("./commissions.js");
      await applyCommissionDecision(companyId, Number(request.referenceId), "reject", reviewerId, reviewNotes);
    }

    return await storage.updateApprovalRequest(requestId, companyId, {
      status: "rejected",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
    });
  } catch (err) {
    await storage.releaseApprovalRequest(requestId, companyId);
    throw err;
  }
}

async function executeApprovalAction(
  type: ApprovalType,
  companyId: number,
  payload: Record<string, unknown>,
  userId: string,
  reviewNotes?: string,
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
      throw new Error(`Unknown approval type: ${type}`);
  }
}

export { DIRECT_ACTION_PERMISSION, APPROVAL_TYPE_PERMISSION };
