
import { pgTable, text, serial, integer, boolean, timestamp, decimal, numeric, jsonb, primaryKey, uuid, date, unique, index, doublePrecision, type AnyPgColumn } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users - Compatible with Supabase Auth
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), // Use UUID for Supabase Auth compatibility
  email: text("email").unique().notNull(),
  password: text("password"),
  name: text("name"),
  username: text("username").unique(),
  passwordChanged: boolean("password_changed").default(false),
  pin: text("pin"), // Encrypted PIN for POS overrides
  ownerGroupScope: text("owner_group_scope"), // Optional data-scope guard (e.g. Beauty, Mother)
  createdAt: timestamp("created_at").defaultNow(),
  isSuperAdmin: boolean("is_super_admin").default(false),
});

export const usersRelations = relations(users, ({ many }) => ({
  companyUsers: many(companyUsers),
  branchUsers: many(branchUsers),
  busTrips: many(busTrips),
  busShifts: many(busShifts),
}));

export const resetTokens = pgTable("reset_tokens", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  method: text("method").notNull(),
  path: text("path").notNull(),
  statusCode: integer("status_code").notNull(),
  responseBody: jsonb("response_body").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  expiresAtIdx: index("idempotency_keys_expires_at_idx").on(table.expiresAt),
}));

// Companies (Tenants)
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tradingName: text("trading_name"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  country: text("country").default("Zimbabwe"),
  currency: text("currency").default("USD"),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  website: text("website"),
  logoUrl: text("logo_url"),

  // ZIMRA Compliance
  tin: text("tin").unique(),
  vatNumber: text("vat_number"),
  bpNumber: text("bp_number"),
  nssaEmployerNumber: text("nssa_employer_number"),
  vatEnabled: boolean("vat_enabled").default(true),
  defaultPaymentTerms: text("default_payment_terms"),
  correctionPeriodMonths: integer("correction_period_months").default(12), // Credit/debit note correction window
  fiscalDayStalenessHours: integer("fiscal_day_staleness_hours").default(24), // Hours before fiscal day considered stale
  bankDetails: text("bank_details"),
  payrollBankExportFormat: jsonb("payroll_bank_export_format"),
  fdmsDeviceId: text("fdms_device_id"),
  fdmsDeviceSerialNo: text("fdms_device_serial_no"), // ZIMRA Field [21] - Device Serial Number
  fdmsApiKey: text("fdms_api_key"),
  apiKey: text("api_key").unique(), // For external device authentication
  apiKeyCreatedAt: timestamp("api_key_created_at"),
  zimraPrivateKey: text("zimra_private_key"),
  zimraCertificate: text("zimra_certificate"),
  zimraEnvironment: text("zimra_environment").default("test"), // "test" or "production"
  fiscalDayOpen: boolean("fiscal_day_open").default(false),
  currentFiscalDayNo: integer("current_fiscal_day_no").default(0),
  fiscalDayOpenedAt: timestamp("fiscal_day_opened_at"),
  lastFiscalDayStatus: text("last_fiscal_day_status"),

  // Customization
  invoiceTemplate: text("invoice_template").default("modern"),
  primaryColor: text("primary_color").default("#4f46e5"),

  lastReceiptGlobalNo: integer("last_receipt_global_no").default(0),
  deviceReportingFrequency: integer("device_reporting_frequency").default(1440), // Default 24h/1440m just in case
  lastPing: timestamp("last_ping"),
  lastFiscalHash: text("last_fiscal_hash"), // To store previous receipt hash for chaining
  dailyReceiptCount: integer("daily_receipt_count").default(0), // To track RCPT011
  branchName: text("branch_name"), // ZIMRA Field [5] - Branch name (if different from company name)
  qrUrl: text("qr_url"), // ZIMRA Field [48] - URL for QR validation

  // Banking Details
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  branchCode: text("branch_code"),
  vatRegistered: boolean("vat_registered").default(true),
  emailSettings: jsonb("email_settings"),
  posSettings: jsonb("pos_settings"), // Stores receipt header/footer, auto-print defaults etc.
  accountingSettings: jsonb("accounting_settings"), // Stores default GL accounts for automated system postings.
  lastReceiptAt: timestamp("last_receipt_at"),

  // Inventory Settings
  inventoryValuationMethod: text("inventory_valuation_method").default("WAC"), // WAC, FIFO, LIFO

  subscriptionEndDate: timestamp("subscription_end_date"),
  subscriptionStatus: text("subscription_status").default("inactive"), // active, inactive, expired
  registeredMacAddress: text("registered_mac_address"), // Physical device binding
  restaurantSettings: jsonb("restaurant_settings"), // Stores floor plan layout etc.
  pharmacySettings: jsonb("pharmacy_settings"), // { enabled: boolean, licenseNo: string, etc }
  busSettings: jsonb("bus_settings"), // Controls bus-ticketing feature visibility for web and APK.
  approvalSettings: jsonb("approval_settings"), // Company-level approval policy per action type
  partnershipSettings: jsonb("partnership_settings"), // Dual-logo and partnership display settings
  appMode: text("app_mode").default("pos"), // pos, restaurant, bus_ticketing
  superadminVisible: boolean("superadmin_visible").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Branches (Locations)
export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  code: text("code"), // Optional internal code
  address: text("address"),
  city: text("city"),
  phone: text("phone"),
  email: text("email"),

  // ZIMRA Compliance - Overrides company-level defaults
  fdmsDeviceId: text("fdms_device_id"),
  fdmsDeviceSerialNo: text("fdms_device_serial_no"),
  fdmsApiKey: text("fdms_api_key"),
  zimraPrivateKey: text("zimra_private_key"),
  zimraCertificate: text("zimra_certificate"),
  zimraEnvironment: text("zimra_environment"), // "test" or "production"
  
  // Fiscal State
  fiscalDayOpen: boolean("fiscal_day_open").default(false),
  currentFiscalDayNo: integer("current_fiscal_day_no").default(0),
  fiscalDayOpenedAt: timestamp("fiscal_day_opened_at"),
  lastFiscalDayStatus: text("last_fiscal_day_status"),
  lastReceiptGlobalNo: integer("last_receipt_global_no").default(0),
  dailyReceiptCount: integer("daily_receipt_count").default(0),
  lastFiscalHash: text("last_fiscal_hash"),
  lastReceiptAt: timestamp("last_receipt_at"),
  qrUrl: text("qr_url"),
  correctionPeriodMonths: integer("correction_period_months"), // Override company correction period
  fiscalDayStalenessHours: integer("fiscal_day_staleness_hours"), // Override company staleness threshold

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(companyUsers),
  accessRoles: many(companyAccessRoles),
  branches: many(branches),
  inventoryLocations: many(inventoryLocations),
  customers: many(customers),
  products: many(products),
  invoices: many(invoices),
  suppliers: many(suppliers),
  expenses: many(expenses),
  busVehicles: many(busVehicles),
  busRoutes: many(busRoutes),
  busTrips: many(busTrips),
  busTickets: many(busTickets),
  busShifts: many(busShifts),
  busReconciliations: many(busReconciliations),
  accounts: many(accounts),
  journalEntries: many(journalEntries),
  employees: many(employees),
  payrollRuns: many(payrollRuns),
  departments: many(departments),
  positions: many(positions),
  payrollPayGrades: many(payrollPayGrades),
  leaveRequests: many(leaveRequests),
  employeeLoans: many(employeeLoans),
  disciplinaryRecords: many(disciplinaryRecords),
  assignedAssets: many(assignedAssets),
  paymentBatches: many(paymentBatches),
  employeeDocuments: many(employeeDocuments),
  payrollStatutoryReports: many(payrollStatutoryReports),
  payrollRemittances: many(payrollRemittances),
  employeeSalaryChanges: many(employeeSalaryChanges),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  company: one(companies, { fields: [branches.companyId], references: [companies.id] }),
  users: many(branchUsers),
  stocks: many(branchStocks),
  invoices: many(invoices),
  posShifts: many(posShifts),
  employees: many(employees),
  payrollRuns: many(payrollRuns),
}));

// User access to specific branches
export const branchUsers = pgTable("branch_users", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  role: text("role").default("staff"), // manager, staff
}, (table) => ({
  userBranchIdx: index("branch_users_user_id_idx").on(table.userId),
  branchIdIdx: index("branch_users_branch_id_idx").on(table.branchId),
}));

export const branchUsersRelations = relations(branchUsers, ({ one }) => ({
  user: one(users, { fields: [branchUsers.userId], references: [users.id] }),
  branch: one(branches, { fields: [branchUsers.branchId], references: [branches.id] }),
}));

// Multi-branch stock levels
export const branchStocks = pgTable("branch_stocks", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  stockLevel: decimal("stock_level", { precision: 10, scale: 2 }).default("0"),
  lowStockThreshold: decimal("low_stock_threshold", { precision: 10, scale: 2 }).default("10"),
}, (table) => ({
  branchProductUnique: unique("branch_product_unique").on(table.branchId, table.productId),
  branchIdIdx: index("branch_stocks_branch_id_idx").on(table.branchId),
  productIdIdx: index("branch_stocks_product_id_idx").on(table.productId),
}));

export const branchStocksRelations = relations(branchStocks, ({ one }) => ({
  branch: one(branches, { fields: [branchStocks.branchId], references: [branches.id] }),
  product: one(products, { fields: [branchStocks.productId], references: [products.id] }),
}));

export const inventoryLocations = pgTable("inventory_locations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  type: text("type").default("WAREHOUSE").notNull(), // WAREHOUSE, BRANCH, VAN, SHOP_FLOOR
  name: text("name").notNull(),
  code: text("code"),
  address: text("address"),
  branchId: integer("branch_id").references(() => branches.id),
  isDefaultReceiving: boolean("is_default_receiving").default(false).notNull(),
  isDefaultDispatch: boolean("is_default_dispatch").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyIdx: index("inventory_locations_company_idx").on(table.companyId),
  branchIdx: index("inventory_locations_branch_idx").on(table.branchId),
  companyCodeIdx: unique("inventory_locations_company_code_idx").on(table.companyId, table.code),
}));

export const inventoryLocationStocks = pgTable("inventory_location_stocks", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").references(() => inventoryLocations.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  stockLevel: decimal("stock_level", { precision: 10, scale: 2 }).default("0").notNull(),
  reservedQuantity: decimal("reserved_quantity", { precision: 10, scale: 2 }).default("0").notNull(),
  availableQuantity: decimal("available_quantity", { precision: 10, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  locationProductUnique: unique("inventory_location_stocks_location_product_idx").on(table.locationId, table.productId),
  locationIdx: index("inventory_location_stocks_location_idx").on(table.locationId),
  productIdx: index("inventory_location_stocks_product_idx").on(table.productId),
}));

export const inventoryLocationsRelations = relations(inventoryLocations, ({ one, many }) => ({
  company: one(companies, { fields: [inventoryLocations.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [inventoryLocations.branchId], references: [branches.id] }),
  stocks: many(inventoryLocationStocks),
}));

export const inventoryLocationStocksRelations = relations(inventoryLocationStocks, ({ one }) => ({
  location: one(inventoryLocations, { fields: [inventoryLocationStocks.locationId], references: [inventoryLocations.id] }),
  product: one(products, { fields: [inventoryLocationStocks.productId], references: [products.id] }),
}));

// Company-scoped custom roles with granular permissions
export const companyRoles = pgTable("company_roles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false),
  legacyRole: text("legacy_role"), // owner, admin, member, cashier
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("company_roles_company_id_idx").on(table.companyId),
  companyNameUnique: unique("company_roles_company_name_unique").on(table.companyId, table.name),
}));

export const companyRolePermissions = pgTable("company_role_permissions", {
  roleId: integer("role_id").references(() => companyRoles.id, { onDelete: "cascade" }).notNull(),
  permission: text("permission").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.permission] }),
}));

export const companyRolesRelations = relations(companyRoles, ({ one, many }) => ({
  company: one(companies, { fields: [companyRoles.companyId], references: [companies.id] }),
  permissions: many(companyRolePermissions),
}));

export const companyRolePermissionsRelations = relations(companyRolePermissions, ({ one }) => ({
  role: one(companyRoles, { fields: [companyRolePermissions.roleId], references: [companyRoles.id] }),
}));

export const approvalRequests = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  type: text("type").notNull(), // stock_adjustment, grn_confirm, journal_post, invoice_issue
  status: text("status").default("pending").notNull(), // pending, approved, rejected, cancelled
  title: text("title").notNull(),
  description: text("description"),
  payload: jsonb("payload").notNull(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  requestedBy: uuid("requested_by").references(() => users.id).notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  resultData: jsonb("result_data"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyStatusIdx: index("approval_requests_company_status_idx").on(table.companyId, table.status),
  typeIdx: index("approval_requests_type_idx").on(table.type),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
  company: one(companies, { fields: [approvalRequests.companyId], references: [companies.id] }),
  requester: one(users, { fields: [approvalRequests.requestedBy], references: [users.id] }),
  reviewer: one(users, { fields: [approvalRequests.reviewedBy], references: [users.id] }),
}));

// Join table for Users <-> Companies
export const companyUsers = pgTable("company_users", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  role: text("role").default("member"), // owner, admin, member, cashier, manufacturing (legacy)
  accessRoleId: integer("access_role_id").references(() => companyAccessRoles.id),
  companyRoleId: integer("company_role_id").references(() => companyRoles.id),
}, (table) => {
  return {
    userIdIdx: index("company_users_user_id_idx").on(table.userId),
    companyIdIdx: index("company_users_company_id_idx").on(table.companyId),
    accessRoleIdx: index("company_users_access_role_idx").on(table.accessRoleId),
    companyRoleIdx: index("company_users_company_role_idx").on(table.companyRoleId),
  };
});

export const companyUsersRelations = relations(companyUsers, ({ one }) => ({
  user: one(users, { fields: [companyUsers.userId], references: [users.id] }),
  company: one(companies, { fields: [companyUsers.companyId], references: [companies.id] }),
  accessRole: one(companyAccessRoles, { fields: [companyUsers.accessRoleId], references: [companyAccessRoles.id] }),
  companyRole: one(companyRoles, { fields: [companyUsers.companyRoleId], references: [companyRoles.id] }),
}));

export const companyAccessRoles = pgTable("company_access_roles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyNameIdx: unique("company_access_roles_company_name_idx").on(table.companyId, table.name),
  companyIdx: index("company_access_roles_company_idx").on(table.companyId),
}));

export const companyAccessRolesRelations = relations(companyAccessRoles, ({ one, many }) => ({
  company: one(companies, { fields: [companyAccessRoles.companyId], references: [companies.id] }),
  createdByUser: one(users, { fields: [companyAccessRoles.createdBy], references: [users.id] }),
  members: many(companyUsers),
}));

export const insertCompanyAccessRoleSchema = createInsertSchema(companyAccessRoles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  isSystem: true,
});
export type CompanyAccessRole = typeof companyAccessRoles.$inferSelect;
export type InsertCompanyAccessRole = z.infer<typeof insertCompanyAccessRoleSchema>;

// Customers
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  address: text("address"),
  billingAddress: text("billing_address"),
  city: text("city"),
  country: text("country").default("Zimbabwe"),
  tin: text("tin"),
  vatNumber: text("vat_number"),
  bpNumber: text("bp_number"),
  customerType: text("customer_type").default("individual"), // individual, business
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }).default("0.00"),
  creditDays: integer("credit_days").default(0), // Standard payment terms in days
  currency: text("currency").default("USD"),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("customers_company_id_idx").on(table.companyId),
  };
});

export const customersRelations = relations(customers, ({ one, many }) => ({
  company: one(companies, { fields: [customers.companyId], references: [companies.id] }),
  invoices: many(invoices),
}));

// Tax Types
export const taxTypes = pgTable("tax_types", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id), // Nullable for system defaults if any
  code: text("code").notNull(), // VAT-STD, VAT-ZERO
  name: text("name").notNull(),
  description: text("description"),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  zimraCode: text("zimra_code"), // A, B, E, C
  zimraTaxId: text("zimra_tax_id"), // Optional ZIMRA ID e.g. "3"
  defaultHsCode: text("default_hs_code"), // Default HS code used for this tax type
  calculationMethod: text("calculation_method").default("INCLUSIVE"), // INCLUSIVE, EXCLUSIVE
}, (table) => {
  return {
//    companyCodeUnique: unique("company_code_idx").on(table.companyId, table.code),
  };
});

// Tax Categories
export const taxCategories = pgTable("tax_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  defaultTaxTypeId: integer("default_tax_type_id").references(() => taxTypes.id),
  zimraCategoryCode: text("zimra_category_code"), // GOODS_STD, FOOD_BASIC
  description: text("description"),
  isActive: boolean("is_active").default(true),
}, (table) => {
  return {
//    companyNameUnique: unique("company_name_idx").on(table.companyId, table.name),
  };
});

export const insertTaxCategorySchema = createInsertSchema(taxCategories).omit({ id: true, companyId: true });
export type InsertTaxCategory = z.infer<typeof insertTaxCategorySchema>;
export type TaxCategory = typeof taxCategories.$inferSelect;

export const insertTaxTypeSchema = createInsertSchema(taxTypes, {
  rate: z.string().or(z.number()),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional().nullable(),
}).omit({ id: true, companyId: true });
export type InsertTaxType = z.infer<typeof insertTaxTypeSchema>;
export type TaxType = typeof taxTypes.$inferSelect;

export const taxRateHistory = pgTable("tax_rate_history", {
  id: serial("id").primaryKey(),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  reason: text("reason"),
  gazetteReference: text("gazette_reference"),
});

// Products
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku"),
  barcode: text("barcode"),
  unitOfMeasure: text("unit_of_measure"),
  hsCode: text("hs_code").default("0000.00.00"),
  category: text("category"),
  ownerGroup: text("owner_group"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  costPrice: decimal("cost_price", { precision: 14, scale: 6 }),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("15.50"), // Default VAT

  // Inventory
  isTracked: boolean("is_tracked").default(false),
  stockLevel: decimal("stock_level", { precision: 10, scale: 2 }).default("0"),
  lowStockThreshold: decimal("low_stock_threshold", { precision: 10, scale: 2 }).default("10"),
  sellByWeight: boolean("sell_by_weight").default(false),

  isActive: boolean("is_active").default(true),
  productType: text("product_type").default("good").notNull(), // "good" or "service"
  taxCategoryId: integer("tax_category_id").references(() => taxCategories.id),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  
  // Recipe Flags
  isIngredient: boolean("is_ingredient").default(false), // e.g. Flour, Sugar
  hasRecipe: boolean("has_recipe").default(false), // e.g. Burger, Cake
  isCompound: boolean("is_compound").default(false), // e.g. Hampers, Combo Meals

  // POS Visibility
  isForSale: boolean("is_for_sale").default(true).notNull(), // When false, hides from POS/invoicing (raw materials)
  
  // Visuals
  imageUrl: text("image_url"),
  
  // Pharmacy & Batch Tracking
  isPrescriptionOnly: boolean("is_prescription_only").default(false),
  batchTrackingEnabled: boolean("batch_tracking_enabled").default(false),
  brandName: text("brand_name"),
  genericName: text("generic_name"),
  oemPartNumber: text("oem_part_number"),
  supplierPartNumber: text("supplier_part_number"),
  alternatePartNumbers: jsonb("alternate_part_numbers").$type<string[]>().default([]),
  vehicleFitment: jsonb("vehicle_fitment").$type<Array<{ make?: string; model?: string; yearFrom?: number; yearTo?: number; engine?: string; variant?: string }>>().default([]),
  fitmentNotes: text("fitment_notes"),
  serialTrackingEnabled: boolean("serial_tracking_enabled").default(false),
  warrantyTrackingEnabled: boolean("warranty_tracking_enabled").default(false),
  warrantyMonths: integer("warranty_months").default(0),

  // Multi-Lingual Product Support
  originalLanguageName: text("original_language_name"),
  originalLanguageCode: text("original_language_code"), // e.g., 'zh', 'fr', 'es'
  translationVerified: boolean("translation_verified").default(false),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("products_company_id_idx").on(table.companyId),
//    companySkuUnique: unique("products_company_sku_idx").on(table.companyId, table.sku),
  };
});

export const productsRelations = relations(products, ({ one, many }) => ({
  company: one(companies, { fields: [products.companyId], references: [companies.id] }),
  branchStocks: many(branchStocks),
  inventoryTransactions: many(inventoryTransactions),
  compoundItems: many(compoundProductItems, { relationName: "parentProduct" }),
}));

// Product Categories
export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("product_categories_company_id_idx").on(table.companyId),
//    companyNameUnique: unique("product_categories_company_name_idx").on(table.companyId, table.name),
  };
});

export const productCategoriesRelations = relations(productCategories, ({ one }) => ({
  company: one(companies, { fields: [productCategories.companyId], references: [companies.id] }),
}));

export const insertProductCategorySchema = createInsertSchema(productCategories).omit({ id: true, createdAt: true });
export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;

export const companyPartners = pgTable("company_partners", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  tradingName: text("trading_name"),
  logoUrl: text("logo_url"),
  tin: text("tin"),
  vatNumber: text("vat_number"),
  displayLabel: text("display_label").default("In partnership with"),
  defaultRevenueSharePercent: decimal("default_revenue_share_percent", { precision: 5, scale: 2 }).default("0"),
  ownerGroupMatch: text("owner_group_match"),
  invoiceTemplate: text("invoice_template"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("company_partners_company_id_idx").on(table.companyId),
}));

export const companyPartnersRelations = relations(companyPartners, ({ one }) => ({
  company: one(companies, { fields: [companyPartners.companyId], references: [companies.id] }),
}));

// Validation Errors
export const validationErrors = pgTable("validation_errors", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  errorCode: text("error_code").notNull(), // RCPT010, RCPT011, etc.
  errorMessage: text("error_message").notNull(),
  errorColor: text("error_color").notNull(), // Grey, Yellow, Red
  requiresPreviousReceipt: boolean("requires_previous_receipt").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});


// Product Variations (e.g., 500mg, 1000mg, 10-pack, 20-pack)
export const productVariations = pgTable("product_variations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  name: text("name").notNull(), // e.g. "500mg" or "Box of 20"
  sku: text("sku"),
  barcode: text("barcode"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  baseUnitMultiplier: decimal("base_unit_multiplier", { precision: 10, scale: 4 }).default("1.0000"), // UoM conversion
  stockLevel: decimal("stock_level", { precision: 10, scale: 2 }).default("0"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product Batches (Expiry Dates & Batch Numbers)
export const productBatches = pgTable("product_batches", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  variationId: integer("variation_id").references(() => productVariations.id),
  batchNumber: text("batch_number").notNull(),
  manufacturingDate: date("manufacturing_date"),
  expiryDate: date("expiry_date").notNull(),
  stockLevel: decimal("stock_level", { precision: 10, scale: 2 }).default("0"),
  costPrice: decimal("cost_price", { precision: 14, scale: 6 }),
  isExpired: boolean("is_expired").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  productIdIdx: index("product_batches_product_id_idx").on(table.productId),
  batchNumberIdx: index("product_batches_number_idx").on(table.batchNumber),
}));

export const productVariationsRelations = relations(productVariations, ({ one, many }) => ({
  product: one(products, { fields: [productVariations.productId], references: [products.id] }),
  batches: many(productBatches),
}));

export const productBatchesRelations = relations(productBatches, ({ one }) => ({
  product: one(products, { fields: [productBatches.productId], references: [products.id] }),
  variation: one(productVariations, { fields: [productBatches.variationId], references: [productVariations.id] }),
}));

// Price Adjustments
export const priceAdjustments = pgTable("price_adjustments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  variationId: integer("variation_id").references(() => productVariations.id),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }).notNull(),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("price_adj_company_id_idx").on(table.companyId),
  productIdIdx: index("price_adj_product_id_idx").on(table.productId),
}));

export const priceAdjustmentsRelations = relations(priceAdjustments, ({ one }) => ({
  company: one(companies, { fields: [priceAdjustments.companyId], references: [companies.id] }),
  product: one(products, { fields: [priceAdjustments.productId], references: [products.id] }),
  variation: one(productVariations, { fields: [priceAdjustments.variationId], references: [productVariations.id] }),
  user: one(users, { fields: [priceAdjustments.createdBy], references: [users.id] }),
}));

export const insertProductVariationSchema = createInsertSchema(productVariations).omit({ id: true, createdAt: true });
export const insertProductBatchSchema = createInsertSchema(productBatches).omit({ id: true, createdAt: true });
export const insertPriceAdjustmentSchema = createInsertSchema(priceAdjustments).omit({ id: true, createdAt: true });
export type ProductVariation = typeof productVariations.$inferSelect;
export type InsertProductVariation = z.infer<typeof insertProductVariationSchema>;
export type ProductBatch = typeof productBatches.$inferSelect;
export type InsertProductBatch = z.infer<typeof insertProductBatchSchema>;
export type PriceAdjustment = typeof priceAdjustments.$inferSelect;
export type InsertPriceAdjustment = z.infer<typeof insertPriceAdjustmentSchema>;

// Invoices
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id), // Nullable for migration
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  salesOrderId: integer("sales_order_id").references((): AnyPgColumn => salesOrders.id),

  invoiceNumber: text("invoice_number").notNull(),
  issueDate: timestamp("issue_date").defaultNow(),
  dueDate: timestamp("due_date").notNull(),

  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),

  // Status
  status: text("status").default("draft"), // draft, issued, paid, cancelled
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  taxInclusive: boolean("tax_inclusive").default(false),
  isPos: boolean("is_pos").default(false),
  shiftId: integer("shift_id").references(() => posShifts.id), // Link to POS shift
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),

  // Locking
  lockedBy: uuid("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),

  // ZIMRA Fiscal Fields
  fiscalCode: text("fiscal_code"),
  fiscalSignature: text("fiscal_signature"),
  qrCodeData: text("qr_code_data"),
  verificationCode: text("verification_code"),
  syncedWithFdms: boolean("synced_with_fdms").default(false),
  fdmsStatus: text("fdms_status").default("pending"), // pending, issued, failed
  submissionId: text("submission_id"),
  fiscalDayNo: integer("fiscal_day_no"), // To track which fiscal day this invoice belongs to
  receiptCounter: integer("receipt_counter"), // ZIMRA Field [17] - Daily receipt counter
  receiptGlobalNo: integer("receipt_global_no"), // ZIMRA Field [18] - Global receipt number

  // Validation Status
  validationStatus: text("validation_status"), // valid, invalid, grey, null
  lastValidationAttempt: timestamp("last_validation_attempt"),

  currency: text("currency").default("USD"),
  paymentMethod: text("payment_method").default("CASH"), // Legacy/Primary method
  splitPayments: jsonb("split_payments"), // Array of { method: string, amount: number }
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1.000000"),

  transactionType: text("transaction_type").default("FiscalInvoice"), // FiscalInvoice, CreditNote, DebitNote
  relatedInvoiceId: integer("related_invoice_id"), // Self-reference for CN/DN

  notes: text("notes"),
  poNumber: text("po_number"),
  externalRef: text("external_ref"), // RevMax/external system invoice reference number
  invoiceTemplate: text("invoice_template").default("modern"),
  isFiscalized: boolean("is_fiscalized").default(true),

  // Partnership / co-branding
  partnerId: integer("partner_id").references(() => companyPartners.id),
  partnerSnapshot: jsonb("partner_snapshot"),
  revenueSharePercent: decimal("revenue_share_percent", { precision: 5, scale: 2 }),
  partnerShareAmount: decimal("partner_share_amount", { precision: 10, scale: 2 }),
  issuerShareAmount: decimal("issuer_share_amount", { precision: 10, scale: 2 }),

  // Restaurant & Online Orders
  tableId: integer("table_id"), // Refers to restaurant_tables
  waiterId: uuid("waiter_id").references(() => users.id), // Waiter who took the order
  covers: integer("covers").default(1), // Guest count
  diningOption: text("dining_option").default("dine_in"), // dine_in, takeaway, delivery
  orderStatus: text("order_status").default("pending"), // pending, preparing, ready, served
  orderNumber: text("order_number"), // Short order number for customer display (e.g. #001)
  customerName: text("customer_name"),
  buyerVat: text("buyer_vat"),
  buyerTin: text("buyer_tin"),
  offlinePreviousHash: text("offline_previous_hash"),
  offlineDate: text("offline_date"),
  customerPhone: text("customer_phone"),
  deliveryAddress: text("delivery_address"),
  deliveryNotes: text("delivery_notes"),

  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("invoices_company_id_idx").on(table.companyId),
    customerIdIdx: index("invoices_customer_id_idx").on(table.customerId),
    invoiceNumberIdx: index("invoices_invoice_number_idx").on(table.invoiceNumber),
  };
});



