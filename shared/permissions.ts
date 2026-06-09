/**
 * Central permission catalog for RBAC.
 * Permission keys use dot notation: module.resource.action
 */

export type PermissionKey = string;

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
  group: string;
  /** If true, granting this permission allows bypassing approval for that action */
  allowsDirect?: boolean;
}

export const PERMISSION_GROUPS = [
  "Navigation",
  "Point of Sale",
  "Invoices",
  "Inventory & Stock",
  "Goods Received",
  "Accounting",
  "Reports",
  "Users & Roles",
  "Approvals",
  "Settings",
] as const;

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // Navigation
  { key: "nav.dashboard", label: "Dashboard", description: "View the main dashboard", group: "Navigation" },
  { key: "nav.pos", label: "POS Terminal", description: "Access the point of sale", group: "Navigation" },
  { key: "nav.invoices", label: "Invoices", description: "View invoices and billing", group: "Navigation" },
  { key: "nav.customers", label: "Customers", description: "View and manage customers", group: "Navigation" },
  { key: "nav.inventory", label: "Inventory", description: "View inventory modules", group: "Navigation" },
  { key: "nav.accounting", label: "Accounting", description: "View accounting modules", group: "Navigation" },
  { key: "nav.expenses", label: "Expenses", description: "View expenses", group: "Navigation" },
  { key: "nav.reports", label: "Reports", description: "View business reports", group: "Navigation" },
  { key: "nav.restaurant", label: "Restaurant", description: "View restaurant modules", group: "Navigation" },
  { key: "nav.compliance", label: "Compliance", description: "View ZIMRA and compliance tools", group: "Navigation" },
  { key: "nav.settings", label: "Settings", description: "Access organization settings", group: "Navigation" },
  { key: "nav.approvals", label: "Approvals Inbox", description: "View pending approval requests", group: "Navigation" },

  // POS
  { key: "pos.sell", label: "Process Sales", description: "Ring up sales on POS", group: "Point of Sale" },
  { key: "pos.void", label: "Void Sales", description: "Void POS transactions", group: "Point of Sale" },
  { key: "pos.discount", label: "Apply Discounts", description: "Apply discounts without override", group: "Point of Sale" },
  { key: "pos.shift", label: "Manage Shifts", description: "Open and close POS shifts", group: "Point of Sale" },
  { key: "pos.reconcile", label: "Reconcile Shifts", description: "Approve shift reconciliations", group: "Point of Sale" },

  // Invoices
  { key: "invoices.view", label: "View Invoices", description: "View invoice list and details", group: "Invoices" },
  { key: "invoices.create", label: "Create Invoices", description: "Create draft invoices", group: "Invoices" },
  { key: "invoices.issue", label: "Issue Invoices", description: "Issue invoices (may require approval)", group: "Invoices", allowsDirect: false },
  { key: "invoices.issue.direct", label: "Issue Invoices Directly", description: "Issue invoices without approval", group: "Invoices", allowsDirect: true },
  { key: "invoices.approve", label: "Approve Invoice Issuance", description: "Approve pending invoice requests", group: "Invoices" },
  { key: "invoices.fiscalize", label: "Fiscalize Invoices", description: "Submit invoices to ZIMRA", group: "Invoices" },
  { key: "invoices.void", label: "Void Invoices", description: "Void issued invoices", group: "Invoices" },
  { key: "invoices.credit_note", label: "Credit Notes", description: "Create credit notes", group: "Invoices" },

  // Inventory
  { key: "stock.view", label: "View Stock", description: "View products and stock levels", group: "Inventory & Stock" },
  { key: "stock.adjust.request", label: "Request Stock Adjustments", description: "Submit stock adjustments for approval", group: "Inventory & Stock" },
  { key: "stock.adjust.direct", label: "Adjust Stock Directly", description: "Apply stock adjustments immediately", group: "Inventory & Stock", allowsDirect: true },
  { key: "stock.adjust.approve", label: "Approve Stock Adjustments", description: "Approve pending stock adjustments", group: "Inventory & Stock" },
  { key: "stock.count", label: "Stock Counts", description: "Run and complete stock counts", group: "Inventory & Stock" },
  { key: "stock.transfer", label: "Stock Transfers", description: "Transfer stock between branches", group: "Inventory & Stock" },

  // Goods Received
  { key: "grn.create", label: "Create GDN", description: "Record goods delivery notes for verification", group: "Goods Received" },
  { key: "grn.confirm", label: "Confirm GDN / Receive Stock", description: "Confirm GDN and post stock in", group: "Goods Received", allowsDirect: true },
  { key: "grn.direct", label: "Direct Goods Receipt", description: "Receive stock without GDN workflow", group: "Goods Received", allowsDirect: true },
  { key: "grn.view", label: "View Goods Received", description: "View GRVs and GDNs", group: "Goods Received" },

  // Accounting
  { key: "accounting.view", label: "View Accounting", description: "View chart of accounts and ledgers", group: "Accounting" },
  { key: "accounting.journal.create", label: "Create Journal Drafts", description: "Create journal entry drafts", group: "Accounting" },
  { key: "accounting.journal.post", label: "Post Journal Entries", description: "Post journal entries (may require approval)", group: "Accounting" },
  { key: "accounting.journal.post.direct", label: "Post Journals Directly", description: "Post journals without approval", group: "Accounting", allowsDirect: true },
  { key: "accounting.journal.approve", label: "Approve Journal Postings", description: "Approve pending journal postings", group: "Accounting" },
  { key: "accounting.receipts", label: "Customer Receipts", description: "Record customer receipts", group: "Accounting" },
  { key: "accounting.payments", label: "Supplier Payments", description: "Record supplier payments", group: "Accounting" },
  { key: "accounting.periods", label: "Financial Periods", description: "Open and close financial periods", group: "Accounting" },

  // Reports
  { key: "reports.sales", label: "Sales Reports", description: "View sales reports", group: "Reports" },
  { key: "reports.financial", label: "Financial Reports", description: "View P&L and financial statements", group: "Reports" },
  { key: "reports.inventory", label: "Inventory Reports", description: "View inventory reports", group: "Reports" },
  { key: "reports.tax", label: "Tax Reports", description: "View tax and ZIMRA reports", group: "Reports" },

  // Users & Roles
  { key: "users.view", label: "View Users", description: "View team members", group: "Users & Roles" },
  { key: "users.manage", label: "Manage Users", description: "Add, edit, and remove users", group: "Users & Roles" },
  { key: "roles.view", label: "View Roles", description: "View role definitions", group: "Users & Roles" },
  { key: "roles.manage", label: "Manage Roles", description: "Create and edit custom roles", group: "Users & Roles" },

  // Approvals
  { key: "approvals.view", label: "View Approvals", description: "View approval inbox", group: "Approvals" },
  { key: "approvals.action", label: "Process Approvals", description: "Approve or reject requests", group: "Approvals" },

  // Settings
  { key: "settings.organization", label: "Organization Settings", description: "Edit company profile", group: "Settings" },
  { key: "settings.zimra", label: "ZIMRA Settings", description: "Configure fiscal device", group: "Settings" },
  { key: "settings.pos", label: "POS Settings", description: "Configure POS terminal", group: "Settings" },
  { key: "settings.accounting", label: "Accounting Setup", description: "Configure posting accounts", group: "Settings" },
];

