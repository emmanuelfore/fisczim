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
  "CRM",
  "Vehicles",
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
  { key: "nav.crm", label: "CRM", description: "Access the enquiry pipeline", group: "Navigation" },

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
  { key: "invoices.credit_note", label: "Credit Notes", description: "Create credit notes (may require approval)", group: "Sales" },
  { key: "invoices.credit_note.direct", label: "Create Credit Notes Directly", description: "Create credit notes without approval", group: "Sales", allowsDirect: true },
  { key: "invoices.credit_note.approve", label: "Approve Credit Notes", description: "Approve pending credit notes", group: "Sales" },
  { key: "sales.order.create", label: "Create Sales Orders", description: "Create sales orders (may require approval)", group: "Sales" },
  { key: "sales.order.confirm.direct", label: "Confirm Sales Orders Directly", description: "Confirm sales orders without approval", group: "Sales", allowsDirect: true },
  { key: "sales.order.approve", label: "Approve Sales Orders", description: "Approve pending sales orders", group: "Sales" },
  { key: "sales.discount.request", label: "Request Sales Discounts", description: "Submit discounts above the normal limit for approval", group: "Sales" },
  { key: "sales.discount.direct", label: "Apply Discounts Directly", description: "Apply discounts without approval", group: "Sales", allowsDirect: true },
  { key: "sales.discount.approve", label: "Approve Sales Discounts", description: "Approve discount overrides", group: "Sales" },
  { key: "sales.price-lists.manage", label: "Manage Price Lists", description: "Maintain department and customer price lists", group: "Sales" },

  // CRM
  { key: "crm.pipeline.view", label: "View Pipeline", description: "View enquiries, activities and the pipeline board", group: "CRM" },
  { key: "crm.pipeline.manage", label: "Manage Enquiries", description: "Capture, edit, assign and move enquiries between stages", group: "CRM" },
  { key: "crm.quotation.create", label: "Quote From Enquiry", description: "Raise a quotation from a won enquiry (may require approval)", group: "CRM" },
  { key: "crm.quotation.approve", label: "Approve Quotations", description: "Approve pending quotations", group: "CRM" },
  { key: "crm.duplicates.merge", label: "Merge Duplicates", description: "Merge duplicate enquiries into one record", group: "CRM" },
  { key: "crm.stages.manage", label: "Configure Stages", description: "Create, reorder and set the probability of pipeline stages", group: "CRM" },
  { key: "crm.reports.view", label: "CRM Reports", description: "View pipeline, source and salesperson analysis", group: "CRM" },
  { key: "crm.social.view", label: "View Social Inbox", description: "See linked pages and the inbound lead and comment queue", group: "CRM" },
  { key: "crm.social.capture", label: "Capture Social Leads", description: "Turn an inbound lead or comment into an enquiry, or discard it", group: "CRM" },
  { key: "crm.social.manage", label: "Manage Social Connections", description: "Connect and disconnect pages, test tokens and run a manual sync", group: "CRM" },
  { key: "crm.commission.view", label: "View Commissions", description: "See commission statements, penalties and payout status", group: "CRM" },
  { key: "crm.commission.manage", label: "Manage Commission Rules", description: "Configure commission rates and generate commission from sales", group: "CRM" },
  { key: "crm.commission.request", label: "Request Commission Payout", description: "Submit a commission statement for admin approval", group: "CRM" },
  { key: "crm.commission.approve", label: "Approve Commissions", description: "Approve or reject commission payouts and mark them paid", group: "CRM" },
  { key: "crm.tasks.view", label: "View Team Tasks", description: "See tasks and messages given to team members, including SLA status", group: "CRM" },
  { key: "crm.tasks.manage", label: "Assign Team Tasks", description: "Create, reassign and close tasks for team members", group: "CRM" },
  { key: "crm.tasks.respond", label: "Respond To Tasks", description: "Answer tasks assigned to you within the response window", group: "CRM" },

  // Vehicle imports
  { key: "nav.vehicles", label: "Vehicles", description: "Access the vehicle import module", group: "Navigation" },
  { key: "vehicles.view", label: "View Vehicles", description: "View vehicles, import tracking and customer balances", group: "Vehicles" },
  { key: "vehicles.manage", label: "Manage Vehicles", description: "Create and edit vehicles, assign customers and update import stages", group: "Vehicles" },
  { key: "vehicles.costs", label: "Vehicle Costs & Profit", description: "View and post landed costs, and see profit per vehicle", group: "Vehicles" },
  { key: "vehicles.payments", label: "Vehicle Payments", description: "Record deposits and part-payments and set payment schedules", group: "Vehicles" },
  { key: "vehicles.delete", label: "Delete Vehicles", description: "Delete vehicles that have no payments or invoice", group: "Vehicles" },

  // Inventory
  { key: "stock.view", label: "View Stock", description: "View products and stock levels", group: "Inventory" },
  { key: "stock.adjust.request", label: "Request Stock Adjustments", description: "Submit stock adjustments for approval", group: "Inventory" },
  { key: "stock.adjust.direct", label: "Adjust Stock Directly", description: "Apply stock adjustments immediately", group: "Inventory", allowsDirect: true },
  { key: "stock.adjust.approve", label: "Approve Stock Adjustments", description: "Approve pending stock adjustments", group: "Inventory" },
  { key: "stock.count", label: "Stock Counts", description: "Run and complete stock counts", group: "Inventory" },
  { key: "stock.transfer", label: "Stock Transfers", description: "Transfer stock between branches", group: "Inventory" },

  // Goods Received
  { key: "grn.create", label: "Create GDN", description: "Record goods delivery notes for verification", group: "Procurement" },
  { key: "grn.confirm", label: "Approve GDN Confirmation", description: "Approve a pending GDN confirmation request", group: "Procurement" },
  { key: "grn.confirm.direct", label: "Confirm GDN Directly", description: "Confirm GDN and receive stock immediately, bypassing approval", group: "Procurement", allowsDirect: true },
  { key: "grn.view", label: "View Goods Received", description: "View GRVs and GDNs", group: "Procurement" },
  { key: "purchasing.supplier.create", label: "Register Suppliers", description: "Register suppliers (may require approval)", group: "Procurement" },
  { key: "purchasing.supplier.approve.direct", label: "Register Suppliers Directly", description: "Register suppliers without approval", group: "Procurement", allowsDirect: true },
  { key: "purchasing.supplier.approve", label: "Approve Supplier Registrations", description: "Approve new supplier registrations", group: "Procurement" },
  { key: "purchasing.requisition.request", label: "Request Purchases", description: "Raise departmental purchase requisitions for manager approval", group: "Procurement" },
  { key: "purchasing.requisition.direct", label: "Approve Requisitions Directly", description: "Approve requisitions without a second approval", group: "Procurement", allowsDirect: true },
  { key: "purchasing.requisition.approve", label: "Approve Purchase Requisitions", description: "Approve or reject departmental purchase requisitions", group: "Procurement" },
  { key: "purchasing.quote.manage", label: "Manage Supplier Quotes", description: "Capture and maintain supplier quotations against requisitions", group: "Procurement" },
  { key: "purchasing.quote.select", label: "Select Supplier Quotes", description: "Select the successful supplier quotation before PO approval", group: "Procurement" },
  { key: "purchasing.po.request", label: "Request Purchase Orders", description: "Submit purchase orders for approval", group: "Procurement" },
  { key: "purchasing.po.approve.direct", label: "Approve Purchase Orders Directly", description: "Approve and send purchase orders without a second approval", group: "Procurement", allowsDirect: true },
  { key: "purchasing.po.approve", label: "Approve Purchase Orders", description: "Approve pending purchase orders", group: "Procurement" },

  // Accounting
  { key: "accounting.view", label: "View Accounting", description: "View chart of accounts and ledgers", group: "Finance" },
  { key: "accounting.journal.create", label: "Create Journal Drafts", description: "Create journal entry drafts", group: "Finance" },
  { key: "accounting.journal.post", label: "Post Journal Entries", description: "Post journal entries (may require approval)", group: "Finance" },
  { key: "accounting.journal.post.direct", label: "Post Journals Directly", description: "Post journals without approval", group: "Finance", allowsDirect: true },
  { key: "accounting.journal.approve", label: "Approve Journal Postings", description: "Approve pending journal postings", group: "Finance" },
  { key: "accounting.journal.reverse", label: "Reverse Journal Entries", description: "Reverse posted journal entries", group: "Finance" },
  { key: "accounting.coa.manage", label: "Manage Chart of Accounts", description: "Create and maintain general ledger accounts", group: "Finance" },
  { key: "accounting.cashbook", label: "Cashbook & Transfers", description: "Post cashbook entries and inter-account transfers", group: "Finance" },
  { key: "accounting.budgets", label: "Budgets & Allocations", description: "Create budgets, cost allocation rules and consolidation eliminations", group: "Finance" },
  { key: "accounting.fixedassets", label: "Fixed Asset Actions", description: "Dispose assets and run FX revaluation", group: "Finance" },
  { key: "accounting.receipts", label: "Customer Receipts", description: "Record customer receipts", group: "Finance" },
  { key: "accounting.payments", label: "Supplier Payments", description: "Record supplier payments (may require approval)", group: "Finance" },
  { key: "accounting.payments.direct", label: "Execute Payments Directly", description: "Execute supplier payments without approval", group: "Finance", allowsDirect: true },
  { key: "accounting.payments.approve", label: "Approve Payments", description: "Approve pending payment executions", group: "Finance" },
  { key: "accounting.bills.post", label: "Post Supplier Bills", description: "Create supplier bills with enforced three-way matching", group: "Finance" },
  { key: "accounting.bills.waive", label: "Approve Match Variances", description: "Authorise supplier bill posting or payment with a three-way match variance", group: "Finance" },
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
  { key: "approvals.admin", label: "Resolve Failed Approvals", description: "Close failed approval executions after manual reconciliation", group: "Administration" },

  // Settings
  { key: "settings.organization", label: "Organization Settings", description: "Edit company profile", group: "Administration" },
  { key: "settings.zimra", label: "ZIMRA Settings", description: "Configure fiscal device", group: "Administration" },
  { key: "settings.pos", label: "POS Settings", description: "Configure POS terminal", group: "Administration" },
  { key: "settings.accounting", label: "Accounting Setup", description: "Configure posting accounts", group: "Administration" },

  // Payroll & HR
  { key: "payroll.view", label: "View Payroll", description: "View employee profiles, contracts, payroll runs, and pay slips", group: "HR & Payroll" },
  { key: "payroll.write", label: "Manage Payroll", description: "Create and edit employee profiles, contract settings, and run payroll", group: "HR & Payroll" },
  { key: "payroll.approve", label: "Approve Payroll", description: "Lock/approve payroll runs and manage payroll integrations/credentials", group: "HR & Payroll" },
  { key: "payroll.leave.request", label: "Request Leave", description: "Submit employee leave requests for approval", group: "HR & Payroll" },
  { key: "payroll.leave.approve.direct", label: "Approve Leave Directly", description: "Approve leave requests without a second approval", group: "HR & Payroll", allowsDirect: true },
  { key: "payroll.leave.approve", label: "Approve Leave", description: "Approve pending leave requests", group: "HR & Payroll" },
  { key: "expenses.create", label: "Capture Expenses", description: "Capture expenses (may require approval)", group: "Finance" },
  { key: "expenses.create.direct", label: "Post Expenses Directly", description: "Post expenses without approval", group: "Finance", allowsDirect: true },
  { key: "expenses.approve", label: "Approve Expenses", description: "Approve pending expenses", group: "Finance" },

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

  // Admin: full management access but must use approval workflow for financial actions.
  // Does NOT hold *.direct bypass keys — changes go through approvals like everyone else.
  admin: [
    "nav.dashboard", "nav.pos", "nav.invoices", "nav.customers", "nav.inventory",
    "nav.accounting", "nav.expenses", "nav.reports", "nav.restaurant",
    "nav.compliance", "nav.settings", "nav.users", "nav.approvals",
    "nav.payroll", "nav.bus", "nav.manufacturing", "nav.crm",
    // Sales
    "pos.sell", "pos.shift", "pos.void", "pos.discount", "pos.reconcile",
    "invoices.view", "invoices.create", "invoices.issue", "invoices.approve",
    "invoices.void", "invoices.credit_note", "invoices.credit_note.approve", "invoices.fiscalize",
    "sales.order.create", "sales.order.approve",
    "sales.discount.request", "sales.discount.approve", "sales.price-lists.manage",
    // CRM
    "crm.pipeline.view", "crm.pipeline.manage", "crm.quotation.create", "crm.quotation.approve",
    "crm.duplicates.merge", "crm.stages.manage", "crm.reports.view",
    "crm.social.view", "crm.social.capture", "crm.social.manage",
    "crm.commission.view", "crm.commission.manage", "crm.commission.request", "crm.commission.approve",
    "crm.tasks.view", "crm.tasks.manage", "crm.tasks.respond",
    "nav.vehicles", "vehicles.view", "vehicles.manage", "vehicles.costs", "vehicles.payments", "vehicles.delete",
    // Inventory
    "stock.view", "stock.adjust.request", "stock.adjust.approve",
    "stock.count", "stock.transfer",
    "grn.create", "grn.view", "grn.confirm",
    "purchasing.supplier.create", "purchasing.supplier.approve",
    "purchasing.requisition.request", "purchasing.requisition.approve",
    "purchasing.quote.manage", "purchasing.quote.select",
    "purchasing.po.request", "purchasing.po.approve",
    // Accounting
    "accounting.view", "accounting.journal.create", "accounting.journal.approve",
    "accounting.journal.reverse", "accounting.coa.manage", "accounting.cashbook",
    "accounting.budgets", "accounting.fixedassets",
    "accounting.receipts", "accounting.payments", "accounting.payments.approve", "accounting.bills.post",
    "accounting.bills.waive", "accounting.periods",
    "expenses.create", "expenses.approve",
    // Reports
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    // Users & Roles
    "users.view", "users.manage", "roles.view", "roles.manage",
    "approvals.view", "approvals.action", "approvals.admin",
    // Settings
    "settings.organization", "settings.zimra", "settings.pos", "settings.accounting",
    // HR
    "payroll.view", "payroll.write", "payroll.approve",
    "payroll.leave.request", "payroll.leave.approve",
    // Compliance
    "compliance.logs", "compliance.test", "compliance.manage",
    // Bus
    "bus.view", "bus.operations", "bus.setup", "bus.reports",
    // Restaurant
    "restaurant.orders", "restaurant.kds", "restaurant.layout",
    // Manufacturing
    "manufacturing.view", "manufacturing.bom", "manufacturing.work_orders",
  ],

  // Member: basic operational access — can sell and view their own work.
  // No payroll, compliance, settings, or user-management access.
  member: [
    "nav.dashboard", "nav.pos", "nav.invoices", "nav.customers", "nav.crm",
    "nav.inventory", "nav.expenses", "nav.reports",
    "pos.sell", "pos.shift",
    "invoices.view", "invoices.create", "invoices.issue",
    "sales.order.create", "sales.discount.request",
    "crm.pipeline.view", "crm.pipeline.manage", "crm.quotation.create",
    "crm.social.view", "crm.social.capture",
    "crm.commission.view", "crm.tasks.view", "crm.tasks.respond",
    "nav.vehicles", "vehicles.view",
    "stock.view", "stock.adjust.request",
    "grn.create", "grn.view",
    "accounting.view",
    "expenses.create", "payroll.leave.request",
    "reports.sales",
  ],

  // Cashier: POS-only access.
  cashier: [
    "nav.pos",
    "nav.bus",
    "pos.sell", "pos.shift", "sales.discount.request",
    "bus.view", "bus.operations", "bus.setup", "bus.reports",
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
    "nav.reports",
    "nav.crm",
    "pos.sell", "pos.shift",
    "invoices.view", "invoices.create", "invoices.issue",
    "sales.order.create", "sales.discount.request",
    "crm.pipeline.view", "crm.pipeline.manage", "crm.quotation.create", "crm.reports.view",
    "crm.social.view", "crm.social.capture",
    "crm.commission.view", "crm.commission.request",
    "crm.tasks.view", "crm.tasks.respond",
    "nav.vehicles", "vehicles.view", "vehicles.manage", "vehicles.payments",
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
    // Invoices — can create and issue; void requires explicit grant
    "invoices.view", "invoices.create", "invoices.issue",
    "invoices.credit_note", "sales.order.create", "sales.discount.request",
    // Accounting — can create drafts, approve postings, manage periods & receipts
    "accounting.view", "accounting.journal.create", "accounting.journal.approve",
    "accounting.journal.reverse", "accounting.coa.manage", "accounting.cashbook",
    "accounting.receipts", "accounting.payments", "accounting.bills.post",
    "accounting.bills.waive", "accounting.periods", "expenses.create",
    // Reports
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    // Payroll — view only; processing requires payroll.write
    "payroll.view",
    // Compliance — view logs only; no diagnostic tests
    "compliance.logs",
  ],

  logistics: [
    "nav.dashboard",
    "nav.inventory",
    "nav.bus",
    "stock.view", "stock.adjust.request", "stock.count", "stock.transfer",
    "grn.create", "grn.view",
    "bus.view",
  ],

  manager: [
    "nav.dashboard", "nav.pos", "nav.invoices", "nav.customers", "nav.inventory",
    "nav.expenses", "nav.reports", "nav.users", "nav.approvals", "nav.restaurant", "nav.crm",
    "pos.sell", "pos.shift", "pos.void", "pos.discount",
    "invoices.view", "invoices.create", "invoices.issue", "invoices.issue.direct",
    "invoices.void", "invoices.credit_note", "invoices.credit_note.direct",
    "sales.order.create", "sales.order.confirm.direct", "sales.order.approve",
    "sales.discount.request", "sales.discount.direct", "sales.discount.approve", "sales.price-lists.manage",
    "crm.pipeline.view", "crm.pipeline.manage", "crm.quotation.create", "crm.quotation.approve",
    "crm.duplicates.merge", "crm.stages.manage", "crm.reports.view",
    "crm.social.view", "crm.social.capture", "crm.social.manage",
    "crm.commission.view", "crm.commission.manage", "crm.commission.request",
    "crm.tasks.view", "crm.tasks.manage", "crm.tasks.respond",
    "nav.vehicles", "vehicles.view", "vehicles.manage", "vehicles.costs", "vehicles.payments",
    "stock.view", "stock.adjust.request", "stock.adjust.approve", "stock.count", "stock.transfer",
    "grn.create", "grn.view", "grn.confirm",
    "purchasing.supplier.create", "purchasing.supplier.approve.direct", "purchasing.supplier.approve",
    "purchasing.requisition.request", "purchasing.requisition.approve",
    "purchasing.quote.manage", "purchasing.quote.select",
    "purchasing.po.request", "purchasing.po.approve.direct", "purchasing.po.approve",
    "accounting.view", "accounting.payments", "accounting.payments.approve",
    "expenses.create", "expenses.create.direct", "expenses.approve",
    "payroll.leave.request", "payroll.leave.approve",
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    "users.view",
    "approvals.view", "approvals.action", "approvals.admin",
    "restaurant.orders", "restaurant.kds", "restaurant.layout",
  ],

  hr: [
    "nav.dashboard", "nav.payroll", "nav.users",
    "payroll.view", "payroll.write", "payroll.leave.request",
    "users.view",
  ],

  // Finance Director: owns financial control and final payroll approval.
  // Can review and reverse postings but still works through approval policies
  // for actions submitted by other users.
  finance_director: [
    "nav.dashboard", "nav.invoices", "nav.accounting", "nav.expenses",
    "nav.reports", "nav.payroll", "nav.compliance", "nav.approvals", "nav.settings",
    "invoices.view", "invoices.approve", "invoices.void", "invoices.credit_note", "invoices.credit_note.approve",
    "sales.order.approve", "sales.discount.approve", "sales.price-lists.manage", "crm.quotation.approve",
    "accounting.view", "accounting.journal.create", "accounting.journal.approve",
    "accounting.journal.reverse", "accounting.coa.manage", "accounting.cashbook",
    "accounting.receipts", "accounting.payments", "accounting.payments.approve", "accounting.bills.post",
    "accounting.bills.waive", "accounting.periods",
    "expenses.create", "expenses.approve", "purchasing.supplier.approve", "purchasing.po.approve",
    "purchasing.requisition.approve", "purchasing.quote.select",
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    "payroll.view", "payroll.approve",
    "compliance.logs",
    "approvals.view", "approvals.action", "approvals.admin",
    "settings.accounting",
  ],

  // HR Manager: manages employees and payroll preparation and approves leave.
  hr_manager: [
    "nav.dashboard", "nav.payroll", "nav.users",
    "payroll.view", "payroll.write", "payroll.approve",
    "payroll.leave.request", "payroll.leave.approve.direct", "payroll.leave.approve",
    "users.view",
  ],

  // Payroll Clerk: prepares payroll runs but cannot approve or lock them.
  payroll_clerk: [
    "nav.dashboard", "nav.payroll",
    "payroll.view", "payroll.write", "payroll.leave.request",
  ],

  // Tax Officer: focused on statutory compliance, returns and audit evidence.
  tax_officer: [
    "nav.dashboard", "nav.accounting", "nav.reports", "nav.compliance", "nav.settings",
    "accounting.view",
    "reports.sales", "reports.financial", "reports.tax",
    "compliance.logs", "compliance.test", "compliance.manage",
    "settings.zimra",
  ],

  // Report Viewer: read-only access to cross-module reporting.
  report_viewer: [
    "nav.dashboard", "nav.invoices", "nav.inventory", "nav.accounting",
    "nav.reports", "nav.payroll", "nav.compliance", "nav.crm",
    "invoices.view", "stock.view", "grn.view", "accounting.view",
    "crm.pipeline.view", "crm.reports.view", "crm.commission.view",
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    "payroll.view", "compliance.logs",
  ],

  procurement: [
    "nav.dashboard", "nav.inventory",
    "stock.view", "stock.transfer",
    "grn.create", "grn.view", "grn.confirm",
    "purchasing.supplier.create", "purchasing.requisition.request",
    "purchasing.quote.manage", "purchasing.po.request",
  ],

  // Auditor: read-only access across all modules. No write or diagnostic actions.
  auditor: [
    "nav.dashboard", "nav.invoices", "nav.customers", "nav.inventory",
    "nav.accounting", "nav.expenses", "nav.reports", "nav.payroll", "nav.compliance", "nav.crm",
    "invoices.view", "stock.view", "grn.view", "accounting.view",
    "crm.pipeline.view", "crm.reports.view", "crm.social.view",
    "crm.commission.view", "crm.tasks.view",
    "nav.vehicles", "vehicles.view", "vehicles.costs",
    "reports.sales", "reports.inventory", "reports.financial", "reports.tax",
    "payroll.view", "users.view", "compliance.logs",
  ],

  restaurant: [
    "nav.restaurant",
    "restaurant.orders", "restaurant.kds", "restaurant.layout",
  ],
};