// Invoice Items
export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  cogsAmount: decimal("cogs_amount", { precision: 10, scale: 2 }),
  serialNumber: text("serial_number"),
  warrantyMonths: integer("warranty_months"),
  warrantyExpiresAt: timestamp("warranty_expires_at"),
  
  // Modifiers
  // Modifiers
  modifiers: jsonb("modifiers"), // Array of { id, name, price } or string array
  
  // Pharmacy/Batch Tracking
  batchId: integer("batch_id"), // Linked to product_batches
  variationId: integer("variation_id"), // Linked to product_variations
  expiryDate: date("expiry_date"), // Snapshot from batch
  batchNumber: text("batch_number"), // Snapshot from batch
  segmentId: integer("segment_id").references(() => accountingSegments.id),

  
}, (table) => {
  return {
    invoiceIdIdx: index("invoice_items_invoice_id_idx").on(table.invoiceId),
  };
});


export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  product: one(products, { fields: [invoiceItems.productId], references: [products.id] }),
  segment: one(accountingSegments, { fields: [invoiceItems.segmentId], references: [accountingSegments.id] }),
}));

export const productSerialNumbers = pgTable("product_serial_numbers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  serialNumber: text("serial_number").notNull(),
  status: text("status").notNull().default("IN_STOCK"), // IN_STOCK, SOLD, RESERVED, WARRANTY_CLAIM, RETURNED, VOID
  supplierId: integer("supplier_id").references(() => suppliers.id),
  receivedInventoryTransactionId: integer("received_inventory_transaction_id"),
  soldInvoiceId: integer("sold_invoice_id").references(() => invoices.id),
  soldInvoiceItemId: integer("sold_invoice_item_id").references(() => invoiceItems.id),
  soldAt: timestamp("sold_at"),
  warrantyExpiresAt: timestamp("warranty_expires_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companySerialUnique: unique("product_serial_numbers_company_serial_unique").on(table.companyId, table.serialNumber),
  companyIdx: index("product_serial_numbers_company_idx").on(table.companyId),
  productIdx: index("product_serial_numbers_product_idx").on(table.productId),
  statusIdx: index("product_serial_numbers_status_idx").on(table.status),
}));

export const warrantyClaims = pgTable("warranty_claims", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  invoiceItemId: integer("invoice_item_id").references(() => invoiceItems.id),
  serialNumberId: integer("serial_number_id").references(() => productSerialNumbers.id),
  claimNumber: text("claim_number").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN, APPROVED, REJECTED, REPLACED, SENT_TO_SUPPLIER, CLOSED
  reason: text("reason").notNull(),
  resolution: text("resolution"),
  receivedAt: timestamp("received_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdx: index("warranty_claims_company_idx").on(table.companyId),
  claimNumberIdx: index("warranty_claims_claim_number_idx").on(table.claimNumber),
  statusIdx: index("warranty_claims_status_idx").on(table.status),
}));

export const validationErrorsRelations = relations(validationErrors, ({ one }) => ({
  invoice: one(invoices, { fields: [validationErrors.invoiceId], references: [invoices.id] }),
}));

// Currencies
export const currencies = pgTable("currencies", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(), // USD, ZWG, ZAR
  name: text("name").notNull(), // US Dollar, Zimbabwe Gold
  symbol: text("symbol").notNull(), // $, ZWG, R
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).notNull().default("1.000000"),
  isBase: boolean("is_base").default(false),
  isActive: boolean("is_active").default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const currenciesRelations = relations(currencies, ({ one }) => ({
  company: one(companies, { fields: [currencies.companyId], references: [companies.id] }),
}));

// SCHEMAS

export const insertUserSchema = createInsertSchema(users).omit({ createdAt: true });
export const insertResetTokenSchema = createInsertSchema(resetTokens).omit({ id: true, createdAt: true });
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true }).extend({
  tin: z.string().regex(/^\d{10}$/, "TIN must be exactly 10 digits").or(z.string().length(0)).nullable().optional().transform(v => v === "" ? null : v),
  vatNumber: z.string().regex(/^\d{9,10}$/, "VAT number must be 9 or 10 digits").or(z.string().length(0)).nullable().optional().transform(v => v === "" ? null : v),
  bpNumber: z.string().regex(/^\d{10}$/, "BP number must be exactly 10 digits").or(z.string().length(0)).nullable().optional().transform(v => v === "" ? null : v),
});
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true }).extend({
  tin: z.string().regex(/^\d{10}$/, "TIN must be exactly 10 digits").or(z.string().length(0)).nullable().optional().transform(v => v === "" ? null : v),
  vatNumber: z.string().regex(/^\d{9,10}$/, "VAT number must be 9 or 10 digits").or(z.string().length(0)).nullable().optional().transform(v => v === "" ? null : v),
  bpNumber: z.string().regex(/^\d{10}$/, "BP number must be exactly 10 digits").or(z.string().length(0)).nullable().optional().transform(v => v === "" ? null : v),
});
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true }).extend({
  sku: z.string().min(1, "Code/SKU is required")
});
export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
}).extend({
  invoiceNumber: z.string().optional(),
  fiscalDayNo: z.number().int().optional(),
  fiscalCode: z.string().optional(),
  fiscalSignature: z.string().optional(),
  qrCodeData: z.string().optional(),
  verificationCode: z.string().optional(),
  syncedWithFdms: z.boolean().optional(),
  fdmsStatus: z.string().optional(),
  submissionId: z.string().optional(),
  receiptCounter: z.number().int().optional(),
  receiptGlobalNo: z.number().int().optional(),
  validationStatus: z.string().optional(),
  lastValidationAttempt: z.date().optional(),
  isFiscalized: z.boolean().optional(),
});
// When creating an invoice, the invoiceId foreign key is added after the invoice record is created.
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true, invoiceId: true });

// TYPES
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type ResetToken = typeof resetTokens.$inferSelect;
export type InsertResetToken = z.infer<typeof insertResetTokenSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;


export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

// API TYPES
export type CreateInvoiceRequest = InsertInvoice & {
  items: InsertInvoiceItem[];
};

export const insertCurrencySchema = createInsertSchema(currencies).omit({ id: true });
export type InsertCurrency = z.infer<typeof insertCurrencySchema>;
export type Currency = typeof currencies.$inferSelect;


// Payments
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  invoiceId: integer("invoice_id").references(() => invoices.id), // Nullable for direct/sales order deposit payments
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id), // Soft/hard link for preorder/lay-by deposits
  customerId: integer("customer_id").references(() => customers.id), // Direct customer link for ledger/statements

  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1.000000"),

  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  paymentMethod: text("payment_method").notNull(), // Cash, Card, Transfer, Ecocash
  reference: text("reference"), // Check No, Transaction ID

  notes: text("notes"),

  // GL audit trail: the journal entry created when this payment was posted
  journalEntryId: integer("journal_entry_id"),

  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  company: one(companies, { fields: [payments.companyId], references: [companies.id] }),
  user: one(users, { fields: [payments.createdBy], references: [users.id] }),
}));

export const paymentAllocations = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  paymentId: integer("payment_id").references(() => payments.id, { onDelete: "cascade" }).notNull(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  allocatedAt: timestamp("allocated_at").defaultNow().notNull(),
  reversedAt: timestamp("reversed_at"),
  reversalReason: text("reversal_reason"),
}, (table) => ({
  paymentIdx: index("payment_allocations_payment_idx").on(table.paymentId),
  invoiceIdx: index("payment_allocations_invoice_idx").on(table.invoiceId),
  companyIdx: index("payment_allocations_company_idx").on(table.companyId),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  company: one(companies, { fields: [paymentAllocations.companyId], references: [companies.id] }),
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  invoice: one(invoices, { fields: [paymentAllocations.invoiceId], references: [invoices.id] }),
}));

// Also update Invoice relations to include payments
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [invoices.branchId], references: [branches.id] }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  partner: one(companyPartners, { fields: [invoices.partnerId], references: [companyPartners.id] }),
  creator: one(users, { fields: [invoices.createdBy], references: [users.id] }),
  items: many(invoiceItems),
  payments: many(payments),
  validationErrors: many(validationErrors),
}));

export const laybys = pgTable("laybys", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  laybyNumber: text("layby_number").notNull(),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE, COMPLETED, CANCELLED, EXPIRED
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  depositRequired: decimal("deposit_required", { precision: 10, scale: 2 }).default("0.00"),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  currency: text("currency").default("USD").notNull(),
  expiryDate: timestamp("expiry_date"),
  completedInvoiceId: integer("completed_invoice_id").references(() => invoices.id),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyIdx: index("laybys_company_idx").on(table.companyId),
  customerIdx: index("laybys_customer_idx").on(table.customerId),
  laybyNumberIdx: index("laybys_number_idx").on(table.laybyNumber),
  statusIdx: index("laybys_status_idx").on(table.status),
}));

export const laybyItems = pgTable("layby_items", {
  id: serial("id").primaryKey(),
  laybyId: integer("layby_id").references(() => laybys.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  serialNumber: text("serial_number"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  laybyIdx: index("layby_items_layby_idx").on(table.laybyId),
  productIdx: index("layby_items_product_idx").on(table.productId),
}));

export const laybyPayments = pgTable("layby_payments", {
  id: serial("id").primaryKey(),
  laybyId: integer("layby_id").references(() => laybys.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  laybyIdx: index("layby_payments_layby_idx").on(table.laybyId),
  companyIdx: index("layby_payments_company_idx").on(table.companyId),
}));

export const laybysRelations = relations(laybys, ({ one, many }) => ({
  company: one(companies, { fields: [laybys.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [laybys.branchId], references: [branches.id] }),
  customer: one(customers, { fields: [laybys.customerId], references: [customers.id] }),
  items: many(laybyItems),
  payments: many(laybyPayments),
}));

export const laybyItemsRelations = relations(laybyItems, ({ one }) => ({
  layby: one(laybys, { fields: [laybyItems.laybyId], references: [laybys.id] }),
  product: one(products, { fields: [laybyItems.productId], references: [products.id] }),
}));

export const laybyPaymentsRelations = relations(laybyPayments, ({ one }) => ({
  layby: one(laybys, { fields: [laybyPayments.laybyId], references: [laybys.id] }),
  company: one(companies, { fields: [laybyPayments.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [laybyPayments.branchId], references: [branches.id] }),
}));


export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, companyId: true, createdAt: true, createdBy: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
export const insertPaymentAllocationSchema = createInsertSchema(paymentAllocations).omit({ id: true, allocatedAt: true, reversedAt: true, reversalReason: true });
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type InsertPaymentAllocation = z.infer<typeof insertPaymentAllocationSchema>;

export const insertProductSerialNumberSchema = createInsertSchema(productSerialNumbers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWarrantyClaimSchema = createInsertSchema(warrantyClaims).omit({ id: true, createdAt: true });
export const insertLaybySchema = createInsertSchema(laybys).omit({ id: true, createdAt: true, updatedAt: true, laybyNumber: true, paidAmount: true, completedInvoiceId: true });
export const insertLaybyItemSchema = createInsertSchema(laybyItems).omit({ id: true, laybyId: true, createdAt: true });
export const insertLaybyPaymentSchema = createInsertSchema(laybyPayments).omit({ id: true, createdAt: true, companyId: true, branchId: true, createdBy: true });

export type ProductSerialNumber = typeof productSerialNumbers.$inferSelect;
export type InsertProductSerialNumber = z.infer<typeof insertProductSerialNumberSchema>;
export type WarrantyClaim = typeof warrantyClaims.$inferSelect;
export type InsertWarrantyClaim = z.infer<typeof insertWarrantyClaimSchema>;
export type Layby = typeof laybys.$inferSelect;
export type InsertLayby = z.infer<typeof insertLaybySchema>;
export type LaybyItem = typeof laybyItems.$inferSelect;
export type InsertLaybyItem = z.infer<typeof insertLaybyItemSchema>;
export type LaybyPayment = typeof laybyPayments.$inferSelect;
export type InsertLaybyPayment = z.infer<typeof insertLaybyPaymentSchema>;

export const insertValidationErrorSchema = createInsertSchema(validationErrors).omit({ id: true, createdAt: true });
export type InsertValidationError = z.infer<typeof insertValidationErrorSchema>;
export type ValidationError = typeof validationErrors.$inferSelect;


// Quotations
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  salesOrderId: integer("sales_order_id").references((): AnyPgColumn => salesOrders.id),
  convertedAt: timestamp("converted_at"),

  quotationNumber: text("quotation_number").notNull(),
  issueDate: timestamp("issue_date").defaultNow(),
  expiryDate: timestamp("expiry_date"),

  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),

  // Status & Settings
  status: text("status").default("draft"), // draft, sent, accepted, declined, invoiced
  taxInclusive: boolean("tax_inclusive").default(false),
  currency: text("currency").default("USD"),
  notes: text("notes"),
  invoiceTemplate: text("invoice_template").default("modern"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const quotationItems = pgTable("quotation_items", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").references(() => quotations.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  cogsAmount: decimal("cogs_amount", { precision: 10, scale: 2 }), // Cost of Goods Sold for this line
});

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  company: one(companies, { fields: [quotations.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [quotations.branchId], references: [branches.id] }),
  customer: one(customers, { fields: [quotations.customerId], references: [customers.id] }),
  items: many(quotationItems),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationItems.quotationId], references: [quotations.id] }),
  product: one(products, { fields: [quotationItems.productId], references: [products.id] }),
}));

export const insertQuotationSchema = createInsertSchema(quotations).omit({
  id: true,
  createdAt: true,
}).extend({
  quotationNumber: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional().nullable(),
});
export const insertQuotationItemSchema = createInsertSchema(quotationItems).omit({ id: true, quotationId: true });

export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type InsertQuotationItem = z.infer<typeof insertQuotationItemSchema>;

// Recurring Invoices
export const recurringInvoices = pgTable("recurring_invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id).notNull(),

  // Template data
  description: text("description"),
  currency: text("currency").default("USD").notNull(),
  taxInclusive: boolean("tax_inclusive").default(false),
  items: jsonb("items").notNull(), // Array of items

  // Schedule
  frequency: text("frequency").notNull(), // weekly, monthly, quarterly, yearly
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  nextRunDate: timestamp("next_run_date").notNull(),
  lastRunDate: timestamp("last_run_date"),

  // Settings
  status: text("status").default("active"), // active, paused, completed
  autoSend: boolean("auto_send").default(false),
  autoFiscalize: boolean("auto_fiscalize").default(false),

  createdAt: timestamp("created_at").defaultNow(),
});

export const recurringInvoicesRelations = relations(recurringInvoices, ({ one }) => ({
  company: one(companies, { fields: [recurringInvoices.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [recurringInvoices.branchId], references: [branches.id] }),
  customer: one(customers, { fields: [recurringInvoices.customerId], references: [customers.id] }),
}));

export const insertRecurringInvoiceSchema = createInsertSchema(recurringInvoices).omit({ id: true, createdAt: true });
export type InsertRecurringInvoice = z.infer<typeof insertRecurringInvoiceSchema>;
export type RecurringInvoice = typeof recurringInvoices.$inferSelect;

// SECURITY & AUDIT
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ZIMRA Logs
export const zimraLogs = pgTable("zimra_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id), // Link to company for general logs
  invoiceId: integer("invoice_id").references(() => invoices.id), // Nullable for general requests
  endpoint: text("endpoint"), // Captured endpoint URL
  requestPayload: jsonb("request_payload").notNull(),
  responsePayload: jsonb("response_payload").notNull(),
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertZimraLogSchema = createInsertSchema(zimraLogs).omit({ id: true, createdAt: true });
export type InsertZimraLog = z.infer<typeof insertZimraLogSchema>;
export type ZimraLog = typeof zimraLogs.$inferSelect;

// API Logs (Incoming)
export const apiLogs = pgTable("api_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApiLogSchema = createInsertSchema(apiLogs).omit({ id: true, createdAt: true }).partial();
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type ApiLog = typeof apiLogs.$inferSelect;

// Subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  deviceSerialNo: text("device_serial_no").notNull(),
  deviceMacAddress: text("device_mac_address"), // Physical device binding
  paynowReference: text("paynow_reference").unique(), // Nullable for manual/cash payments
  paymentMethod: text("payment_method").default("paynow"), // paynow, cash, bank_transfer
  pollUrl: text("poll_url"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default("pending"), // pending, paid, failed, cancelled
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  company: one(companies, { fields: [subscriptions.companyId], references: [companies.id] }),
}));

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

// POS Shifts
export const posShifts = pgTable("pos_shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  userId: uuid("user_id").references(() => users.id).notNull(),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  openingBalance: decimal("opening_balance", { precision: 10, scale: 2 }).notNull(),
  closingBalance: decimal("closing_balance", { precision: 10, scale: 2 }),
  status: text("status").default("open"), // open, closed
  notes: text("notes"),

  // Reconciliation data
  actualCash: decimal("actual_cash", { precision: 10, scale: 2 }),
  reconciledAt: timestamp("reconciled_at"),
  reconciledBy: uuid("reconciled_by").references(() => users.id),
  reconciliationNotes: text("reconciliation_notes"),
  reconciliationStatus: text("reconciliation_status"), // reconciled, minor_discrepancy, major_discrepancy, critical_discrepancy, pending

  createdAt: timestamp("created_at").defaultNow(),
});

export const posShiftsRelations = relations(posShifts, ({ one }) => ({
  company: one(companies, { fields: [posShifts.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [posShifts.branchId], references: [branches.id] }),
  user: one(users, { fields: [posShifts.userId], references: [users.id] }),
}));

// POS Holds (Parked Sales)
export const posHolds = pgTable("pos_holds", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  userId: uuid("user_id").references(() => users.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  holdName: text("hold_name"),
  total: numeric("total", { precision: 12, scale: 2 }),
  orderDiscount: numeric("order_discount", { precision: 12, scale: 2 }).default("0"),
  cartData: jsonb("cart_data").notNull(), // Array of cart items
  createdAt: timestamp("created_at").defaultNow(),
});

export const posHoldsRelations = relations(posHolds, ({ one }) => ({
  company: one(companies, { fields: [posHolds.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [posHolds.branchId], references: [branches.id] }),
  user: one(users, { fields: [posHolds.userId], references: [users.id] }),
  customer: one(customers, { fields: [posHolds.customerId], references: [customers.id] }),
}));

export const insertPosShiftSchema = createInsertSchema(posShifts).omit({ id: true, createdAt: true });
export type PosShift = typeof posShifts.$inferSelect;
export type InsertPosShift = z.infer<typeof insertPosShiftSchema>;

export const insertPosHoldSchema = createInsertSchema(posHolds).omit({ id: true, createdAt: true });
export type PosHold = typeof posHolds.$inferSelect;
export type InsertPosHold = z.infer<typeof insertPosHoldSchema>;

// POS Shift Transactions (Cash Drops / Payouts)
export const posShiftTransactions = pgTable("pos_shift_transactions", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id").references(() => posShifts.id).notNull(),
  items: jsonb("items").notNull(), // Array of { description, amount } or similar if needed, or just simple
  type: text("type").notNull(), // "DROP", "PAYOUT"
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  userId: uuid("user_id").references(() => users.id).notNull(),
  authorizedBy: uuid("authorized_by").references(() => users.id), // Supervisor who verified
  createdAt: timestamp("created_at").defaultNow(),
});

export const posShiftTransactionsRelations = relations(posShiftTransactions, ({ one }) => ({
  shift: one(posShifts, { fields: [posShiftTransactions.shiftId], references: [posShifts.id] }),
  user: one(users, { fields: [posShiftTransactions.userId], references: [users.id] }),
  authorizer: one(users, { fields: [posShiftTransactions.authorizedBy], references: [users.id] }),
}));

export const insertPosShiftTransactionSchema = createInsertSchema(posShiftTransactions).omit({ id: true, createdAt: true });
export type PosShiftTransaction = typeof posShiftTransactions.$inferSelect;
export type InsertPosShiftTransaction = z.infer<typeof insertPosShiftTransactionSchema>;

// Suppliers
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  tin: text("tin"),
  vatNumber: text("vat_number"),
  withholdingTaxType: text("withholding_tax_type"),
  withholdingTaxRate: decimal("withholding_tax_rate", { precision: 5, scale: 2 }),
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }).default("0.00"),
  creditDays: integer("credit_days").default(0),
  isActive: boolean("is_active").default(true),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("suppliers_company_id_idx").on(table.companyId),
  };
});

export const suppliersRelations = relations(suppliers, ({ one }) => ({
  company: one(companies, { fields: [suppliers.companyId], references: [companies.id] }),
}));

// Freight Forwarders
export const freightForwarders = pgTable("freight_forwarders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  isActive: boolean("is_active").default(true),
  supportedShippingMethods: text("supported_shipping_methods").array(),
  defaultCurrency: text("default_currency").default("USD"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const freightForwardersRelations = relations(freightForwarders, ({ one, many }) => ({
  company: one(companies, { fields: [freightForwarders.companyId], references: [companies.id] }),
  consignments: many(consignments),
}));

export const insertFreightForwarderSchema = createInsertSchema(freightForwarders).omit({ id: true, createdAt: true });
export type FreightForwarder = typeof freightForwarders.$inferSelect;
export type InsertFreightForwarder = z.infer<typeof insertFreightForwarderSchema>;

// Consignments
export const consignments = pgTable("consignments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  forwarderId: integer("forwarder_id").references(() => freightForwarders.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  referenceNumber: text("reference_number").notNull(),
  shippingMethod: text("shipping_method").notNull(), // AIR, SEA, ROAD, RAIL
  status: text("status").default("PENDING"), // PENDING, DISPATCHED, IN_TRANSIT, CUSTOMS, ARRIVED, DELAYED
  
  dispatchDate: timestamp("dispatch_date"),
  expectedArrivalDate: timestamp("expected_arrival_date"),
  actualArrivalDate: timestamp("actual_arrival_date"),
  
  destinationLocationId: integer("destination_location_id").references(() => inventoryLocations.id),
  
  shippingCost: decimal("shipping_cost", { precision: 15, scale: 2 }).default("0.00"),
  currency: text("currency").default("USD"),
  delayNotes: text("delay_notes"),
  
  trackingUrl: text("tracking_url"),
  containerNumber: text("container_number"),
  flightNumber: text("flight_number"),
  insuranceCost: decimal("insurance_cost", { precision: 15, scale: 2 }).default("0.00"),
  customsDuty: decimal("customs_duty", { precision: 15, scale: 2 }).default("0.00"),
  handlingCharges: decimal("handling_charges", { precision: 15, scale: 2 }).default("0.00"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const consignmentsRelations = relations(consignments, ({ one, many }) => ({
  company: one(companies, { fields: [consignments.companyId], references: [companies.id] }),
  forwarder: one(freightForwarders, { fields: [consignments.forwarderId], references: [freightForwarders.id] }),
  supplier: one(suppliers, { fields: [consignments.supplierId], references: [suppliers.id] }),
  destination: one(inventoryLocations, { fields: [consignments.destinationLocationId], references: [inventoryLocations.id] }),
  purchaseOrders: many(consignmentPurchaseOrders),
}));

export const insertConsignmentSchema = createInsertSchema(consignments).omit({ id: true, createdAt: true });
export type Consignment = typeof consignments.$inferSelect;
export type InsertConsignment = z.infer<typeof insertConsignmentSchema>;

// Consignment Purchase Orders
export const consignmentPurchaseOrders = pgTable("consignment_purchase_orders", {
  id: serial("id").primaryKey(),
  consignmentId: integer("consignment_id").references(() => consignments.id, { onDelete: "cascade" }).notNull(),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const consignmentPurchaseOrdersRelations = relations(consignmentPurchaseOrders, ({ one }) => ({
  consignment: one(consignments, { fields: [consignmentPurchaseOrders.consignmentId], references: [consignments.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [consignmentPurchaseOrders.purchaseOrderId], references: [purchaseOrders.id] }),
}));

export const insertConsignmentPurchaseOrderSchema = createInsertSchema(consignmentPurchaseOrders).omit({ id: true, createdAt: true });
export type ConsignmentPurchaseOrder = typeof consignmentPurchaseOrders.$inferSelect;
export type InsertConsignmentPurchaseOrder = z.infer<typeof insertConsignmentPurchaseOrderSchema>;

// Inventory Transactions (Stock Ledger)
export const inventoryTransactions = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  locationId: integer("location_id").references(() => inventoryLocations.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  variationId: integer("variation_id"), // Added for pharma/variant tracking
  supplierId: integer("supplier_id").references(() => suppliers.id),

  type: text("type").notNull(), // "STOCK_IN" (GRN), "STOCK_OUT" (Invoice), "ADJUSTMENT"
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),

  referenceType: text("reference_type"), // "GRN", "INVOICE", "MANUAL"
  referenceId: text("reference_id"), // ID of the GRN or Invoice

  remainingQuantity: decimal("remaining_quantity", { precision: 10, scale: 2 }), // For FIFO/LIFO tracking
  batchNumber: text("batch_number"),
  expiryDate: timestamp("expiry_date"),

  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("inv_trans_company_id_idx").on(table.companyId),
    productIdIdx: index("inv_trans_product_id_idx").on(table.productId),
  };
});

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  company: one(companies, { fields: [inventoryTransactions.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [inventoryTransactions.branchId], references: [branches.id] }),
  location: one(inventoryLocations, { fields: [inventoryTransactions.locationId], references: [inventoryLocations.id] }),
  product: one(products, { fields: [inventoryTransactions.productId], references: [products.id] }),
  supplier: one(suppliers, { fields: [inventoryTransactions.supplierId], references: [suppliers.id] }),
}));

export const inventoryCostComponents = pgTable("inventory_cost_components", {
  id: serial("id").primaryKey(),
  inventoryTransactionId: integer("inventory_transaction_id").references(() => inventoryTransactions.id).notNull(),
  type: text("type").notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 4 }).notNull(),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  transactionIdIdx: index("inv_cost_comp_trans_id_idx").on(table.inventoryTransactionId),
}));

