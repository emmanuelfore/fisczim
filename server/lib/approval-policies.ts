import {
  DIRECT_ACTION_PERMISSION,
  REQUEST_ACTION_PERMISSION,
  type ApprovalType,
} from "../../shared/permissions.js";
import {
  normalizeApprovalPolicies,
  type CompanyApprovalPolicies,
} from "../../shared/approval-policies.js";
import { getUserPermissions } from "./permissions.js";
import { storage } from "../storage.js";

export interface ActionAccessContext {
  amount?: number;
}

export interface ActionAccessResult {
  allowed: boolean;
  requiresApproval: boolean;
  policyMode?: string;
}

export async function getCompanyApprovalPolicies(companyId: number): Promise<CompanyApprovalPolicies> {
  const company = await storage.getCompany(companyId);
  return normalizeApprovalPolicies(company?.approvalSettings);
}

export async function resolveActionAccess(
  userId: string,
  companyId: number,
  type: ApprovalType,
  isSuperAdmin?: boolean,
  context?: ActionAccessContext
): Promise<ActionAccessResult> {
  if (isSuperAdmin) {
    return { allowed: true, requiresApproval: false, policyMode: "superadmin" };
  }

  const requestPermission = REQUEST_ACTION_PERMISSION[type];
  const directPermission = DIRECT_ACTION_PERMISSION[type];
  const policies = await getCompanyApprovalPolicies(companyId);
  const policy = policies[type];

  const perms = await getUserPermissions(userId, companyId, false);
  const membership = await storage.getCompanyMembership(userId, companyId);
  const isOwner = membership?.legacyRole === "owner";
  const ownerBypass = policy.ownerBypass !== false;

  const hasDirect = perms.has(directPermission);
  const hasRequest = perms.has(requestPermission);
  const hasAny = hasDirect || hasRequest;

  if (!hasAny) {
    return { allowed: false, requiresApproval: false, policyMode: policy.mode };
  }

  if (isOwner && ownerBypass) {
    return { allowed: true, requiresApproval: false, policyMode: policy.mode };
  }

  if (policy.mode === "disabled") {
    return { allowed: true, requiresApproval: false, policyMode: policy.mode };
  }

  const threshold = Number(policy.amountThreshold || 0);
  const amount = context?.amount;
  const amountTriggersApproval =
    threshold > 0 && amount != null && Number.isFinite(amount) && amount >= threshold;

  if (policy.mode === "always") {
    return { allowed: true, requiresApproval: true, policyMode: policy.mode };
  }

  // by_permission
  if (amountTriggersApproval) {
    return { allowed: true, requiresApproval: true, policyMode: policy.mode };
  }

  if (hasDirect) {
    return { allowed: true, requiresApproval: false, policyMode: policy.mode };
  }

  return { allowed: true, requiresApproval: true, policyMode: policy.mode };
}