/** Human-readable names for the built-in role templates. */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  member: "Member",
  cashier: "Cashier",
  manufacturing: "Manufacturing",
  sales: "Sales",
  accountant: "Accountant",
  logistics: "Logistics",
  manager: "Manager",
  hr: "HR",
  finance_director: "Finance Director",
  hr_manager: "HR Manager",
  payroll_clerk: "Payroll Clerk",
  tax_officer: "Tax Officer",
  report_viewer: "Report Viewer",
  procurement: "Procurement",
  auditor: "Auditor",
  restaurant: "Restaurant",
};

/** Map nav hrefs to required permission.
 * IMPORTANT: Every client-side route must appear here.
 * Any path NOT listed will be DENIED by default (canAccessPath returns false).
 */
export const NAV_PERMISSION_MAP: Record<string, PermissionKey | PermissionKey[]> = {
  // ─── Dashboard ───────────────────────────────────────────────────────────────
  "/dashboard": "nav.dashboard",

  // ─── Sales / POS ─────────────────────────────────────────────────────────────
  "/pos": "nav.pos",
  "/pos/my-sales": "nav.pos",
  "/pos/all-sales": "nav.pos",
  "/invoices": "nav.invoices",
  "/invoices/new": "nav.invoices",
  "/invoice-templates": "nav.invoices",
  "/recurring": "nav.invoices",
  "/payments-received": "nav.invoices",
  "/customers": "nav.customers",
  "/crm": "nav.crm",
  "/crm/enquiries": "nav.crm",
  "/crm/commissions": "nav.crm",
  "/vehicles": "nav.vehicles",
  "/vehicles/costing": "nav.vehicles",
  "/vehicles/profitability": "nav.vehicles",
  "/vehicles/statements": "nav.vehicles",
  "/quotations": "nav.invoices",
  "/quotations/new": "nav.invoices",
  "/sales-orders": "nav.invoices",
  "/pick-lists": ["nav.invoices", "nav.inventory"],
  "/compound-products": "nav.invoices",
  "/sales-order-reports": "nav.invoices",
  "/sales-reports": ["nav.reports", "reports.sales"],

  // ─── Procurement / Inventory ──────────────────────────────────────────────────
  "/products": "nav.inventory",
  "/serial-tracking": "nav.inventory",
  "/services": "nav.inventory",
  "/suppliers": "nav.inventory",
  "/stock-receipt": "nav.inventory",
  "/inventory": "nav.inventory",
  "/inventory/purchase-orders": "nav.inventory",
  "/inventory/purchase-returns": "nav.inventory",
  "/inventory/account": "nav.inventory",
  "/inventory/production": "nav.inventory",
  "/inventory/adjustments": "nav.inventory",
  "/inventory/stock-counts": "nav.inventory",
  "/inventory/stock-take": "nav.inventory",
  "/inventory/bulk-adjust": "nav.inventory",
  "/inventory/transfers": "nav.inventory",
  "/inventory/locations": "nav.inventory",
  "/inventory/grvs": "nav.inventory",
  // Inventory sub-reports
  "/inventory/adjustments/report": "nav.inventory",
  "/inventory/reports/ledger": "nav.inventory",
  "/inventory/reports/overview": "nav.inventory",
  "/inventory/reports/historical": "nav.inventory",
  "/inventory/reports/dead-stock": "nav.inventory",
  "/inventory/reports/production": "nav.inventory",

  // ─── Manufacturing ────────────────────────────────────────────────────────────
  "/manufacturing": "nav.manufacturing",
  "/manufacturing/bom": "nav.manufacturing",
  "/manufacturing/production-runs": "nav.manufacturing",
  "/manufacturing/work-centers": "nav.manufacturing",
  "/manufacturing/routings": "nav.manufacturing",
  "/manufacturing/mrp": "nav.manufacturing",
  "/manufacturing/reports": "nav.manufacturing",
  "/manufacturing/standard-costs": "nav.manufacturing",

  // ─── Accounting / Finance ─────────────────────────────────────────────────────
  "/accounting": "nav.accounting",
  "/accounting/dashboard": "nav.accounting",
  "/accounting/coa": "nav.accounting",
  "/accounting/journal": "nav.accounting",
  "/accounting/cashbook": "nav.accounting",
  "/accounting/reconciliation": "nav.accounting",
  "/accounting/accounts-payable": "nav.accounting",
  "/accounting/accounts-receivable": "nav.accounting",
  "/accounting/allocations": "nav.accounting",
  "/accounting/periods": "nav.accounting",
  "/accounting/segments": "nav.accounting",
  "/accounting/opening-balances": "nav.accounting",
  "/accounting/fixed-assets": "nav.accounting",
  "/accounting/fixed-assets/depreciation": "nav.accounting",
  "/accounting/audit-trail": "nav.accounting",
  "/supplier-invoices": "nav.accounting",
  "/supplier-credit-notes": "nav.accounting",
  // Financial reports
  "/accounting/reports/financial": "nav.accounting",
  "/accounting/reports/balance-sheet": "nav.accounting",
  "/accounting/reports/cash-flow": "nav.accounting",
  "/accounting/reports/trial-balance": "nav.accounting",
  "/accounting/reports/ledger": "nav.accounting",
  "/accounting/reports/aging": "nav.accounting",
  "/accounting/reports/cost-centers": "nav.accounting",
  "/accounting/reports/vat-return": "nav.accounting",

  // ─── Expenses ─────────────────────────────────────────────────────────────────
  "/expenses": "nav.expenses",

  // ─── Reports ─────────────────────────────────────────────────────────────────
  "/reports": "nav.reports",
  "/reports/sales": "nav.reports",
  "/reports/daily": "nav.reports",
  "/reports/pos": "nav.reports",
  "/reports/sales-by-customer": "nav.reports",
  "/reports/sales-by-item": "nav.reports",
  "/reports/tax": "nav.reports",
  "/reports/tax-summary": "nav.reports",
  "/reports/inventory": "nav.reports",
  "/reports/financial": "nav.reports",
  "/reports/branches": "nav.reports",
  "/reports/customer-statements": "nav.reports",
  "/reports/customer-balance-summary": "nav.reports",
  "/reports/cash-collection": "nav.reports",
  "/reports/payments-received": "nav.reports",
  "/reports/ar-aging-summary": "nav.reports",
  "/reports/receivable-details": "nav.reports",
  "/reports/stock-on-hand": "nav.reports",
  "/reports/stock-alerts": "nav.reports",
  "/reports/inventory-movements": "nav.reports",
  "/reports/profit-margins-product": "nav.reports",
  "/reports/stock-movement": "nav.reports",
  "/reports/purchase-report": "nav.reports",
  "/reports/operational-daily": "nav.reports",
  "/reports/operational-weekly": "nav.reports",
  "/reports/operational-monthly": "nav.reports",
  "/reports/partnership-sales": "nav.reports",

  // ─── Restaurant ───────────────────────────────────────────────────────────────
  "/restaurant": "nav.restaurant",
  "/restaurant/orders": "nav.restaurant",
  "/restaurant/kds": "nav.restaurant",
  "/restaurant/layout": "nav.restaurant",

  // ─── Payroll / HR ─────────────────────────────────────────────────────────────
  "/payroll": "nav.payroll",
  "/hr": "nav.payroll",
  "/hr/payroll": "nav.payroll",
  "/hr/employees": "nav.payroll",
  "/hr/leave": "nav.payroll",
  "/hr/loans": "nav.payroll",
  "/hr/setup": "nav.payroll",
  "/hr/reports": "nav.payroll",
  "/hr/reports/zimra": "nav.payroll",
  "/hr/reports/remittances": "nav.payroll",

  // ─── Bus Ticketing ────────────────────────────────────────────────────────────
  "/bus/dashboard": "nav.bus",
  "/bus/trips": "nav.bus",
  "/bus/fleet": "nav.bus",
  "/bus/conductors": "nav.bus",
  "/bus/reports": "nav.bus",

  // ─── Tax & Compliance ─────────────────────────────────────────────────────────
  "/zimra-logs": "nav.compliance",
  "/fdms-test": "nav.compliance",
  "/jobs": "nav.compliance",
  "/api-logs": "nav.compliance",

  // ─── Settings ─────────────────────────────────────────────────────────────────
  "/settings": "nav.settings",
  "/currencies": "nav.settings",
  "/zimra-settings": "nav.settings",
  "/tax-config": "nav.settings",

  // ─── Administration ───────────────────────────────────────────────────────────
  "/team-settings": "nav.users",
  "/approvals": "nav.approvals",
  "/audit-logs": "nav.users",
  "/system/mx-3f7a": "nav.users",

  // ─── Profile (always allowed for any authenticated user) ──────────────────────
  // NOTE: /profile is handled directly in ProtectedRoute — do not add here.
};