export const landedCostDocuments = pgTable("landed_cost_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  reference: text("reference").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  status: text("status").default("PENDING").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("landed_cost_doc_company_id_idx").on(table.companyId),
}));

export const landedCostAllocations = pgTable("landed_cost_allocations", {
  id: serial("id").primaryKey(),
  landedCostDocumentId: integer("landed_cost_document_id").references(() => landedCostDocuments.id).notNull(),
  inventoryTransactionId: integer("inventory_transaction_id").references(() => inventoryTransactions.id).notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  documentIdIdx: index("landed_cost_alloc_doc_id_idx").on(table.landedCostDocumentId),
  transactionIdIdx: index("landed_cost_alloc_trans_id_idx").on(table.inventoryTransactionId),
}));

export const goodsDeliveryNotes = pgTable("goods_delivery_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id),
  gdnNumber: text("gdn_number").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, CONFIRMED, CANCELLED
  notes: text("notes"),
  currency: text("currency").default("USD").notNull(),
  taxInclusive: boolean("tax_inclusive").default(false),
  createdBy: uuid("created_by").references(() => users.id),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedGrvNumber: text("confirmed_grv_number"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("goods_delivery_notes_company_id_idx").on(table.companyId),
    statusIdx: index("goods_delivery_notes_status_idx").on(table.status),
    companyGdnUnique: unique("goods_delivery_notes_company_gdn_number_idx").on(table.companyId, table.gdnNumber),
  };
});

export const inventoryValuationSnapshots = pgTable("inventory_valuation_snapshots", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  asOfDate: timestamp("as_of_date").notNull(),
  valuationMethod: text("valuation_method").notNull(),
  totalQuantity: decimal("total_quantity", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalValue: decimal("total_value", { precision: 15, scale: 2 }).default("0.00").notNull(),
  lines: jsonb("lines").$type<Array<{
    productId: number;
    productName: string;
    sku?: string | null;
    branchId?: number | null;
    quantity: number;
    unitCost: number;
    totalValue: number;
    valuationMethod: string;
  }>>().default([]),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyDateIdx: index("inventory_valuation_snapshots_company_date_idx").on(table.companyId, table.asOfDate),
  branchIdx: index("inventory_valuation_snapshots_branch_idx").on(table.branchId),
}));

export const goodsDeliveryNoteItems = pgTable("goods_delivery_note_items", {
  id: serial("id").primaryKey(),
  gdnId: integer("gdn_id").references(() => goodsDeliveryNotes.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  accountCode: text("account_code"),
  description: text("description"),
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }).notNull(),
  quantityAccepted: decimal("quantity_accepted", { precision: 10, scale: 2 }),
  quantityRejected: decimal("quantity_rejected", { precision: 10, scale: 2 }),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isRecoverable: boolean("is_recoverable").default(true),
  notes: text("notes"),
}, (table) => {
  return {
    gdnIdIdx: index("goods_delivery_note_items_gdn_id_idx").on(table.gdnId),
    productIdIdx: index("goods_delivery_note_items_product_id_idx").on(table.productId),
  };
});

export const goodsDeliveryNotesRelations = relations(goodsDeliveryNotes, ({ one, many }) => ({
  company: one(companies, { fields: [goodsDeliveryNotes.companyId], references: [companies.id] }),
  supplier: one(suppliers, { fields: [goodsDeliveryNotes.supplierId], references: [suppliers.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [goodsDeliveryNotes.purchaseOrderId], references: [purchaseOrders.id] }),
  creator: one(users, { fields: [goodsDeliveryNotes.createdBy], references: [users.id] }),
  confirmer: one(users, { fields: [goodsDeliveryNotes.confirmedBy], references: [users.id] }),
  items: many(goodsDeliveryNoteItems),
}));

export const goodsDeliveryNoteItemsRelations = relations(goodsDeliveryNoteItems, ({ one }) => ({
  gdn: one(goodsDeliveryNotes, { fields: [goodsDeliveryNoteItems.gdnId], references: [goodsDeliveryNotes.id] }),
  product: one(products, { fields: [goodsDeliveryNoteItems.productId], references: [products.id] }),
}));

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  transferNumber: text("transfer_number").notNull(),
  fromBranchId: integer("from_branch_id").references(() => branches.id),
  toBranchId: integer("to_branch_id").references(() => branches.id),
  fromLocationId: integer("from_location_id").references(() => inventoryLocations.id),
  toLocationId: integer("to_location_id").references(() => inventoryLocations.id),
  status: text("status").default("IN_TRANSIT").notNull(), // DRAFT, PENDING_APPROVAL, APPROVED, IN_TRANSIT, RECEIVED, CANCELLED
  notes: text("notes"),
  transitCost: decimal("transit_cost", { precision: 10, scale: 2 }).default("0.00"),
  transitCostCurrency: text("transit_cost_currency").default("USD"),
  freightCarrier: text("freight_carrier"),
  vehicleReg: text("vehicle_reg"),
  varianceReason: text("variance_reason"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  dispatchedBy: uuid("dispatched_by").references(() => users.id),
  dispatchedAt: timestamp("dispatched_at"),
  receivedBy: uuid("received_by").references(() => users.id),
  receivedAt: timestamp("received_at"),
  cancelledBy: uuid("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("stock_transfers_company_id_idx").on(table.companyId),
  statusIdx: index("stock_transfers_status_idx").on(table.status),
  companyNumberUnique: unique("stock_transfers_company_number_idx").on(table.companyId, table.transferNumber),
}));

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").references(() => stockTransfers.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }),
  quantityDamaged: decimal("quantity_damaged", { precision: 10, scale: 2 }).default("0.00"),
  quantityLost: decimal("quantity_lost", { precision: 10, scale: 2 }).default("0.00"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).default("0.00"),
  batchNumber: text("batch_number"),
  expiryDate: timestamp("expiry_date"),
  notes: text("notes"),
}, (table) => ({
  transferIdIdx: index("stock_transfer_items_transfer_id_idx").on(table.transferId),
  productIdIdx: index("stock_transfer_items_product_id_idx").on(table.productId),
}));

export const stockTransfersRelations = relations(stockTransfers, ({ one, many }) => ({
  company: one(companies, { fields: [stockTransfers.companyId], references: [companies.id] }),
  fromBranch: one(branches, { fields: [stockTransfers.fromBranchId], references: [branches.id] }),
  toBranch: one(branches, { fields: [stockTransfers.toBranchId], references: [branches.id] }),
  fromLocation: one(inventoryLocations, { fields: [stockTransfers.fromLocationId], references: [inventoryLocations.id] }),
  toLocation: one(inventoryLocations, { fields: [stockTransfers.toLocationId], references: [inventoryLocations.id] }),
  dispatcher: one(users, { fields: [stockTransfers.dispatchedBy], references: [users.id] }),
  receiver: one(users, { fields: [stockTransfers.receivedBy], references: [users.id] }),
  items: many(stockTransferItems),
}));

export const stockTransferItemsRelations = relations(stockTransferItems, ({ one }) => ({
  transfer: one(stockTransfers, { fields: [stockTransferItems.transferId], references: [stockTransfers.id] }),
  product: one(products, { fields: [stockTransferItems.productId], references: [products.id] }),
}));

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  poNumber: text("po_number").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, SENT, RECEIVED, CANCELLED
  expectedDate: timestamp("expected_date"),
  shipTo: text("ship_to"),           // Delivery address — defaults to company address
  notes: text("notes"),
  currency: text("currency").default("USD").notNull(),
  taxInclusive: boolean("tax_inclusive").default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("purchase_orders_company_id_idx").on(table.companyId),
    supplierIdIdx: index("purchase_orders_supplier_id_idx").on(table.supplierId),
    statusIdx: index("purchase_orders_status_idx").on(table.status),
    companyPoUnique: unique("purchase_orders_company_po_number_idx").on(table.companyId, table.poNumber),
  };
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id).notNull(),
  productId: integer("product_id").references(() => products.id),  // nullable — free-text lines have no productId
  description: text("description"),  // free-text description for non-inventory lines
  accountCode: text("account_code"), // optional GL account code for expense/asset lines
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }).default("0.00").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isRecoverable: boolean("is_recoverable").default(true),
  segmentId: integer("segment_id").references(() => accountingSegments.id),
  notes: text("notes"),
}, (table) => {
  return {
    purchaseOrderIdIdx: index("purchase_order_items_po_id_idx").on(table.purchaseOrderId),
    productIdIdx: index("purchase_order_items_product_id_idx").on(table.productId),
  };
});

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  company: one(companies, { fields: [purchaseOrders.companyId], references: [companies.id] }),
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  branch: one(branches, { fields: [purchaseOrders.branchId], references: [branches.id] }),
  creator: one(users, { fields: [purchaseOrders.createdBy], references: [users.id] }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderItems.purchaseOrderId], references: [purchaseOrders.id] }),
  product: one(products, { fields: [purchaseOrderItems.productId], references: [products.id] }),
  segment: one(accountingSegments, { fields: [purchaseOrderItems.segmentId], references: [accountingSegments.id] }),
}));

export const purchaseReturns = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id),
  goodsDeliveryNoteId: integer("goods_delivery_note_id").references(() => goodsDeliveryNotes.id),
  returnNumber: text("return_number").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, APPROVED, SHIPPED, COMPLETED, CANCELLED
  reason: text("reason"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("purchase_returns_company_id_idx").on(table.companyId),
    supplierIdIdx: index("purchase_returns_supplier_id_idx").on(table.supplierId),
    statusIdx: index("purchase_returns_status_idx").on(table.status),
    companyReturnUnique: unique("purchase_returns_company_return_number_idx").on(table.companyId, table.returnNumber),
  };
});

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  purchaseReturnId: integer("purchase_return_id").references(() => purchaseReturns.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  notes: text("notes"),
}, (table) => {
  return {
    purchaseReturnIdIdx: index("purchase_return_items_return_id_idx").on(table.purchaseReturnId),
    productIdIdx: index("purchase_return_items_product_id_idx").on(table.productId),
  };
});

export const purchaseReturnsRelations = relations(purchaseReturns, ({ one, many }) => ({
  company: one(companies, { fields: [purchaseReturns.companyId], references: [companies.id] }),
  supplier: one(suppliers, { fields: [purchaseReturns.supplierId], references: [suppliers.id] }),
  branch: one(branches, { fields: [purchaseReturns.branchId], references: [branches.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [purchaseReturns.purchaseOrderId], references: [purchaseOrders.id] }),
  goodsDeliveryNote: one(goodsDeliveryNotes, { fields: [purchaseReturns.goodsDeliveryNoteId], references: [goodsDeliveryNotes.id] }),
  creator: one(users, { fields: [purchaseReturns.createdBy], references: [users.id] }),
  items: many(purchaseReturnItems),
}));

export const purchaseReturnItemsRelations = relations(purchaseReturnItems, ({ one }) => ({
  purchaseReturn: one(purchaseReturns, { fields: [purchaseReturnItems.purchaseReturnId], references: [purchaseReturns.id] }),
  product: one(products, { fields: [purchaseReturnItems.productId], references: [products.id] }),
}));

// Expenses
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),

  category: text("category").notNull(), // Rent, Utilities, Salary, etc.
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  expenseDate: timestamp("expense_date").defaultNow().notNull(),

  paymentMethod: text("payment_method"),
  reference: text("reference"),
  status: text("status").default("paid"), // paid, pending

  attachmentUrl: text("attachment_url"),
  notes: text("notes"),
  debitAccountId: integer("debit_account_id").references(() => accounts.id),
  creditAccountId: integer("credit_account_id").references(() => accounts.id),
  segmentId: integer("segment_id").references(() => accountingSegments.id),
  productionRunId: integer("production_run_id").references(() => productionRuns.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("expenses_company_id_idx").on(table.companyId),
  };
});

export const expensesRelations = relations(expenses, ({ one }) => ({
  company: one(companies, { fields: [expenses.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [expenses.branchId], references: [branches.id] }),
  supplier: one(suppliers, { fields: [expenses.supplierId], references: [suppliers.id] }),
  segment: one(accountingSegments, { fields: [expenses.segmentId], references: [accountingSegments.id] }),
}));

export const stockTakes = pgTable("stock_takes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  userId: uuid("user_id").notNull(),
  status: text("status").default("draft").notNull(), // draft, completed, cancelled
  startDate: timestamp("start_date").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("stock_takes_company_id_idx").on(table.companyId),
  };
});

export const stockTakeItems = pgTable("stock_take_items", {
  id: serial("id").primaryKey(),
  stockTakeId: integer("stock_take_id").notNull(),
  productId: integer("product_id").notNull(),
  systemCount: decimal("system_count", { precision: 10, scale: 2 }).notNull(),
  physicalCount: decimal("physical_count", { precision: 10, scale: 2 }),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
}, (table) => {
  return {
    stockTakeIdIdx: index("stock_take_items_stock_take_id_idx").on(table.stockTakeId),
  };
});

export const stockTakesRelations = relations(stockTakes, ({ one, many }) => ({
  company: one(companies, { fields: [stockTakes.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [stockTakes.branchId], references: [branches.id] }),
  user: one(users, { fields: [stockTakes.userId], references: [users.id] }),
  items: many(stockTakeItems),
}));

export const stockTakeItemsRelations = relations(stockTakeItems, ({ one }) => ({
  stockTake: one(stockTakes, { fields: [stockTakeItems.stockTakeId], references: [stockTakes.id] }),
  product: one(products, { fields: [stockTakeItems.productId], references: [products.id] }),
}));

// RESTAURANT & BOM TABLES

export const restaurantSections = pgTable("restaurant_sections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const restaurantTables = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").references(() => restaurantSections.id).notNull(),
  tableName: text("table_name").notNull(),
  capacity: integer("capacity").default(2),
  status: text("status").default("available"), // available, occupied, dirty, reserved
  posX: integer("pos_x").default(0), // For visual layout
  posY: integer("pos_y").default(0),
  width: integer("width").default(60),
  height: integer("height").default(60),
  shape: text("shape").default("square"), // square, circle
  currentInvoiceId: integer("current_invoice_id"), // Linked order
});

export const recipeItems = pgTable("recipe_items", {
  id: serial("id").primaryKey(),
  parentProductId: integer("parent_product_id").references(() => products.id).notNull(), // The Burger
  ingredientProductId: integer("ingredient_product_id").references(() => products.id).notNull(), // Beef
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(), // Amount per unit e.g. 0.150kg
  unit: text("unit").notNull(), // kg, g, l, ml, unit
});

export const restaurantSectionsRelations = relations(restaurantSections, ({ one, many }) => ({
  company: one(companies, { fields: [restaurantSections.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [restaurantSections.branchId], references: [branches.id] }),
  tables: many(restaurantTables),
}));

export const restaurantTablesRelations = relations(restaurantTables, ({ one }) => ({
  section: one(restaurantSections, { fields: [restaurantTables.sectionId], references: [restaurantSections.id] }),
  currentInvoice: one(invoices, { fields: [restaurantTables.currentInvoiceId], references: [invoices.id] }),
}));

export const recipeItemsRelations = relations(recipeItems, ({ one }) => ({
  parentProduct: one(products, { fields: [recipeItems.parentProductId], references: [products.id] }),
  ingredient: one(products, { fields: [recipeItems.ingredientProductId], references: [products.id] }),
}));

// Zod schemas for new tables
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({ id: true, createdAt: true });
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;

export const insertGoodsDeliveryNoteSchema = createInsertSchema(goodsDeliveryNotes).omit({ id: true, createdAt: true, confirmedAt: true });
export type GoodsDeliveryNote = typeof goodsDeliveryNotes.$inferSelect;
export type InsertGoodsDeliveryNote = z.infer<typeof insertGoodsDeliveryNoteSchema>;

export const insertGoodsDeliveryNoteItemSchema = createInsertSchema(goodsDeliveryNoteItems).omit({ id: true });
export type GoodsDeliveryNoteItem = typeof goodsDeliveryNoteItems.$inferSelect;
export type InsertGoodsDeliveryNoteItem = z.infer<typeof insertGoodsDeliveryNoteItemSchema>;

export const insertStockTransferSchema = createInsertSchema(stockTransfers).omit({ id: true, createdAt: true, updatedAt: true, dispatchedAt: true, receivedAt: true, cancelledAt: true });
export type StockTransfer = typeof stockTransfers.$inferSelect;
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;

export const insertStockTransferItemSchema = createInsertSchema(stockTransferItems).omit({ id: true });
export type StockTransferItem = typeof stockTransferItems.$inferSelect;
export type InsertStockTransferItem = z.infer<typeof insertStockTransferItemSchema>;

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;

export const insertPurchaseReturnSchema = createInsertSchema(purchaseReturns).omit({ id: true, createdAt: true, updatedAt: true });
export type PurchaseReturn = typeof purchaseReturns.$inferSelect;
export type InsertPurchaseReturn = z.infer<typeof insertPurchaseReturnSchema>;

export const insertPurchaseReturnItemSchema = createInsertSchema(purchaseReturnItems).omit({ id: true });
export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;
export type InsertPurchaseReturnItem = z.infer<typeof insertPurchaseReturnItemSchema>;

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true });
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export const insertStockTakeSchema = createInsertSchema(stockTakes).omit({ id: true, createdAt: true });
export type StockTake = typeof stockTakes.$inferSelect;
export type InsertStockTake = z.infer<typeof insertStockTakeSchema>;

export const insertStockTakeItemSchema = createInsertSchema(stockTakeItems).omit({ id: true });
export type StockTakeItem = typeof stockTakeItems.$inferSelect;
export type InsertStockTakeItem = z.infer<typeof insertStockTakeItemSchema>;

export const insertRecipeItemSchema = createInsertSchema(recipeItems).omit({ id: true });
export type RecipeItem = typeof recipeItems.$inferSelect;
export type InsertRecipeItem = z.infer<typeof insertRecipeItemSchema>;

export const insertRestaurantSectionSchema = createInsertSchema(restaurantSections).omit({ id: true });
export type RestaurantSection = typeof restaurantSections.$inferSelect;
export type InsertRestaurantSection = z.infer<typeof insertRestaurantSectionSchema>;

export const insertRestaurantTableSchema = createInsertSchema(restaurantTables).omit({ id: true });
export type RestaurantTable = typeof restaurantTables.$inferSelect;
export type InsertRestaurantTable = z.infer<typeof insertRestaurantTableSchema>;

export const insertBranchSchema = createInsertSchema(branches).omit({ id: true, createdAt: true });
export type Branch = typeof branches.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;

export const insertBranchUserSchema = createInsertSchema(branchUsers).omit({ id: true });
export type BranchUser = typeof branchUsers.$inferSelect;
export type InsertBranchUser = z.infer<typeof insertBranchUserSchema>;

export const insertBranchStockSchema = createInsertSchema(branchStocks).omit({ id: true });
export type BranchStock = typeof branchStocks.$inferSelect;
export type InsertBranchStock = z.infer<typeof insertBranchStockSchema>;



// --- BUS TICKETING TABLES ---

export const busVehicles = pgTable("bus_vehicles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  regNumber: text("reg_number").notNull(),
  model: text("model"),
  capacity: integer("capacity").notNull(),
  fleetId: text("fleet_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const busRoutes = pgTable("bus_routes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  fromLocation: text("from_location").notNull(),
  toLocation: text("to_location").notNull(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  config: jsonb("config").notNull(), // { fields: TicketFieldConfig, dropOffPoints: string[] }
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const busTrips = pgTable("bus_trips", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  routeId: integer("route_id").references(() => busRoutes.id).notNull(),
  vehicleId: integer("vehicle_id").references(() => busVehicles.id).notNull(),
  conductorId: uuid("conductor_id").references(() => users.id).notNull(),
  scheduledDeparture: timestamp("scheduled_departure").notNull(),
  actualDeparture: timestamp("actual_departure"),
  actualArrival: timestamp("actual_arrival"),
  currentLatitude: doublePrecision("current_latitude"),
  currentLongitude: doublePrecision("current_longitude"),
  lastLocationUpdate: timestamp("last_location_update"),
  status: text("status").default("scheduled").notNull(), // scheduled, boarding, en_route, in_progress, completed, cancelled
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyStatusIdx: index("bus_trips_company_status_idx").on(table.companyId, table.status),
  vehicleStatusIdx: index("bus_trips_vehicle_status_idx").on(table.vehicleId, table.status),
  conductorStatusIdx: index("bus_trips_conductor_status_idx").on(table.conductorId, table.status),
}));

export const busTickets = pgTable("bus_tickets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tripId: integer("trip_id").references(() => busTrips.id).notNull(),
  shiftId: integer("shift_id"),
  ticketNumber: text("ticket_number").notNull(),
  deviceId: text("device_id"),
  localTicketId: text("local_ticket_id"),
  passengerName: text("passenger_name"),
  idNumber: text("id_number"),
  phone: text("phone"),
  boardingPoint: text("boarding_point"),
  dropOffPoint: text("drop_off_point"),
  seatNumber: text("seat_number"),
  quantity: integer("quantity").default(1),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  paymentMethod: text("payment_method"),
  status: text("status").default("active").notNull(), // active, voided, refunded
  isSynced: boolean("is_synced").default(false),
  accountingStatus: text("accounting_status").default("unposted").notNull(), // unposted, posted, skipped, failed
  accountingError: text("accounting_error"),
  postedJournalEntryId: integer("posted_journal_entry_id").references(() => journalEntries.id),
  postedAt: timestamp("posted_at"),
  timestamp: timestamp("timestamp").notNull(),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyTicketNumberUnique: unique("bus_tickets_company_ticket_number_idx").on(table.companyId, table.ticketNumber),
  companyDeviceLocalUnique: unique("bus_tickets_company_device_local_idx").on(table.companyId, table.deviceId, table.localTicketId),
  companyTimestampIdx: index("bus_tickets_company_timestamp_idx").on(table.companyId, table.timestamp),
  tripIdx: index("bus_tickets_trip_id_idx").on(table.tripId),
  shiftIdx: index("bus_tickets_shift_id_idx").on(table.shiftId),
  postingIdx: index("bus_tickets_posting_idx").on(table.companyId, table.accountingStatus),
}));

export const busShifts = pgTable("bus_shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  conductorId: uuid("conductor_id").references(() => users.id).notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  vehicleId: integer("vehicle_id").references(() => busVehicles.id),
  tripId: integer("trip_id").references(() => busTrips.id),
  routeId: integer("route_id").references(() => busRoutes.id),
  closedAt: timestamp("closed_at"),
  totalTickets: integer("total_tickets").default(0),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0"),
  status: text("status").default("open"), // open, closed
  createdAt: timestamp("created_at").defaultNow(),
});

export const busReconciliations = pgTable("bus_reconciliations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  shiftId: integer("shift_id").references(() => busShifts.id),
  conductorId: uuid("conductor_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  expectedCash: decimal("expected_cash", { precision: 10, scale: 2 }).notNull(),
  cashReceived: decimal("cash_received", { precision: 10, scale: 2 }).notNull(),
  gap: decimal("gap", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  adminNotes: text("admin_notes"),
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  signedOffBy: uuid("signed_off_by").references(() => users.id),
  signedOffAt: timestamp("signed_off_at"),
  accountingStatus: text("accounting_status").default("unposted").notNull(), // unposted, posted, skipped, failed
  accountingError: text("accounting_error"),
  postedJournalEntryId: integer("posted_journal_entry_id").references(() => journalEntries.id),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyStatusIdx: index("bus_reconciliations_company_status_idx").on(table.companyId, table.status),
  postingIdx: index("bus_reconciliations_posting_idx").on(table.companyId, table.accountingStatus),
}));

// --- BUS TICKETING RELATIONS ---

export const busVehiclesRelations = relations(busVehicles, ({ one, many }) => ({
  company: one(companies, { fields: [busVehicles.companyId], references: [companies.id] }),
  trips: many(busTrips),
}));

export const busRoutesRelations = relations(busRoutes, ({ one, many }) => ({
  company: one(companies, { fields: [busRoutes.companyId], references: [companies.id] }),
  trips: many(busTrips),
}));

export const busTripsRelations = relations(busTrips, ({ one, many }) => ({
  company: one(companies, { fields: [busTrips.companyId], references: [companies.id] }),
  route: one(busRoutes, { fields: [busTrips.routeId], references: [busRoutes.id] }),
  vehicle: one(busVehicles, { fields: [busTrips.vehicleId], references: [busVehicles.id] }),
  conductor: one(users, { fields: [busTrips.conductorId], references: [users.id] }),
  tickets: many(busTickets),
}));

export const busTicketsRelations = relations(busTickets, ({ one }) => ({
  company: one(companies, { fields: [busTickets.companyId], references: [companies.id] }),
  trip: one(busTrips, { fields: [busTickets.tripId], references: [busTrips.id] }),
  postedJournalEntry: one(journalEntries, { fields: [busTickets.postedJournalEntryId], references: [journalEntries.id] }),
}));

export const busShiftsRelations = relations(busShifts, ({ one, many }) => ({
  company: one(companies, { fields: [busShifts.companyId], references: [companies.id] }),
  conductor: one(users, { fields: [busShifts.conductorId], references: [users.id] }),
  tickets: many(busTickets),
}));

export const busReconciliationsRelations = relations(busReconciliations, ({ one }) => ({
  company: one(companies, { fields: [busReconciliations.companyId], references: [companies.id] }),
  shift: one(busShifts, { fields: [busReconciliations.shiftId], references: [busShifts.id] }),
  conductor: one(users, { fields: [busReconciliations.conductorId], references: [users.id] }),
  postedJournalEntry: one(journalEntries, { fields: [busReconciliations.postedJournalEntryId], references: [journalEntries.id] }),
}));

// --- BUS TICKETING SCHEMAS & TYPES ---

export const insertBusVehicleSchema = createInsertSchema(busVehicles).omit({ id: true, createdAt: true });
export type BusVehicle = typeof busVehicles.$inferSelect;
export type InsertBusVehicle = z.infer<typeof insertBusVehicleSchema>;

export const insertBusRouteSchema = createInsertSchema(busRoutes).omit({ id: true, createdAt: true });
export type BusRouteCloud = typeof busRoutes.$inferSelect;
export type InsertBusRouteCloud = z.infer<typeof insertBusRouteSchema>;