export const ALL_PERMISSION_KEYS = ALL_PERMISSIONS.map((p) => p.key);

export const PERMISSION_BY_KEY = Object.fromEntries(
  ALL_PERMISSIONS.map((p) => [p.key, p])
) as Record<string, PermissionDefinition>;

/** Built-in role templates — used when no custom role is assigned */
export const LEGACY_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  owner: [...ALL_PERMISSION_KEYS],
  admin: [...ALL_PERMISSION_KEYS],
  member: [
    "nav.dashboard", "nav.pos", "nav.invoices", "nav.customers", "nav.inventory",
    "nav.expenses", "nav.reports", "nav.settings",
    "pos.sell", "pos.shift",
    "invoices.view", "invoices.create", "invoices.issue",
    "stock.view", "stock.adjust.request", "stock.count",
    "grn.create", "grn.view",
    "accounting.view", "accounting.journal.create",
    "reports.sales", "reports.inventory",
    "users.view",
    "settings.organization",
  ],
  cashier: [
    "nav.pos",
    "pos.sell", "pos.shift",
    "grn.create",
    "stock.adjust.request",
  ],
};

/** Map nav hrefs to required permission */
export const NAV_PERMISSION_MAP: Record<string, PermissionKey | PermissionKey[]> = {
  "/dashboard": "nav.dashboard",
  "/pos": "nav.pos",
  "/invoices": "nav.invoices",
  "/invoice-templates": "nav.invoices",
  "/recurring": "nav.invoices",
  "/payments-received": "nav.invoices",
  "/customers": "nav.customers",
  "/products": "nav.inventory",
  "/auto-spares": "nav.inventory",
  "/services": "nav.inventory",
  "/inventory": "nav.inventory",
  "/inventory/purchase-orders": "nav.inventory",
  "/inventory/account": "nav.inventory",
  "/inventory/production": "nav.inventory",
  "/inventory/adjustments": "nav.inventory",
  "/inventory/stock-counts": "nav.inventory",
  "/accounting": "nav.accounting",
  "/expenses": "nav.expenses",
  "/reports": "nav.reports",
  "/restaurant": "nav.restaurant",
  "/settings": "nav.settings",
  "/approvals": "nav.approvals",
  "/zimra-logs": "nav.compliance",
  "/fdms-test": "nav.compliance",
};

export const APPROVAL_TYPES = {
  STOCK_ADJUSTMENT: "stock_adjustment",
  GRN_CONFIRM: "grn_confirm",
  JOURNAL_POST: "journal_post",
  INVOICE_ISSUE: "invoice_issue",
} as const;

export type ApprovalType = (typeof APPROVAL_TYPES)[keyof typeof APPROVAL_TYPES];

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  stock_adjustment: "Stock Adjustment",
  grn_confirm: "Goods Received",
  journal_post: "Journal Posting",
  invoice_issue: "Invoice Issuance",
};

/** Permission required to approve each approval type */
export const APPROVAL_TYPE_PERMISSION: Record<ApprovalType, PermissionKey> = {
  stock_adjustment: "stock.adjust.approve",
  grn_confirm: "grn.confirm",
  journal_post: "accounting.journal.approve",
  invoice_issue: "invoices.approve",
};

/** Permission for direct action (bypass approval) */
export const DIRECT_ACTION_PERMISSION: Record<ApprovalType, PermissionKey> = {
  stock_adjustment: "stock.adjust.direct",
  grn_confirm: "grn.confirm",
  journal_post: "accounting.journal.post.direct",
  invoice_issue: "invoices.issue.direct",
};

/** Permission to request (submit for approval) */
export const REQUEST_ACTION_PERMISSION: Record<ApprovalType, PermissionKey> = {
  stock_adjustment: "stock.adjust.request",
  grn_confirm: "grn.create",
  journal_post: "accounting.journal.create",
  invoice_issue: "invoices.issue",
};