export const APPROVAL_TYPES = {
  STOCK_ADJUSTMENT: "stock_adjustment",
  GRN_CONFIRM: "grn_confirm",
  JOURNAL_POST: "journal_post",
  INVOICE_ISSUE: "invoice_issue",
  SALES_COMMISSION: "sales_commission",
  QUOTATION: "quotation",
  DISCOUNT: "discount",
  SALES_ORDER: "sales_order",
  PURCHASE_ORDER: "purchase_order",
  SUPPLIER_REGISTRATION: "supplier_registration",
  REQUISITION: "requisition",
  CREDIT_NOTE: "credit_note",
  PAYMENT_EXECUTION: "payment_execution",
  LEAVE: "leave",
  EXPENSE: "expense",
} as const;

export type ApprovalType = (typeof APPROVAL_TYPES)[keyof typeof APPROVAL_TYPES];

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  stock_adjustment: "Stock Adjustment",
  grn_confirm: "Goods Received",
  journal_post: "Journal Posting",
  invoice_issue: "Invoice Issuance",
  sales_commission: "Sales Commission",
  quotation: "Quotation",
  discount: "Discount Override",
  sales_order: "Sales Order",
  purchase_order: "Purchase Order",
  supplier_registration: "Supplier Registration",
  requisition: "Purchase Requisition",
  credit_note: "Credit Note",
  payment_execution: "Payment Execution",
  leave: "Leave",
  expense: "Expense",
};