export const insertBusTripSchema = createInsertSchema(busTrips).omit({ id: true, createdAt: true });
export type BusTrip = typeof busTrips.$inferSelect;
export type InsertBusTrip = z.infer<typeof insertBusTripSchema>;

export const insertBusTicketSchema = createInsertSchema(busTickets).omit({ id: true, createdAt: true });
export type BusTicketCloud = typeof busTickets.$inferSelect;
export type InsertBusTicketCloud = z.infer<typeof insertBusTicketSchema>;

export const insertBusShiftSchema = createInsertSchema(busShifts).omit({ id: true, createdAt: true });
export type BusShiftCloud = typeof busShifts.$inferSelect;
export type InsertBusShiftCloud = z.infer<typeof insertBusShiftSchema>;

export const insertBusReconciliationSchema = createInsertSchema(busReconciliations).omit({ id: true, createdAt: true });
export type BusReconciliationCloud = typeof busReconciliations.$inferSelect;
export type InsertBusReconciliationCloud = z.infer<typeof insertBusReconciliationSchema>;
// --- ACCOUNTING & GENERAL LEDGER ---

export const costCenters = pgTable("cost_centers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  parentId: integer("parent_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyCodeIdx: unique("cost_centers_company_code_idx").on(table.companyId, table.code),
  companyIdx: index("cost_centers_company_idx").on(table.companyId),
  parentIdx: index("cost_centers_parent_idx").on(table.parentId),
}));

export const accountingSegments = pgTable("accounting_segments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  type: text("type").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyTypeCodeIdx: unique("accounting_segments_company_type_code_idx").on(table.companyId, table.type, table.code),
  companyIdx: index("accounting_segments_company_idx").on(table.companyId),
}));

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  parentId: integer("parent_id"),
  code: text("code").notNull(), // e.g. "1000", "4000"
  name: text("name").notNull(), // e.g. "Cash at Bank", "Sales Revenue"
  type: text("type").notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  subType: text("sub_type").default("Operating").notNull(), // Current, Non-current, Operating, Finance
  category: text("category"), // Current Asset, Fixed Asset, etc. (for UI grouping)
  description: text("description"),
  normalBalance: text("normal_balance").notNull().default("DEBIT"), // DEBIT, CREDIT
  ifrsMappingTag: text("ifrs_mapping_tag"), // e.g. IAS-1, IFRS-9, etc.
  cashFlowCategory: text("cash_flow_category"),
  isControlAccount: boolean("is_control_account").default(false).notNull(),
  defaultVatTypeId: integer("default_vat_type_id").references(() => taxTypes.id),
  defaultCostCenterId: integer("default_cost_center_id").references(() => costCenters.id),
  defaultSegmentId: integer("default_segment_id").references(() => accountingSegments.id),
  isBudgetEnabled: boolean("is_budget_enabled").default(false).notNull(),
  isSystem: boolean("is_system").default(false), // Permanent accounts like AR/Revenue
  isActive: boolean("is_active").default(true),
  deactivatedAt: timestamp("deactivated_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyCodeIdx: unique("accounts_company_code_idx").on(table.companyId, table.code),
  companyIdIdx: index("accounts_company_id_idx").on(table.companyId),
  parentIdx: index("accounts_parent_idx").on(table.parentId),
  defaultCostCenterIdx: index("accounts_default_cost_center_idx").on(table.defaultCostCenterId),
}));

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id), // Branch-level GL segregation
  entryDate: timestamp("entry_date").defaultNow().notNull(),
  description: text("description").notNull(),
  referenceType: text("reference_type"), // INVOICE, PAYMENT, EXPENSE, MANUAL
  referenceId: text("reference_id"), // ID of the source document
  journalType: text("journal_type").default("GENERAL").notNull(),
  status: text("status").default("POSTED").notNull(),
  approvalStatus: text("approval_status").default("APPROVED").notNull(),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  reversalOfJournalEntryId: integer("reversal_of_journal_entry_id"),
  autoReverseOn: timestamp("auto_reverse_on"),
  fiscalSignature: text("fiscal_signature"),
  rowVersion: integer("row_version").default(1).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("journal_entries_company_id_idx").on(table.companyId),
  branchIdx: index("journal_entries_branch_idx").on(table.branchId),
  referenceIdx: index("journal_entries_reference_idx").on(table.referenceType, table.referenceId),
  statusIdx: index("journal_entries_company_status_idx").on(table.companyId, table.status),
  companyBranchIdx: index("journal_entries_company_branch_idx").on(table.companyId, table.branchId),
}));

export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id), // Denormalized for branch-level querying
  costCenterId: integer("cost_center_id").references(() => costCenters.id),
  segmentId: integer("segment_id").references(() => accountingSegments.id),
  type: text("type").notNull(), // DEBIT, CREDIT
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1.000000"),
  vatTypeId: integer("vat_type_id").references(() => taxTypes.id),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0.00"),
  withholdingTaxAmount: decimal("withholding_tax_amount", { precision: 15, scale: 2 }).default("0.00"),
  memo: text("memo"),
  isReconciled: boolean("is_reconciled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  journalEntryIdx: index("ledger_entries_journal_idx").on(table.journalEntryId),
  accountIdx: index("ledger_entries_account_idx").on(table.accountId),
  branchIdx: index("ledger_entries_branch_idx").on(table.branchId),
  costCenterIdx: index("ledger_entries_cost_center_idx").on(table.costCenterId),
  segmentIdx: index("ledger_entries_segment_idx").on(table.segmentId),
}));

export const journalEntryDrafts = pgTable("journal_entry_drafts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id), // Branch-level GL segregation
  entryDate: timestamp("entry_date").defaultNow().notNull(),
  description: text("description").notNull(),
  referenceType: text("reference_type").default("JOURNAL"),
  referenceId: text("reference_id"),
  status: text("status").default("DRAFT").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  postedJournalEntryId: integer("posted_journal_entry_id").references(() => journalEntries.id),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyStatusIdx: index("journal_entry_drafts_company_status_idx").on(table.companyId, table.status),
  companyBranchIdx: index("journal_entry_drafts_company_branch_idx").on(table.companyId, table.branchId),
}));

export const journalEntryDraftLines = pgTable("journal_entry_draft_lines", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").references(() => journalEntryDrafts.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id), // Branch-level GL segregation
  costCenterId: integer("cost_center_id").references(() => costCenters.id),
  segmentId: integer("segment_id").references(() => accountingSegments.id),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  draftIdx: index("journal_entry_draft_lines_draft_idx").on(table.draftId),
  accountIdx: index("journal_entry_draft_lines_account_idx").on(table.accountId),
  branchIdx: index("journal_entry_draft_lines_branch_idx").on(table.branchId),
  costCenterIdx: index("journal_entry_draft_lines_cost_center_idx").on(table.costCenterId),
  segmentIdx: index("journal_entry_draft_lines_segment_idx").on(table.segmentId),
}));

export const costCentersRelations = relations(costCenters, ({ one, many }) => ({
  company: one(companies, { fields: [costCenters.companyId], references: [companies.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const accountingSegmentsRelations = relations(accountingSegments, ({ one, many }) => ({
  company: one(companies, { fields: [accountingSegments.companyId], references: [companies.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  company: one(companies, { fields: [accounts.companyId], references: [companies.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  company: one(companies, { fields: [journalEntries.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [journalEntries.branchId], references: [branches.id] }),
  user: one(users, { fields: [journalEntries.createdBy], references: [users.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  journalEntry: one(journalEntries, { fields: [ledgerEntries.journalEntryId], references: [journalEntries.id] }),
  account: one(accounts, { fields: [ledgerEntries.accountId], references: [accounts.id] }),
  branch: one(branches, { fields: [ledgerEntries.branchId], references: [branches.id] }),
  costCenter: one(costCenters, { fields: [ledgerEntries.costCenterId], references: [costCenters.id] }),
  segment: one(accountingSegments, { fields: [ledgerEntries.segmentId], references: [accountingSegments.id] }),
}));

export const journalEntryDraftsRelations = relations(journalEntryDrafts, ({ one, many }) => ({
  company: one(companies, { fields: [journalEntryDrafts.companyId], references: [companies.id] }),
  user: one(users, { fields: [journalEntryDrafts.createdBy], references: [users.id] }),
  postedJournalEntry: one(journalEntries, { fields: [journalEntryDrafts.postedJournalEntryId], references: [journalEntries.id] }),
  lines: many(journalEntryDraftLines),
}));

export const journalEntryDraftLinesRelations = relations(journalEntryDraftLines, ({ one }) => ({
  draft: one(journalEntryDrafts, { fields: [journalEntryDraftLines.draftId], references: [journalEntryDrafts.id] }),
  account: one(accounts, { fields: [journalEntryDraftLines.accountId], references: [accounts.id] }),
  costCenter: one(costCenters, { fields: [journalEntryDraftLines.costCenterId], references: [costCenters.id] }),
  segment: one(accountingSegments, { fields: [journalEntryDraftLines.segmentId], references: [accountingSegments.id] }),
}));

export const withholdingTaxRates = pgTable("withholding_tax_rates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  category: text("category").notNull().default("CONTRACT"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyCodeIdx: unique("wht_rates_company_code_idx").on(table.companyId, table.code),
  companyIdx: index("wht_rates_company_idx").on(table.companyId),
}));

export const withholdingTaxCertificates = pgTable("withholding_tax_certificates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  supplierInvoiceId: integer("supplier_invoice_id").references(() => supplierInvoices.id),
  rateId: integer("rate_id").references(() => withholdingTaxRates.id),
  certificateNumber: text("certificate_number").notNull(),
  taxableAmount: decimal("taxable_amount", { precision: 15, scale: 2 }).notNull(),
  withheldAmount: decimal("withheld_amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, ISSUED, REMITTED, CANCELLED
  remittanceReference: text("remittance_reference"),
  issuedAt: timestamp("issued_at"),
  remittedAt: timestamp("remitted_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyCertificateIdx: unique("wht_certificates_company_number_idx").on(table.companyId, table.certificateNumber),
  companyIdx: index("wht_certificates_company_idx").on(table.companyId),
  supplierIdx: index("wht_certificates_supplier_idx").on(table.supplierId),
}));

// --- SUPPLIER INVOICES & PAYMENTS (AP) ---

export const supplierInvoices = pgTable("supplier_invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id),
  invoiceNumber: text("invoice_number").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  dueDate: timestamp("due_date"),
  transactionType: text("transaction_type").default("Invoice").notNull(), // Invoice, DebitNote, CreditNote
  referenceInvoiceId: integer("reference_invoice_id"), // Reference to the original supplier_invoices.id
  subtotalAmount: decimal("subtotal_amount", { precision: 15, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"),
  taxInclusive: boolean("tax_inclusive").default(false).notNull(),
  withholdingTaxRateId: integer("withholding_tax_rate_id").references(() => withholdingTaxRates.id),
  withholdingTaxAmount: decimal("withholding_tax_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  withholdingCertificateId: integer("withholding_certificate_id"),
  currency: text("currency").default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1.000000"),
  status: text("status").notNull().default("unpaid"), // unpaid, partial, paid, cancelled
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  grvReference: text("grv_reference"),
  referenceGdnId: integer("reference_gdn_id").references(() => goodsDeliveryNotes.id),
  debitAccountId: integer("debit_account_id").references(() => accounts.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdx: index("supplier_invoices_company_idx").on(table.companyId),
  supplierIdx: index("supplier_invoices_supplier_idx").on(table.supplierId),
}));

export const supplierInvoiceItems = pgTable("supplier_invoice_items", {
  id: serial("id").primaryKey(),
  supplierInvoiceId: integer("supplier_invoice_id").references(() => supplierInvoices.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  accountCode: text("account_code"),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).notNull(),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"),
  isRecoverable: boolean("is_recoverable").default(true),
});

export const supplierPayments = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  supplierInvoiceId: integer("supplier_invoice_id").references(() => supplierInvoices.id), // Nullable for on-account payments
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  method: text("method").notNull(), // Cash, Bank, Mobile Money, etc.
  reference: text("reference"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdx: index("supplier_payments_company_idx").on(table.companyId),
  supplierIdx: index("supplier_payments_supplier_idx").on(table.supplierId),
}));

export const supplierPaymentAllocations = pgTable("supplier_payment_allocations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierPaymentId: integer("supplier_payment_id").references(() => supplierPayments.id).notNull(),
  supplierInvoiceId: integer("supplier_invoice_id").references(() => supplierInvoices.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  allocatedAt: timestamp("allocated_at").defaultNow().notNull(),
  reversedAt: timestamp("reversed_at"),
  reversalReason: text("reversal_reason"),
}, (table) => ({
  paymentIdx: index("supplier_payment_allocations_payment_idx").on(table.supplierPaymentId),
  invoiceIdx: index("supplier_payment_allocations_invoice_idx").on(table.supplierInvoiceId),
  companyIdx: index("supplier_payment_allocations_company_idx").on(table.companyId),
}));

export const supplierInvoicesRelations = relations(supplierInvoices, ({ one, many }) => ({
  company: one(companies, { fields: [supplierInvoices.companyId], references: [companies.id] }),
  supplier: one(suppliers, { fields: [supplierInvoices.supplierId], references: [suppliers.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [supplierInvoices.purchaseOrderId], references: [purchaseOrders.id] }),
  items: many(supplierInvoiceItems),
}));

export const supplierInvoiceItemsRelations = relations(supplierInvoiceItems, ({ one }) => ({
  invoice: one(supplierInvoices, { fields: [supplierInvoiceItems.supplierInvoiceId], references: [supplierInvoices.id] }),
  product: one(products, { fields: [supplierInvoiceItems.productId], references: [products.id] }),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one }) => ({
  company: one(companies, { fields: [supplierPayments.companyId], references: [companies.id] }),
  supplier: one(suppliers, { fields: [supplierPayments.supplierId], references: [suppliers.id] }),
}));

export const supplierPaymentAllocationsRelations = relations(supplierPaymentAllocations, ({ one }) => ({
  company: one(companies, { fields: [supplierPaymentAllocations.companyId], references: [companies.id] }),
  payment: one(supplierPayments, { fields: [supplierPaymentAllocations.supplierPaymentId], references: [supplierPayments.id] }),
  invoice: one(supplierInvoices, { fields: [supplierPaymentAllocations.supplierInvoiceId], references: [supplierInvoices.id] }),
}));

export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({ id: true, createdAt: true });
export type JournalEntry = typeof journalEntries.$inferSelect;

// ==========================================
// FINANCIAL PERIODS
// ==========================================
export const financialPeriods = pgTable("financial_periods", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(), // e.g. "January 2026"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  periodNumber: integer("period_number"),
  fiscalYear: integer("fiscal_year"),
  isAdjustmentPeriod: boolean("is_adjustment_period").default(false).notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN, CLOSED, LOCKED
  apLocked: boolean("ap_locked").default(false).notNull(),
  arLocked: boolean("ar_locked").default(false).notNull(),
  inventoryLocked: boolean("inventory_locked").default(false).notNull(),
  glLocked: boolean("gl_locked").default(false).notNull(),
  closedBy: uuid("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
  lockedBy: uuid("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  reopenJustification: text("reopen_justification"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const financialPeriodsRelations = relations(financialPeriods, ({ one }) => ({
  company: one(companies, { fields: [financialPeriods.companyId], references: [companies.id] }),
}));

export const insertFinancialPeriodSchema = createInsertSchema(financialPeriods).omit({ id: true, createdAt: true });
export type FinancialPeriod = typeof financialPeriods.$inferSelect;
export type InsertFinancialPeriod = z.infer<typeof insertFinancialPeriodSchema>;

// ==========================================
// CASHBOOK
// ==========================================
export const cashbookEntries = pgTable("cashbook_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  bankAccountId: integer("bank_account_id").references(() => accounts.id).notNull(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  entryDate: timestamp("entry_date").defaultNow().notNull(),
  type: text("type").notNull(), // RECEIPT, PAYMENT, TRANSFER
  method: text("method").default("CASH").notNull(),
  reference: text("reference"),
  counterpartyName: text("counterparty_name"),
  description: text("description").notNull(),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  status: text("status").default("POSTED").notNull(), // DRAFT, PENDING_APPROVAL, POSTED, VOID
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyDateIdx: index("cashbook_entries_company_date_idx").on(table.companyId, table.entryDate),
  bankAccountIdx: index("cashbook_entries_bank_account_idx").on(table.bankAccountId),
  statusIdx: index("cashbook_entries_status_idx").on(table.companyId, table.status),
}));

export const cashbookEntryLines = pgTable("cashbook_entry_lines", {
  id: serial("id").primaryKey(),
  cashbookEntryId: integer("cashbook_entry_id").references(() => cashbookEntries.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  costCenterId: integer("cost_center_id").references(() => costCenters.id),
  description: text("description"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
}, (table) => ({
  entryIdx: index("cashbook_entry_lines_entry_idx").on(table.cashbookEntryId),
  accountIdx: index("cashbook_entry_lines_account_idx").on(table.accountId),
  costCenterIdx: index("cashbook_entry_lines_cost_center_idx").on(table.costCenterId),
}));

export const cashbookEntriesRelations = relations(cashbookEntries, ({ one, many }) => ({
  company: one(companies, { fields: [cashbookEntries.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [cashbookEntries.branchId], references: [branches.id] }),
  bankAccount: one(accounts, { fields: [cashbookEntries.bankAccountId], references: [accounts.id] }),
  journalEntry: one(journalEntries, { fields: [cashbookEntries.journalEntryId], references: [journalEntries.id] }),
  lines: many(cashbookEntryLines),
}));

export const cashbookEntryLinesRelations = relations(cashbookEntryLines, ({ one }) => ({
  entry: one(cashbookEntries, { fields: [cashbookEntryLines.cashbookEntryId], references: [cashbookEntries.id] }),
  account: one(accounts, { fields: [cashbookEntryLines.accountId], references: [accounts.id] }),
  costCenter: one(costCenters, { fields: [cashbookEntryLines.costCenterId], references: [costCenters.id] }),
}));

export const insertCashbookEntrySchema = createInsertSchema(cashbookEntries).omit({ id: true, createdAt: true, journalEntryId: true, approvedBy: true, approvedAt: true });
export type CashbookEntry = typeof cashbookEntries.$inferSelect;
export type InsertCashbookEntry = z.infer<typeof insertCashbookEntrySchema>;

export const insertCashbookEntryLineSchema = createInsertSchema(cashbookEntryLines).omit({ id: true });
export type CashbookEntryLine = typeof cashbookEntryLines.$inferSelect;
export type InsertCashbookEntryLine = z.infer<typeof insertCashbookEntryLineSchema>;

// ==========================================
// TAX OBLIGATIONS, MOBILE MONEY, AND REPORT SCHEDULING
// ==========================================

export const taxObligations = pgTable("tax_obligations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  taxType: text("tax_type").notNull(), // VAT, WHT, PROVISIONAL_TAX, INCOME_TAX
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  dueDate: timestamp("due_date").notNull(),
  amountDue: decimal("amount_due", { precision: 15, scale: 2 }).default("0.00").notNull(),
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).default("0.00").notNull(),
  status: text("status").default("OPEN").notNull(),
  reference: text("reference"),
  submittedAt: timestamp("submitted_at"),
  paidAt: timestamp("paid_at"),
  snapshot: jsonb("snapshot"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyTaxPeriodIdx: unique("tax_obligations_company_tax_period_idx").on(table.companyId, table.taxType, table.periodStart, table.periodEnd),
  dueDateIdx: index("tax_obligations_due_date_idx").on(table.companyId, table.dueDate),
}));

export const mobileMoneyTransactions = pgTable("mobile_money_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  paymentId: integer("payment_id").references(() => payments.id),
  cashbookEntryId: integer("cashbook_entry_id").references(() => cashbookEntries.id),
  network: text("network").notNull(),
  reference: text("reference").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  status: text("status").default("PENDING").notNull(),
  rawPayload: jsonb("raw_payload"),
  signatureHash: text("signature_hash"),
  confirmedAt: timestamp("confirmed_at"),
  reconciledAt: timestamp("reconciled_at"),
  reversedAt: timestamp("reversed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyReferenceIdx: unique("mobile_money_company_reference_idx").on(table.companyId, table.network, table.reference),
  statusIdx: index("mobile_money_company_status_idx").on(table.companyId, table.status),
}));

export const scheduledReports = pgTable("scheduled_reports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  reportKey: text("report_key").notNull(),
  cadence: text("cadence").notNull(), // DAILY, WEEKLY, MONTHLY
  recipients: jsonb("recipients").$type<string[]>().default([]),
  filters: jsonb("filters").default({}),
  format: text("format").default("PDF").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdx: index("scheduled_reports_company_idx").on(table.companyId),
  nextRunIdx: index("scheduled_reports_next_run_idx").on(table.nextRunAt),
}));

export const provisions = pgTable("provisions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  additions: decimal("additions", { precision: 15, scale: 2 }).default("0.00").notNull(),
  reversals: decimal("reversals", { precision: 15, scale: 2 }).default("0.00").notNull(),
  utilisation: decimal("utilisation", { precision: 15, scale: 2 }).default("0.00").notNull(),
  closingBalance: decimal("closing_balance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  probability: text("probability").default("PROBABLE"),
  status: text("status").default("ACTIVE").notNull(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdx: index("provisions_company_idx").on(table.companyId),
  statusIdx: index("provisions_company_status_idx").on(table.companyId, table.status),
}));

export const revenueContracts = pgTable("revenue_contracts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  contractNumber: text("contract_number").notNull(),
  description: text("description"),
  totalValue: decimal("total_value", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  recognitionMethod: text("recognition_method").default("POINT_IN_TIME").notNull(),
  deferredRevenue: decimal("deferred_revenue", { precision: 15, scale: 2 }).default("0.00").notNull(),
  recognizedRevenue: decimal("recognized_revenue", { precision: 15, scale: 2 }).default("0.00").notNull(),
  obligations: jsonb("obligations").$type<Array<{ name: string; amount: number; status?: string }>>().default([]),
  status: text("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyContractIdx: unique("revenue_contracts_company_number_idx").on(table.companyId, table.contractNumber),
  companyIdx: index("revenue_contracts_company_idx").on(table.companyId),
}));

// ==========================================
// BANK RECONCILIATION
// ==========================================
export const bankStatements = pgTable("bank_statements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  statementDate: timestamp("statement_date").notNull(),
  closingBalance: decimal("closing_balance", { precision: 12, scale: 2 }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const bankStatementLines = pgTable("bank_statement_lines", {
  id: serial("id").primaryKey(),
  statementId: integer("statement_id").references(() => bankStatements.id).notNull(),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  isReconciled: boolean("is_reconciled").default(false).notNull(),
  matchedLedgerEntryId: integer("matched_ledger_entry_id").references(() => ledgerEntries.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bankStatementsRelations = relations(bankStatements, ({ one, many }) => ({
  company: one(companies, { fields: [bankStatements.companyId], references: [companies.id] }),
  account: one(accounts, { fields: [bankStatements.accountId], references: [accounts.id] }),
  lines: many(bankStatementLines),
}));

export const insertBankStatementSchema = createInsertSchema(bankStatements).omit({ id: true, uploadedAt: true });
export type BankStatement = typeof bankStatements.$inferSelect;
export type InsertBankStatement = z.infer<typeof insertBankStatementSchema>;

export const insertBankStatementLineSchema = createInsertSchema(bankStatementLines).omit({ id: true, createdAt: true, isReconciled: true, matchedLedgerEntryId: true });
export type BankStatementLine = typeof bankStatementLines.$inferSelect;
export type InsertBankStatementLine = z.infer<typeof insertBankStatementLineSchema>;

// ==========================================
// FIXED ASSETS & DEPRECIATION
// ==========================================
export const fixedAssets = pgTable("fixed_assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  description: text("description"),
  serialNumber: text("serial_number"),
  
  purchaseDate: timestamp("purchase_date").notNull(),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }).notNull(),
  salvageValue: decimal("salvage_value", { precision: 12, scale: 2 }).default("0").notNull(),
  usefulLifeYears: integer("useful_life_years").notNull(),
  
  depreciationMethod: text("depreciation_method").notNull().default("STRAIGHT_LINE"), // STRAIGHT_LINE, DECLINING_BALANCE
  accumulatedDepreciation: decimal("accumulated_depreciation", { precision: 12, scale: 2 }).default("0").notNull(),
  netBookValue: decimal("net_book_value", { precision: 12, scale: 2 }).notNull(),
  
  // Account mappings for journaling
  assetAccountId: integer("asset_account_id").references(() => accounts.id).notNull(),
  depreciationExpenseAccountId: integer("depreciation_expense_account_id").references(() => accounts.id).notNull(),
  accumulatedDepreciationAccountId: integer("accumulated_depreciation_account_id").references(() => accounts.id).notNull(),
  
  status: text("status").notNull().default("ACTIVE"), // ACTIVE, DISPOSED, SOLD
  lastDepreciationDate: timestamp("last_depreciation_date"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const depreciationRuns = pgTable("depreciation_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  assetId: integer("asset_id").references(() => fixedAssets.id).notNull(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  date: timestamp("date").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fixedAssetsRelations = relations(fixedAssets, ({ one, many }) => ({
  company: one(companies, { fields: [fixedAssets.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [fixedAssets.branchId], references: [branches.id] }),
  assetAccount: one(accounts, { fields: [fixedAssets.assetAccountId], references: [accounts.id] }),
  depreciationExpenseAccount: one(accounts, { fields: [fixedAssets.depreciationExpenseAccountId], references: [accounts.id] }),
  accumulatedDepreciationAccount: one(accounts, { fields: [fixedAssets.accumulatedDepreciationAccountId], references: [accounts.id] }),
  runs: many(depreciationRuns),
}));

export const depreciationRunsRelations = relations(depreciationRuns, ({ one }) => ({
  company: one(companies, { fields: [depreciationRuns.companyId], references: [companies.id] }),
  asset: one(fixedAssets, { fields: [depreciationRuns.assetId], references: [fixedAssets.id] }),
  journalEntry: one(journalEntries, { fields: [depreciationRuns.journalEntryId], references: [journalEntries.id] }),
}));

export const insertFixedAssetSchema = createInsertSchema(fixedAssets).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  accumulatedDepreciation: true,
  netBookValue: true,
  lastDepreciationDate: true,
  status: true
});
export type FixedAsset = typeof fixedAssets.$inferSelect;
export type InsertFixedAsset = z.infer<typeof insertFixedAssetSchema>;
export type DepreciationRun = typeof depreciationRuns.$inferSelect;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({ id: true, createdAt: true });
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;

export const insertJournalEntryDraftSchema = createInsertSchema(journalEntryDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  postedAt: true,
  postedJournalEntryId: true
});
export type JournalEntryDraft = typeof journalEntryDrafts.$inferSelect;
export type InsertJournalEntryDraft = z.infer<typeof insertJournalEntryDraftSchema>;

export const insertJournalEntryDraftLineSchema = createInsertSchema(journalEntryDraftLines).omit({ id: true, createdAt: true });
export type JournalEntryDraftLine = typeof journalEntryDraftLines.$inferSelect;
export type InsertJournalEntryDraftLine = z.infer<typeof insertJournalEntryDraftLineSchema>;

export const insertSupplierInvoiceSchema = createInsertSchema(supplierInvoices).omit({ id: true, createdAt: true });
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type InsertSupplierInvoice = z.infer<typeof insertSupplierInvoiceSchema>;

export const insertSupplierInvoiceItemSchema = createInsertSchema(supplierInvoiceItems).omit({ id: true });
export type SupplierInvoiceItem = typeof supplierInvoiceItems.$inferSelect;
export type InsertSupplierInvoiceItem = z.infer<typeof insertSupplierInvoiceItemSchema>;

export const insertSupplierPaymentSchema = createInsertSchema(supplierPayments).omit({ id: true, createdAt: true });
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;
export const insertSupplierPaymentAllocationSchema = createInsertSchema(supplierPaymentAllocations).omit({ id: true, allocatedAt: true, reversedAt: true, reversalReason: true });
export type SupplierPaymentAllocation = typeof supplierPaymentAllocations.$inferSelect;
export type InsertSupplierPaymentAllocation = z.infer<typeof insertSupplierPaymentAllocationSchema>;

// ==========================================
// --- HR AND PAYROLL SYSTEM SCHEMAS ---
// ==========================================

// 1. National Employment Council (NEC) Sectors Configuration
export const necSectorsConfig = pgTable("nec_sectors_config", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id), // Nullable for system-wide presets
  name: text("name").notNull(), // e.g. NEC Commercial Sector, NEC Construction, NEC Catering
  code: text("code").notNull(),
  employeeRate: decimal("employee_rate", { precision: 5, scale: 4 }).default("0.0000").notNull(), // e.g. 0.0100 for 1%
  employerRate: decimal("employer_rate", { precision: 5, scale: 4 }).default("0.0000").notNull(),
  fixedAmount: decimal("fixed_amount", { precision: 15, scale: 2 }).default("0.00").notNull(), // For flat fees
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyNecIdx: index("nec_sectors_company_idx").on(table.companyId),
}));

// 2. Departments Configuration
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  glAccountId: integer("gl_account_id").references(() => accounts.id), // Direct payroll expense mapping
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyDeptIdx: index("departments_company_idx").on(table.companyId),
}));

// 3. Positions Configuration
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  title: text("title").notNull(),
  grade: text("grade"), // e.g. D1, C3 (used for Grade-based/NEC payslips)
  necCategory: text("nec_category"), // National Employment Council classification
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyPosIdx: index("positions_company_idx").on(table.companyId),
}));

// 3B. Pay Grades / NEC Bands
export const payrollPayGrades = pgTable("payroll_pay_grades", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  salaryStructureId: integer("salary_structure_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  currency: text("currency").default("USD").notNull(),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(),
  minSalary: decimal("min_salary", { precision: 15, scale: 2 }).default("0.00").notNull(),
  midpointSalary: decimal("midpoint_salary", { precision: 15, scale: 2 }).default("0.00").notNull(),
  maxSalary: decimal("max_salary", { precision: 15, scale: 2 }).default("0.00").notNull(),
  necSectorId: integer("nec_sector_id").references(() => necSectorsConfig.id),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyGradeUnique: unique("payroll_pay_grades_company_code_unique").on(table.companyId, table.code),
  companyGradeIdx: index("payroll_pay_grades_company_idx").on(table.companyId),
}));

// 4. Employee Directory
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  positionId: integer("position_id").references(() => positions.id),
  
  employeeNumber: text("employee_number").notNull(), // User-facing identifier
  title: text("title"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  maritalStatus: text("marital_status"),
  email: text("email"),
  phone: text("phone"),
  physicalAddress: text("physical_address"),
  postalAddress: text("postal_address"),
  
  // Compliance identifiers
  nationalId: text("national_id").notNull(), // ID number in format: 12-345678X90
  nssaNumber: text("nssa_number"),
  zimraTaxNumber: text("zimra_tax_number"),
  
  // Banking details
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  bankAccountNumber: text("bank_account_number"),
  ecocashNumber: text("ecocash_number"), // Wallet details
  
  // Personal Details
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  nextOfKinName: text("next_of_kin_name"),
  nextOfKinRelationship: text("next_of_kin_relationship"),
  nextOfKinPhone: text("next_of_kin_phone"),
  nextOfKinAddress: text("next_of_kin_address"),
  status: text("status").default("ACTIVE").notNull(), // ACTIVE, INACTIVE, SUSPENDED, TERMINATED
  joiningDate: date("joining_date").notNull(),
  terminationDate: date("termination_date"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyEmpUnique: unique("employees_company_emp_no_unique").on(table.companyId, table.employeeNumber),
  companyIdx: index("employees_company_idx").on(table.companyId),
  branchIdx: index("employees_branch_idx").on(table.branchId),
  statusIdx: index("employees_status_idx").on(table.status),
}));

// 5. Employee Contracts (Finance Act Compliant Split-Currency Configuration)
export const employeeContracts = pgTable("employee_contracts", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  contractType: text("contract_type").default("PERMANENT").notNull(), // PERMANENT, FIXED_TERM, CASUAL
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(), // MONTHLY, WEEKLY, FORTNIGHTLY, DAILY
  baseSalary: decimal("base_salary", { precision: 15, scale: 2 }).notNull(), // Total base salary in base contract currency
  currency: text("currency").default("USD").notNull(), // USD, ZiG, or SPLIT
  
  // Split Currency Multi-Currency Ratio Allocations
  usdPercentage: decimal("usd_percentage", { precision: 5, scale: 2 }).default("100.00").notNull(), // e.g. 70.00
  zigPercentage: decimal("zig_percentage", { precision: 5, scale: 2 }).default("0.00").notNull(),   // e.g. 30.00
  
  payGradeId: integer("pay_grade_id").references(() => payrollPayGrades.id),
  necSectorId: integer("nec_sector_id").references(() => necSectorsConfig.id), // Link to selected NEC config
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  employeeContractIdx: index("employee_contracts_employee_idx").on(table.employeeId),
}));

