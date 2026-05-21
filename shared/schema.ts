
import { pgTable, text, serial, integer, boolean, timestamp, decimal, numeric, jsonb, primaryKey, uuid, date, unique, index } from "drizzle-orm/pg-core";
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
  vatEnabled: boolean("vat_enabled").default(true),
  defaultPaymentTerms: text("default_payment_terms"),
  bankDetails: text("bank_details"),
  fdmsDeviceId: text("fdms_device_id"),
  fdmsDeviceSerialNo: text("fdms_device_serial_no"), // ZIMRA Field [21] - Device Serial Number
  fdmsApiKey: text("fdms_api_key"),
  apiKey: text("api_key").unique(), // For external device authentication
  apiKeyCreatedAt: timestamp("api_key_created_at"),
  zimraPrivateKey: text("zimra_private_key"),
  zimraCertificate: text("zimra_certificate"),
  zimraEnvironment: text("zimra_environment").default("test"), // 'test' or 'production'
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
  appMode: text("app_mode").default("pos"), // pos, restaurant, bus_ticketing
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
  zimraEnvironment: text("zimra_environment"), // 'test' or 'production'
  
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

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(companyUsers),
  branches: many(branches),
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
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  company: one(companies, { fields: [branches.companyId], references: [companies.id] }),
  users: many(branchUsers),
  stocks: many(branchStocks),
  invoices: many(invoices),
  posShifts: many(posShifts),
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

// Join table for Users <-> Companies
export const companyUsers = pgTable("company_users", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  role: text("role").default("member"), // owner, admin, member
}, (table) => {
  return {
    userIdIdx: index("company_users_user_id_idx").on(table.userId),
    companyIdIdx: index("company_users_company_id_idx").on(table.companyId),
  };
});

export const companyUsersRelations = relations(companyUsers, ({ one }) => ({
  user: one(users, { fields: [companyUsers.userId], references: [users.id] }),
  company: one(companies, { fields: [companyUsers.companyId], references: [companies.id] }),
}));

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
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("15.00"), // Default VAT

  // Inventory
  isTracked: boolean("is_tracked").default(false),
  stockLevel: decimal("stock_level", { precision: 10, scale: 2 }).default("0"),
  lowStockThreshold: decimal("low_stock_threshold", { precision: 10, scale: 2 }).default("10"),

  isActive: boolean("is_active").default(true),
  productType: text("product_type").default("good").notNull(), // 'good' or 'service'
  taxCategoryId: integer("tax_category_id").references(() => taxCategories.id),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  
  // Recipe Flags
  isIngredient: boolean("is_ingredient").default(false), // e.g. Flour, Sugar
  hasRecipe: boolean("has_recipe").default(false), // e.g. Burger, Cake
  
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

// Validation Errors
export const validationErrors = pgTable("validation_errors", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
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
  expiryDate: date("expiry_date").notNull(),
  stockLevel: decimal("stock_level", { precision: 10, scale: 2 }).default("0"),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
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
  invoiceTemplate: text("invoice_template").default("modern"),
  isFiscalized: boolean("is_fiscalized").default(true),

  // Restaurant & Online Orders
  tableId: integer("table_id"), // Refers to restaurant_tables
  waiterId: uuid("waiter_id").references(() => users.id), // Waiter who took the order
  covers: integer("covers").default(1), // Guest count
  diningOption: text("dining_option").default("dine_in"), // dine_in, takeaway, delivery
  orderStatus: text("order_status").default("pending"), // pending, preparing, ready, served
  orderNumber: text("order_number"), // Short order number for customer display (e.g. #001)
  customerName: text("customer_name"),
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
  
}, (table) => {
  return {
    invoiceIdIdx: index("invoice_items_invoice_id_idx").on(table.invoiceId),
  };
});


