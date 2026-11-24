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
  /** Require approval when monetary amount is at or above this value. 0 = no threshold. */
  amountThreshold?: number;
  /** When true (default), company owners skip forced approval in "always" mode */
  ownerBypass?: boolean;
  /** Optional explicit approvers. Empty means any user with the type approval permission. */
  approverUserIds?: string[];
  /** Optional company role IDs whose holders may approve this type. */
  approverRoleIds?: number[];
  /** Allow the requester to approve their own request. Default false — segregation of duties. */
  allowSelfApproval?: boolean;
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
  [APPROVAL_TYPES.SALES_COMMISSION]: { mode: "by_permission", ownerBypass: true },
  [APPROVAL_TYPES.QUOTATION]: { mode: "by_permission", ownerBypass: true },
  [APPROVAL_TYPES.DISCOUNT]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
  [APPROVAL_TYPES.SALES_ORDER]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
  [APPROVAL_TYPES.PURCHASE_ORDER]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
  [APPROVAL_TYPES.SUPPLIER_REGISTRATION]: { mode: "by_permission", ownerBypass: true },
  [APPROVAL_TYPES.REQUISITION]: { mode: "by_permission", ownerBypass: true },
  [APPROVAL_TYPES.CREDIT_NOTE]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
  [APPROVAL_TYPES.PAYMENT_EXECUTION]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
  [APPROVAL_TYPES.LEAVE]: { mode: "by_permission", ownerBypass: true },
  [APPROVAL_TYPES.EXPENSE]: { mode: "by_permission", amountThreshold: 0, ownerBypass: true },
};

export const APPROVAL_POLICY_DESCRIPTIONS: Record<ApprovalType, string> = {
  stock_adjustment: "Stock corrections, shrinkage, damage, and manual quantity changes.",
  grn_confirm: "Confirming goods delivery notes and direct goods receipt postings.",
  journal_post: "Posting journal vouchers and manual ledger entries.",
  invoice_issue: "Issuing customer invoices (non-POS).",
  sales_commission: "Salesperson commission statements submitted for admin approval.",
  quotation: "Customer quotations before they are sent or accepted.",
  discount: "Discounts above the permitted limit, including POS overrides.",
  sales_order: "Sales orders before confirmation, picking and dispatch.",
  purchase_order: "Purchase orders before they are sent to suppliers.",
  supplier_registration: "New supplier master records before they can be used.",
  requisition: "Departmental purchase requisitions before supplier quotes are requested.",
  credit_note: "Credit notes and invoice cancellation credits.",
  payment_execution: "Customer and supplier payment execution.",
  leave: "Employee leave requests before they affect balances or payroll.",
  expense: "Departmental expenses before posting to the ledger.",
};

export const APPROVAL_AMOUNT_TYPES = new Set<ApprovalType>([
  APPROVAL_TYPES.JOURNAL_POST,
  APPROVAL_TYPES.INVOICE_ISSUE,
  APPROVAL_TYPES.DISCOUNT,
  APPROVAL_TYPES.SALES_ORDER,
  APPROVAL_TYPES.PURCHASE_ORDER,
  APPROVAL_TYPES.CREDIT_NOTE,
  APPROVAL_TYPES.PAYMENT_EXECUTION,
  APPROVAL_TYPES.EXPENSE,
]);

export function supportsAmountThreshold(type: ApprovalType): boolean {
  return APPROVAL_AMOUNT_TYPES.has(type);
}

export function normalizeApprovalPolicies(raw: unknown): CompanyApprovalPolicies {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result: CompanyApprovalPolicies = Object.fromEntries(
    Object.values(APPROVAL_TYPES).map((type) => [type, { ...DEFAULT_APPROVAL_POLICIES[type] }]),
  ) as CompanyApprovalPolicies;

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
    if (typeof policy.allowSelfApproval === "boolean") {
      result[type] = { ...result[type], allowSelfApproval: policy.allowSelfApproval };
    }
    if (Array.isArray(policy.approverUserIds)) {
      result[type] = {
        ...result[type],
        approverUserIds: policy.approverUserIds.filter((id): id is string => typeof id === "string"),
      };
    }
    if (Array.isArray(policy.approverRoleIds)) {
      result[type] = {
        ...result[type],
        approverRoleIds: policy.approverRoleIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      };
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
    supportsAmountThreshold: supportsAmountThreshold(type),
  }));
}