// 6. Statutory Configurations (Administratively configurable tax tables)
export const taxTablesConfig = pgTable("tax_tables_config", {
  id: serial("id").primaryKey(),
  currency: text("currency").default("USD").notNull(), // USD or ZiG
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  
  // Tax bracket definitions stored as JSONB array of objects:
  // [{ min: 0, max: 100, rate: 0, deduction: 0 }, { min: 101, max: 500, rate: 20, deduction: 20.20 }]
  brackets: jsonb("brackets").notNull(), 
  
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  currencyPeriodIdx: index("tax_tables_currency_period_idx").on(table.currency, table.effectiveFrom),
}));

// 6B. Normalized PAYE tables and tax bands
export const payrollTaxTables = pgTable("payroll_tax_tables", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  countryCode: text("country_code").default("ZW").notNull(),
  currency: text("currency").default("USD").notNull(),
  taxYear: integer("tax_year").notNull(),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  version: integer("version").default(1).notNull(),
  sourceReference: text("source_reference"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyTaxTableIdx: index("payroll_tax_tables_company_idx").on(table.companyId),
  taxTableLookupIdx: index("payroll_tax_tables_lookup_idx").on(table.countryCode, table.currency, table.payFrequency, table.effectiveFrom),
}));

export const payrollTaxBrackets = pgTable("payroll_tax_brackets", {
  id: serial("id").primaryKey(),
  taxTableId: integer("tax_table_id").references(() => payrollTaxTables.id).notNull(),
  bracketOrder: integer("bracket_order").notNull(),
  minIncome: decimal("min_income", { precision: 15, scale: 2 }).default("0.00").notNull(),
  maxIncome: decimal("max_income", { precision: 15, scale: 2 }),
  rate: decimal("rate", { precision: 8, scale: 6 }).default("0.000000").notNull(),
  deduction: decimal("deduction", { precision: 15, scale: 2 }).default("0.00").notNull(),
  baseTax: decimal("base_tax", { precision: 15, scale: 2 }).default("0.00").notNull(),
}, (table) => ({
  taxTableBracketIdx: index("payroll_tax_brackets_table_idx").on(table.taxTableId, table.bracketOrder),
}));

// 6C. Statutory rule registry for NSSA, AIDS levy, NEC and future Zimbabwe rules
export const payrollStatutoryRules = pgTable("payroll_statutory_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  countryCode: text("country_code").default("ZW").notNull(),
  ruleCode: text("rule_code").notNull(), // PAYE, AIDS_LEVY, NSSA_POBS, NEC, APWCS, PENSION
  name: text("name").notNull(),
  currency: text("currency").default("USD").notNull(),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(),
  employeeRate: decimal("employee_rate", { precision: 8, scale: 6 }).default("0.000000").notNull(),
  employerRate: decimal("employer_rate", { precision: 8, scale: 6 }).default("0.000000").notNull(),
  ceilingAmount: decimal("ceiling_amount", { precision: 15, scale: 2 }),
  floorAmount: decimal("floor_amount", { precision: 15, scale: 2 }),
  calculationBasis: text("calculation_basis").default("TAXABLE_INCOME").notNull(),
  formula: text("formula"),
  metadata: jsonb("metadata").default({}).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  version: integer("version").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isSystemLocked: boolean("is_system_locked").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  statutoryRuleLookupIdx: index("payroll_statutory_rules_lookup_idx").on(table.countryCode, table.ruleCode, table.currency, table.payFrequency, table.effectiveFrom),
  statutoryRuleCompanyIdx: index("payroll_statutory_rules_company_idx").on(table.companyId),
}));

// 6D. Configurable earning and deduction definitions
export const payrollEarningTypes = pgTable("payroll_earning_types", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  countryCode: text("country_code").default("ZW").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").default("ALLOWANCE").notNull(), // BASIC, ALLOWANCE, BENEFIT, OVERTIME, BONUS, COMMISSION, BACK_PAY, LEAVE_PAY
  taxTreatment: text("tax_treatment").default("TAXABLE").notNull(), // TAXABLE, NON_TAXABLE, PARTIAL
  taxablePercentage: decimal("taxable_percentage", { precision: 5, scale: 2 }).default("100.00").notNull(),
  isPensionable: boolean("is_pensionable").default(false).notNull(),
  isNssaApplicable: boolean("is_nssa_applicable").default(false).notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  calculationMethod: text("calculation_method").default("FIXED").notNull(), // FIXED, PERCENTAGE, FORMULA
  formula: text("formula"),
  glAccountId: integer("gl_account_id").references(() => accounts.id),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  earningTypeCompanyCodeIdx: index("payroll_earning_types_company_code_idx").on(table.companyId, table.code),
}));

export const payrollDeductionTypes = pgTable("payroll_deduction_types", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  countryCode: text("country_code").default("ZW").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").default("COMPANY").notNull(), // STATUTORY, COMPANY, PENSION, LOAN, GARNISHEE
  timing: text("timing").default("POST_TAX").notNull(), // PRE_TAX, POST_TAX, STATUTORY
  contributionSide: text("contribution_side").default("EMPLOYEE").notNull(), // EMPLOYEE, EMPLOYER, BOTH
  calculationMethod: text("calculation_method").default("FIXED").notNull(), // FIXED, PERCENTAGE, FORMULA
  formula: text("formula"),
  employeeRate: decimal("employee_rate", { precision: 8, scale: 6 }).default("0.000000").notNull(),
  employerRate: decimal("employer_rate", { precision: 8, scale: 6 }).default("0.000000").notNull(),
  maxAmount: decimal("max_amount", { precision: 15, scale: 2 }),
  priorityOrder: integer("priority_order").default(100).notNull(),
  glAccountId: integer("gl_account_id").references(() => accounts.id),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  deductionTypeCompanyCodeIdx: index("payroll_deduction_types_company_code_idx").on(table.companyId, table.code),
  deductionTypePriorityIdx: index("payroll_deduction_types_priority_idx").on(table.priorityOrder),
}));

export const payrollSalaryStructures = pgTable("payroll_salary_structures", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  currency: text("currency").default("USD").notNull(),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(),
  defaultEarningTypeIds: jsonb("default_earning_type_ids").default([]).notNull(),
  defaultDeductionTypeIds: jsonb("default_deduction_type_ids").default([]).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  salaryStructureUnique: unique("payroll_salary_structures_company_code_unique").on(table.companyId, table.code),
}));

export const payrollPayGradeSteps = pgTable("payroll_pay_grade_steps", {
  id: serial("id").primaryKey(),
  payGradeId: integer("pay_grade_id").references(() => payrollPayGrades.id).notNull(),
  stepCode: text("step_code").notNull(),
  stepName: text("step_name").notNull(),
  salaryAmount: decimal("salary_amount", { precision: 15, scale: 2 }).notNull(),
  progressionMonths: integer("progression_months"),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => ({
  payGradeStepIdx: index("payroll_pay_grade_steps_grade_idx").on(table.payGradeId),
}));

export const employeePayrollProfiles = pgTable("employee_payroll_profiles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  salaryStructureId: integer("salary_structure_id").references(() => payrollSalaryStructures.id),
  payGradeId: integer("pay_grade_id").references(() => payrollPayGrades.id),
  payGradeStepId: integer("pay_grade_step_id").references(() => payrollPayGradeSteps.id),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(),
  currency: text("currency").default("USD").notNull(),
  isNssaExempt: boolean("is_nssa_exempt").default(false).notNull(),
  isPayeExempt: boolean("is_paye_exempt").default(false).notNull(),
  taxCreditAmount: decimal("tax_credit_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  employeePayrollProfileIdx: index("employee_payroll_profiles_employee_idx").on(table.employeeId),
  companyPayrollProfileIdx: index("employee_payroll_profiles_company_idx").on(table.companyId),
}));

// 7. Recurring Earnings and Deductions (Salary templates per employee)
export const payrollRecurringItems = pgTable("payroll_recurring_items", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  type: text("type").notNull(), // ALLOWANCE, DEDUCTION
  name: text("name").notNull(), // e.g. Transport Allowance, Pension Scheme
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  isTaxable: boolean("is_taxable").default(true).notNull(), // Relevant for Allowances
  isTaxDeductible: boolean("is_tax_deductible").default(false).notNull(), // Relevant for Deductions (e.g. Pension)
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => ({
  employeeRecurIdx: index("payroll_recurring_employee_idx").on(table.employeeId),
}));

// 8. Payroll Processing Runs (The monthly or weekly batch container)
export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id), // Nullable for global run
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(), // MONTHLY, WEEKLY
  currency: text("currency").default("USD").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1.000000").notNull(), // Target exchange rate USD->ZiG for this run
  
  status: text("status").default("DRAFT").notNull(), // DRAFT, REVIEW, APPROVED, LOCKED, REVERSED
  version: integer("version").default(1).notNull(),
  reversalOfRunId: integer("reversal_of_run_id"), // Points to run being reversed
  runType: text("run_type").default("REGULAR").notNull(), // REGULAR, BONUS (13th cheque / annual bonus)
  prorationBasis: text("proration_basis").default("CALENDAR_DAYS").notNull(), // CALENDAR_DAYS, WORKING_DAYS, PAYABLE_DAYS, HOURS_WORKED
  
  // Aggregate calculation metrics
  totalBasic: decimal("total_basic", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalGross: decimal("total_gross", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalDeductions: decimal("total_deductions", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalNet: decimal("total_net", { precision: 15, scale: 2 }).default("0.00").notNull(),
  
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  lockedBy: uuid("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyPeriodIdx: index("payroll_runs_company_period_idx").on(table.companyId, table.periodStart, table.periodEnd),
  statusIdx: index("payroll_runs_status_idx").on(table.status),
}));

// 9. Payroll Run Employee Lines (The calculated payslip data)
export const payrollRunEmployees = pgTable("payroll_run_employees", {
  id: serial("id").primaryKey(),
  payrollRunId: integer("payroll_run_id").references(() => payrollRuns.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  
  // Calculated financial data (expressed in base run currency)
  basicSalary: decimal("basic_salary", { precision: 15, scale: 2 }).notNull(),
  grossSalary: decimal("gross_salary", { precision: 15, scale: 2 }).notNull(),
  netSalary: decimal("net_salary", { precision: 15, scale: 2 }).notNull(),
  
  // Statutory deductions breakdowns
  paye: decimal("paye", { precision: 15, scale: 2 }).default("0.00").notNull(),
  aidsLevy: decimal("aids_levy", { precision: 15, scale: 2 }).default("0.00").notNull(),
  nssaEmployee: decimal("nssa_employee", { precision: 15, scale: 2 }).default("0.00").notNull(),
  nssaEmployer: decimal("nssa_employer", { precision: 15, scale: 2 }).default("0.00").notNull(),
  necEmployee: decimal("nec_employee", { precision: 15, scale: 2 }).default("0.00").notNull(),
  necEmployer: decimal("nec_employer", { precision: 15, scale: 2 }).default("0.00").notNull(),
  pensionEmployee: decimal("pension_employee", { precision: 15, scale: 2 }).default("0.00").notNull(),
  pensionEmployer: decimal("pension_employer", { precision: 15, scale: 2 }).default("0.00").notNull(),
  
  // Finance Act Compliant Multi-Currency Split Allocations
  usdPercentage: decimal("usd_percentage", { precision: 5, scale: 2 }).default("100.00").notNull(),
  zigPercentage: decimal("zig_percentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
  
  netSalaryUsd: decimal("net_salary_usd", { precision: 15, scale: 2 }).default("0.00").notNull(),
  netSalaryZig: decimal("net_salary_zig", { precision: 15, scale: 2 }).default("0.00").notNull(), // Split net in ZiG
  payeUsd: decimal("paye_usd", { precision: 15, scale: 2 }).default("0.00").notNull(),
  payeZig: decimal("paye_zig", { precision: 15, scale: 2 }).default("0.00").notNull(), // Split PAYE remittable in ZiG
  nssaEmployeeUsd: decimal("nssa_employee_usd", { precision: 15, scale: 2 }).default("0.00").notNull(),
  nssaEmployeeZig: decimal("nssa_employee_zig", { precision: 15, scale: 2 }).default("0.00").notNull(), // Split NSSA in ZiG
  
  totalAllowances: decimal("total_allowances", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalDeductions: decimal("total_deductions", { precision: 15, scale: 2 }).default("0.00").notNull(),
  
  // Payment status
  isPaid: boolean("is_paid").default(false).notNull(),
  paidAt: timestamp("paid_at"),
  paymentReference: text("payment_reference"),
  
  // Snapshot Data for audit trail - Stores formulas, rates, tax tables used, and custom variances
  snapshotData: jsonb("snapshot_data").notNull(), 
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  runIdx: index("payroll_run_employees_run_idx").on(table.payrollRunId),
  employeeIdx: index("payroll_run_employees_employee_idx").on(table.employeeId),
}));

// 10. Payroll Allowances (Individual line details per payslip)
export const payrollAllowances = pgTable("payroll_allowances", {
  id: serial("id").primaryKey(),
  payrollRunEmployeeId: integer("payroll_run_employee_id").references(() => payrollRunEmployees.id).notNull(),
  name: text("name").notNull(), // e.g. Transport Allowance
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  isTaxable: boolean("is_taxable").default(true).notNull(),
  isCash: boolean("is_cash").default(true).notNull(), // fringe benefits vs monetary payments
  allowanceType: text("allowance_type").default("OTHER").notNull(), // TRANSPORT, HOUSING, AIRTIME, BONUS, COMMISSION, OVERTIME, OTHER
}, (table) => ({
  payrollEmployeeIdx: index("payroll_allowances_employee_line_idx").on(table.payrollRunEmployeeId),
}));

// 11. Payroll Deductions (Individual deduction lines per payslip)
export const payrollDeductions = pgTable("payroll_deductions", {
  id: serial("id").primaryKey(),
  payrollRunEmployeeId: integer("payroll_run_employee_id").references(() => payrollRunEmployees.id).notNull(),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  isTaxDeductible: boolean("is_tax_deductible").default(false).notNull(),
  deductionType: text("deduction_type").default("OTHER").notNull(), // NSSA, PAYE, AIDS_LEVY, PENSION, NEC, LOAN_REPAYMENT, GARNISHEE, OTHER
}, (table) => ({
  payrollEmployeeIdx: index("payroll_deductions_employee_line_idx").on(table.payrollRunEmployeeId),
}));

// 12. Leave Requests & Encashment
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  leaveType: text("leave_type").default("ANNUAL").notNull(), // ANNUAL, SICK, MATERNITY, COMPASSIONATE, UNPAID, CUSTOM
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalDays: integer("total_days").notNull(),
  reason: text("reason"),
  attachmentUrl: text("attachment_url"), // For sick sheets / medical certificates
  status: text("status").default("PENDING").notNull(), // PENDING, APPROVED, REJECTED, CANCELLED
  
  // Encashment properties
  encashmentDays: integer("encashment_days").default(0).notNull(),
  encashmentAmount: decimal("encashment_amount", { precision: 15, scale: 2 }),
  
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyLeaveIdx: index("leave_requests_company_idx").on(table.companyId),
  employeeLeaveIdx: index("leave_requests_employee_idx").on(table.employeeId),
}));

// 13. Leave Balances Tracker
export const leaveBalances = pgTable("leave_balances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  leaveType: text("leave_type").default("ANNUAL").notNull(),
  accruedDays: decimal("accrued_days", { precision: 5, scale: 2 }).default("0.00").notNull(),
  usedDays: decimal("used_days", { precision: 5, scale: 2 }).default("0.00").notNull(),
  pendingDays: decimal("pending_days", { precision: 5, scale: 2 }).default("0.00").notNull(),
  availableDays: decimal("available_days", { precision: 5, scale: 2 }).default("0.00").notNull(),
  lastAccruedAt: timestamp("last_accrued_at").defaultNow(),
}, (table) => ({
  employeeLeaveTypeIdx: index("leave_balances_employee_type_idx").on(table.employeeId, table.leaveType),
}));

// 14. Loans & Advances Registry
export const employeeLoans = pgTable("employee_loans", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  loanType: text("loan_type").default("LOAN").notNull(), // LOAN or ADVANCE
  principalAmount: decimal("principal_amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).default("0.00").notNull(), // Annual interest rate
  repaymentTermMonths: integer("repayment_term_months").notNull(),
  monthlyRepaymentAmount: decimal("monthly_repayment_amount", { precision: 15, scale: 2 }).notNull(),
  remainingBalance: decimal("remaining_balance", { precision: 15, scale: 2 }).notNull(),
  status: text("status").default("PENDING").notNull(), // PENDING, APPROVED, DISBURSED, ACTIVE, COMPLETED, WRITTEN_OFF
  
  disbursedDate: date("disbursed_date"),
  approvedBy: uuid("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyLoanIdx: index("employee_loans_company_idx").on(table.companyId),
  employeeLoanIdx: index("employee_loans_employee_idx").on(table.employeeId),
}));

// 15. Loan Installments (Audit ledger of repayments)
export const loanInstallments = pgTable("loan_installments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => employeeLoans.id).notNull(),
  payrollRunEmployeeId: integer("payroll_run_employee_id").references(() => payrollRunEmployees.id), // Nullable if manual deposit
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).notNull(),
  principalPaid: decimal("principal_paid", { precision: 15, scale: 2 }).notNull(),
  interestPaid: decimal("interest_paid", { precision: 15, scale: 2 }).notNull(),
  remainingBalanceAfter: decimal("remaining_balance_after", { precision: 15, scale: 2 }).notNull(),
  repaymentDate: timestamp("repayment_date").defaultNow(),
}, (table) => ({
  loanIdx: index("loan_installments_loan_idx").on(table.loanId),
}));

// 16. HR Disciplinary Records
export const disciplinaryRecords = pgTable("disciplinary_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  incidentDate: date("incident_date").notNull(),
  offenseType: text("offense_type").notNull(), // e.g. Absenteeism, Negligence
  description: text("description").notNull(),
  actionTaken: text("action_taken").notNull(), // WARNING, SUSPENSION, WRITTEN_WARNING, TERMINATION
  status: text("status").default("ACTIVE").notNull(), // ACTIVE, APPEALED, RESOLVED
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyDiscIdx: index("disciplinary_records_company_idx").on(table.companyId),
}));

// 17. HR Employee Assigned Assets
export const assignedAssets = pgTable("assigned_assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id), // Nullable when in pool
  assetName: text("asset_name").notNull(),
  serialNumber: text("serial_number"),
  value: decimal("value", { precision: 15, scale: 2 }),
  assignedDate: date("assigned_date"),
  returnedDate: date("returned_date"),
  condition: text("condition").default("GOOD").notNull(), // GOOD, FAIR, DAMAGED
}, (table) => ({
  companyAssetIdx: index("assigned_assets_company_idx").on(table.companyId),
}));

// 18. Payment Batches (Compilation for bank export files)
export const paymentBatches = pgTable("payment_batches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(), // e.g. May 2026 Salary Batch
  paymentMethod: text("payment_method").default("BANK_TRANSFER").notNull(), // BANK_TRANSFER, ECOCASH, ZIPIT
  currency: text("currency").default("USD").notNull(),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, COMPILED, TRANSMITTED, PAID, FAILED
  exportedAt: timestamp("exported_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyBatchIdx: index("payment_batches_company_idx").on(table.companyId),
}));

// 19. Payment Batch Details (Mapping payslips to batches)
export const paymentBatchDetails = pgTable("payment_batch_details", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => paymentBatches.id).notNull(),
  payrollRunEmployeeId: integer("payroll_run_employee_id").references(() => payrollRunEmployees.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").default("PENDING").notNull(), // PENDING, SUCCESS, FAILED
  failureReason: text("failure_reason"),
}, (table) => ({
  batchIdx: index("payment_batch_details_batch_idx").on(table.batchId),
}));

// 20. Tenant Integration Credentials Vault (Secure encrypted settings)
export const tenantIntegrationCredentials = pgTable("tenant_integration_credentials", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  integrationType: text("integration_type").notNull(), // ECOCASH_BULK_PAYOUT, ZIPIT_GATEWAY, BANK_API
  credentialData: text("credential_data").notNull(), // AES-256-GBC encrypted JSON config string containing keys, pins, certificates
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyIntegrationUnique: unique("company_integration_unique").on(table.companyId, table.integrationType),
}));

// 21. Attendance Import Batches (future biometric/time-clock/mobile integrations)
export const payrollAttendanceImports = pgTable("payroll_attendance_imports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  source: text("source").default("MANUAL").notNull(), // MANUAL, CSV, BIOMETRIC, MOBILE_APP, API
  provider: text("provider"), // e.g. ZKTeco, Hikvision, Custom API
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").default("IMPORTED").notNull(), // IMPORTED, VALIDATED, APPLIED, REJECTED
  rowCount: integer("row_count").default(0).notNull(),
  summaryData: jsonb("summary_data").default({}).notNull(),
  importedBy: uuid("imported_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyAttendanceIdx: index("payroll_attendance_imports_company_idx").on(table.companyId),
  periodAttendanceIdx: index("payroll_attendance_imports_period_idx").on(table.periodStart, table.periodEnd),
}));

