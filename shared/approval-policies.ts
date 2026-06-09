import {
  APPROVAL_TYPES,
  APPROVAL_TYPE_LABELS,
  type ApprovalType,
} from "./permissions.js";

/** How the company enforces approval for an action type */
export type ApprovalPolicyMode =
  | "disabled"       // No approval workflow — permitted users act immediately
  | "by_permission"  // Direct permission skips approval; request permission submits for approval
  | "always";        // All permitted users must submit for approval (owners may bypass)

export interface ApprovalTypePolicy {
  mode: ApprovalPolicyMode;
  /** Require approval when monetary amount is at or above this value (invoices, journal postings). 0 = ignore. */
  amountThreshold?: number;
  /** When true (default), company owners skip forced approval in "always" mode */
  ownerBypass?: boolean;
}

export type CompanyApprovalPolicies = Record<ApprovalType, ApprovalTypePolicy>;

export const APPROVAL_POLICY_MODES: { value: ApprovalPolicyMode; label: string; description: string }[] = [
  {
    value: "disabled",
    label: "Disabled",
    description: "No approval step. Users with the relevant permission can complete the action immediately.",
  },
  {
    value: "by_permission",
    label: "By user permission",
    description: "Users with a direct permission act immediately; others submit for approval.",
  },
  {
    value: "always",
    label: "Always required",
    description: "Every user must submit for approval, even if they have direct permission. Owners can bypass.",
  },
];

export const DEFAULT_APPROVAL_POLICIES: CompanyApprovalPolicies = {
  [APPROVAL_TYPES.STOCK_ADJUSTMENT]: { mode: "by_permission", ownerBypass: true },
  [APPROVAL_TYPES.GRN_CONFIRM]: { mode: "by_permission", ownerBypass: true },
  [APPROVAL_TYPES.JOURNAL_POST]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
  [APPROVAL_TYPES.INVOICE_ISSUE]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
};

export const APPROVAL_POLICY_DESCRIPTIONS: Record<ApprovalType, string> = {
  stock_adjustment: "Stock corrections, shrinkage, damage, and manual quantity changes.",
  grn_confirm: "Confirming goods delivery notes and direct goods receipt postings.",
  journal_post: "Posting journal vouchers and manual ledger entries.",
  invoice_issue: "Issuing customer invoices (non-POS).",
};

export function normalizeApprovalPolicies(raw: unknown): CompanyApprovalPolicies {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_APPROVAL_POLICIES };

  for (const type of Object.values(APPROVAL_TYPES) as ApprovalType[]) {
    const entry = input[type];
    if (!entry || typeof entry !== "object") continue;
    const policy = entry as Record<string, unknown>;
    const mode = policy.mode;
    if (mode === "disabled" || mode === "by_permission" || mode === "always") {
      result[type] = { ...result[type], mode };
    }
    if (typeof policy.amountThreshold === "number" && policy.amountThreshold >= 0) {
      result[type] = { ...result[type], amountThreshold: policy.amountThreshold };
    }
    if (typeof policy.ownerBypass === "boolean") {
      result[type] = { ...result[type], ownerBypass: policy.ownerBypass };
    }
  }

  return result;
}

export function getApprovalPolicyList(policies: CompanyApprovalPolicies) {
  return (Object.values(APPROVAL_TYPES) as ApprovalType[]).map((type) => ({
    type,
    label: APPROVAL_TYPE_LABELS[type],
    description: APPROVAL_POLICY_DESCRIPTIONS[type],
    policy: policies[type],
    supportsAmountThreshold: type === APPROVAL_TYPES.INVOICE_ISSUE || type === APPROVAL_TYPES.JOURNAL_POST,
  }));
}