export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  product: one(products, { fields: [invoiceItems.productId], references: [products.id] }),
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
  tin: z.string().regex(/^\d{10}$/, "TIN must be exactly 10 digits").or(z.string().length(0)).nullable().optional(),
  vatNumber: z.string().regex(/^\d{9,10}$/, "VAT number must be 9 or 10 digits").or(z.string().length(0)).nullable().optional(),
  bpNumber: z.string().regex(/^\d{10}$/, "BP number must be exactly 10 digits").or(z.string().length(0)).nullable().optional(),
});
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true }).extend({
  tin: z.string().regex(/^\d{10}$/, "TIN must be exactly 10 digits").or(z.string().length(0)).nullable().optional(),
  vatNumber: z.string().regex(/^\d{9,10}$/, "VAT number must be 9 or 10 digits").or(z.string().length(0)).nullable().optional(),
  bpNumber: z.string().regex(/^\d{10}$/, "BP number must be exactly 10 digits").or(z.string().length(0)).nullable().optional(),
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
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),

  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1.000000"),

  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  paymentMethod: text("payment_method").notNull(), // Cash, Card, Transfer, Ecocash
  reference: text("reference"), // Check No, Transaction ID

  notes: text("notes"),

  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  company: one(companies, { fields: [payments.companyId], references: [companies.id] }),
  user: one(users, { fields: [payments.createdBy], references: [users.id] }),
}));

// Also update Invoice relations to include payments
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [invoices.branchId], references: [branches.id] }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
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
  serialNumberId: integer("serial_number_id").references(() => productSerialNumbers.id),
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
  serialNumber: one(productSerialNumbers, { fields: [laybyItems.serialNumberId], references: [productSerialNumbers.id] }),
}));

export const laybyPaymentsRelations = relations(laybyPayments, ({ one }) => ({
  layby: one(laybys, { fields: [laybyPayments.laybyId], references: [laybys.id] }),
  company: one(companies, { fields: [laybyPayments.companyId], references: [companies.id] }),
  branch: one(branches, { fields: [laybyPayments.branchId], references: [branches.id] }),
}));


export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, companyId: true, createdAt: true, createdBy: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

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
  type: text("type").notNull(), // 'DROP', 'PAYOUT'
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
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }).default("0.00"),
  creditDays: integer("credit_days").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("suppliers_company_id_idx").on(table.companyId),
  };
});

export const suppliersRelations = relations(suppliers, ({ one }) => ({
  company: one(companies, { fields: [suppliers.companyId], references: [companies.id] }),
}));

// Inventory Transactions (Stock Ledger)
export const inventoryTransactions = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  variationId: integer("variation_id"), // Added for pharma/variant tracking
  supplierId: integer("supplier_id").references(() => suppliers.id),

  type: text("type").notNull(), // 'STOCK_IN' (GRN), 'STOCK_OUT' (Invoice), 'ADJUSTMENT'
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),

  referenceType: text("reference_type"), // 'GRN', 'INVOICE', 'MANUAL'
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
  product: one(products, { fields: [inventoryTransactions.productId], references: [products.id] }),
  supplier: one(suppliers, { fields: [inventoryTransactions.supplierId], references: [suppliers.id] }),
}));

export const goodsDeliveryNotes = pgTable("goods_delivery_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  gdnNumber: text("gdn_number").notNull(),
  status: text("status").default("PENDING").notNull(), // PENDING, CONFIRMED, CANCELLED
  notes: text("notes"),
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

export const goodsDeliveryNoteItems = pgTable("goods_delivery_note_items", {
  id: serial("id").primaryKey(),
  gdnId: integer("gdn_id").references(() => goodsDeliveryNotes.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }).notNull(),
  quantityAccepted: decimal("quantity_accepted", { precision: 10, scale: 2 }),
  quantityRejected: decimal("quantity_rejected", { precision: 10, scale: 2 }),
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
  creator: one(users, { fields: [goodsDeliveryNotes.createdBy], references: [users.id] }),
  confirmer: one(users, { fields: [goodsDeliveryNotes.confirmedBy], references: [users.id] }),
  items: many(goodsDeliveryNoteItems),
}));

export const goodsDeliveryNoteItemsRelations = relations(goodsDeliveryNoteItems, ({ one }) => ({
  gdn: one(goodsDeliveryNotes, { fields: [goodsDeliveryNoteItems.gdnId], references: [goodsDeliveryNotes.id] }),
  product: one(products, { fields: [goodsDeliveryNoteItems.productId], references: [products.id] }),
}));

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  poNumber: text("po_number").notNull(),
  status: text("status").default("DRAFT").notNull(), // DRAFT, SENT, RECEIVED, CANCELLED
  expectedDate: timestamp("expected_date"),
  notes: text("notes"),
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
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
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

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;

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
  status: text("status").default("scheduled").notNull(), // scheduled, boarding, en_route, completed, cancelled
  createdAt: timestamp("created_at").defaultNow(),
});