// 22. Employee Document Registry (storage-provider agnostic)
export const employeeDocuments = pgTable("employee_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  documentType: text("document_type").notNull(), // CONTRACT, ID_COPY, NSSA, MEDICAL, CERTIFICATE, OTHER
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  fileHash: text("file_hash"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  employeeDocumentIdx: index("employee_documents_employee_idx").on(table.employeeId),
  companyDocumentIdx: index("employee_documents_company_idx").on(table.companyId),
}));

// 23. Generated Payslip Artifacts (PDF/email/WhatsApp delivery readiness)
export const payslipDocuments = pgTable("payslip_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  payrollRunId: integer("payroll_run_id").references(() => payrollRuns.id).notNull(),
  payrollRunEmployeeId: integer("payroll_run_employee_id").references(() => payrollRunEmployees.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  documentUrl: text("document_url"),
  documentHash: text("document_hash"),
  deliveryChannel: text("delivery_channel").default("DOWNLOAD").notNull(), // DOWNLOAD, EMAIL, WHATSAPP, MOBILE_APP
  deliveryStatus: text("delivery_status").default("GENERATED").notNull(), // GENERATED, QUEUED, SENT, FAILED
  passwordProtected: boolean("password_protected").default(false).notNull(),
  generatedBy: uuid("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => ({
  payslipRunIdx: index("payslip_documents_run_idx").on(table.payrollRunId),
  payslipEmployeeIdx: index("payslip_documents_employee_idx").on(table.employeeId),
}));

// 24. Payroll Integration Events (banking, EcoCash, ZIPIT, WhatsApp, AI assistant hooks)
export const payrollIntegrationEvents = pgTable("payroll_integration_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  integrationType: text("integration_type").notNull(), // BANK_CSV, ECOCASH, ZIPIT, WHATSAPP, BIOMETRIC, AI_ASSISTANT
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  direction: text("direction").default("OUTBOUND").notNull(), // INBOUND, OUTBOUND
  status: text("status").default("PENDING").notNull(),
  requestPayload: jsonb("request_payload").default({}).notNull(),
  responsePayload: jsonb("response_payload").default({}).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payrollIntegrationCompanyIdx: index("payroll_integration_events_company_idx").on(table.companyId),
  payrollIntegrationEntityIdx: index("payroll_integration_events_entity_idx").on(table.entityType, table.entityId),
}));

// 25. Immutable statutory report snapshots and export history
export const payrollStatutoryReports = pgTable("payroll_statutory_reports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  reportType: text("report_type").notNull(), // P2, P6, ITF16, NSSA, NEC, PAYROLL_SUMMARY, PAYE_RECON, etc.
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  taxYear: integer("tax_year"),
  currency: text("currency").default("USD").notNull(),
  version: integer("version").default(1).notNull(),
  payrollRunIds: jsonb("payroll_run_ids").default([]).notNull(),
  taxTablesUsed: jsonb("tax_tables_used").default([]).notNull(),
  statutoryRatesUsed: jsonb("statutory_rates_used").default([]).notNull(),
  validationSummary: jsonb("validation_summary").default({}).notNull(),
  reportData: jsonb("report_data").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  status: text("status").default("GENERATED").notNull(), // GENERATED, APPROVED, SUBMITTED, AMENDED, REVERSED
  approvalStatus: text("approval_status").default("PENDING").notNull(), // PENDING, APPROVED, REJECTED
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  submissionStatus: text("submission_status").default("NOT_SUBMITTED").notNull(),
  submissionReference: text("submission_reference"),
  amendmentOfReportId: integer("amendment_of_report_id"),
  generatedBy: uuid("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
  submittedAt: timestamp("submitted_at"),
}, (table) => ({
  statutoryReportsCompanyIdx: index("payroll_statutory_reports_company_idx").on(table.companyId),
  statutoryReportsTypePeriodIdx: index("payroll_statutory_reports_type_period_idx").on(table.reportType, table.periodStart, table.periodEnd),
}));

export const payrollReportExports = pgTable("payroll_report_exports", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").references(() => payrollStatutoryReports.id).notNull(),
  format: text("format").notNull(), // PDF, CSV, EXCEL, ZIMRA_EFILE
  version: integer("version").default(1).notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  fileHash: text("file_hash").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  generatedBy: uuid("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => ({
  payrollReportExportsReportIdx: index("payroll_report_exports_report_idx").on(table.reportId),
}));

export const payrollReportValidationIssues = pgTable("payroll_report_validation_issues", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").references(() => payrollStatutoryReports.id),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  reportType: text("report_type").notNull(),
  severity: text("severity").default("ERROR").notNull(), // ERROR, WARNING
  code: text("code").notNull(),
  message: text("message").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: jsonb("details").default({}).notNull(),
  isResolved: boolean("is_resolved").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payrollReportValidationCompanyIdx: index("payroll_report_validation_company_idx").on(table.companyId),
  payrollReportValidationReportIdx: index("payroll_report_validation_report_idx").on(table.reportId),
}));

export const payrollStatutoryDeadlines = pgTable("payroll_statutory_deadlines", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  countryCode: text("country_code").default("ZW").notNull(),
  authority: text("authority").notNull(), // ZIMRA, NSSA, NEC
  reportType: text("report_type").notNull(),
  name: text("name").notNull(),
  dueDay: integer("due_day"),
  dueMonth: integer("due_month"),
  frequency: text("frequency").default("MONTHLY").notNull(), // MONTHLY, ANNUAL, EVENT
  reminderDaysBefore: integer("reminder_days_before").default(7).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payrollDeadlineLookupIdx: index("payroll_deadline_lookup_idx").on(table.countryCode, table.authority, table.reportType),
  payrollDeadlineCompanyIdx: index("payroll_deadline_company_idx").on(table.companyId),
}));

// 25b. Salary change requests with approval workflow
// A structured, audited salary revision: PENDING until an approver approves it,
// then applied to the employee's active contract.
export const employeeSalaryChanges = pgTable("employee_salary_changes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  previousBaseSalary: decimal("previous_base_salary", { precision: 15, scale: 2 }).notNull(),
  newBaseSalary: decimal("new_base_salary", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(),
  reason: text("reason").notNull(),
  effectiveDate: date("effective_date").notNull(),
  status: text("status").default("PENDING").notNull(), // PENDING, APPROVED, REJECTED
  requestedBy: uuid("requested_by").references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  salaryChangesCompanyIdx: index("salary_changes_company_idx").on(table.companyId, table.status),
  salaryChangesEmployeeIdx: index("salary_changes_employee_idx").on(table.employeeId),
}));

// 25b2. Effective-dated salary history (immutable record of every salary revision).
// Payroll runs resolve the salary applicable to a period from this table; historical
// records are never overwritten — a change closes the current record (effective_to)
// and opens a new one (effective_from).
export const employeeSalaryHistory = pgTable("employee_salary_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  salaryChangeId: integer("salary_change_id").references(() => employeeSalaryChanges.id),
  salaryAmount: decimal("salary_amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  payFrequency: text("pay_frequency").default("MONTHLY").notNull(),
  usdPercentage: decimal("usd_percentage", { precision: 5, scale: 2 }).default("100.00").notNull(),
  zigPercentage: decimal("zig_percentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  reason: text("reason"),
  approvedBy: uuid("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  salaryHistoryCompanyIdx: index("employee_salary_history_company_idx").on(table.companyId),
  salaryHistoryEmployeePeriodIdx: index("employee_salary_history_employee_period_idx").on(table.employeeId, table.effectiveFrom),
}));

// 25b3. Effective-dated employment history (joined, transfer, promotion, position
// change, contract change, termination, rehire).
export const employeeEmploymentHistory = pgTable("employee_employment_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  eventType: text("event_type").notNull(), // JOINED, TRANSFER, PROMOTION, POSITION_CHANGE, CONTRACT_CHANGE, TERMINATION, REHIRE
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  departmentId: integer("department_id").references(() => departments.id),
  positionId: integer("position_id").references(() => positions.id),
  branchId: integer("branch_id").references(() => branches.id),
  employmentType: text("employment_type"), // PERMANENT, FIXED_TERM, CASUAL
  contractType: text("contract_type"),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  employmentHistoryCompanyIdx: index("employee_employment_history_company_idx").on(table.companyId),
  employmentHistoryEmployeePeriodIdx: index("employee_employment_history_employee_period_idx").on(table.employeeId, table.effectiveFrom),
}));

// 25b4. Effective-dated income/allowance history. Never overwrite an allowance
// amount; a change closes the current effective record and opens a new one.
export const employeeIncomeHistory = pgTable("employee_income_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  recurringItemId: integer("recurring_item_id").references(() => payrollRecurringItems.id),
  incomeTypeId: integer("income_type_id").references(() => payrollEarningTypes.id),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  calculationType: text("calculation_type").default("FIXED").notNull(), // FIXED, PERCENTAGE, FORMULA
  isTaxable: boolean("is_taxable").default(true).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  incomeHistoryCompanyIdx: index("employee_income_history_company_idx").on(table.companyId),
  incomeHistoryEmployeePeriodIdx: index("employee_income_history_employee_period_idx").on(table.employeeId, table.effectiveFrom),
}));

// 25b5. Effective-dated deduction history (mirror of employee_income_history).
export const employeeDeductionHistory = pgTable("employee_deduction_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  recurringItemId: integer("recurring_item_id").references(() => payrollRecurringItems.id),
  deductionTypeId: integer("deduction_type_id").references(() => payrollDeductionTypes.id),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  calculationType: text("calculation_type").default("FIXED").notNull(), // FIXED, PERCENTAGE, FORMULA
  isTaxDeductible: boolean("is_tax_deductible").default(false).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  deductionHistoryCompanyIdx: index("employee_deduction_history_company_idx").on(table.companyId),
  deductionHistoryEmployeePeriodIdx: index("employee_deduction_history_employee_period_idx").on(table.employeeId, table.effectiveFrom),
}));

// 25c. Statutory remittance tracker - generated from locked payroll runs
// One row per obligation per period (e.g. ZIMRA P2 for 2026-06) with due date,
// computed amount and filing/remittance status.
export const payrollRemittances = pgTable("payroll_remittances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  authority: text("authority").notNull(), // ZIMRA, NSSA, NEC
  reportType: text("report_type").notNull(), // P2, ZIMDEF, NSSA, NEC
  name: text("name").notNull(),
  period: text("period").notNull(), // YYYY-MM
  currency: text("currency").default("USD").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").default("NOT_SUBMITTED").notNull(), // NOT_SUBMITTED, SUBMITTED, ACKNOWLEDGED
  referenceNumber: text("reference_number"),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }),
  paidDate: date("paid_date"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  remittancesCompanyIdx: index("remittances_company_idx").on(table.companyId, table.reportType, table.period),
}));

// 26. Payroll data import batches with row-level validation history
export const payrollImportBatches = pgTable("payroll_import_batches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  importType: text("import_type").notNull(), // EMPLOYEES, PAY_GRADES, EARNING_TYPES, DEDUCTION_TYPES, etc.
  sourceFileName: text("source_file_name"),
  status: text("status").default("PENDING").notNull(), // PENDING, VALIDATED, PARTIAL, COMPLETED, FAILED
  rowCount: integer("row_count").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  errorCount: integer("error_count").default(0).notNull(),
  validationSummary: jsonb("validation_summary").default({}).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  payrollImportBatchesCompanyIdx: index("payroll_import_batches_company_idx").on(table.companyId),
  payrollImportBatchesTypeIdx: index("payroll_import_batches_type_idx").on(table.importType, table.createdAt),
}));

export const payrollImportRows = pgTable("payroll_import_rows", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => payrollImportBatches.id).notNull(),
  rowNumber: integer("row_number").notNull(),
  status: text("status").default("PENDING").notNull(), // PENDING, SUCCESS, ERROR
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  rawData: jsonb("raw_data").default({}).notNull(),
  errors: jsonb("errors").default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payrollImportRowsBatchIdx: index("payroll_import_rows_batch_idx").on(table.batchId),
  payrollImportRowsStatusIdx: index("payroll_import_rows_status_idx").on(table.status),
}));

// Relations Definitions
export const employeesRelations = relations(employees, ({ one, many }) => ({
  company: one(companies, { fields: [employees.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [employees.branchId], references: [branches.id] }),
  department: one(departments, { fields: [employees.departmentId], references: [departments.id] }),
  position: one(positions, { fields: [employees.positionId], references: [positions.id] }),
  contracts: many(employeeContracts),
  leaveRequests: many(leaveRequests),
  leaveBalances: many(leaveBalances),
  loans: many(employeeLoans),
  disciplinaryRecords: many(disciplinaryRecords),
  assignedAssets: many(assignedAssets),
  documents: many(employeeDocuments),
  payrollRunEmployees: many(payrollRunEmployees),
  recurringItems: many(payrollRecurringItems),
  payrollProfiles: many(employeePayrollProfiles),
  salaryChanges: many(employeeSalaryChanges),
  payslipDocuments: many(payslipDocuments),
  salaryHistory: many(employeeSalaryHistory),
  employmentHistory: many(employeeEmploymentHistory),
  incomeHistory: many(employeeIncomeHistory),
  deductionHistory: many(employeeDeductionHistory),
}));

export const employeeContractsRelations = relations(employeeContracts, ({ one }) => ({
  employee: one(employees, { fields: [employeeContracts.employeeId], references: [employees.id] }),
  necSector: one(necSectorsConfig, { fields: [employeeContracts.necSectorId], references: [necSectorsConfig.id] }),
  payGrade: one(payrollPayGrades, { fields: [employeeContracts.payGradeId], references: [payrollPayGrades.id] }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  company: one(companies, { fields: [departments.companyId], references: [companies.id] }),
  glAccount: one(accounts, { fields: [departments.glAccountId], references: [accounts.id] }),
  employees: many(employees),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  company: one(companies, { fields: [positions.companyId], references: [companies.id] }),
  employees: many(employees),
}));

export const payrollPayGradesRelations = relations(payrollPayGrades, ({ one, many }) => ({
  company: one(companies, { fields: [payrollPayGrades.companyId], references: [companies.id] }),
  necSector: one(necSectorsConfig, { fields: [payrollPayGrades.necSectorId], references: [necSectorsConfig.id] }),
  contracts: many(employeeContracts),
  steps: many(payrollPayGradeSteps),
}));

export const payrollRunsRelations = relations(payrollRuns, ({ one, many }) => ({
  company: one(companies, { fields: [payrollRuns.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [payrollRuns.branchId], references: [branches.id] }),
  approvedByUser: one(users, { fields: [payrollRuns.approvedBy], references: [users.id] }),
  lockedByUser: one(users, { fields: [payrollRuns.lockedBy], references: [users.id] }),
  journalEntry: one(journalEntries, { fields: [payrollRuns.journalEntryId], references: [journalEntries.id] }),
  reversalOfRun: one(payrollRuns, { fields: [payrollRuns.reversalOfRunId], references: [payrollRuns.id] }),
  runEmployees: many(payrollRunEmployees),
  payslipDocuments: many(payslipDocuments),
}));

export const payrollRunEmployeesRelations = relations(payrollRunEmployees, ({ one, many }) => ({
  payrollRun: one(payrollRuns, { fields: [payrollRunEmployees.payrollRunId], references: [payrollRuns.id] }),
  employee: one(employees, { fields: [payrollRunEmployees.employeeId], references: [employees.id] }),
  allowances: many(payrollAllowances),
  deductions: many(payrollDeductions),
  loanInstallments: many(loanInstallments),
  paymentBatchDetails: many(paymentBatchDetails),
  payslipDocuments: many(payslipDocuments),
}));

export const payrollAllowancesRelations = relations(payrollAllowances, ({ one }) => ({
  runEmployee: one(payrollRunEmployees, { fields: [payrollAllowances.payrollRunEmployeeId], references: [payrollRunEmployees.id] }),
}));

export const payrollDeductionsRelations = relations(payrollDeductions, ({ one }) => ({
  runEmployee: one(payrollRunEmployees, { fields: [payrollDeductions.payrollRunEmployeeId], references: [payrollRunEmployees.id] }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  company: one(companies, { fields: [leaveRequests.companyId], references: [companies.id] }),
  employee: one(employees, { fields: [leaveRequests.employeeId], references: [employees.id] }),
  approvedByUser: one(users, { fields: [leaveRequests.approvedBy], references: [users.id] }),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  employee: one(employees, { fields: [leaveBalances.employeeId], references: [employees.id] }),
}));

export const employeeLoansRelations = relations(employeeLoans, ({ one, many }) => ({
  company: one(companies, { fields: [employeeLoans.companyId], references: [companies.id] }),
  employee: one(employees, { fields: [employeeLoans.employeeId], references: [employees.id] }),
  approvedByUser: one(users, { fields: [employeeLoans.approvedBy], references: [users.id] }),
  installments: many(loanInstallments),
}));

export const loanInstallmentsRelations = relations(loanInstallments, ({ one }) => ({
  loan: one(employeeLoans, { fields: [loanInstallments.loanId], references: [employeeLoans.id] }),
  runEmployee: one(payrollRunEmployees, { fields: [loanInstallments.payrollRunEmployeeId], references: [payrollRunEmployees.id] }),
}));

export const necSectorsConfigRelations = relations(necSectorsConfig, ({ one }) => ({
  company: one(companies, { fields: [necSectorsConfig.companyId], references: [companies.id] }),
}));

export const tenantIntegrationCredentialsRelations = relations(tenantIntegrationCredentials, ({ one }) => ({
  company: one(companies, { fields: [tenantIntegrationCredentials.companyId], references: [companies.id] }),
}));

export const paymentBatchesRelations = relations(paymentBatches, ({ one, many }) => ({
  company: one(companies, { fields: [paymentBatches.companyId], references: [companies.id] }),
  details: many(paymentBatchDetails),
}));

export const paymentBatchDetailsRelations = relations(paymentBatchDetails, ({ one }) => ({
  batch: one(paymentBatches, { fields: [paymentBatchDetails.batchId], references: [paymentBatches.id] }),
  runEmployee: one(payrollRunEmployees, { fields: [paymentBatchDetails.payrollRunEmployeeId], references: [payrollRunEmployees.id] }),
}));

export const payrollAttendanceImportsRelations = relations(payrollAttendanceImports, ({ one }) => ({
  company: one(companies, { fields: [payrollAttendanceImports.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [payrollAttendanceImports.branchId], references: [branches.id] }),
  importedByUser: one(users, { fields: [payrollAttendanceImports.importedBy], references: [users.id] }),
}));

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  company: one(companies, { fields: [employeeDocuments.companyId], references: [companies.id] }),
  employee: one(employees, { fields: [employeeDocuments.employeeId], references: [employees.id] }),
  uploadedByUser: one(users, { fields: [employeeDocuments.uploadedBy], references: [users.id] }),
}));

export const payslipDocumentsRelations = relations(payslipDocuments, ({ one }) => ({
  company: one(companies, { fields: [payslipDocuments.companyId], references: [companies.id] }),
  payrollRun: one(payrollRuns, { fields: [payslipDocuments.payrollRunId], references: [payrollRuns.id] }),
  runEmployee: one(payrollRunEmployees, { fields: [payslipDocuments.payrollRunEmployeeId], references: [payrollRunEmployees.id] }),
  employee: one(employees, { fields: [payslipDocuments.employeeId], references: [employees.id] }),
  generatedByUser: one(users, { fields: [payslipDocuments.generatedBy], references: [users.id] }),
}));

export const payrollIntegrationEventsRelations = relations(payrollIntegrationEvents, ({ one }) => ({
  company: one(companies, { fields: [payrollIntegrationEvents.companyId], references: [companies.id] }),
}));

export const payrollStatutoryReportsRelations = relations(payrollStatutoryReports, ({ one, many }) => ({
  company: one(companies, { fields: [payrollStatutoryReports.companyId], references: [companies.id] }),
  generatedByUser: one(users, { fields: [payrollStatutoryReports.generatedBy], references: [users.id] }),
  approvedByUser: one(users, { fields: [payrollStatutoryReports.approvedBy], references: [users.id] }),
  exports: many(payrollReportExports),
  validationIssues: many(payrollReportValidationIssues),
}));

export const payrollReportExportsRelations = relations(payrollReportExports, ({ one }) => ({
  report: one(payrollStatutoryReports, { fields: [payrollReportExports.reportId], references: [payrollStatutoryReports.id] }),
  generatedByUser: one(users, { fields: [payrollReportExports.generatedBy], references: [users.id] }),
}));

export const payrollReportValidationIssuesRelations = relations(payrollReportValidationIssues, ({ one }) => ({
  report: one(payrollStatutoryReports, { fields: [payrollReportValidationIssues.reportId], references: [payrollStatutoryReports.id] }),
  company: one(companies, { fields: [payrollReportValidationIssues.companyId], references: [companies.id] }),
}));

export const payrollStatutoryDeadlinesRelations = relations(payrollStatutoryDeadlines, ({ one }) => ({
  company: one(companies, { fields: [payrollStatutoryDeadlines.companyId], references: [companies.id] }),
}));

export const payrollImportBatchesRelations = relations(payrollImportBatches, ({ one, many }) => ({
  company: one(companies, { fields: [payrollImportBatches.companyId], references: [companies.id] }),
  createdByUser: one(users, { fields: [payrollImportBatches.createdBy], references: [users.id] }),
  rows: many(payrollImportRows),
}));

export const payrollImportRowsRelations = relations(payrollImportRows, ({ one }) => ({
  batch: one(payrollImportBatches, { fields: [payrollImportRows.batchId], references: [payrollImportBatches.id] }),
}));

export const employeeSalaryChangesRelations = relations(employeeSalaryChanges, ({ one, many }) => ({
  employee: one(employees, { fields: [employeeSalaryChanges.employeeId], references: [employees.id] }),
  company: one(companies, { fields: [employeeSalaryChanges.companyId], references: [companies.id] }),
  salaryHistory: many(employeeSalaryHistory),
}));

export const employeeSalaryHistoryRelations = relations(employeeSalaryHistory, ({ one }) => ({
  employee: one(employees, { fields: [employeeSalaryHistory.employeeId], references: [employees.id] }),
  company: one(companies, { fields: [employeeSalaryHistory.companyId], references: [companies.id] }),
  salaryChange: one(employeeSalaryChanges, { fields: [employeeSalaryHistory.salaryChangeId], references: [employeeSalaryChanges.id] }),
}));

export const employeeEmploymentHistoryRelations = relations(employeeEmploymentHistory, ({ one }) => ({
  employee: one(employees, { fields: [employeeEmploymentHistory.employeeId], references: [employees.id] }),
  company: one(companies, { fields: [employeeEmploymentHistory.companyId], references: [companies.id] }),
  department: one(departments, { fields: [employeeEmploymentHistory.departmentId], references: [departments.id] }),
  position: one(positions, { fields: [employeeEmploymentHistory.positionId], references: [positions.id] }),
  branch: one(branches, { fields: [employeeEmploymentHistory.branchId], references: [branches.id] }),
}));

export const employeeIncomeHistoryRelations = relations(employeeIncomeHistory, ({ one }) => ({
  employee: one(employees, { fields: [employeeIncomeHistory.employeeId], references: [employees.id] }),
  company: one(companies, { fields: [employeeIncomeHistory.companyId], references: [companies.id] }),
  incomeType: one(payrollEarningTypes, { fields: [employeeIncomeHistory.incomeTypeId], references: [payrollEarningTypes.id] }),
  recurringItem: one(payrollRecurringItems, { fields: [employeeIncomeHistory.recurringItemId], references: [payrollRecurringItems.id] }),
}));

export const employeeDeductionHistoryRelations = relations(employeeDeductionHistory, ({ one }) => ({
  employee: one(employees, { fields: [employeeDeductionHistory.employeeId], references: [employees.id] }),
  company: one(companies, { fields: [employeeDeductionHistory.companyId], references: [companies.id] }),
  deductionType: one(payrollDeductionTypes, { fields: [employeeDeductionHistory.deductionTypeId], references: [payrollDeductionTypes.id] }),
  recurringItem: one(payrollRecurringItems, { fields: [employeeDeductionHistory.recurringItemId], references: [payrollRecurringItems.id] }),
}));

export const payrollRecurringItemsRelations = relations(payrollRecurringItems, ({ one }) => ({
  employee: one(employees, { fields: [payrollRecurringItems.employeeId], references: [employees.id] }),
}));

export const payrollPayGradeStepsRelations = relations(payrollPayGradeSteps, ({ one }) => ({
  payGrade: one(payrollPayGrades, { fields: [payrollPayGradeSteps.payGradeId], references: [payrollPayGrades.id] }),
}));

export const payrollTaxTablesRelations = relations(payrollTaxTables, ({ one, many }) => ({
  company: one(companies, { fields: [payrollTaxTables.companyId], references: [companies.id] }),
  brackets: many(payrollTaxBrackets),
}));

export const payrollTaxBracketsRelations = relations(payrollTaxBrackets, ({ one }) => ({
  taxTable: one(payrollTaxTables, { fields: [payrollTaxBrackets.taxTableId], references: [payrollTaxTables.id] }),
}));

export const payrollStatutoryRulesRelations = relations(payrollStatutoryRules, ({ one }) => ({
  company: one(companies, { fields: [payrollStatutoryRules.companyId], references: [companies.id] }),
}));

export const payrollEarningTypesRelations = relations(payrollEarningTypes, ({ one }) => ({
  company: one(companies, { fields: [payrollEarningTypes.companyId], references: [companies.id] }),
  glAccount: one(accounts, { fields: [payrollEarningTypes.glAccountId], references: [accounts.id] }),
}));

export const payrollDeductionTypesRelations = relations(payrollDeductionTypes, ({ one }) => ({
  company: one(companies, { fields: [payrollDeductionTypes.companyId], references: [companies.id] }),
  glAccount: one(accounts, { fields: [payrollDeductionTypes.glAccountId], references: [accounts.id] }),
}));

export const payrollSalaryStructuresRelations = relations(payrollSalaryStructures, ({ one }) => ({
  company: one(companies, { fields: [payrollSalaryStructures.companyId], references: [companies.id] }),
}));

export const employeePayrollProfilesRelations = relations(employeePayrollProfiles, ({ one }) => ({
  company: one(companies, { fields: [employeePayrollProfiles.companyId], references: [companies.id] }),
  employee: one(employees, { fields: [employeePayrollProfiles.employeeId], references: [employees.id] }),
  salaryStructure: one(payrollSalaryStructures, { fields: [employeePayrollProfiles.salaryStructureId], references: [payrollSalaryStructures.id] }),
  payGrade: one(payrollPayGrades, { fields: [employeePayrollProfiles.payGradeId], references: [payrollPayGrades.id] }),
  payGradeStep: one(payrollPayGradeSteps, { fields: [employeePayrollProfiles.payGradeStepId], references: [payrollPayGradeSteps.id] }),
}));

export const payrollRemittancesRelations = relations(payrollRemittances, ({ one }) => ({
  company: one(companies, { fields: [payrollRemittances.companyId], references: [companies.id] }),
}));

// Insert Schemas & Type Exports
export const insertNecSectorConfigSchema = createInsertSchema(necSectorsConfig).omit({ id: true, createdAt: true });
export type NecSectorConfig = typeof necSectorsConfig.$inferSelect;
export type InsertNecSectorConfig = z.infer<typeof insertNecSectorConfigSchema>;

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true, createdAt: true });
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;

