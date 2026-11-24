import {
  APPROVAL_TYPE_PERMISSION,
  DIRECT_ACTION_PERMISSION,
  REQUEST_ACTION_PERMISSION,
  type ApprovalType,
} from "../../shared/permissions.js";
import {
  normalizeApprovalPolicies,
  supportsAmountThreshold,
  type CompanyApprovalPolicies,
} from "../../shared/approval-policies.js";
import { getUserPermissions, userHasPermission } from "./permissions.js";
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function firstFinite(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n != null) return n;
  }
  return undefined;
}

function sumField(rows: unknown, field: string): number | undefined {
  if (!Array.isArray(rows)) return undefined;
  let total = 0;
  let found = false;
  for (const row of rows) {
    const record = asRecord(row);
    const n = record ? finiteNumber(record[field]) : undefined;
    if (n != null) {
      total += n;
      found = true;
    }
  }
  return found ? total : undefined;
}

/**
 * Approval amounts must come from the stored source document, never from a
 * free-form `amount` supplied by the client. This is used both by the gate and
 * by the generic approval endpoint so a low declared amount cannot slip a high
 * value transaction past a monetary threshold.
 */
export function deriveApprovalAmount(type: ApprovalType, payload: Record<string, unknown>): number | undefined {
  const invoice = asRecord(payload.invoiceData);
  const order = asRecord(payload.orderData);
  const purchaseOrder = asRecord(payload.purchaseOrderData);
  const payment = asRecord(payload.paymentData);
  const supplierPayment = asRecord(payload.supplierPaymentData);
  const expense = asRecord(payload.expenseData);
  const journal = asRecord(payload.manualEntry);

  switch (type) {
    case "invoice_issue":
    case "credit_note":
      return firstFinite(invoice?.total, payload.total);
    case "discount":
      return firstFinite(
        invoice?.discountAmount,
        sumField(payload.items, "discountAmount"),
        sumField(invoice?.items, "discountAmount"),
        payload.discountAmount,
      );
    case "sales_order":
      return firstFinite(order?.total, payload.total);
    case "purchase_order":
      return firstFinite(purchaseOrder?.total, payload.total);
    case "payment_execution":
      return firstFinite(payment?.amount, supplierPayment?.amount, payload.amount);
    case "expense":
      return firstFinite(expense?.amount, payload.amount);
    case "journal_post":
      return firstFinite(
        sumField(journal?.lines, "debit"),
        sumField(journal?.lines, "amount"),
        sumField(payload.lines, "amount"),
        payload.amount,
      );
    default:
      return finiteNumber(payload.amount);
  }
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

  const threshold = supportsAmountThreshold(type) ? Number(policy.amountThreshold || 0) : 0;
  const amount = context?.amount;
  const amountTriggersApproval =
    threshold > 0 && amount != null && Number.isFinite(amount) && amount >= threshold;

  if (policy.mode === "always") {
    return { allowed: true, requiresApproval: true, policyMode: policy.mode };
  }

  // by_permission
  if (amountTriggersApproval || !hasDirect) {
    return { allowed: true, requiresApproval: true, policyMode: policy.mode };
  }

  return { allowed: true, requiresApproval: false, policyMode: policy.mode };
}

/**
 * A reviewer is eligible only if they hold the type permission and, when the
 * company configured explicit approvers, they are one of those users/roles.
 */
export async function canUserApproveType(
  userId: string,
  companyId: number,
  type: ApprovalType,
  isSuperAdmin = false,
): Promise<boolean> {
  const hasPermission = isSuperAdmin || await userHasPermission(userId, companyId, APPROVAL_TYPE_PERMISSION[type], false);
  if (!hasPermission) return false;

  const policies = await getCompanyApprovalPolicies(companyId);
  const policy = policies[type];
  const userIds = policy.approverUserIds || [];
  const roleIds = policy.approverRoleIds || [];
  if (!userIds.length && !roleIds.length) return true;
  if (userIds.includes(userId)) return true;

  if (roleIds.length) {
    const membership = await storage.getCompanyMembership(userId, companyId);
    if (membership?.companyRoleId && roleIds.includes(membership.companyRoleId)) return true;
  }
  return false;
}

export async function assertCanApproveType(
  userId: string,
  companyId: number,
  type: ApprovalType,
  isSuperAdmin = false,
): Promise<void> {
  if (!(await canUserApproveType(userId, companyId, type, isSuperAdmin))) {
    throw new Error("You do not have permission to approve this request");
  }
}

export async function assertNotSelfApproval(
  requestedBy: string,
  reviewerId: string,
  companyId: number,
  type: ApprovalType,
): Promise<void> {
  if (requestedBy !== reviewerId) return;
  const policies = await getCompanyApprovalPolicies(companyId);
  if (policies[type].allowSelfApproval === true) return;
  throw new Error("You cannot approve or reject your own request");
}
