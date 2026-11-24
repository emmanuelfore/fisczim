import { type ApprovalType } from "../../shared/permissions.js";
import { createApprovalRequest } from "./approvals.js";
import { resolveActionAccess } from "./approval-policies.js";

export interface ApprovalGateInput {
  userId: string;
  companyId: number;
  isSuperAdmin?: boolean;
  type: ApprovalType;
  amount?: number;
  title: string;
  description?: string;
  payload: Record<string, unknown>;
  referenceType?: string;
  referenceId?: string;
}

/**
 * Server-side gate for source documents. Callers must stop when
 * `requiresApproval` is true and let the central approval executor perform the
 * action after a different user approves it.
 */
export async function requireApprovalOrContinue(input: ApprovalGateInput) {
  const access = await resolveActionAccess(
    input.userId,
    input.companyId,
    input.type,
    input.isSuperAdmin,
    { amount: input.amount },
  );

  if (!access.allowed) {
    const error = new Error("You do not have permission to perform this action");
    (error as any).statusCode = 403;
    throw error;
  }

  if (!access.requiresApproval) {
    return { requiresApproval: false as const, request: null };
  }

  const request = await createApprovalRequest({
    companyId: input.companyId,
    type: input.type,
    title: input.title,
    description: input.description,
    payload: input.payload,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    requestedBy: input.userId,
  });
  return { requiresApproval: true as const, request };
}