export const insertPositionSchema = createInsertSchema(positions).omit({ id: true, createdAt: true });
export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;

export const insertPayrollPayGradeSchema = createInsertSchema(payrollPayGrades).omit({ id: true, createdAt: true, updatedAt: true });
export type PayrollPayGrade = typeof payrollPayGrades.$inferSelect;
export type InsertPayrollPayGrade = z.infer<typeof insertPayrollPayGradeSchema>;

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true, updatedAt: true });
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export const insertEmployeeContractSchema = createInsertSchema(employeeContracts).omit({ id: true, createdAt: true });
export type EmployeeContract = typeof employeeContracts.$inferSelect;
export type InsertEmployeeContract = z.infer<typeof insertEmployeeContractSchema>;

export const insertTaxTablesConfigSchema = createInsertSchema(taxTablesConfig).omit({ id: true, createdAt: true });
export type TaxTablesConfig = typeof taxTablesConfig.$inferSelect;
export type InsertTaxTablesConfig = z.infer<typeof insertTaxTablesConfigSchema>;

export const insertPayrollTaxTableSchema = createInsertSchema(payrollTaxTables).omit({ id: true, createdAt: true });
export type PayrollTaxTable = typeof payrollTaxTables.$inferSelect;
export type InsertPayrollTaxTable = z.infer<typeof insertPayrollTaxTableSchema>;

export const insertPayrollTaxBracketSchema = createInsertSchema(payrollTaxBrackets).omit({ id: true });
export type PayrollTaxBracket = typeof payrollTaxBrackets.$inferSelect;
export type InsertPayrollTaxBracket = z.infer<typeof insertPayrollTaxBracketSchema>;

export const insertPayrollStatutoryRuleSchema = createInsertSchema(payrollStatutoryRules).omit({ id: true, createdAt: true });
export type PayrollStatutoryRule = typeof payrollStatutoryRules.$inferSelect;
export type InsertPayrollStatutoryRule = z.infer<typeof insertPayrollStatutoryRuleSchema>;

export const insertPayrollEarningTypeSchema = createInsertSchema(payrollEarningTypes).omit({ id: true, createdAt: true });
export type PayrollEarningType = typeof payrollEarningTypes.$inferSelect;
export type InsertPayrollEarningType = z.infer<typeof insertPayrollEarningTypeSchema>;

export const insertPayrollDeductionTypeSchema = createInsertSchema(payrollDeductionTypes).omit({ id: true, createdAt: true });
export type PayrollDeductionType = typeof payrollDeductionTypes.$inferSelect;
export type InsertPayrollDeductionType = z.infer<typeof insertPayrollDeductionTypeSchema>;

export const insertPayrollSalaryStructureSchema = createInsertSchema(payrollSalaryStructures).omit({ id: true, createdAt: true });
export type PayrollSalaryStructure = typeof payrollSalaryStructures.$inferSelect;
export type InsertPayrollSalaryStructure = z.infer<typeof insertPayrollSalaryStructureSchema>;

export const insertPayrollPayGradeStepSchema = createInsertSchema(payrollPayGradeSteps).omit({ id: true });
export type PayrollPayGradeStep = typeof payrollPayGradeSteps.$inferSelect;
export type InsertPayrollPayGradeStep = z.infer<typeof insertPayrollPayGradeStepSchema>;

export const insertEmployeePayrollProfileSchema = createInsertSchema(employeePayrollProfiles).omit({ id: true, createdAt: true });
export type EmployeePayrollProfile = typeof employeePayrollProfiles.$inferSelect;
export type InsertEmployeePayrollProfile = z.infer<typeof insertEmployeePayrollProfileSchema>;

export const insertPayrollRecurringItemSchema = createInsertSchema(payrollRecurringItems).omit({ id: true });
export type PayrollRecurringItem = typeof payrollRecurringItems.$inferSelect;
export type InsertPayrollRecurringItem = z.infer<typeof insertPayrollRecurringItemSchema>;

export const insertEmployeeSalaryHistorySchema = createInsertSchema(employeeSalaryHistory).omit({ id: true, createdAt: true });
export type EmployeeSalaryHistory = typeof employeeSalaryHistory.$inferSelect;
export type InsertEmployeeSalaryHistory = z.infer<typeof insertEmployeeSalaryHistorySchema>;

export const insertEmployeeEmploymentHistorySchema = createInsertSchema(employeeEmploymentHistory).omit({ id: true, createdAt: true });
export type EmployeeEmploymentHistory = typeof employeeEmploymentHistory.$inferSelect;
export type InsertEmployeeEmploymentHistory = z.infer<typeof insertEmployeeEmploymentHistorySchema>;

export const insertEmployeeIncomeHistorySchema = createInsertSchema(employeeIncomeHistory).omit({ id: true, createdAt: true });
export type EmployeeIncomeHistory = typeof employeeIncomeHistory.$inferSelect;
export type InsertEmployeeIncomeHistory = z.infer<typeof insertEmployeeIncomeHistorySchema>;

export const insertEmployeeDeductionHistorySchema = createInsertSchema(employeeDeductionHistory).omit({ id: true, createdAt: true });
export type EmployeeDeductionHistory = typeof employeeDeductionHistory.$inferSelect;
export type InsertEmployeeDeductionHistory = z.infer<typeof insertEmployeeDeductionHistorySchema>;

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({ id: true, createdAt: true, updatedAt: true });
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;

export const insertPayrollRunEmployeeSchema = createInsertSchema(payrollRunEmployees).omit({ id: true, createdAt: true });
export type PayrollRunEmployee = typeof payrollRunEmployees.$inferSelect;
export type InsertPayrollRunEmployee = z.infer<typeof insertPayrollRunEmployeeSchema>;

export const insertPayrollAllowanceSchema = createInsertSchema(payrollAllowances).omit({ id: true });
export type PayrollAllowance = typeof payrollAllowances.$inferSelect;
export type InsertPayrollAllowance = z.infer<typeof insertPayrollAllowanceSchema>;

export const insertPayrollDeductionSchema = createInsertSchema(payrollDeductions).omit({ id: true });
export type PayrollDeduction = typeof payrollDeductions.$inferSelect;
export type InsertPayrollDeduction = z.infer<typeof insertPayrollDeductionSchema>;
// Unified Payroll Elements (Earnings & Deductions)
export const payrollElements = pgTable("payroll_elements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  countryCode: text("country_code").default("ZW").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  elementType: text("element_type").default("EARNING").notNull(), // EARNING or DEDUCTION
  category: text("category").default("ALLOWANCE").notNull(),
  taxTreatment: text("tax_treatment").default("TAXABLE").notNull(),
  taxablePercentage: decimal("taxable_percentage", { precision: 5, scale: 2 }).default("100.00").notNull(),
  isPensionable: boolean("is_pensionable").default(false).notNull(),
  isNssaApplicable: boolean("is_nssa_applicable").default(false).notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  calculationMethod: text("calculation_method").default("FIXED").notNull(),
  formula: text("formula"),
  employeeRate: decimal("employee_rate", { precision: 8, scale: 6 }).default("0.000000").notNull(),
  employerRate: decimal("employer_rate", { precision: 8, scale: 6 }).default("0.000000").notNull(),
  maxAmount: decimal("max_amount", { precision: 15, scale: 2 }),
  priorityOrder: integer("priority_order").default(100).notNull(),
  glAccountId: integer("gl_account_id").references(() => accounts.id),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  elementCompanyIdx: index("payroll_elements_company_code_idx").on(table.companyId, table.code),
  elementPriorityIdx: index("payroll_elements_priority_idx").on(table.priorityOrder),
}));

export const insertPayrollElementSchema = createInsertSchema(payrollElements).omit({ id: true, createdAt: true });
export type PayrollElement = typeof payrollElements.$inferSelect;
export type InsertPayrollElement = z.infer<typeof insertPayrollElementSchema>;

// Payroll Calculation Audits for full auditability
export const payrollCalculationAudits = pgTable("payroll_calculation_audits", {
  id: serial("id").primaryKey(),
  payrollRunEmployeeId: integer("payroll_run_employee_id").references(() => payrollRunEmployees.id).notNull(),
  snapshotData: jsonb("snapshot_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayrollAuditSchema = createInsertSchema(payrollCalculationAudits).omit({ id: true });
export type PayrollCalculationAudit = typeof payrollCalculationAudits.$inferSelect;
export type InsertPayrollCalculationAudit = z.infer<typeof insertPayrollAuditSchema>;

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({ id: true, createdAt: true });
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;

export const insertLeaveBalanceSchema = createInsertSchema(leaveBalances).omit({ id: true });
export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;

export const insertEmployeeLoanSchema = createInsertSchema(employeeLoans).omit({ id: true, createdAt: true });
export type EmployeeLoan = typeof employeeLoans.$inferSelect;
export type InsertEmployeeLoan = z.infer<typeof insertEmployeeLoanSchema>;

export const insertLoanInstallmentSchema = createInsertSchema(loanInstallments).omit({ id: true, repaymentDate: true });
export type LoanInstallment = typeof loanInstallments.$inferSelect;
export type InsertLoanInstallment = z.infer<typeof insertLoanInstallmentSchema>;

export const insertTenantIntegrationCredentialSchema = createInsertSchema(tenantIntegrationCredentials).omit({ id: true, createdAt: true, updatedAt: true });
export type TenantIntegrationCredential = typeof tenantIntegrationCredentials.$inferSelect;
export type InsertTenantIntegrationCredential = z.infer<typeof insertTenantIntegrationCredentialSchema>;

export const insertPayrollAttendanceImportSchema = createInsertSchema(payrollAttendanceImports).omit({ id: true, createdAt: true });
export type PayrollAttendanceImport = typeof payrollAttendanceImports.$inferSelect;
export type InsertPayrollAttendanceImport = z.infer<typeof insertPayrollAttendanceImportSchema>;

export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments).omit({ id: true, createdAt: true });
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;

export const insertPayslipDocumentSchema = createInsertSchema(payslipDocuments).omit({ id: true, generatedAt: true });
export type PayslipDocument = typeof payslipDocuments.$inferSelect;
export type InsertPayslipDocument = z.infer<typeof insertPayslipDocumentSchema>;

export const insertPayrollIntegrationEventSchema = createInsertSchema(payrollIntegrationEvents).omit({ id: true, createdAt: true });
export type PayrollIntegrationEvent = typeof payrollIntegrationEvents.$inferSelect;
export type InsertPayrollIntegrationEvent = z.infer<typeof insertPayrollIntegrationEventSchema>;

export const insertPayrollStatutoryReportSchema = createInsertSchema(payrollStatutoryReports).omit({ id: true, generatedAt: true });
export type PayrollStatutoryReport = typeof payrollStatutoryReports.$inferSelect;
export type InsertPayrollStatutoryReport = z.infer<typeof insertPayrollStatutoryReportSchema>;

export const insertPayrollReportExportSchema = createInsertSchema(payrollReportExports).omit({ id: true, generatedAt: true });
export type PayrollReportExport = typeof payrollReportExports.$inferSelect;
export type InsertPayrollReportExport = z.infer<typeof insertPayrollReportExportSchema>;

export const insertPayrollReportValidationIssueSchema = createInsertSchema(payrollReportValidationIssues).omit({ id: true, createdAt: true });
export type PayrollReportValidationIssue = typeof payrollReportValidationIssues.$inferSelect;
export type InsertPayrollReportValidationIssue = z.infer<typeof insertPayrollReportValidationIssueSchema>;

export const insertPayrollStatutoryDeadlineSchema = createInsertSchema(payrollStatutoryDeadlines).omit({ id: true, createdAt: true });
export type PayrollStatutoryDeadline = typeof payrollStatutoryDeadlines.$inferSelect;
export type InsertPayrollStatutoryDeadline = z.infer<typeof insertPayrollStatutoryDeadlineSchema>;

export const insertPayrollImportBatchSchema = createInsertSchema(payrollImportBatches).omit({ id: true, createdAt: true, completedAt: true });
export type PayrollImportBatch = typeof payrollImportBatches.$inferSelect;
export type InsertPayrollImportBatch = z.infer<typeof insertPayrollImportBatchSchema>;

export const insertPayrollImportRowSchema = createInsertSchema(payrollImportRows).omit({ id: true, createdAt: true });
export type PayrollImportRow = typeof payrollImportRows.$inferSelect;
export type InsertPayrollImportRow = z.infer<typeof insertPayrollImportRowSchema>;

export const insertCompanyRoleSchema = createInsertSchema(companyRoles).omit({ id: true, createdAt: true });
export type CompanyRole = typeof companyRoles.$inferSelect;
export type InsertCompanyRole = z.infer<typeof insertCompanyRoleSchema>;

export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
  reviewedBy: true,
  reviewNotes: true,
  resultData: true,
});
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;

export const insertCompanyPartnerSchema = createInsertSchema(companyPartners).omit({ id: true, createdAt: true });
export type CompanyPartner = typeof companyPartners.$inferSelect;
export type InsertCompanyPartner = z.infer<typeof insertCompanyPartnerSchema>;

export const insertCostCenterSchema = createInsertSchema(costCenters).omit({ id: true, createdAt: true });
export type CostCenter = typeof costCenters.$inferSelect;
export type InsertCostCenter = z.infer<typeof insertCostCenterSchema>;

// ==========================================
// MANUFACTURING & BOM
// ==========================================

export const manufacturingWorkCenters = pgTable("manufacturing_work_centers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description"),
  costPerHour: decimal("cost_per_hour", { precision: 15, scale: 2 }).default("0.00").notNull(),
  overheadRate: decimal("overhead_rate", { precision: 15, scale: 2 }).default("0.00").notNull(),
  capacityHoursPerDay: decimal("capacity_hours_per_day", { precision: 5, scale: 2 }).default("8.00").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const manufacturingMachines = pgTable("manufacturing_machines", {
  id: serial("id").primaryKey(),
  workCenterId: integer("work_center_id").references(() => manufacturingWorkCenters.id).notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  status: text("status").default("ACTIVE").notNull(), // ACTIVE, MAINTENANCE, DOWN
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const manufacturingRoutings = pgTable("manufacturing_routings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  name: text("name").notNull(),
  version: text("version").default("1.0").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const manufacturingRoutingOperations = pgTable("manufacturing_routing_operations", {
  id: serial("id").primaryKey(),
  routingId: integer("routing_id").references(() => manufacturingRoutings.id).notNull(),
  sequence: integer("sequence").notNull(),
  operationName: text("operation_name").notNull(),
  workCenterId: integer("work_center_id").references(() => manufacturingWorkCenters.id).notNull(),
  defaultMachineId: integer("default_machine_id").references(() => manufacturingMachines.id),
  setupTimeMinutes: decimal("setup_time_minutes", { precision: 10, scale: 2 }).default("0").notNull(),
  cycleTimeMinutes: decimal("cycle_time_minutes", { precision: 10, scale: 2 }).default("0").notNull(),
});

export const billOfMaterials = pgTable("bill_of_materials", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(), // The finished good
  name: text("name").notNull(),
  version: text("version").default("1.0").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bomItems = pgTable("bom_items", {
  id: serial("id").primaryKey(),
  bomId: integer("bom_id").references(() => billOfMaterials.id).notNull(),
  componentProductId: integer("component_product_id").references(() => products.id).notNull(), // The raw material
  type: text("type").default("COMPONENT").notNull(), // COMPONENT, BY_PRODUCT, CO_PRODUCT
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unitOfMeasure: text("unit_of_measure").notNull(),
  scrapPercentage: decimal("scrap_percentage", { precision: 5, scale: 2 }).default("0").notNull(),
});

// ==========================================
// PRODUCTION RUNS (renamed from work_orders)
// ==========================================

export const productionRuns = pgTable("production_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  type: text("type").default("RECIPE").notNull(), // RECIPE (uses BOM), SIMPLE (manual input/output)
  parentProductionRunId: integer("parent_production_run_id"), // Self-reference for rework
  routingId: integer("routing_id").references(() => manufacturingRoutings.id),
  bomId: integer("bom_id").references(() => billOfMaterials.id), // Nullable for SIMPLE type
  // Status: PLANNED → RELEASED → IN_PROGRESS → COMPLETED → SETTLED | CANCELLED
  status: text("status").default("PLANNED").notNull(),
  plannedQuantity: decimal("planned_quantity", { precision: 12, scale: 4 }).notNull(),
  completedQuantity: decimal("completed_quantity", { precision: 12, scale: 4 }).default("0").notNull(),
  goodQuantity: decimal("good_quantity", { precision: 12, scale: 4 }).default("0"),
  rejectedQuantity: decimal("rejected_quantity", { precision: 12, scale: 4 }).default("0"),
  completionPercentage: decimal("completion_percentage", { precision: 5, scale: 2 }).default("0"),

  // Customer / Sales Order linkage
  customerId: integer("customer_id").references(() => customers.id),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id),
  artworkVersionSnapshot: text("artwork_version_snapshot"), // Copied from customer_products.artwork_version at creation

  // Scheduling
  plannedStart: timestamp("planned_start"),
  plannedCompletion: timestamp("planned_completion"),
  actualCompletion: timestamp("actual_completion"),

  // Operation / machine / operator (absorbed from manufacturing_production_runs)
  routingOperationId: integer("routing_operation_id").references(() => manufacturingRoutingOperations.id),
  machineId: integer("machine_id").references(() => manufacturingMachines.id),
  operatorId: integer("operator_id").references(() => employees.id),
  shift: text("shift"),
  downtimeMinutes: decimal("downtime_minutes", { precision: 10, scale: 2 }).default("0"),

  // Planned costs (snapshotted at creation from standard_costs + routing)
  plannedMaterialCost: decimal("planned_material_cost", { precision: 15, scale: 2 }).default("0"),
  plannedLaborCost: decimal("planned_labor_cost", { precision: 15, scale: 2 }).default("0"),
  plannedOverheadCost: decimal("planned_overhead_cost", { precision: 15, scale: 2 }).default("0"),

  // Actual costs (accumulated from goods_issues + time_confirmations)
  actualMaterialCost: decimal("actual_material_cost", { precision: 15, scale: 2 }).default("0"),
  actualLaborCost: decimal("actual_labor_cost", { precision: 15, scale: 2 }).default("0"),
  actualOverheadCost: decimal("actual_overhead_cost", { precision: 15, scale: 2 }).default("0"),

  // Variances (set on COMPLETED)
  varianceMaterial: decimal("variance_material", { precision: 15, scale: 2 }).default("0"),
  varianceLabor: decimal("variance_labor", { precision: 15, scale: 2 }).default("0"),
  varianceOverhead: decimal("variance_overhead", { precision: 15, scale: 2 }).default("0"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyIdx: index("production_runs_company_idx").on(table.companyId),
  customerIdx: index("production_runs_customer_idx").on(table.customerId),
  salesOrderIdx: index("production_runs_sales_order_idx").on(table.salesOrderId),
  statusIdx: index("production_runs_status_idx").on(table.status),
}));

// Keep old workOrders alias for backward-compat with any remaining references
/** @deprecated Use productionRuns instead */
export const workOrders = productionRuns;

export const productionRunConsumptions = pgTable("production_run_consumptions", {
  id: serial("id").primaryKey(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantityConsumed: decimal("quantity_consumed", { precision: 12, scale: 4 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
});

// Keep old alias for backward-compat
/** @deprecated Use productionRunConsumptions instead */
export const workOrderConsumptions = productionRunConsumptions;

export const manufacturingMaterialTransactions = pgTable("manufacturing_material_transactions", {
  id: serial("id").primaryKey(),
  // Legacy FK to work_orders — kept for historical data. New records use goodsIssues/goodsReceipts.
  workOrderId: integer("work_order_id"),
  productionRunId: integer("production_run_id").references(() => productionRuns.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  type: text("type").default("ISSUE").notNull(), // ISSUE, RETURN, FINISHED_GOOD, SCRAP, BY_PRODUCT, CO_PRODUCT
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  reason: text("reason"),
});

export const manufacturingProductionNotes = pgTable("manufacturing_production_notes", {
  id: serial("id").primaryKey(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  noteType: text("note_type").default("GENERAL").notNull(), // GENERAL, DELAY, SCRAP, QUALITY
  content: text("content").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const manufacturingProductionAttachments = pgTable("manufacturing_production_attachments", {
  id: serial("id").primaryKey(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==========================================
// GOODS ISSUES — material pulls from stock
// ==========================================
export const goodsIssues = pgTable("goods_issues", {
  id: serial("id").primaryKey(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  locationId: integer("location_id").references(() => inventoryLocations.id),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }),
  type: text("type").default("ISSUE").notNull(), // ISSUE, RETURN, SCRAP
  postedAt: timestamp("posted_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  notes: text("notes"),
}, (table) => ({
  productionRunIdx: index("goods_issues_production_run_idx").on(table.productionRunId),
  productIdx: index("goods_issues_product_idx").on(table.productId),
}));

// ==========================================
// GOODS RECEIPTS — finished goods credited to stock
// ==========================================
export const goodsReceipts = pgTable("goods_receipts", {
  id: serial("id").primaryKey(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  locationId: integer("location_id").references(() => inventoryLocations.id),
  customerId: integer("customer_id").references(() => customers.id), // Set if run has customer_id → goes to customer_stock
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }),
  postedAt: timestamp("posted_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  notes: text("notes"),
}, (table) => ({
  productionRunIdx: index("goods_receipts_production_run_idx").on(table.productionRunId),
  productIdx: index("goods_receipts_product_idx").on(table.productId),
  customerIdx: index("goods_receipts_customer_idx").on(table.customerId),
}));

// ==========================================
// TIME CONFIRMATIONS — labor bookings
// ==========================================
export const timeConfirmations = pgTable("time_confirmations", {
  id: serial("id").primaryKey(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  workCenterId: integer("work_center_id").references(() => manufacturingWorkCenters.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id), // Nullable — anonymous booking allowed
  hours: decimal("hours", { precision: 10, scale: 2 }).notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 15, scale: 2 }),
  laborCost: decimal("labor_cost", { precision: 15, scale: 2 }), // hours * hourlyRate
  overheadCost: decimal("overhead_cost", { precision: 15, scale: 2 }), // hours * workCenter.overheadRate
  postedAt: timestamp("posted_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  notes: text("notes"),
}, (table) => ({
  productionRunIdx: index("time_confirmations_production_run_idx").on(table.productionRunId),
  workCenterIdx: index("time_confirmations_work_center_idx").on(table.workCenterId),
  employeeIdx: index("time_confirmations_employee_idx").on(table.employeeId),
}));

// ==========================================
// STANDARD COSTS — planned cost per product
// ==========================================
export const standardCosts = pgTable("standard_costs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  materialCost: decimal("material_cost", { precision: 15, scale: 2 }).default("0").notNull(),
  laborCost: decimal("labor_cost", { precision: 15, scale: 2 }).default("0").notNull(),
  overheadCost: decimal("overhead_cost", { precision: 15, scale: 2 }).default("0").notNull(),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }).default("0").notNull(), // materialCost + laborCost + overheadCost
  effectiveFrom: date("effective_from").defaultNow().notNull(),
  effectiveTo: date("effective_to"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  companyProductFromUnique: unique("standard_costs_company_product_from_idx").on(table.companyId, table.productId, table.effectiveFrom),
  companyIdx: index("standard_costs_company_idx").on(table.companyId),
  productIdx: index("standard_costs_product_idx").on(table.productId),
}));

// Relations
export const manufacturingWorkCentersRelations = relations(manufacturingWorkCenters, ({ one, many }) => ({
  company: one(companies, { fields: [manufacturingWorkCenters.companyId], references: [companies.id] }),
  machines: many(manufacturingMachines),
  operations: many(manufacturingRoutingOperations),
  timeConfirmations: many(timeConfirmations),
}));

export const manufacturingMachinesRelations = relations(manufacturingMachines, ({ one }) => ({
  workCenter: one(manufacturingWorkCenters, { fields: [manufacturingMachines.workCenterId], references: [manufacturingWorkCenters.id] }),
}));

export const manufacturingRoutingsRelations = relations(manufacturingRoutings, ({ one, many }) => ({
  company: one(companies, { fields: [manufacturingRoutings.companyId], references: [companies.id] }),
  product: one(products, { fields: [manufacturingRoutings.productId], references: [products.id] }),
  operations: many(manufacturingRoutingOperations),
}));

export const manufacturingRoutingOperationsRelations = relations(manufacturingRoutingOperations, ({ one }) => ({
  routing: one(manufacturingRoutings, { fields: [manufacturingRoutingOperations.routingId], references: [manufacturingRoutings.id] }),
  workCenter: one(manufacturingWorkCenters, { fields: [manufacturingRoutingOperations.workCenterId], references: [manufacturingWorkCenters.id] }),
  defaultMachine: one(manufacturingMachines, { fields: [manufacturingRoutingOperations.defaultMachineId], references: [manufacturingMachines.id] }),
}));

export const billOfMaterialsRelations = relations(billOfMaterials, ({ one, many }) => ({
  company: one(companies, { fields: [billOfMaterials.companyId], references: [companies.id] }),
  product: one(products, { fields: [billOfMaterials.productId], references: [products.id] }),
  lines: many(bomItems),
}));

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  bom: one(billOfMaterials, { fields: [bomItems.bomId], references: [billOfMaterials.id] }),
  componentProduct: one(products, { fields: [bomItems.componentProductId], references: [products.id] }),
}));

export const productionRunsRelations = relations(productionRuns, ({ one, many }) => ({
  company: one(companies, { fields: [productionRuns.companyId], references: [companies.id] }),
  bom: one(billOfMaterials, { fields: [productionRuns.bomId], references: [billOfMaterials.id] }),
  routing: one(manufacturingRoutings, { fields: [productionRuns.routingId], references: [manufacturingRoutings.id] }),
  routingOperation: one(manufacturingRoutingOperations, { fields: [productionRuns.routingOperationId], references: [manufacturingRoutingOperations.id] }),
  machine: one(manufacturingMachines, { fields: [productionRuns.machineId], references: [manufacturingMachines.id] }),
  operator: one(employees, { fields: [productionRuns.operatorId], references: [employees.id] }),
  customer: one(customers, { fields: [productionRuns.customerId], references: [customers.id] }),
  salesOrder: one(salesOrders, { fields: [productionRuns.salesOrderId], references: [salesOrders.id] }),
  consumptions: many(productionRunConsumptions),
  materialTransactions: many(manufacturingMaterialTransactions),
  goodsIssues: many(goodsIssues),
  goodsReceipts: many(goodsReceipts),
  timeConfirmations: many(timeConfirmations),
  notes: many(manufacturingProductionNotes),
  attachments: many(manufacturingProductionAttachments),
}));

export const productionRunConsumptionsRelations = relations(productionRunConsumptions, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [productionRunConsumptions.productionRunId], references: [productionRuns.id] }),
  product: one(products, { fields: [productionRunConsumptions.productId], references: [products.id] }),
}));

export const manufacturingMaterialTransactionsRelations = relations(manufacturingMaterialTransactions, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [manufacturingMaterialTransactions.productionRunId], references: [productionRuns.id] }),
  product: one(products, { fields: [manufacturingMaterialTransactions.productId], references: [products.id] }),
}));