export const busTickets = pgTable("bus_tickets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tripId: integer("trip_id").references(() => busTrips.id).notNull(),
  ticketNumber: text("ticket_number").notNull(),
  passengerName: text("passenger_name"),
  boardingPoint: text("boarding_point"),
  dropOffPoint: text("drop_off_point"),
  seatNumber: text("seat_number"),
  quantity: integer("quantity").default(1),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  isSynced: boolean("is_synced").default(false),
  timestamp: timestamp("timestamp").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const busShifts = pgTable("bus_shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  conductorId: uuid("conductor_id").references(() => users.id).notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

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

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(), // e.g. "1000", "4000"
  name: text("name").notNull(), // e.g. "Cash at Bank", "Sales Revenue"
  type: text("type").notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  category: text("category"), // Current Asset, Fixed Asset, etc.
  description: text("description"),
  isSystem: boolean("is_system").default(false), // Permanent accounts like AR/Revenue
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyCodeIdx: unique("accounts_company_code_idx").on(table.companyId, table.code),
  companyIdIdx: index("accounts_company_id_idx").on(table.companyId),
}));

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  entryDate: timestamp("entry_date").defaultNow().notNull(),
  description: text("description").notNull(),
  referenceType: text("reference_type"), // INVOICE, PAYMENT, EXPENSE, MANUAL
  referenceId: text("reference_id"), // ID of the source document
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("journal_entries_company_id_idx").on(table.companyId),
  referenceIdx: index("journal_entries_reference_idx").on(table.referenceType, table.referenceId),
}));

export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  type: text("type").notNull(), // DEBIT, CREDIT
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1.000000"),
  isReconciled: boolean("is_reconciled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  journalEntryIdx: index("ledger_entries_journal_idx").on(table.journalEntryId),
  accountIdx: index("ledger_entries_account_idx").on(table.accountId),
}));

export const journalEntryDrafts = pgTable("journal_entry_drafts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
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
}));

export const journalEntryDraftLines = pgTable("journal_entry_draft_lines", {
  id: serial("id").primaryKey(),
  draftId: integer("draft_id").references(() => journalEntryDrafts.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  draftIdx: index("journal_entry_draft_lines_draft_idx").on(table.draftId),
  accountIdx: index("journal_entry_draft_lines_account_idx").on(table.accountId),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  company: one(companies, { fields: [accounts.companyId], references: [companies.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  company: one(companies, { fields: [journalEntries.companyId], references: [companies.id] }),
  user: one(users, { fields: [journalEntries.createdBy], references: [users.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  journalEntry: one(journalEntries, { fields: [ledgerEntries.journalEntryId], references: [journalEntries.id] }),
  account: one(accounts, { fields: [ledgerEntries.accountId], references: [accounts.id] }),
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
}));

// --- SUPPLIER INVOICES & PAYMENTS (AP) ---

export const supplierInvoices = pgTable("supplier_invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  dueDate: timestamp("due_date"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"),
  currency: text("currency").default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).default("1.000000"),
  status: text("status").notNull().default("unpaid"), // unpaid, partial, paid, cancelled
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
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
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"),
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

export const supplierInvoicesRelations = relations(supplierInvoices, ({ one, many }) => ({
  company: one(companies, { fields: [supplierInvoices.companyId], references: [companies.id] }),
  supplier: one(suppliers, { fields: [supplierInvoices.supplierId], references: [suppliers.id] }),
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
  name: text("name").notNull(), // e.g. 'January 2026'
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN, CLOSED
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const financialPeriodsRelations = relations(financialPeriods, ({ one }) => ({
  company: one(companies, { fields: [financialPeriods.companyId], references: [companies.id] }),
}));

export const insertFinancialPeriodSchema = createInsertSchema(financialPeriods).omit({ id: true, createdAt: true });
export type FinancialPeriod = typeof financialPeriods.$inferSelect;
export type InsertFinancialPeriod = z.infer<typeof insertFinancialPeriodSchema>;

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