/** Permission required to approve each approval type */
export const APPROVAL_TYPE_PERMISSION: Record<ApprovalType, PermissionKey> = {
  stock_adjustment: "stock.adjust.approve",
  grn_confirm: "grn.confirm",
  journal_post: "accounting.journal.approve",
  invoice_issue: "invoices.approve",
  sales_commission: "crm.commission.approve",
  quotation: "crm.quotation.approve",
  discount: "sales.discount.approve",
  sales_order: "sales.order.approve",
  purchase_order: "purchasing.po.approve",
  supplier_registration: "purchasing.supplier.approve",
  requisition: "purchasing.requisition.approve",
  credit_note: "invoices.credit_note.approve",
  payment_execution: "accounting.payments.approve",
  leave: "payroll.leave.approve",
  expense: "expenses.approve",
};

/** Permission for direct action (bypass approval) */
export const DIRECT_ACTION_PERMISSION: Record<ApprovalType, PermissionKey> = {
  stock_adjustment: "stock.adjust.direct",
  grn_confirm: "grn.confirm.direct",
  journal_post: "accounting.journal.post.direct",
  invoice_issue: "invoices.issue.direct",
  sales_commission: "crm.commission.approve",
  quotation: "crm.quotation.approve",
  discount: "sales.discount.direct",
  sales_order: "sales.order.confirm.direct",
  purchase_order: "purchasing.po.approve.direct",
  supplier_registration: "purchasing.supplier.approve.direct",
  requisition: "purchasing.requisition.direct",
  credit_note: "invoices.credit_note.direct",
  payment_execution: "accounting.payments.direct",
  leave: "payroll.leave.approve.direct",
  expense: "expenses.create.direct",
};

/** Permission to request (submit for approval) */
export const REQUEST_ACTION_PERMISSION: Record<ApprovalType, PermissionKey> = {
  stock_adjustment: "stock.adjust.request",
  grn_confirm: "grn.create",
  journal_post: "accounting.journal.create",
  invoice_issue: "invoices.issue",
  sales_commission: "crm.commission.request",
  quotation: "crm.quotation.create",
  discount: "sales.discount.request",
  sales_order: "sales.order.create",
  purchase_order: "purchasing.po.request",
  supplier_registration: "purchasing.supplier.create",
  requisition: "purchasing.requisition.request",
  credit_note: "invoices.credit_note",
  payment_execution: "accounting.payments",
  leave: "payroll.leave.request",
  expense: "expenses.create",
};