export const manufacturingProductionNotesRelations = relations(manufacturingProductionNotes, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [manufacturingProductionNotes.productionRunId], references: [productionRuns.id] }),
  createdByUser: one(users, { fields: [manufacturingProductionNotes.createdBy], references: [users.id] }),
}));

export const manufacturingProductionAttachmentsRelations = relations(manufacturingProductionAttachments, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [manufacturingProductionAttachments.productionRunId], references: [productionRuns.id] }),
  uploadedByUser: one(users, { fields: [manufacturingProductionAttachments.uploadedBy], references: [users.id] }),
}));

export const goodsIssuesRelations = relations(goodsIssues, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [goodsIssues.productionRunId], references: [productionRuns.id] }),
  product: one(products, { fields: [goodsIssues.productId], references: [products.id] }),
  location: one(inventoryLocations, { fields: [goodsIssues.locationId], references: [inventoryLocations.id] }),
  createdByUser: one(users, { fields: [goodsIssues.createdBy], references: [users.id] }),
}));

export const goodsReceiptsRelations = relations(goodsReceipts, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [goodsReceipts.productionRunId], references: [productionRuns.id] }),
  product: one(products, { fields: [goodsReceipts.productId], references: [products.id] }),
  location: one(inventoryLocations, { fields: [goodsReceipts.locationId], references: [inventoryLocations.id] }),
  customer: one(customers, { fields: [goodsReceipts.customerId], references: [customers.id] }),
  createdByUser: one(users, { fields: [goodsReceipts.createdBy], references: [users.id] }),
}));

export const timeConfirmationsRelations = relations(timeConfirmations, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [timeConfirmations.productionRunId], references: [productionRuns.id] }),
  workCenter: one(manufacturingWorkCenters, { fields: [timeConfirmations.workCenterId], references: [manufacturingWorkCenters.id] }),
  employee: one(employees, { fields: [timeConfirmations.employeeId], references: [employees.id] }),
  createdByUser: one(users, { fields: [timeConfirmations.createdBy], references: [users.id] }),
}));

export const standardCostsRelations = relations(standardCosts, ({ one }) => ({
  company: one(companies, { fields: [standardCosts.companyId], references: [companies.id] }),
  product: one(products, { fields: [standardCosts.productId], references: [products.id] }),
}));

// Types & Insert Schemas
export const insertManufacturingWorkCenterSchema = createInsertSchema(manufacturingWorkCenters).omit({ id: true, createdAt: true });
export type ManufacturingWorkCenter = typeof manufacturingWorkCenters.$inferSelect;
export type InsertManufacturingWorkCenter = z.infer<typeof insertManufacturingWorkCenterSchema>;

export const insertManufacturingMachineSchema = createInsertSchema(manufacturingMachines).omit({ id: true, createdAt: true });
export type ManufacturingMachine = typeof manufacturingMachines.$inferSelect;
export type InsertManufacturingMachine = z.infer<typeof insertManufacturingMachineSchema>;

export const insertManufacturingRoutingSchema = createInsertSchema(manufacturingRoutings).omit({ id: true, createdAt: true });
export type ManufacturingRouting = typeof manufacturingRoutings.$inferSelect;
export type InsertManufacturingRouting = z.infer<typeof insertManufacturingRoutingSchema>;

export const insertManufacturingRoutingOperationSchema = createInsertSchema(manufacturingRoutingOperations).omit({ id: true });
export type ManufacturingRoutingOperation = typeof manufacturingRoutingOperations.$inferSelect;
export type InsertManufacturingRoutingOperation = z.infer<typeof insertManufacturingRoutingOperationSchema>;

export const insertManufacturingMaterialTransactionSchema = createInsertSchema(manufacturingMaterialTransactions).omit({ id: true, date: true });
export type ManufacturingMaterialTransaction = typeof manufacturingMaterialTransactions.$inferSelect;
export type InsertManufacturingMaterialTransaction = z.infer<typeof insertManufacturingMaterialTransactionSchema>;

export const insertManufacturingProductionNoteSchema = createInsertSchema(manufacturingProductionNotes).omit({ id: true, createdAt: true });
export type ManufacturingProductionNote = typeof manufacturingProductionNotes.$inferSelect;
export type InsertManufacturingProductionNote = z.infer<typeof insertManufacturingProductionNoteSchema>;

export const insertManufacturingProductionAttachmentSchema = createInsertSchema(manufacturingProductionAttachments).omit({ id: true, createdAt: true });
export type ManufacturingProductionAttachment = typeof manufacturingProductionAttachments.$inferSelect;
export type InsertManufacturingProductionAttachment = z.infer<typeof insertManufacturingProductionAttachmentSchema>;

export const insertBillOfMaterialSchema = createInsertSchema(billOfMaterials).omit({ id: true, createdAt: true });
export type BillOfMaterial = typeof billOfMaterials.$inferSelect;
export type InsertBillOfMaterial = z.infer<typeof insertBillOfMaterialSchema>;

export const insertBomItemSchema = createInsertSchema(bomItems).omit({ id: true });
export type BomItem = typeof bomItems.$inferSelect;
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;

export const insertProductionRunSchema = createInsertSchema(productionRuns).omit({ id: true, createdAt: true, updatedAt: true, completedQuantity: true });
export type ProductionRun = typeof productionRuns.$inferSelect;
export type InsertProductionRun = z.infer<typeof insertProductionRunSchema>;

/** @deprecated Use insertProductionRunSchema / ProductionRun */
export const insertWorkOrderSchema = insertProductionRunSchema;
export type WorkOrder = ProductionRun;
export type InsertWorkOrder = InsertProductionRun;

export const insertProductionRunConsumptionSchema = createInsertSchema(productionRunConsumptions).omit({ id: true, date: true });
export type ProductionRunConsumption = typeof productionRunConsumptions.$inferSelect;
export type InsertProductionRunConsumption = z.infer<typeof insertProductionRunConsumptionSchema>;

/** @deprecated Use insertProductionRunConsumptionSchema / ProductionRunConsumption */
export const insertWorkOrderConsumptionSchema = insertProductionRunConsumptionSchema;
export type WorkOrderConsumption = ProductionRunConsumption;
export type InsertWorkOrderConsumption = InsertProductionRunConsumption;

export const insertGoodsIssueSchema = createInsertSchema(goodsIssues).omit({ id: true, postedAt: true });
export type GoodsIssue = typeof goodsIssues.$inferSelect;
export type InsertGoodsIssue = z.infer<typeof insertGoodsIssueSchema>;

export const insertGoodsReceiptSchema = createInsertSchema(goodsReceipts).omit({ id: true, postedAt: true });
export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type InsertGoodsReceipt = z.infer<typeof insertGoodsReceiptSchema>;

export const insertTimeConfirmationSchema = createInsertSchema(timeConfirmations).omit({ id: true, postedAt: true });
export type TimeConfirmation = typeof timeConfirmations.$inferSelect;
export type InsertTimeConfirmation = z.infer<typeof insertTimeConfirmationSchema>;

export const insertStandardCostSchema = createInsertSchema(standardCosts).omit({ id: true, createdAt: true, updatedAt: true });
export type StandardCost = typeof standardCosts.$inferSelect;
export type InsertStandardCost = z.infer<typeof insertStandardCostSchema>;


// --- Phase 2: Manufacturing Planning & MRP ---
export const manufacturingProductionSchedules = pgTable("manufacturing_production_schedules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, PUBLISHED
  createdAt: timestamp("created_at").defaultNow(),
});

export const manufacturingProductionScheduleLines = pgTable("manufacturing_production_schedule_lines", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => manufacturingProductionSchedules.id).notNull(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  plannedStartDate: timestamp("planned_start_date"),
  plannedEndDate: timestamp("planned_end_date"),
});

export const manufacturingMaterialReservations = pgTable("manufacturing_material_reservations", {
  id: serial("id").primaryKey(),
  productionRunId: integer("production_run_id").references(() => productionRuns.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantityReserved: decimal("quantity_reserved", { precision: 15, scale: 4 }).notNull(),
  status: text("status").default("RESERVED").notNull(), // RESERVED, CONSUMED, CANCELLED
});

export const manufacturingMrpRuns = pgTable("manufacturing_mrp_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  status: text("status").default("COMPLETED").notNull(), // COMPLETED, FAILED
  notes: text("notes"),
});

export const manufacturingMaterialShortages = pgTable("manufacturing_material_shortages", {
  id: serial("id").primaryKey(),
  mrpRunId: integer("mrp_run_id").references(() => manufacturingMrpRuns.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  shortageQuantity: decimal("shortage_quantity", { precision: 15, scale: 4 }).notNull(),
  requiredDate: date("required_date"),
  status: text("status").default("UNRESOLVED").notNull(), // UNRESOLVED, RESOLVED
});

export const manufacturingMrpRecommendations = pgTable("manufacturing_mrp_recommendations", {
  id: serial("id").primaryKey(),
  mrpRunId: integer("mrp_run_id").references(() => manufacturingMrpRuns.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  type: text("type").notNull(), // PURCHASE, TRANSFER, WORK_ORDER
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  requiredDate: date("required_date"),
  status: text("status").default("PENDING").notNull(), // PENDING, APPROVED, REJECTED
  referenceId: integer("reference_id"), // Points to created PO/WO/Transfer
});

// Relations
export const manufacturingProductionSchedulesRelations = relations(manufacturingProductionSchedules, ({ many }) => ({
  lines: many(manufacturingProductionScheduleLines),
}));

export const manufacturingProductionScheduleLinesRelations = relations(manufacturingProductionScheduleLines, ({ one }) => ({
  schedule: one(manufacturingProductionSchedules, { fields: [manufacturingProductionScheduleLines.scheduleId], references: [manufacturingProductionSchedules.id] }),
  productionRun: one(productionRuns, { fields: [manufacturingProductionScheduleLines.productionRunId], references: [productionRuns.id] }),
}));

export const manufacturingMaterialReservationsRelations = relations(manufacturingMaterialReservations, ({ one }) => ({
  productionRun: one(productionRuns, { fields: [manufacturingMaterialReservations.productionRunId], references: [productionRuns.id] }),
  product: one(products, { fields: [manufacturingMaterialReservations.productId], references: [products.id] }),
}));

export const manufacturingMrpRunsRelations = relations(manufacturingMrpRuns, ({ many }) => ({
  recommendations: many(manufacturingMrpRecommendations),
  shortages: many(manufacturingMaterialShortages),
}));

export const manufacturingMaterialShortagesRelations = relations(manufacturingMaterialShortages, ({ one }) => ({
  mrpRun: one(manufacturingMrpRuns, { fields: [manufacturingMaterialShortages.mrpRunId], references: [manufacturingMrpRuns.id] }),
  product: one(products, { fields: [manufacturingMaterialShortages.productId], references: [products.id] }),
}));

export const manufacturingMrpRecommendationsRelations = relations(manufacturingMrpRecommendations, ({ one }) => ({
  mrpRun: one(manufacturingMrpRuns, { fields: [manufacturingMrpRecommendations.mrpRunId], references: [manufacturingMrpRuns.id] }),
  product: one(products, { fields: [manufacturingMrpRecommendations.productId], references: [products.id] }),
}));

// Types
export const insertManufacturingProductionScheduleSchema = createInsertSchema(manufacturingProductionSchedules).omit({ id: true, createdAt: true });
export type ManufacturingProductionSchedule = typeof manufacturingProductionSchedules.$inferSelect;
export type InsertManufacturingProductionSchedule = z.infer<typeof insertManufacturingProductionScheduleSchema>;

export const insertManufacturingMrpRunSchema = createInsertSchema(manufacturingMrpRuns).omit({ id: true, date: true });
export type ManufacturingMrpRun = typeof manufacturingMrpRuns.$inferSelect;
export type InsertManufacturingMrpRun = z.infer<typeof insertManufacturingMrpRunSchema>;

// --- Bank Reconciliation Rules Engine ---
export const bankRules = pgTable("bank_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  priority: integer("priority").default(0).notNull(),
  applyTo: text("apply_to").default("ALL").notNull(), // ALL, SPEND, RECEIVE
  conditions: jsonb("conditions").notNull(), // Array of { field, operator, value }
  actionType: text("action_type").notNull(), // CREATE_EXPENSE, CREATE_INCOME, ASSIGN_ACCOUNT
  targetAccountId: integer("target_account_id").references(() => accounts.id),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBankRuleSchema = createInsertSchema(bankRules).omit({ id: true, createdAt: true });
export type BankRule = typeof bankRules.$inferSelect;
export type InsertBankRule = z.infer<typeof insertBankRuleSchema>;


export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  customerId: integer("customer_id").references(() => customers.id),
  quotationId: integer("quotation_id").references((): AnyPgColumn => invoices.id),

  orderNumber: text("order_number").notNull(),
  issueDate: timestamp("issue_date").defaultNow(),
  dueDate: timestamp("due_date"),

  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),

  status: text("status").default("draft").notNull(), // draft, confirmed, partially_invoiced, invoiced, closed
  currency: text("currency").default("USD"),
  notes: text("notes"),

  // Order type extension
  orderType: text("order_type").default("cash_and_carry").notNull(), // cash_and_carry | preorder | lay_by
  
  // Preorder fields
  preorderType: text("preorder_type"), // air | sea
  depositPct: decimal("deposit_pct", { precision: 5, scale: 2 }), // Required deposit %
  depositPaid: decimal("deposit_paid", { precision: 15, scale: 2 }), // Amount received
  remainingBalance: decimal("remaining_balance", { precision: 15, scale: 2 }),
  expectedArrival: date("expected_arrival"), // Expected delivery date
  shipmentId: integer("shipment_id"), // FK to freight/consignment (soft ref)
  
  // Lay-by fields  
  layByDuration: integer("lay_by_duration"), // 3 or 6 (months)
  
  // Approval workflow
  approvalStatus: text("approval_status").default("none"), // none | pending | approved | rejected
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").references((): AnyPgColumn => salesOrders.id).notNull(),
  quotationItemId: integer("quotation_item_id").references((): AnyPgColumn => invoiceItems.id),
  productId: integer("product_id").references(() => products.id),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  invoicedQuantity: decimal("invoiced_quantity", { precision: 10, scale: 2 }).default("0.00").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
});

export const salesOrdersRelations = relations(salesOrders, ({ one, many }) => ({
  company: one(companies, { fields: [salesOrders.companyId], references: [companies.id] }),
  customer: one(customers, { fields: [salesOrders.customerId], references: [customers.id] }),
  quotation: one(quotations, { fields: [salesOrders.quotationId], references: [quotations.id] }),
  items: many(salesOrderItems),
  invoices: many(invoices),
  layBySchedules: many(layBySchedules),
  stockReservations: many(stockReservations),
}));

export const salesOrderItemsRelations = relations(salesOrderItems, ({ one }) => ({
  salesOrder: one(salesOrders, { fields: [salesOrderItems.salesOrderId], references: [salesOrders.id] }),
  product: one(products, { fields: [salesOrderItems.productId], references: [products.id] }),
}));

// Customer Exclusive Products
export const customerProducts = pgTable("customer_products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  isExclusive: boolean("is_exclusive").default(false).notNull(),
  negotiatedPrice: decimal("negotiated_price", { precision: 10, scale: 2 }),
  customerSku: text("customer_sku"),
  artworkVersion: text("artwork_version"),
  specReference: text("spec_reference"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    customerProductUnique: unique("customer_products_customer_product_idx").on(table.customerId, table.productId),
  };
});

export const customerProductsRelations = relations(customerProducts, ({ one }) => ({
  customer: one(customers, { fields: [customerProducts.customerId], references: [customers.id] }),
  product: one(products, { fields: [customerProducts.productId], references: [products.id] }),
}));

// Granular Stock Table (Customer-Linked)

export const stockAllocations = pgTable("stock_allocations", {
  id: serial("id").primaryKey(),
  stockId: integer("stock_id").references(() => customerStock.id).notNull(),
  salesOrderLineId: integer("sales_order_line_id").references(() => salesOrderItems.id).notNull(),
  quantityAllocated: decimal("quantity_allocated", { precision: 10, scale: 2 }).notNull(),
  allocatedAt: timestamp("allocated_at").defaultNow().notNull(),
  releasedAt: timestamp("released_at"),
});

export const stockAllocationsRelations = relations(stockAllocations, ({ one }) => ({
  stock: one(customerStock, { fields: [stockAllocations.stockId], references: [customerStock.id] }),
  salesOrderLine: one(salesOrderItems, { fields: [stockAllocations.salesOrderLineId], references: [salesOrderItems.id] }),
}));

export const insertStockAllocationSchema = createInsertSchema(stockAllocations).omit({ id: true, allocatedAt: true });

export const customerStock = pgTable("customer_stock", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  locationId: integer("location_id").references(() => inventoryLocations.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id), // Null for shared stock
  batchId: integer("batch_id").references(() => productBatches.id), // Nullable

  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("0").notNull(),
  uom: text("uom"),
  status: text("status").default("AVAILABLE").notNull(), // AVAILABLE, ALLOCATED, QA_HOLD

  lastMovementDate: timestamp("last_movement_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    locationIdx: index("customer_stock_location_idx").on(table.locationId),
    productIdx: index("customer_stock_product_idx").on(table.productId),
    customerIdx: index("customer_stock_customer_idx").on(table.customerId),
  };
});

export const customerStockRelations = relations(customerStock, ({ one }) => ({
  location: one(inventoryLocations, { fields: [customerStock.locationId], references: [inventoryLocations.id] }),
  product: one(products, { fields: [customerStock.productId], references: [products.id] }),
  customer: one(customers, { fields: [customerStock.customerId], references: [customers.id] }),
  batch: one(productBatches, { fields: [customerStock.batchId], references: [productBatches.id] }),
}));

// Ledger for Customer Stock Movements (IN, OUT, ADJUSTMENT)
export const customerStockTransactions = pgTable("customer_stock_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),

  type: text("type").notNull(), // "STOCK_IN", "STOCK_OUT", "ADJUSTMENT"
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),

  referenceType: text("reference_type").notNull(), // "INVOICE", "MANUAL", "RETURN"
  referenceId: text("reference_id"), // E.g., Invoice Number

  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    customerIdx: index("cst_trans_customer_idx").on(table.customerId),
    productIdx: index("cst_trans_product_idx").on(table.productId),
  };
});

export const customerStockTransactionsRelations = relations(customerStockTransactions, ({ one }) => ({
  company: one(companies, { fields: [customerStockTransactions.companyId], references: [companies.id] }),
  customer: one(customers, { fields: [customerStockTransactions.customerId], references: [customers.id] }),
  product: one(products, { fields: [customerStockTransactions.productId], references: [products.id] }),
  user: one(users, { fields: [customerStockTransactions.createdBy], references: [users.id] }),
}));

// Job Execution Logs
export const jobLogs = pgTable("job_logs", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull(), // "recurring_invoices", "fiscal_day_closure", etc.
  status: text("status").notNull(), // "started", "completed", "failed"
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  duration: integer("duration"), // Duration in milliseconds
  resultData: jsonb("result_data"), // Success results (e.g., invoices created, days closed)
  errorData: jsonb("error_data"), // Error details if failed
  companyId: integer("company_id").references(() => companies.id), // Optional: for company-specific jobs
  metadata: jsonb("metadata"), // Additional context (e.g., parameters, job-specific data)
}, (table) => {
  return {
    jobNameIdx: index("job_logs_job_name_idx").on(table.jobName),
    statusIdx: index("job_logs_status_idx").on(table.status),
    startedAtIdx: index("job_logs_started_at_idx").on(table.startedAt),
    companyIdIdx: index("job_logs_company_id_idx").on(table.companyId),
  };
});

export const jobLogsRelations = relations(jobLogs, ({ one }) => ({
  company: one(companies, { fields: [jobLogs.companyId], references: [companies.id] }),
}));

export const insertJobLogSchema = createInsertSchema(jobLogs).omit({ id: true, startedAt: true });
export type InsertJobLog = z.infer<typeof insertJobLogSchema>;
export type JobLog = typeof jobLogs.$inferSelect;

export const insertSalesOrderSchema = createInsertSchema(salesOrders).omit({ id: true, createdAt: true });
export const insertSalesOrderItemSchema = createInsertSchema(salesOrderItems).omit({ id: true });
export const insertCustomerProductSchema = createInsertSchema(customerProducts).omit({ id: true, createdAt: true });
export const insertCustomerStockSchema = createInsertSchema(customerStock).omit({ id: true, createdAt: true });


export const salesOrderAuditLogs = pgTable("sales_order_audit_logs", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id).notNull(),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow().notNull()
});
export const insertSalesOrderAuditLogSchema = createInsertSchema(salesOrderAuditLogs).omit({ id: true, changedAt: true });
export type SalesOrderAuditLog = typeof salesOrderAuditLogs.$inferSelect;

// ==========================================
// LAY-BY SCHEDULES — payment instalment plan
// ==========================================
export const layBySchedules = pgTable("lay_by_schedules", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id).notNull(),
  instalmentNumber: integer("instalment_number").notNull(),
  dueDate: date("due_date").notNull(),
  amountDue: decimal("amount_due", { precision: 15, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).default("0.00").notNull(),
  status: text("status").default("pending").notNull(), // pending | paid | overdue | defaulted
  paymentMethod: text("payment_method"), // Cash | Card | Bank Transfer | EcoCash
  paymentReference: text("payment_reference"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const layBySchedulesRelations = relations(layBySchedules, ({ one }) => ({
  salesOrder: one(salesOrders, { fields: [layBySchedules.salesOrderId], references: [salesOrders.id] }),
}));

export const insertLayByScheduleSchema = createInsertSchema(layBySchedules).omit({ id: true, createdAt: true });
export type LayBySchedule = typeof layBySchedules.$inferSelect;
export type InsertLayBySchedule = z.infer<typeof insertLayByScheduleSchema>;

// ==========================================
// STOCK RESERVATIONS — for preorders
// ==========================================
export const stockReservations = pgTable("stock_reservations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantityReserved: decimal("quantity_reserved", { precision: 15, scale: 4 }).notNull(),
  status: text("status").default("reserved").notNull(), // reserved | allocated | released | cancelled
  reservedAt: timestamp("reserved_at").defaultNow().notNull(),
  releasedAt: timestamp("released_at"),
}, (table) => ({
  salesOrderIdx: index("stock_reservations_sales_order_idx").on(table.salesOrderId),
  productIdx: index("stock_reservations_product_idx").on(table.productId),
}));

export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
  company: one(companies, { fields: [stockReservations.companyId], references: [companies.id] }),
  salesOrder: one(salesOrders, { fields: [stockReservations.salesOrderId], references: [salesOrders.id] }),
  product: one(products, { fields: [stockReservations.productId], references: [products.id] }),
}));

export const insertStockReservationSchema = createInsertSchema(stockReservations).omit({ id: true, reservedAt: true });
export type StockReservation = typeof stockReservations.$inferSelect;
export type InsertStockReservation = z.infer<typeof insertStockReservationSchema>;

// ==========================================
// COMPOUND PRODUCTS — product bundles
// ==========================================
export const compoundProducts = pgTable("compound_products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  description: text("description"),
  sellingPrice: decimal("selling_price", { precision: 15, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  companyIdx: index("compound_products_company_idx").on(table.companyId),
  skuIdx: index("compound_products_sku_idx").on(table.companyId, table.sku),
}));

export const compoundProductItems = pgTable("compound_product_items", {
  id: serial("id").primaryKey(),
  compoundProductId: integer("compound_product_id").references(() => compoundProducts.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
});

export const compoundProductsRelations = relations(compoundProducts, ({ one, many }) => ({
  company: one(companies, { fields: [compoundProducts.companyId], references: [companies.id] }),
  items: many(compoundProductItems),
}));

export const compoundProductItemsRelations = relations(compoundProductItems, ({ one }) => ({
  compoundProduct: one(compoundProducts, { fields: [compoundProductItems.compoundProductId], references: [compoundProducts.id] }),
  product: one(products, { fields: [compoundProductItems.productId], references: [products.id] }),
}));

export const insertCompoundProductSchema = createInsertSchema(compoundProducts).omit({ id: true, createdAt: true });
export type CompoundProduct = typeof compoundProducts.$inferSelect;
export type InsertCompoundProduct = z.infer<typeof insertCompoundProductSchema>;

export const insertCompoundProductItemSchema = createInsertSchema(compoundProductItems).omit({ id: true });
export type CompoundProductItem = typeof compoundProductItems.$inferSelect;
export type InsertCompoundProductItem = z.infer<typeof insertCompoundProductItemSchema>;

// ==========================================
// SALES ORDER SETTINGS — per company defaults
// ==========================================
export const salesOrderSettings = pgTable("sales_order_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull().unique(),
  airPreorderMinDepositPct: decimal("air_preorder_min_deposit_pct", { precision: 5, scale: 2 }).default("50.00").notNull(),
  seaPreorderMinDepositPct: decimal("sea_preorder_min_deposit_pct", { precision: 5, scale: 2 }).default("30.00").notNull(),
  laybyMinDepositPct: decimal("layby_min_deposit_pct", { precision: 5, scale: 2 }).default("10.00").notNull(),
  laybyDefaultDurationMonths: integer("layby_default_duration_months").default(3).notNull(),
  depositGlAccountId: integer("deposit_gl_account_id").references(() => accounts.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const salesOrderSettingsRelations = relations(salesOrderSettings, ({ one }) => ({
  company: one(companies, { fields: [salesOrderSettings.companyId], references: [companies.id] }),
  depositGlAccount: one(accounts, { fields: [salesOrderSettings.depositGlAccountId], references: [accounts.id] }),
}));

export const insertSalesOrderSettingsSchema = createInsertSchema(salesOrderSettings).omit({ id: true, updatedAt: true });
export type SalesOrderSettings = typeof salesOrderSettings.$inferSelect;
export type InsertSalesOrderSettings = z.infer<typeof insertSalesOrderSettingsSchema>;
export const fiscalizationJobs = pgTable("fiscalization_jobs", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  status: text("status").default("pending").notNull(), // pending, processing, completed, failed
  attemptCount: integer("attempt_count").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  leaseUntil: timestamp("lease_until"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertFiscalizationJobSchema = createInsertSchema(fiscalizationJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type FiscalizationJob = typeof fiscalizationJobs.$inferSelect;
export type InsertFiscalizationJob = z.infer<typeof insertFiscalizationJobSchema>;
