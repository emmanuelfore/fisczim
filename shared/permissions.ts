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
  "Sales",
  "Procurement",
  "Inventory",
  "Finance",
  "HR & Payroll",
  "Tax & Compliance",
  "Reports",
  "Restaurant",
  "Administration",
  "Transport & Bus Ticketing",
  "Manufacturing",
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
  { key: "nav.users", label: "User Management", description: "Access user and team management", group: "Navigation" },
  { key: "nav.approvals", label: "Approvals Inbox", description: "View pending approval requests", group: "Navigation" },
  { key: "nav.payroll", label: "Payroll & HR", description: "Access payroll and employee records", group: "Navigation" },
  { key: "nav.bus", label: "Bus Ticketing", description: "Access bus transport modules", group: "Navigation" },
  { key: "nav.manufacturing", label: "Manufacturing", description: "Access manufacturing modules", group: "Navigation" },

  // Manufacturing
  { key: "manufacturing.bom", label: "Manage BOMs", description: "Create and edit Bill of Materials", group: "Manufacturing" },
  { key: "manufacturing.work_orders", label: "Manage Work Orders", description: "Create, start, and complete production runs", group: "Manufacturing" },
  { key: "manufacturing.view", label: "View Manufacturing", description: "View manufacturing dashboard and runs", group: "Manufacturing" },

  // POS
  { key: "pos.sell", label: "Process Sales", description: "Ring up sales on POS", group: "Sales" },
  { key: "pos.void", label: "Void Sales", description: "Void POS transactions", group: "Sales" },
  { key: "pos.discount", label: "Apply Discounts", description: "Apply discounts without override", group: "Sales" },
  { key: "pos.shift", label: "Manage Shifts", description: "Open and close POS shifts", group: "Sales" },
  { key: "pos.reconcile", label: "Reconcile Shifts", description: "Approve shift reconciliations", group: "Sales" },

  // Invoices
  { key: "invoices.view", label: "View Invoices", description: "View invoice list and details", group: "Sales" },
  { key: "invoices.create", label: "Create Invoices", description: "Create draft invoices", group: "Sales" },
  { key: "invoices.issue", label: "Issue Invoices", description: "Issue invoices (may require approval)", group: "Sales", allowsDirect: false },
  { key: "invoices.issue.direct", label: "Issue Invoices Directly", description: "Issue invoices without approval", group: "Sales", allowsDirect: true },
  { key: "invoices.approve", label: "Approve Invoice Issuance", description: "Approve pending invoice requests", group: "Sales" },
  { key: "invoices.fiscalize", label: "Fiscalize Invoices", description: "Submit invoices to ZIMRA", group: "Sales" },
  { key: "invoices.void", label: "Void Invoices", description: "Void issued invoices", group: "Sales" },
  { key: "invoices.credit_note", label: "Credit Notes", description: "Create credit notes", group: "Sales" },

  // Inventory
  { key: "stock.view", label: "View Stock", description: "View products and stock levels", group: "Inventory" },
  { key: "stock.adjust.request", label: "Request Stock Adjustments", description: "Submit stock adjustments for approval", group: "Inventory" },
  { key: "stock.adjust.direct", label: "Adjust Stock Directly", description: "Apply stock adjustments immediately", group: "Inventory", allowsDirect: true },
  { key: "stock.adjust.approve", label: "Approve Stock Adjustments", description: "Approve pending stock adjustments", group: "Inventory" },
  { key: "stock.count", label: "Stock Counts", description: "Run and complete stock counts", group: "Inventory" },
  { key: "stock.transfer", label: "Stock Transfers", description: "Transfer stock between branches", group: "Inventory" },

  // Goods Received
  { key: "grn.create", label: "Create GDN", description: "Record goods delivery notes for verification", group: "Procurement" },
  { key: "grn.confirm", label: "Confirm GDN / Receive Stock", description: "Confirm GDN and post stock in", group: "Procurement", allowsDirect: true },
  { key: "grn.direct", label: "Direct Goods Receipt", description: "Receive stock without GDN workflow", group: "Procurement", allowsDirect: true },
  { key: "grn.view", label: "View Goods Received", description: "View GRVs and GDNs", group: "Procurement" },

  // Accounting
  { key: "accounting.view", label: "View Accounting", description: "View chart of accounts and ledgers", group: "Finance" },
  { key: "accounting.journal.create", label: "Create Journal Drafts", description: "Create journal entry drafts", group: "Finance" },
  { key: "accounting.journal.post", label: "Post Journal Entries", description: "Post journal entries (may require approval)", group: "Finance" },
  { key: "accounting.journal.post.direct", label: "Post Journals Directly", description: "Post journals without approval", group: "Finance", allowsDirect: true },
  { key: "accounting.journal.approve", label: "Approve Journal Postings", description: "Approve pending journal postings", group: "Finance" },
  { key: "accounting.receipts", label: "Customer Receipts", description: "Record customer receipts", group: "Finance" },
  { key: "accounting.payments", label: "Supplier Payments", description: "Record supplier payments", group: "Finance" },
  { key: "accounting.periods", label: "Financial Periods", description: "Open and close financial periods", group: "Finance" },

  // Reports
  { key: "reports.sales", label: "Sales Reports", description: "View sales reports", group: "Reports" },
  { key: "reports.financial", label: "Financial Reports", description: "View P&L and financial statements", group: "Reports" },
  { key: "reports.inventory", label: "Inventory Reports", description: "View inventory reports", group: "Reports" },
  { key: "reports.tax", label: "Tax Reports", description: "View tax and ZIMRA reports", group: "Reports" },

  // Users & Roles
  { key: "users.view", label: "View Users", description: "View team members", group: "Administration" },
  { key: "users.manage", label: "Manage Users", description: "Add, edit, and remove users", group: "Administration" },
  { key: "roles.view", label: "View Roles", description: "View role definitions", group: "Administration" },
  { key: "roles.manage", label: "Manage Roles", description: "Create and edit custom roles", group: "Administration" },

  // Approvals
  { key: "approvals.view", label: "View Approvals", description: "View approval inbox", group: "Administration" },
  { key: "approvals.action", label: "Process Approvals", description: "Approve or reject requests", group: "Administration" },

  // Settings
  { key: "settings.organization", label: "Organization Settings", description: "Edit company profile", group: "Administration" },
  { key: "settings.zimra", label: "ZIMRA Settings", description: "Configure fiscal device", group: "Administration" },
  { key: "settings.pos", label: "POS Settings", description: "Configure POS terminal", group: "Administration" },
  { key: "settings.accounting", label: "Accounting Setup", description: "Configure posting accounts", group: "Administration" },

  // Payroll & HR
  { key: "payroll.view", label: "View Payroll", description: "View employee profiles, contracts, payroll runs, and pay slips", group: "HR & Payroll" },
  { key: "payroll.write", label: "Manage Payroll", description: "Create and edit employee profiles, contract settings, and run payroll", group: "HR & Payroll" },
  { key: "payroll.approve", label: "Approve Payroll", description: "Lock/approve payroll runs and manage payroll integrations/credentials", group: "HR & Payroll" },

  // Transport & Bus Ticketing
  { key: "bus.view", label: "View Bus Ticketing", description: "View bus ticketing dashboard and general schedules", group: "Transport & Bus Ticketing" },
  { key: "bus.operations", label: "Manage Trips", description: "Schedule trips and assign conductors", group: "Transport & Bus Ticketing" },
  { key: "bus.setup", label: "Fleet & Setup", description: "Configure bus fleet, routes, and fare matrix pricing", group: "Transport & Bus Ticketing" },
  { key: "bus.reports", label: "Bus Reports", description: "Access detailed daily, range, and conductor ticketing reports", group: "Transport & Bus Ticketing" },

  // Restaurant
  { key: "restaurant.orders", label: "Live Orders", description: "View and process live dining orders", group: "Restaurant" },
  { key: "restaurant.kds", label: "Kitchen Display System", description: "Manage orders on the kitchen display", group: "Restaurant" },
  { key: "restaurant.layout", label: "Manage Layout", description: "Configure restaurant floor plan and table layouts", group: "Restaurant" },

  // Compliance
  { key: "compliance.logs", label: "View Fiscal Logs", description: "View ZIMRA device registration and signature logs", group: "Tax & Compliance" },
  { key: "compliance.test", label: "FDMS Diagnostics", description: "Perform signature validation and connection tests", group: "Tax & Compliance" },
  { key: "compliance.manage", label: "Configure ZIMRA Device", description: "Edit ZIMRA device serial numbers and keys", group: "Tax & Compliance" },
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
    "nav.users", "users.view",
    "settings.organization",
    "nav.payroll", "nav.bus",
    "payroll.view", "bus.view",
    "restaurant.orders", "restaurant.kds",
    "compliance.logs", "compliance.test",
  ],
  cashier: [
    "nav.pos",
    "pos.sell", "pos.shift",
    "grn.create",
    "stock.adjust.request",
    "nav.bus",
    "bus.view",
  ],
  manufacturing: [
    "nav.dashboard",
    "nav.inventory",
    "stock.view",
    "stock.adjust.request",
    "stock.count",
    "nav.manufacturing",
    "manufacturing.bom",
    "manufacturing.work_orders",
    "manufacturing.view",
  ],
  sales: [
    "nav.dashboard",
    "nav.pos",
    "nav.invoices",
    "nav.customers",
    "pos.sell", "pos.shift",
    "invoices.view", "invoices.create", "invoices.issue",
    "reports.sales",
  ],
  accountant: [
    "nav.dashboard",
    "nav.invoices",
    "nav.customers",
    "nav.accounting",
    "nav.expenses",
    "nav.reports",
    "nav.payroll",
    "nav.compliance",
    "invoices.view", "invoices.create", "invoices.issue", "invoices.void",
    "accounting.view", "accounting.journal.create", "accounting.journal.approve", "accounting.close",
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    "payroll.view", "payroll.process",
    "compliance.logs", "compliance.test",
  ],
  logistics: [
    "nav.dashboard",
    "nav.inventory",
    "nav.bus",
    "stock.view", "stock.adjust.request", "stock.count",
    "grn.create", "grn.view",
    "bus.view",
  ],
  manager: [
    "nav.dashboard", "nav.pos", "nav.invoices", "nav.customers", "nav.inventory", 
    "nav.expenses", "nav.reports", "nav.users", "nav.approvals", "nav.restaurant",
    "pos.sell", "pos.shift", "pos.void", "pos.discount",
    "invoices.view", "invoices.create", "invoices.issue", "invoices.void",
    "stock.view", "stock.adjust.request", "stock.adjust.approve", "stock.count",
    "grn.create", "grn.view", "grn.approve",
    "accounting.view",
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    "users.view",
    "restaurant.orders", "restaurant.kds", "restaurant.menu",
  ],
  hr: [
    "nav.dashboard", "nav.payroll", "nav.users",
    "payroll.view", "payroll.process",
    "users.view",
  ],
  procurement: [
    "nav.dashboard", "nav.inventory",
    "stock.view", "grn.create", "grn.view",
  ],
  auditor: [
    "nav.dashboard", "nav.invoices", "nav.customers", "nav.inventory", 
    "nav.accounting", "nav.expenses", "nav.reports", "nav.payroll", "nav.compliance",
    "invoices.view", "stock.view", "grn.view", "accounting.view",
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    "payroll.view", "users.view", "compliance.logs", "compliance.test"
  ],
  restaurant: [
    "nav.restaurant",
    "restaurant.orders", "restaurant.kds",
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
  "/serial-tracking": "nav.inventory",
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
  "/team-settings": "nav.users",
  "/approvals": "nav.approvals",
  "/zimra-logs": "nav.compliance",
  "/fdms-test": "nav.compliance",
  "/suppliers": "nav.inventory",
  "/payroll": "nav.payroll",
  "/bus/fleet": "nav.bus",
  "/bus/dashboard": "nav.bus",
  "/bus/trips": "nav.bus",
  "/bus/conductors": "nav.bus",
  "/bus/reports": "nav.bus",
  "/restaurant/layout": "nav.restaurant",
  "/restaurant/kds": "nav.restaurant",
  "/restaurant/orders": "nav.restaurant",
  "/quotations": "nav.invoices",
  "/quotations/new": "nav.invoices",
  "/currencies": "nav.settings",
  "/zimra-settings": "nav.settings",
  "/tax-config": "nav.settings",
  "/sales-orders": "nav.invoices",
  "/stock-receipt": "nav.inventory",
  "/supplier-invoices": "nav.accounting",
  "/supplier-credit-notes": "nav.accounting",
  "/manufacturing": "nav.manufacturing",
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
