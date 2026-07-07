
import {
  users, companies, customers, products, invoices, invoiceItems, companyUsers,
  companyRoles, companyRolePermissions, approvalRequests, companyPartners,
  type User, type InsertUser, type Company, type InsertCompany,
  type CompanyRole, type InsertCompanyRole, type ApprovalRequest, type InsertApprovalRequest,
  type CompanyPartner, type InsertCompanyPartner,
  type Customer, type Product, type Invoice, type InvoiceItem, type InsertInvoiceItem,
  type InsertCustomer, type InsertProduct, type CreateInvoiceRequest, type InsertInvoice,
  taxTypes, taxCategories, type TaxType, type TaxCategory, type InsertTaxCategory, type InsertTaxType,
  currencies, type Currency, type InsertCurrency,
  payments, type Payment, type InsertPayment,
  auditLogs, type AuditLog, type InsertAuditLog,
  recurringInvoices, type RecurringInvoice, type InsertRecurringInvoice,
  quotations, quotationItems, type Quotation, type QuotationItem, type InsertQuotation, type InsertQuotationItem,
  zimraLogs, type ZimraLog, type InsertZimraLog,
  validationErrors, type ValidationError, type InsertValidationError,
  subscriptions, type Subscription, type InsertSubscription,
  posShifts, type PosShift, type InsertPosShift,
  posHolds, type PosHold, type InsertPosHold,
  branches, branchUsers, branchStocks,
  type Branch, type InsertBranch, type BranchUser, type BranchStock,
  costCenters, type CostCenter, type InsertCostCenter,
  productCategories, type ProductCategory, type InsertProductCategory,
  resetTokens, insertResetTokenSchema,
  suppliers, inventoryTransactions, expenses, purchaseOrders, purchaseOrderItems, goodsDeliveryNotes,
  type Supplier, type InsertSupplier,
  type InventoryTransaction, type InsertInventoryTransaction,
  type Expense, type InsertExpense,
  stockTakes, stockTakeItems,
  type StockTake, type InsertStockTake,
  type StockTakeItem, type InsertStockTakeItem,
  restaurantSections, restaurantTables, recipeItems,
  productVariations, productBatches,
  type RestaurantSection, type InsertRestaurantSection,
  type RestaurantTable, type InsertRestaurantTable,
  type RecipeItem, type InsertRecipeItem,
  type ProductVariation, type InsertProductVariation,
  type ProductBatch, type InsertProductBatch,
  priceAdjustments, type PriceAdjustment, type InsertPriceAdjustment,
  accounts, journalEntries, ledgerEntries, journalEntryDrafts, journalEntryDraftLines,
  type Account, type JournalEntry, type LedgerEntry, type JournalEntryDraft,
  type InsertAccount, type InsertJournalEntry, type InsertLedgerEntry, type InsertJournalEntryDraft,
  financialPeriods, bankStatements, bankStatementLines,
  type FinancialPeriod, type InsertFinancialPeriod,
  type BankStatement, type InsertBankStatement,
  type BankStatementLine, type InsertBankStatementLine,
  supplierInvoices, supplierInvoiceItems, supplierPayments,
  type SupplierInvoice, type InsertSupplierInvoice,
  type SupplierInvoiceItem, type InsertSupplierInvoiceItem,
  type SupplierPayment, type InsertSupplierPayment,
  fixedAssets,
  depreciationRuns,
  type FixedAsset,
  type InsertFixedAsset,
  type DepreciationRun,
  productSerialNumbers, warrantyClaims, laybys, laybyItems, laybyPayments,
  type ProductSerialNumber, type InsertProductSerialNumber,
  type WarrantyClaim, type InsertWarrantyClaim,
  type Layby, type InsertLayby, type LaybyItem, type InsertLaybyItem,
  type LaybyPayment, type InsertLaybyPayment,
  inventoryValuationSnapshots,
  inventoryLocations,
  inventoryLocationStocks,
  payrollElements, payrollCalculationAudits,
  type PayrollElement, type InsertPayrollElement,
  type PayrollCalculationAudit, type InsertPayrollCalculationAudit
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, asc, desc, lte, gte, lt, ne, or, isNull, sql, ilike, count, inArray, gt, not } from "drizzle-orm";
import { type FiscalDayCounter } from "./zimra.js";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { format } from "date-fns";

const scryptAsync = promisify(scrypt);

const DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS = {
  cashAccountCode: "1000",
  accountsReceivableCode: "1200",
  inventoryAccountCode: "1300",
  inventoryInTransitCode: "1310",   // Inter-location inventory-in-transit account
  accountsPayableCode: "2000",
  vatOutputAccountCode: "2200",
  vatInputAccountCode: "1420",
  salesRevenueAccountCode: "4000",
  cogsAccountCode: "5000",
  generalExpenseAccountCode: "5100",
  fxGainAccountCode: "4100",
  fxLossAccountCode: "5300",
  withholdingTaxPayableCode: "2200",
  grniAccountCode: "2000",
  landedCostClearingAccountCode: "2000",
  partnerPayableAccountCode: "2000",
} as const;


type AccountingSystemAccountKey = keyof typeof DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS;

function mergeAccountingSystemAccounts(settings: unknown): typeof DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS {
  const raw = settings && typeof settings === "object" ? settings as Record<string, unknown> : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS).map(([key, fallback]) => {
      const value = raw[key];
      return [key, typeof value === "string" && value.trim() ? value.trim() : fallback];
    })
  ) as typeof DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS;
}

function getAccountCodeRange(type?: string, category?: string): { start: number; end: number } {
  if (type === "ASSET") {
    return category === "Non-current Assets" ? { start: 1500, end: 1999 } : { start: 1000, end: 1499 };
  }
  if (type === "LIABILITY") {
    return category === "Non-current Liabilities" ? { start: 2300, end: 2999 } : { start: 2000, end: 2299 };
  }
  if (type === "EQUITY") return { start: 3000, end: 3999 };
  if (type === "REVENUE") return category === "Other Income" ? { start: 4200, end: 4999 } : { start: 4000, end: 4199 };
  if (type === "EXPENSE") {
    if (category === "Cost of Sales") return { start: 5000, end: 5099 };
    if (category === "Finance Costs") return { start: 5150, end: 5899 };
    if (category === "Other Expenses") return { start: 5900, end: 5999 };
    return { start: 5100, end: 5899 };
  }
  return { start: 9000, end: 9999 };
}

function parseOwnerGroups(raw?: string): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      String(raw)
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0 && v.toLowerCase() !== "all")
    )
  );
}

function buildOwnerGroupSql(column: any, raw?: string) {
  const groups = parseOwnerGroups(raw).map((v) => v.toLowerCase());
  if (groups.length === 0) return undefined;
  if (groups.length === 1) {
    return sql`lower(coalesce(${column}, '')) = ${groups[0]}`;
  }
  return sql`lower(coalesce(${column}, '')) in (${sql.join(groups.map((g) => sql`${g}`), sql`, `)})`;
}

type LedgerPostLine = {
  accountCode?: string;
  accountId?: number;
  type?: "DEBIT" | "CREDIT";
  amount?: number;
  debit?: string | number;
  credit?: string | number;
  branchId?: number;
  memo?: string;
};

type LedgerPostData = {
  entryDate?: Date;
  date?: Date | string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  reference?: string;
  createdBy?: string;
  branchId?: number; // Optional branch context for GL segregation
  lines: LedgerPostLine[];
};

export interface IStorage {
  // User & Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<User>): Promise<User>;
  setUserPin(userId: string, pin: string): Promise<void>;
  verifyUserPin(userId: string, pin: string): Promise<boolean>;

  // Password Reset
  createResetToken(userId: string): Promise<string>;
  verifyResetToken(token: string): Promise<string | null>; // Returns userId if valid
  consumeResetToken(token: string): Promise<void>;

  // Companies
  createCompany(company: InsertCompany, userId: string): Promise<Company>;
  getCompanies(userId: string): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  getCompanyByApiKey(apiKey: string): Promise<Company | undefined>;
  updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company>;

  // Customers
  getCustomers(companyId: number): Promise<(Customer & { balance?: number })[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer>;
  ensureGenericCustomer(companyId: number): Promise<number>;

  // Products
  getProducts(companyId: number, branchId?: number, ownerGroup?: string): Promise<(Product & { branchStock?: string })[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  getProductBySku(companyId: number, sku: string): Promise<Product | undefined>;
  deleteCompanyProducts(companyId: number): Promise<void>;
  getProductsForExport(companyId: number): Promise<any[]>;
  getProductSerialNumbers(companyId: number, productId?: number, status?: string): Promise<any[]>;
  createProductSerialNumbers(data: Array<InsertProductSerialNumber & { companyId: number }>): Promise<ProductSerialNumber[]>;
  updateProductSerialNumber(id: number, companyId: number, data: Partial<InsertProductSerialNumber>): Promise<ProductSerialNumber>;
  getWarrantyClaims(companyId: number): Promise<WarrantyClaim[]>;
  createWarrantyClaim(data: InsertWarrantyClaim & { companyId: number; createdBy?: string | null }): Promise<WarrantyClaim>;
  updateWarrantyClaim(id: number, companyId: number, data: Partial<InsertWarrantyClaim>): Promise<WarrantyClaim>;
  getLaybys(companyId: number): Promise<(Layby & { items: LaybyItem[]; payments: LaybyPayment[] })[]>;
  createLayby(companyId: number, data: InsertLayby & { items: InsertLaybyItem[]; createdBy?: string | null; branchId?: number | null }): Promise<Layby>;
  addLaybyPayment(laybyId: number, companyId: number, data: InsertLaybyPayment & { createdBy?: string | null; branchId?: number | null }): Promise<LaybyPayment>;

  // Invoices
  getInvoicesPaginated(companyId: number, page?: number, limit?: number, search?: string, status?: string, type?: string, dateFrom?: Date, dateTo?: Date, isPos?: boolean, branchId?: number): Promise<{ data: (Invoice & { customer?: Customer; latestError?: { message: string, color: string }; relatedInvoiceNumber?: string | null; linkedDocuments?: Array<{ id: number; invoiceNumber: string; transactionType: string | null }> })[]; total: number; pages: number }>;
  getInvoices(companyId: number, branchId?: number): Promise<(Invoice & { customer?: Customer })[]>;
  getInvoice(id: number): Promise<(Invoice & { items: (InvoiceItem & { product?: Product })[]; customer?: Customer; validationErrors?: any[]; relatedInvoiceNumber?: string; relatedInvoiceDate?: Date | null; relatedFiscalCode?: string; relatedReceiptGlobalNo?: number; relatedReceiptCounter?: number }) | undefined>;
  getInvoiceWithItems(id: number): Promise<(Invoice & { items: (InvoiceItem & { product?: Product })[]; customer?: Customer; validationErrors?: any[]; relatedInvoiceNumber?: string; relatedInvoiceDate?: Date | null; relatedFiscalCode?: string; relatedReceiptGlobalNo?: number; relatedReceiptCounter?: number }) | undefined>;
  createInvoice(invoice: CreateInvoiceRequest): Promise<Invoice>;
  createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice>;
  deleteInvoice(id: number): Promise<void>;
  fiscalizeInvoice(id: number, fiscalData: { fiscalCode: string; qrCodeData: string; fiscalSignature?: string; fiscalDayNo?: number; receiptCounter?: number; receiptGlobalNo?: number; syncedWithFdms?: boolean; fdmsStatus?: string; validationStatus?: string; lastValidationAttempt?: Date }): Promise<Invoice>;
  createValidationErrors(errors: Array<{ invoiceId: number; errorCode: string; errorMessage: string; errorColor: string; requiresPreviousReceipt: boolean }>): Promise<void>;

  // Tax Config
  getTaxTypes(companyId?: number): Promise<TaxType[]>;
  createTaxType(taxType: InsertTaxType & { companyId: number }): Promise<TaxType>;
  updateTaxType(id: number, companyId: number, taxType: Partial<InsertTaxType>): Promise<TaxType | undefined>;
  getTaxCategories(companyId?: number): Promise<TaxCategory[]>;
  createTaxCategory(category: InsertTaxCategory & { companyId: number }): Promise<TaxCategory>;
  updateTaxCategory(id: number, companyId: number, category: Partial<InsertTaxCategory>): Promise<TaxCategory | undefined>;
  syncTaxTypes(companyId: number, zimraTaxes: any[]): Promise<TaxType[]>;

  // Currencies
  getCurrencies(companyId: number): Promise<Currency[]>;
  createCurrency(currency: InsertCurrency): Promise<Currency>;
  updateCurrency(id: number, currency: Partial<InsertCurrency>): Promise<Currency>;
  deleteCurrency(id: number): Promise<void>;

  // User Management
  getCompanyUsers(companyId: number): Promise<(User & { role: string; companyRoleId?: number | null; companyRoleName?: string | null })[]>;
  addUserToCompany(userId: string, companyId: number, role: string, companyRoleId?: number): Promise<void>;
  updateUserRole(userId: string, companyId: number, role: string): Promise<void>;
  assignUserCompanyRole(userId: string, companyId: number, companyRoleId: number | null): Promise<void>;
  removeUserFromCompany(userId: string, companyId: number): Promise<void>;
  getCompanyUserRole(userId: string, companyId: number): Promise<string | undefined>;
  getCompanyMembership(userId: string, companyId: number): Promise<{ legacyRole: string; companyRoleId: number | null } | undefined>;

  // Roles & Permissions
  seedDefaultRolesForCompany(companyId: number): Promise<void>;
  getCompanyRoles(companyId: number): Promise<(CompanyRole & { permissions: string[] })[]>;
  getCompanyRole(roleId: number, companyId: number): Promise<(CompanyRole & { permissions: string[] }) | undefined>;
  createCompanyRole(companyId: number, data: { name: string; description?: string; permissions: string[] }): Promise<CompanyRole & { permissions: string[] }>;
  updateCompanyRole(roleId: number, companyId: number, data: { name?: string; description?: string; permissions?: string[] }): Promise<CompanyRole & { permissions: string[] }>;
  deleteCompanyRole(roleId: number, companyId: number): Promise<void>;
  getRolePermissions(roleId: number): Promise<string[]>;

  // Approvals
  createApprovalRequest(data: InsertApprovalRequest): Promise<ApprovalRequest>;
  getApprovalRequest(id: number, companyId: number): Promise<ApprovalRequest | undefined>;
  getApprovalRequests(companyId: number, status?: string): Promise<(ApprovalRequest & { requesterName?: string; reviewerName?: string })[]>;
  updateApprovalRequest(id: number, companyId: number, data: Partial<ApprovalRequest>): Promise<ApprovalRequest>;
  getPendingApprovalCount(companyId: number): Promise<number>;

  // Partnerships
  getCompanyPartners(companyId: number, includeInactive?: boolean): Promise<CompanyPartner[]>;
  getCompanyPartner(partnerId: number, companyId: number): Promise<CompanyPartner | undefined>;
  createCompanyPartner(companyId: number, data: Partial<InsertCompanyPartner>): Promise<CompanyPartner>;
  updateCompanyPartner(partnerId: number, companyId: number, data: Partial<InsertCompanyPartner>): Promise<CompanyPartner>;
  deactivateCompanyPartner(partnerId: number, companyId: number): Promise<void>;
  getReportPartnershipSales(companyId: number, startDate: Date, endDate: Date, partnerId?: number): Promise<{
    summary: { partnerId: number | null; partnerName: string; invoiceCount: number; grossTotal: number; partnerShare: number; issuerShare: number }[];
    invoices: any[];
  }>;

  // Analytics
  getCompanyStats(companyId: number): Promise<{ totalRevenue: number; pendingAmount: number; invoicesCount: number; customersCount: number }>;
  getRevenueOverTime(companyId: number, days?: number): Promise<{ date: string; amount: number }[]>;
  getReceivablesAging(companyId: number): Promise<{
    total: number;
    current: number;
    days1_15: number;
    days16_30: number;
    days31_45: number;
    above45: number;
  }>;
  getFiscalYearStats(companyId: number): Promise<{
    totalSales: number;
    totalReceipts: number;
    totalExpenses: number;
    monthlyData: { month: string; sales: number; expenses: number }[];
  }>;
  calculateFiscalCounters(companyId: number, fiscalDayNo: number): Promise<FiscalDayCounter[]>;

  // Locking
  lockInvoice(id: number, userId: string): Promise<boolean>;
  unlockInvoice(id: number, userId: string): Promise<void>;

  // Atomic counter claim — prevents race conditions on concurrent fiscalizations
  claimNextReceiptNumbers(companyId: number, branchId?: number): Promise<{ receiptGlobalNo: number; receiptCounter: number }>;

  // Utils
  getNextInvoiceNumber(companyId: number, prefix: string): Promise<string>;
  generateNextDeviceSerial(companyId: number): Promise<string>;

  // Payments
  createPayment(payment: InsertPayment & { companyId: number; skipLedger?: boolean }): Promise<Payment>;
  getPayments(invoiceId: number): Promise<Payment[]>;
  getPayment(id: number): Promise<(Payment & { invoice?: Invoice; customer?: Customer; company?: Company }) | undefined>;
  deletePayment(id: number): Promise<void>;

  // Reports
  getStatementData(customerId: number, startDate: Date, endDate: Date, currency?: string): Promise<{
    customer: Customer;
    openingBalance: number;
    closingBalance: number;
    transactions: any[];
  }>;
  getSalesReport(companyId: number, startDate: Date, endDate: Date, cashierId?: string, ownerGroup?: string): Promise<any[]>;
  getPaymentsReport(companyId: number, startDate: Date, endDate: Date): Promise<any[]>;
  getFiscalReportData(companyId: number, date: Date, cashierId?: string): Promise<any>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(companyId: number, limit?: number): Promise<AuditLog[]>;

  // Recurring Invoices
  getRecurringInvoices(companyId: number): Promise<RecurringInvoice[]>;
  getDueRecurringInvoices(): Promise<RecurringInvoice[]>;
  createRecurringInvoice(data: InsertRecurringInvoice): Promise<RecurringInvoice>;
  updateRecurringInvoice(id: number, data: Partial<InsertRecurringInvoice>): Promise<RecurringInvoice>;
  deleteRecurringInvoice(id: number): Promise<void>;

  // Quotations
  getQuotations(companyId: number): Promise<Quotation[]>;
  getQuotation(id: number): Promise<(Quotation & { items: QuotationItem[]; customer?: Customer }) | undefined>;
  getInvoice(id: number): Promise<(Invoice & { items: (InvoiceItem & { product?: Product })[]; customer?: Customer; validationErrors?: any[]; relatedInvoiceNumber?: string; relatedInvoiceDate?: Date | null; relatedFiscalCode?: string; relatedReceiptGlobalNo?: number; relatedReceiptCounter?: number }) | undefined>;
  createQuotation(data: InsertQuotation & { items: InsertQuotationItem[] }): Promise<Quotation>;

  updateQuotation(id: number, data: Partial<InsertQuotation> & { items?: InsertQuotationItem[] }): Promise<Quotation>;
  deleteQuotation(id: number): Promise<void>;
  getNextQuotationNumber(companyId: number): Promise<string>;

  // ZIMRA Logs
  createZimraLog(log: InsertZimraLog): Promise<ZimraLog>;
  getZimraLogs(invoiceId: number): Promise<ZimraLog[]>;
  getCompanyZimraLogs(companyId: number, limit?: number): Promise<ZimraLog[]>;
  // ZIMRA Helpers
  resolveGreyErrors(companyId: number, fiscalDayNo: number, skipInvoiceId?: number): Promise<void>;
  getInvoicesByFiscalDay(companyId: number, fiscalDayNo: number): Promise<Invoice[]>;
  getAllCompanies(): Promise<Company[]>;

  // Subscriptions
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  getSubscription(id: number): Promise<Subscription | undefined>;
  getSubscriptionByReference(reference: string): Promise<Subscription | undefined>;
  updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription>;
  getActiveSubscriptionByDevice(companyId: number, deviceSerialNo: string, macAddress: string): Promise<Subscription | undefined>;
  getSubscriptionsByCompany(companyId: number): Promise<Subscription[]>;
  hasActiveSubscriptionByMac(companyId: number, macAddress: string): Promise<boolean>;

  // POS
  getPosHolds(companyId: number, userId: string, branchId?: number): Promise<PosHold[]>;
  createPosHold(data: InsertPosHold): Promise<PosHold>;
  deletePosHold(id: number, userId: string): Promise<void>;
  bulkConvertServicesToProducts(companyId: number, productIds: number[]): Promise<void>;
  getPosShifts(companyId: number, userId: string, branchId?: number): Promise<PosShift[]>;
  getActivePosShift(companyId: number, userId: string, branchId?: number): Promise<PosShift | undefined>;
  getPosSales(companyId: number, startDate: Date, endDate: Date, cashierId?: string, paymentMethod?: string, status?: string, search?: string, branchId?: number, ownerGroup?: string): Promise<any[]>;
  getFinancialSummary(companyId: number, dateFrom?: Date, dateTo?: Date, cashierId?: string, drillDown?: boolean, ownerGroup?: string): Promise<any>;
  getARAgingReport(companyId: number, asOfDate?: Date): Promise<any[]>;
  getAPAgingReport(companyId: number, asOfDate?: Date): Promise<any[]>;
  getCostCenterReport(companyId: number, startDate?: Date, endDate?: Date): Promise<any[]>;

  // Fixed Assets
  getFixedAssets(companyId: number): Promise<FixedAsset[]>;
  createFixedAsset(data: InsertFixedAsset & { accumulatedDepreciation?: number, netBookValue?: number }): Promise<FixedAsset>;
  runDepreciation(companyId: number, asOfDate: Date, userId: string): Promise<{ success: boolean; depreciatedCount: number; amount: number }>;
  getDepreciationRuns(companyId: number): Promise<any[]>;
  
  // Financial Periods
  getFinancialPeriods(companyId: number): Promise<FinancialPeriod[]>;
  createFinancialPeriod(data: InsertFinancialPeriod): Promise<FinancialPeriod>;
  toggleFinancialPeriod(id: number, status: string): Promise<FinancialPeriod>;
  runYearEndClose(companyId: number, asOfDate: Date, currentYearEarningsCode?: string, retainedEarningsCode?: string): Promise<void>;
  createPosShift(data: InsertPosShift): Promise<PosShift>;
  updatePosShift(id: number, userId: string, data: Partial<PosShift>): Promise<PosShift>;

  // Product Categories
  getProductCategories(companyId: number): Promise<ProductCategory[]>;
  createProductCategory(data: InsertProductCategory & { companyId: number }): Promise<ProductCategory>;
  deleteProductCategory(id: number, companyId: number): Promise<void>;

  // Reports
  getSalesByCategory(companyId: number, startDate: Date, endDate: Date): Promise<{ category: string; totalSales: number; count: number; byCurrency?: Record<string, number> }[]>;
  getSalesByUser(companyId: number, startDate: Date, endDate: Date): Promise<{ userId: string; userName: string; totalSales: number; count: number; byCurrency?: Record<string, number> }[]>;
  getProductPerformance(companyId: number, startDate: Date, endDate: Date, isPosOnly?: boolean): Promise<{ productId: number; productName: string; quantity: number; revenue: number }[]>;

  // Maintenance
  clearTestInvoices(companyId: number): Promise<number>;

  // Suppliers
  getSuppliers(companyId: number): Promise<(Supplier & { balance?: number })[]>;
  getSupplier(id: number): Promise<Supplier | undefined>;
  createSupplier(data: InsertSupplier & { companyId: number }): Promise<Supplier>;
  updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  createSupplierInvoice(data: InsertSupplierInvoice & { items: InsertSupplierInvoiceItem[], createdBy?: string }): Promise<SupplierInvoice>;
  createSupplierPayment(data: InsertSupplierPayment): Promise<SupplierPayment>;
  getSupplierInvoices(companyId: number): Promise<any[]>;
  getSupplierPayments(companyId: number): Promise<any[]>;

  // Inventory Transactions
  getInventoryTransactions(companyId: number, productId?: number, ownerGroup?: string): Promise<InventoryTransaction[]>;
  createInventoryTransaction(data: InsertInventoryTransaction & { companyId: number }): Promise<InventoryTransaction>;
  createInventoryValuationSnapshot(companyId: number, asOfDate: Date, userId?: string, branchId?: number): Promise<any>;

  // Expenses
  getExpenses(companyId: number): Promise<Expense[]>;
  createExpense(data: InsertExpense & { companyId: number }): Promise<Expense>;
  updateExpense(id: number, data: Partial<InsertExpense>): Promise<Expense | undefined>;

  // Reports & Analytics
  getStockValuationReport(companyId: number, ownerGroup?: string): Promise<any[]>;

  // Report Module Methods
  getReportSalesSummary(companyId: number, start: Date, end: Date): Promise<{ date: string; invoiceCount: number; subtotal: string; taxAmount: string; total: string }[]>;
  getReportSalesByCustomer(companyId: number, start: Date, end: Date): Promise<{ customerId: number; customerName: string; invoiceCount: number; total: string }[]>;
  getReportSalesByItem(companyId: number, start: Date, end: Date): Promise<{ productId: number | null; description: string; quantitySold: string; revenue: string }[]>;
  getReportSalesBySalesperson(companyId: number, start: Date, end: Date): Promise<{ userId: string; userName: string; invoiceCount: number; total: string }[]>;
  getReportArAgingSummary(companyId: number, start: Date, end: Date): Promise<{ customerId: number; customerName: string; current: string; days31_60: string; days61_90: string; days90plus: string; total: string }[]>;
  getReportArAgingDetails(companyId: number, start: Date, end: Date): Promise<{ invoiceId: number; invoiceNumber: string; customerName: string; dueDate: string; daysOverdue: number; balanceDue: string; bucket: "current" | "31-60" | "61-90" | "90+" }[]>;
  getReportInvoiceDetails(companyId: number, start: Date, end: Date): Promise<{ invoiceId: number; invoiceNumber: string; customerName: string; issueDate: string; dueDate: string; status: string; total: string; paidAmount: string; balanceDue: string }[]>;
  getReportQuoteDetails(companyId: number, start: Date, end: Date): Promise<{ quotationId: number; quotationNumber: string; customerName: string; issueDate: string; expiryDate: string | null; status: string; total: string }[]>;
  getReportCustomerBalanceSummary(companyId: number, start: Date, end: Date): Promise<{ customerId: number; customerName: string; totalInvoiced: string; totalPaid: string; balance: string }[]>;
  getReportReceivableSummary(companyId: number, start: Date, end: Date): Promise<{ totalInvoiced: string; totalCollected: string; totalOutstanding: string }>;
  getReportReceivableDetails(companyId: number, start: Date, end: Date): Promise<{ invoiceId: number; invoiceNumber: string; customerName: string; issueDate: string; total: string; paidAmount: string; balanceDue: string; status: string }[]>;
  getReportBadDebts(companyId: number, start: Date, end: Date): Promise<{ invoiceId: number; invoiceNumber: string; customerName: string; dueDate: string; daysOverdue: number; balanceDue: string }[]>;
  getReportBankCharges(companyId: number, start: Date, end: Date): Promise<{ paymentId: number; invoiceNumber: string; customerName: string; paymentDate: string; reference: string; amount: string }[]>;
  getReportTimeToGetPaid(companyId: number, start: Date, end: Date): Promise<{ invoiceId: number; invoiceNumber: string; customerName: string; issueDate: string; paymentDate: string; daysToPayment: number; amount: string }[]>;
  getReportRefundHistory(companyId: number, start: Date, end: Date): Promise<{ invoiceId: number; invoiceNumber: string; customerName: string; issueDate: string; amount: string; relatedInvoiceNumber: string | null }[]>;
  getReportWithholdingTax(companyId: number, start: Date, end: Date): Promise<{ invoiceId: number; invoiceNumber: string; customerName: string; issueDate: string; withheldAmount: string; total: string }[]>;
  getReportExpenseDetails(companyId: number, start: Date, end: Date): Promise<{ expenseId: number; expenseDate: string; category: string; description: string; supplierName: string | null; paymentMethod: string | null; reference: string | null; amount: string; currency: string }[]>;
  getReportExpensesByCategory(companyId: number, start: Date, end: Date): Promise<{ category: string; total: string; percentage: string; count: number }[]>;
  getReportExpensesByCustomer(companyId: number, start: Date, end: Date): Promise<{ supplierId: number | null; supplierName: string; total: string; count: number }[]>;
  getReportExpensesByProject(companyId: number, start: Date, end: Date): Promise<{ project: string; total: string; count: number }[]>;
  getReportBillableExpenseDetails(companyId: number, start: Date, end: Date): Promise<{ expenseId: number; expenseDate: string; category: string; description: string; amount: string; status: string }[]>;
  getReportTaxSummary(companyId: number, start: Date, end: Date): Promise<{ taxCode: string; taxName: string; taxRate: string; taxableAmount: string; outputTax: string; inputTax: string; netVat: string }[]>;
  getHourlySalesDistribution(companyId: number, startDate: Date, endDate: Date): Promise<{ hour: number; count: number; total: number }[]>;
  getOperationalMetrics(companyId: number, startDate: Date, endDate: Date): Promise<{ atv: number; profitMargin: number; itemsPerReceipt: number; totalRevenue: number; totalCogs: number; totalRevenueByCurrency?: Record<string, number> }>;
  getLowStockItems(companyId: number): Promise<(Product & { categoryName?: string })[]>;
  getReportStockOnHand(companyId: number, ownerGroup?: string): Promise<{ productId: number; name: string; sku: string | null; category: string | null; stockLevel: string; unitCost: string; totalValue: string }[]>;
  getReportInventoryMovements(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; type: string; quantity: string; unitCost: string | null; reference: string | null; notes: string | null }[]>;
  getReportStockAdjustments(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; sku: string | null; type: string; quantity: string; unitCost: string | null; totalCost: string | null; referenceType: string | null; reference: string | null; notes: string | null; userName: string | null }[]>;
  getReportPurchaseHistory(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; supplierName: string | null; quantity: string; unitCost: string; totalCost: string; reference: string | null }[]>;
  getReportAutoSparesDailySales(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportTopSellingParts(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportDeadStock(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportProfitMargins(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportSupplierPerformance(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportCustomerCredit(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportSalespersonPerformance(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportCategoryBrandPerformance(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportReturnWarranty(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportReorderSuggestions(companyId: number, start: Date, end: Date): Promise<any[]>;
  getReportPriceChanges(companyId: number, start: Date, end: Date): Promise<any[]>;
  getOperationalDailyReport(companyId: number, start: Date, end: Date): Promise<any>;
  getOperationalWeeklyReport(companyId: number, start: Date, end: Date): Promise<any>;
  getOperationalMonthlyReport(companyId: number, start: Date, end: Date): Promise<any>;
  getStockMovementReport(companyId: number, start: Date, end: Date): Promise<any>;

  // Stock Takes
  getStockTakes(companyId: number): Promise<StockTake[]>;
  getStockTake(id: number): Promise<(StockTake & { items: (StockTakeItem & { product: Product })[] }) | undefined>;
  createStockTake(data: InsertStockTake): Promise<StockTake>;
  updateStockTake(id: number, data: Partial<StockTake>): Promise<StockTake>;
  createStockTakeItems(items: InsertStockTakeItem[]): Promise<void>;
  updateStockTakeItem(id: number, data: Partial<StockTakeItem>): Promise<void>;
  deleteStockTakeItem(id: number): Promise<void>;

  // Restaurant & BOM
  getRestaurantSections(companyId: number): Promise<RestaurantSection[]>;
  createRestaurantSection(section: InsertRestaurantSection): Promise<RestaurantSection>;
  getRestaurantTables(sectionId: number): Promise<RestaurantTable[]>;
  updateRestaurantTable(id: number, table: Partial<RestaurantTable>): Promise<RestaurantTable>;
  createRestaurantTable(table: InsertRestaurantTable): Promise<RestaurantTable>;
  getRecipeItems(productId: number): Promise<any[]>;
  setRecipeItems(productId: number, items: InsertRecipeItem[]): Promise<void>;

  // Pharmacy / Batches / Variations
  getProductVariations(productId: number): Promise<ProductVariation[]>;
  createProductVariation(variation: InsertProductVariation): Promise<ProductVariation>;
  getProductBatches(productId: number): Promise<ProductBatch[]>;
  getExpiringBatches(companyId: number, days: number): Promise<any[]>;
  createProductBatch(batch: InsertProductBatch): Promise<ProductBatch>;
  getActiveBatches(productId: number): Promise<ProductBatch[]>;

  // Order Status Display (Restaurant)
  getActiveOrders(companyId: number): Promise<any[]>;

  // Branches
  getBranches(companyId: number): Promise<Branch[]>;
  getBranch(id: number): Promise<Branch | undefined>;
  createBranch(data: InsertBranch): Promise<Branch>;
  updateBranch(id: number, data: Partial<Branch>): Promise<Branch>;
  deleteBranch(id: number): Promise<void>;
  getUserBranches(userId: string): Promise<Branch[]>;
  addUserToBranch(userId: string, branchId: number, role?: string): Promise<void>;

  // Cost Centers
  getCostCenters(companyId: number): Promise<CostCenter[]>;
  getCostCenter(id: number): Promise<CostCenter | undefined>;
  createCostCenter(data: InsertCostCenter): Promise<CostCenter>;
  updateCostCenter(id: number, data: Partial<CostCenter>): Promise<CostCenter>;
  deleteCostCenter(id: number): Promise<void>;

  // Branch Stock
  getBranchStock(branchId: number, productId: number): Promise<BranchStock | undefined>;
  updateBranchStock(branchId: number, productId: number, stockLevel: string): Promise<void>;
  getBranchStocks(branchId: number): Promise<(BranchStock & { product: Product })[]>;

  // Price Adjustments
  recordPriceAdjustment(data: InsertPriceAdjustment): Promise<PriceAdjustment>;
  getPriceHistory(productId: number, variationId?: number): Promise<(PriceAdjustment & { user?: { username: string } })[]>;

  // Combined Inventory Adjustments
  adjustInventory(companyId: number, data: { productId: number, branchId?: number, quantity: string | number, type: string, notes?: string, userId: string }): Promise<void>;

  // Accounting
  getAccounts(companyId: number): Promise<Account[]>;
  getAccountById(id: number): Promise<Account | undefined>;
  getAccountByCode(companyId: number, code: string): Promise<Account | undefined>;
  createAccount(data: InsertAccount): Promise<Account>;
  initializeCompanyAccounts(companyId: number): Promise<void>;
  getJournalEntries(companyId: number, dateFrom?: Date, dateTo?: Date): Promise<any[]>;
  getJournalEntryDrafts(companyId: number): Promise<any[]>;
  createJournalEntryDraft(companyId: number, data: InsertJournalEntryDraft & { lines: LedgerPostLine[] }): Promise<any>;
  postJournalEntryDraft(companyId: number, draftId: number, userId?: string): Promise<JournalEntry>;
  getLedgerEntries(companyId: number, accountId?: number, dateFrom?: Date, dateTo?: Date): Promise<any[]>;
  getTrialBalance(companyId: number, date?: Date): Promise<any[]>;
  getVatReturn(companyId: number, fromDate?: Date, toDate?: Date): Promise<{ outputVat: number; inputVat: number; netVat: number; inputVatBreakdown?: any[]; outputVatBreakdown?: any[] }>;
  postToLedger(companyId: number, entryData: LedgerPostData, tx?: any): Promise<JournalEntry>;
  
  // Bank Reconciliation
  uploadBankStatement(data: InsertBankStatement, lines: InsertBankStatementLine[]): Promise<BankStatement>;
  getBankStatements(companyId: number, accountId?: number): Promise<BankStatement[]>;
  getBankStatementLines(statementId: number): Promise<BankStatementLine[]>;
  getUnreconciledLedger(companyId: number, accountId: number): Promise<any[]>;
  reconcileBankLine(lineId: number, ledgerEntryId: number): Promise<void>;
  autoReconcile(statementId: number): Promise<number>;
  createCashTransaction(data: { companyId: number, type: 'RECEIPT' | 'PAYMENT', bankAccountId: number, counterpartyAccountId: number, amount: number, date: Date, description: string, reference?: string, createdBy?: string }): Promise<JournalEntry>;

  // Recovered Methods
  getBudgets(companyId: number): Promise<any[]>;
  createBudget(data: any): Promise<any>;
  getCostAllocationRules(companyId: number): Promise<any[]>;
  createCostAllocationRule(data: any): Promise<any>;
  runCostAllocations(companyId: number, asOfDate: Date, userId: string): Promise<any>;
  getConsolidatedTrialBalance(companyId: number, asOfDate: Date): Promise<any[]>;
  runConsolidationEliminations(companyId: number, asOfDate: Date, userId: string): Promise<any>;
  createBillOfMaterial(data: any): Promise<any>;
  createWorkOrder(data: any): Promise<any>;
  completeWorkOrder(id: number, qty: number, userId: string): Promise<any>;
  disposeFixedAsset(assetId: number, companyId: number, disposalDate: Date, disposalType: string, proceedsAmount: string, notes: string, userId: string): Promise<any>;
  runForexRevaluation(companyId: number, date: Date, userId: string): Promise<any>;
  createAndReconcile(statementLineId: number, targetAccountId: number, description: string, userId: string): Promise<any>;

  // Payroll Elements & Audits
  createPayrollElement(data: InsertPayrollElement): Promise<PayrollElement>;
  updatePayrollElement(id: number, data: Partial<InsertPayrollElement>): Promise<PayrollElement>;
  deletePayrollElement(id: number): Promise<void>;
  listPayrollElements(companyId: number): Promise<PayrollElement[]>;
  createPayrollAudit(data: InsertPayrollCalculationAudit): Promise<PayrollCalculationAudit>;
  listPayrollAudits(runEmployeeId: number): Promise<PayrollCalculationAudit[]>;
}

export class DatabaseStorage implements IStorage {
  private roundMoney(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private async normalizeLedgerLines(companyId: number, lines: LedgerPostLine[], tx: any = db): Promise<Array<{
    accountId: number;
    accountCode: string;
    accountName: string;
    type: "DEBIT" | "CREDIT";
    amount: number;
    memo?: string;
  }>> {
    const normalized = [];

    for (const line of lines || []) {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      const amount = Number(line.amount ?? (debit > 0 ? debit : credit));
      const type = line.type ?? (debit > 0 ? "DEBIT" : "CREDIT");
      if (!amount || amount <= 0) continue;

      if (type !== "DEBIT" && type !== "CREDIT") {
        throw new Error("Journal lines must be marked as DEBIT or CREDIT");
      }

      const accountWhere = line.accountCode
        ? and(eq(accounts.companyId, companyId), eq(accounts.code, line.accountCode))
        : and(eq(accounts.companyId, companyId), eq(accounts.id, Number(line.accountId)));
      const [account] = await tx.select().from(accounts).where(accountWhere);
      if (!account) {
        const identifier = line.accountCode ? `code ${line.accountCode}` : `ID ${line.accountId}`;
        throw new Error(`Account ${identifier} not found for company ${companyId}`);
      }

      normalized.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        type,
        amount,
        memo: line.memo,
      });
    }

    return normalized;
  }

  private assertBalancedLedgerLines(lines: Array<{ type: "DEBIT" | "CREDIT"; amount: number }>) {
    if (lines.length < 2) {
      throw new Error("A journal entry must contain at least two lines");
    }

    const totalDebit = lines
      .filter((line) => line.type === "DEBIT")
      .reduce((sum, line) => sum + Number(line.amount), 0);
    const totalCredit = lines
      .filter((line) => line.type === "CREDIT")
      .reduce((sum, line) => sum + Number(line.amount), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(`Journal entry is out of balance. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`);
    }
  }

  private async checkControlAccounts(companyId: number, lines: Array<{ accountId: number; accountName: string; accountCode: string }>, referenceType?: string, tx: any = db) {
    const isManual = !referenceType || ["JOURNAL", "MANUAL", "GENERAL"].includes(referenceType);
    if (!isManual) return; // Permit system postings

    const accountIds = lines.map(line => line.accountId);
    if (accountIds.length === 0) return;

    // Check if any of these accounts are control accounts
    const controlAccounts = await tx.select({
      id: accounts.id,
      name: accounts.name,
      code: accounts.code
    })
    .from(accounts)
    .where(and(
      eq(accounts.companyId, companyId),
      eq(accounts.isControlAccount, true),
      inArray(accounts.id, accountIds)
    ));

    if (controlAccounts.length > 0) {
      const names = controlAccounts.map((a: any) => `${a.name} (${a.code})`).join(", ");
      throw new Error(`Cannot manually post to Control Account(s): ${names}. Control accounts only accept system-generated postings.`);
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updateUser: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updateUser)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setUserPin(userId: string, pin: string): Promise<void> {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(pin, salt, 64)) as Buffer;
    const hashedPin = `${buf.toString("hex")}.${salt}`;

    await db.update(users)
      .set({ pin: hashedPin })
      .where(eq(users.id, userId));
  }

  async verifyUserPin(userId: string, pin: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || !user.pin) return false;

    const [hashed, salt] = user.pin.split(".");
    const buf = (await scryptAsync(pin, salt, 64)) as Buffer;
    const computed = buf.toString("hex");

    // Console log for debugging
    console.log(`[VERIFY] ID: ${userId}, Stored: ${hashed}, Computed: ${computed}`);

    return computed === hashed;
  }

  async createCompany(company: InsertCompany, userId: string): Promise<Company> {
    return await db.transaction(async (tx) => {
      const normalizedCompany = {
        ...company,
        tin: company.tin?.trim() || null,
        vatNumber: company.vatNumber?.trim() || null,
        bpNumber: company.bpNumber?.trim() || null,
        vatEnabled: !!company.vatNumber?.trim(),
        vatRegistered: !!company.vatNumber?.trim(),
      };
      const [newCompany] = await tx.insert(companies).values(normalizedCompany).returning();
      await tx.insert(companyUsers).values({
        userId,
        companyId: newCompany.id,
        role: "admin"
      });

      // Initialize default Chart of Accounts
      await this.initializeCompanyAccounts(newCompany.id, tx);

      // Automatically create default currencies (USD and ZIG)
      await tx.insert(currencies).values([
        {
          companyId: newCompany.id,
          code: "USD",
          name: "US Dollar",
          symbol: "$",
          exchangeRate: "1.000000",
          isBase: true,
          isActive: true
        },
        {
          companyId: newCompany.id,
          code: "ZWG",
          name: "Zimbabwe Gold",
          symbol: "ZWG",
          exchangeRate: "13.500000",
          isBase: false,
          isActive: true
        }
      ]);

      return newCompany;
    });
  }


  async createResetToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    await db.insert(resetTokens).values({
      userId,
      token,
      expiresAt,
      used: false,
      createdAt: new Date()
    });

    return token;
  }

  async verifyResetToken(token: string): Promise<string | null> {
    const [record] = await db
      .select()
      .from(resetTokens)
      .where(eq(resetTokens.token, token));

    if (!record) return null;
    if (record.used) return null;
    if (new Date() > record.expiresAt) return null;

    return record.userId;
  }

  async consumeResetToken(token: string): Promise<void> {
    await db
      .update(resetTokens)
      .set({ used: true })
      .where(eq(resetTokens.token, token));
  }

  // Companies
  async getCompanies(userId: string): Promise<(Company & { role: string })[]> {
    const user = await this.getUser(userId);
    const isSystemAdmin = user?.email === 'admin@zimra.co.zw';
    console.log(`[STORAGE] getCompanies for user: ${userId}, email: ${user?.email}, isSuper: ${user?.isSuperAdmin}, isSystemAdmin: ${isSystemAdmin}`);

    if (user?.isSuperAdmin) {
      let allCompanies = await db.select().from(companies);
      
      // Only the system admin may see these restricted companies.
      if (!isSystemAdmin) {
        const systemAdminOnlyCompanies = new Set(['goosehill trading', 'glorious tire services', 'spares arena']);
        allCompanies = allCompanies.filter(c => {
          const companyName = (c.name || "").toLowerCase();
          const tradingName = (c.tradingName || "").toLowerCase();
          const isSystemOnly = systemAdminOnlyCompanies.has(companyName) || systemAdminOnlyCompanies.has(tradingName);
          return !isSystemOnly && c.superadminVisible !== false;
        });
      }

      console.log(`[STORAGE] Superuser ${userId} found ${allCompanies.length} accessible companies`);
      return allCompanies.map(c => ({ ...c, role: "owner" }));
    }

    const result = await db
      .select({
        company: companies,
        role: companyUsers.role
      })
      .from(companyUsers)
      .innerJoin(companies, eq(companyUsers.companyId, companies.id))
      .where(eq(companyUsers.userId, userId));

    return result.map(r => ({
      ...r.company,
      role: r.role || "member"
    }));
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getCompanyByApiKey(apiKey: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.apiKey, apiKey));
    return company;
  }

  async getSystemAccountCode(companyId: number, key: AccountingSystemAccountKey, tx?: any): Promise<string> {
    const executor = tx || db;
    const [company] = await executor
      .select({ accountingSettings: companies.accountingSettings })
      .from(companies)
      .where(eq(companies.id, companyId));
    return mergeAccountingSystemAccounts(company?.accountingSettings)[key];
  }

  async ensureGenericCustomer(companyId: number): Promise<number> {
    const [c] = await db.select().from(customers).where(and(eq(customers.companyId, companyId), ilike(customers.name, 'General%')));
    if (c) return c.id;
    const [nc] = await db.insert(customers).values({
      companyId,
      name: 'General Customer',
      customerType: 'individual',
      isActive: true,
      currency: 'USD'
    }).returning();
    return nc.id;
  }

  async generateNextDeviceSerial(companyId: number): Promise<string> {
    // Get the highest device serial number across ALL companies to ensure global uniqueness (or per company if preferred)
    // The user requested "starting with FS-00001 going upwards" which implies a global or incremental sequence.
    // However, usually serial numbers are unique identifiers. Let's find the max FS- number in the system.
    const allSerials = await db
      .select({ fdmsDeviceSerialNo: companies.fdmsDeviceSerialNo })
      .from(companies)
      .where(
        and(
          sql`${companies.fdmsDeviceSerialNo} IS NOT NULL`,
          sql`${companies.fdmsDeviceSerialNo} != ''`
        )
      );

    let maxNumber = 0;
    for (const item of allSerials) {
      if (item.fdmsDeviceSerialNo) {
        const match = item.fdmsDeviceSerialNo.match(/FS-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    }

    const nextNumber = maxNumber + 1;
    return `FS-${nextNumber.toString().padStart(5, '0')}`;
  }

  async getCustomers(companyId: number): Promise<(Customer & { balance?: number })[]> {
    const results = await db.select({
      customer: customers,
      balance: sql<number>`COALESCE(SUM(
        CASE 
          WHEN ${invoices.status} NOT IN ('draft', 'cancelled') 
          THEN ${invoices.total} - ${invoices.paidAmount} 
          ELSE 0 
        END
      ), 0)`
    })
    .from(customers)
    .leftJoin(invoices, eq(customers.id, invoices.customerId))
    .where(
      and(
        eq(customers.companyId, companyId),
        eq(customers.isActive, true)
      )
    )
    .groupBy(customers.id);

    return results.map(r => ({
      ...r.customer,
      balance: Number(r.balance)
    }));
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values(customer).returning();
    return newCustomer;
  }

  async updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer> {
    const [updated] = await db.update(customers).set(customer).where(eq(customers.id, id)).returning();
    return updated;
  }

  async getProducts(companyId: number, branchId?: number, ownerGroup?: string): Promise<(Product & { branchStock?: string })[]> {
    const baseFilters: any[] = [eq(products.companyId, companyId), eq(products.isActive, true)];
    const ownerGroups = parseOwnerGroups(ownerGroup);
    if (ownerGroups.length === 1) {
      baseFilters.push(eq(products.ownerGroup, ownerGroups[0]));
    } else if (ownerGroups.length > 1) {
      baseFilters.push(inArray(products.ownerGroup, ownerGroups));
    }

    if (branchId) {
      const result = await db
        .select({
          product: products,
          branchStock: branchStocks.stockLevel
        })
        .from(products)
        .leftJoin(branchStocks, and(eq(branchStocks.productId, products.id), eq(branchStocks.branchId, branchId)))
        .where(and(...baseFilters));

      return result.map(r => ({ ...r.product, branchStock: r.branchStock || "0" }));
    }

    return await db.select().from(products).where(and(...baseFilters));
  }

  async getProductBySku(companyId: number, sku: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.companyId, companyId),
          eq(sql`lower(${products.sku})`, sku.toLowerCase()),
          eq(products.isActive, true)
        )
      );
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const data = { ...product };
    if (data.isTracked === false) {
      data.productType = 'service';
    }
    const [newProduct] = await db.insert(products).values(data as any).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const data = { ...product };
    if (data.isTracked === false) {
      data.productType = 'service';
    }
    const [updated] = await db.update(products).set(data as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async getProductSerialNumbers(companyId: number, productId?: number, status?: string): Promise<any[]> {
    const filters: any[] = [eq(productSerialNumbers.companyId, companyId)];
    if (productId) filters.push(eq(productSerialNumbers.productId, productId));
    if (status) filters.push(eq(productSerialNumbers.status, status));
    const rows = await db
      .select({
        id: productSerialNumbers.id,
        companyId: productSerialNumbers.companyId,
        branchId: productSerialNumbers.branchId,
        productId: productSerialNumbers.productId,
        serialNumber: productSerialNumbers.serialNumber,
        status: productSerialNumbers.status,
        supplierId: productSerialNumbers.supplierId,
        receivedInventoryTransactionId: productSerialNumbers.receivedInventoryTransactionId,
        soldInvoiceId: productSerialNumbers.soldInvoiceId,
        soldInvoiceItemId: productSerialNumbers.soldInvoiceItemId,
        soldAt: productSerialNumbers.soldAt,
        warrantyExpiresAt: productSerialNumbers.warrantyExpiresAt,
        notes: productSerialNumbers.notes,
        createdAt: productSerialNumbers.createdAt,
        updatedAt: productSerialNumbers.updatedAt,
        soldInvoiceNumber: invoices.invoiceNumber,
      })
      .from(productSerialNumbers)
      .leftJoin(invoices, eq(productSerialNumbers.soldInvoiceId, invoices.id))
      .where(and(...filters))
      .orderBy(desc(productSerialNumbers.createdAt));
    return rows;
  }

  async createProductSerialNumbers(data: Array<InsertProductSerialNumber & { companyId: number }>): Promise<ProductSerialNumber[]> {
    if (!data.length) return [];
    return await db.insert(productSerialNumbers).values(data as any).returning();
  }

  async updateProductSerialNumber(id: number, companyId: number, data: Partial<InsertProductSerialNumber>): Promise<ProductSerialNumber> {
    const [updated] = await db
      .update(productSerialNumbers)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(productSerialNumbers.id, id), eq(productSerialNumbers.companyId, companyId)))
      .returning();
    if (!updated) throw new Error("Serial number not found");
    return updated;
  }

  async getWarrantyClaims(companyId: number): Promise<WarrantyClaim[]> {
    return await db
      .select()
      .from(warrantyClaims)
      .where(eq(warrantyClaims.companyId, companyId))
      .orderBy(desc(warrantyClaims.createdAt));
  }

  async createWarrantyClaim(data: InsertWarrantyClaim & { companyId: number; createdBy?: string | null }): Promise<WarrantyClaim> {
    const claimNumber = data.claimNumber || await this.getNextInvoiceNumber(data.companyId, "WCL");
    const [claim] = await db.insert(warrantyClaims).values({ ...data, claimNumber } as any).returning();
    if (claim.serialNumberId) {
      await db.update(productSerialNumbers)
        .set({ status: "WARRANTY_CLAIM", updatedAt: new Date() } as any)
        .where(and(eq(productSerialNumbers.id, claim.serialNumberId), eq(productSerialNumbers.companyId, data.companyId)));
    }
    return claim;
  }

  async updateWarrantyClaim(id: number, companyId: number, data: Partial<InsertWarrantyClaim>): Promise<WarrantyClaim> {
    const [updated] = await db
      .update(warrantyClaims)
      .set(data as any)
      .where(and(eq(warrantyClaims.id, id), eq(warrantyClaims.companyId, companyId)))
      .returning();
    if (!updated) throw new Error("Warranty claim not found");
    return updated;
  }

  async getLaybys(companyId: number): Promise<(Layby & { items: LaybyItem[]; payments: LaybyPayment[] })[]> {
    const rows = await db.select().from(laybys).where(eq(laybys.companyId, companyId)).orderBy(desc(laybys.createdAt));
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [items, paymentsRows] = await Promise.all([
      db.select().from(laybyItems).where(inArray(laybyItems.laybyId, ids)),
      db.select().from(laybyPayments).where(inArray(laybyPayments.laybyId, ids)).orderBy(desc(laybyPayments.paymentDate)),
    ]);
    return rows.map((row) => ({
      ...row,
      items: items.filter((item) => item.laybyId === row.id),
      payments: paymentsRows.filter((payment) => payment.laybyId === row.id),
    }));
  }

  async createLayby(companyId: number, data: InsertLayby & { items: InsertLaybyItem[]; createdBy?: string | null; branchId?: number | null }): Promise<Layby> {
    return await db.transaction(async (tx) => {
      const laybyNumber = await this.getNextInvoiceNumber(companyId, "LAY");
      const [layby] = await tx.insert(laybys).values({
        ...data,
        companyId,
        laybyNumber,
        paidAmount: "0.00",
      } as any).returning();

      if (data.items?.length) {
        await tx.insert(laybyItems).values(data.items.map((item) => ({
          ...item,
          laybyId: layby.id,
        })) as any);

        for (const item of data.items as any[]) {
          const [product] = await tx.select().from(products).where(eq(products.id, item.productId));
          if (!product?.isTracked) continue;
          const quantity = Number(item.quantity || 0);
          if (quantity <= 0) continue;
          await tx.insert(inventoryTransactions).values({
            companyId,
            branchId: data.branchId || null,
            productId: item.productId,
            type: "RESERVED",
            quantity: (-quantity).toString(),
            referenceType: "LAYBY",
            referenceId: layby.id.toString(),
            notes: `Lay-by reservation ${layby.laybyNumber}`,
          } as any);
          await tx.update(products)
            .set({ stockLevel: (Number(product.stockLevel || 0) - quantity).toString() } as any)
            .where(eq(products.id, item.productId));

          if (data.branchId) {
            const [currentBranchStock] = await tx.select().from(branchStocks).where(and(
              eq(branchStocks.branchId, data.branchId),
              eq(branchStocks.productId, item.productId)
            ));
            const newBranchStock = (Number(currentBranchStock?.stockLevel || 0) - quantity).toString();
            await tx.insert(branchStocks)
              .values({ branchId: data.branchId, productId: item.productId, stockLevel: newBranchStock })
              .onConflictDoUpdate({
                target: [branchStocks.branchId, branchStocks.productId],
                set: { stockLevel: newBranchStock },
              });
          }
        }

        const serialIds = data.items.map((item: any) => item.serialNumberId).filter(Boolean);
        if (serialIds.length) {
          await tx.update(productSerialNumbers)
            .set({ status: "RESERVED", updatedAt: new Date() } as any)
            .where(and(eq(productSerialNumbers.companyId, companyId), inArray(productSerialNumbers.id, serialIds)));
        }
      }

      return layby;
    });
  }

  async addLaybyPayment(laybyId: number, companyId: number, data: InsertLaybyPayment & { createdBy?: string | null; branchId?: number | null }): Promise<LaybyPayment> {
    return await db.transaction(async (tx) => {
      const [layby] = await tx.select().from(laybys).where(and(eq(laybys.id, laybyId), eq(laybys.companyId, companyId)));
      if (!layby) throw new Error("Lay-by not found");
      if (layby.status !== "ACTIVE") throw new Error("Only active lay-bys can receive payments");

      const [payment] = await tx.insert(laybyPayments).values({
        ...data,
        laybyId,
        companyId,
      } as any).returning();

      const newPaidAmount = Number(layby.paidAmount || 0) + Number(data.amount || 0);
      const nextStatus = newPaidAmount + 0.005 >= Number(layby.total || 0) ? "COMPLETED" : "ACTIVE";
      await tx.update(laybys)
        .set({ paidAmount: newPaidAmount.toFixed(2), status: nextStatus, updatedAt: new Date() } as any)
        .where(eq(laybys.id, laybyId));

      return payment;
    });
  }

  async deleteCompanyProducts(companyId: number): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Identify non-test products for this company
      // We exclude any product that has "TEST" in its name (case-insensitive)
      const nonTestProducts = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.companyId, companyId),
            sql`LOWER(${products.name}) NOT LIKE '%test%'`
          )
        );

      const productIds = nonTestProducts.map(p => p.id);

      if (productIds.length === 0) return;

      // 2. Clear related data for these products

      // Nullify references in invoice items
      await tx.update(invoiceItems)
        .set({ productId: null })
        .where(inArray(invoiceItems.productId, productIds));

      // Nullify references in quotation items
      await tx.update(quotationItems)
        .set({ productId: null })
        .where(inArray(quotationItems.productId, productIds));

      // Delete inventory transactions
      await tx.delete(inventoryTransactions)
        .where(inArray(inventoryTransactions.productId, productIds));

      // 3. Clear company-wide product structures

      // Delete POS holds (since they contain cart snapshots)
      await tx.delete(posHolds)
        .where(eq(posHolds.companyId, companyId));

      // 4. Finally delete the products themselves
      await tx.delete(products)
        .where(inArray(products.id, productIds));

      // 5. Delete categories (only if they belong to this company)
      await tx.delete(productCategories)
        .where(eq(productCategories.companyId, companyId));
    });
  }

  async bulkConvertServicesToProducts(companyId: number, productIds: number[]): Promise<void> {

    if (productIds.length === 0) return;

    await db.update(products)
      .set({
        productType: 'good',
        isTracked: true
      })
      .where(and(
        eq(products.companyId, companyId),
        inArray(products.id, productIds)
      ));
  }

  async getProductsForExport(companyId: number): Promise<any[]> {
    return await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        sku: products.sku,
        barcode: products.barcode,
        price: products.price,
        costPrice: products.costPrice,
        taxRate: products.taxRate,
        taxCode: taxTypes.code,
        category: products.category,
        productType: products.productType,
        stockLevel: products.stockLevel,
        hsCode: products.hsCode,
        isTracked: products.isTracked,
        isActive: products.isActive
      })
      .from(products)
      .leftJoin(taxTypes, eq(products.taxTypeId, taxTypes.id))
      .where(and(
        eq(products.companyId, companyId),
        eq(products.isActive, true)
      ));
  }

  async getInvoices(companyId: number, branchId?: number): Promise<(Invoice & { customer?: Customer })[]> {
    const filters: any[] = [eq(invoices.companyId, companyId)];
    if (branchId) {
      filters.push(or(eq(invoices.branchId, branchId), isNull(invoices.branchId)));
    }

    const rows = await db
      .select({
        invoice: invoices,
        customer: customers
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(...filters))
      .orderBy(desc(invoices.createdAt));

    return rows.map(r => ({
      ...r.invoice,
      customer: r.customer || undefined
    }));
  }

  async getInvoicesPaginated(
    companyId: number,
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: string,
    type?: string,
    dateFrom?: Date,
    dateTo?: Date,
    isPos?: boolean,
    branchId?: number
  ): Promise<{ data: (Invoice & { customer?: Customer; latestError?: { message: string, color: string }; relatedInvoiceNumber?: string | null; linkedDocuments?: Array<{ id: number; invoiceNumber: string; transactionType: string | null }> })[]; total: number; pages: number }> {
    const offset = (page - 1) * limit;

    const filters: any[] = [eq(invoices.companyId, companyId)];

    if (branchId) {
      filters.push(or(eq(invoices.branchId, branchId), isNull(invoices.branchId)));
    }

    // Add POS filter if specified
    if (isPos !== undefined) {
      filters.push(eq(invoices.isPos, isPos));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      filters.push(
        or(
          ilike(invoices.invoiceNumber, searchTerm),
          ilike(customers.name, searchTerm),
          sql`CAST(${invoices.total} AS TEXT) ILIKE ${searchTerm}`
        )
      );
    }

    if (status && status !== 'all') {
      if (status === 'fiscalized') {
        filters.push(eq(invoices.syncedWithFdms, true));
      } else if (status === 'pending-sync') {
        filters.push(and(
          eq(invoices.syncedWithFdms, false),
          eq(invoices.status, 'issued')
        ));
      } else {
        filters.push(eq(invoices.status, status));
      }
    }

    if (type && type !== 'all') {
      filters.push(eq(invoices.transactionType, type));
    }

    if (dateFrom) {
      filters.push(gte(invoices.issueDate, dateFrom));
    }

    if (dateTo) {
      // Add one day to include the end date fully
      const nextDay = new Date(dateTo);
      nextDay.setDate(nextDay.getDate() + 1);
      filters.push(lt(invoices.issueDate, nextDay));
    }

    const whereClause = and(...filters);

    const [totalResult] = await db
      .select({ count: count() })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(whereClause);

    const total = totalResult?.count || 0;
    const pages = Math.ceil(total / limit);

    // Subquery to get the latest error for each invoice
    const latestErrorSubquery = db
      .select({
        invoiceId: validationErrors.invoiceId,
        errorMessage: validationErrors.errorMessage,
        errorColor: validationErrors.errorColor,
        rn: sql`row_number() over (partition by ${validationErrors.invoiceId} order by ${validationErrors.createdAt} desc)`.as("rn"),
      })
      .from(validationErrors)
      .as("latest_errors");

    const rows = await db
      .select({
        invoice: invoices,
        customer: customers,
        latestErrorMsg: latestErrorSubquery.errorMessage,
        latestErrorColor: latestErrorSubquery.errorColor,
        createdByName: users.name,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .leftJoin(latestErrorSubquery, and(
        eq(invoices.id, latestErrorSubquery.invoiceId),
        eq(latestErrorSubquery.rn, 1)
      ))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(invoices.createdAt));

    const data: Array<Invoice & {
      customer?: Customer;
      createdByName?: string;
      latestError?: { message: string; color: string };
      relatedInvoiceNumber?: string | null;
      linkedDocuments?: Array<{ id: number; invoiceNumber: string; transactionType: string | null }>;
    }> = rows.map(r => ({
      ...r.invoice,
      customer: r.customer || undefined,
      createdByName: r.createdByName || undefined,
      latestError: r.latestErrorMsg ? {
        message: r.latestErrorMsg,
        color: r.latestErrorColor || 'Red'
      } : undefined
    }));

    const invoiceIds = data.map(inv => inv.id);
    const relatedIds = Array.from(
      new Set(data.map(inv => inv.relatedInvoiceId).filter((id): id is number => typeof id === "number"))
    );
    const linkLookupIds = Array.from(new Set([...invoiceIds, ...relatedIds]));

    if (linkLookupIds.length > 0) {
      const linkRows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          transactionType: invoices.transactionType,
          relatedInvoiceId: invoices.relatedInvoiceId,
        })
        .from(invoices)
        .where(and(
          eq(invoices.companyId, companyId),
          or(
            inArray(invoices.id, linkLookupIds),
            inArray(invoices.relatedInvoiceId, linkLookupIds)
          )
        ));

      const numberById = new Map(linkRows.map(row => [row.id, row.invoiceNumber]));
      const linkedByOriginalId = new Map<number, Array<{ id: number; invoiceNumber: string; transactionType: string | null }>>();

      for (const row of linkRows) {
        if (!row.relatedInvoiceId) continue;
        const links = linkedByOriginalId.get(row.relatedInvoiceId) || [];
        links.push({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          transactionType: row.transactionType,
        });
        linkedByOriginalId.set(row.relatedInvoiceId, links);
      }

      for (const inv of data) {
        inv.relatedInvoiceNumber = inv.relatedInvoiceId ? (numberById.get(inv.relatedInvoiceId) ?? null) : null;
        inv.linkedDocuments = linkedByOriginalId.get(inv.id) || [];
      }
    } else {
      for (const inv of data) {
        inv.relatedInvoiceNumber = null;
        inv.linkedDocuments = [];
      }
    }

    return { data, total, pages };
  }

  async getInvoice(id: number): Promise<(Invoice & { items: (InvoiceItem & { product?: Product })[]; customer?: Customer; validationErrors?: any[]; relatedInvoiceNumber?: string; relatedInvoiceDate?: Date | null; relatedFiscalCode?: string; relatedReceiptGlobalNo?: number; relatedReceiptCounter?: number }) | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return undefined;

    const [customer] = await db.select().from(customers).where(eq(customers.id, invoice.customerId));

    // Fetch related invoice details if this is a credit/debit note
    // ZIMRA Fields [26], [27], [28]
    let relatedInvoiceNumber: string | undefined;
    let relatedInvoiceDate: Date | null | undefined;
    let relatedFiscalCode: string | undefined;
    let relatedReceiptGlobalNo: number | undefined;
    let relatedReceiptCounter: number | undefined;

    if (invoice.relatedInvoiceId) {
      const [relatedInvoice] = await db.select({
        invoiceNumber: invoices.invoiceNumber,
        issueDate: invoices.issueDate,
        fiscalCode: invoices.fiscalCode,
        receiptGlobalNo: invoices.receiptGlobalNo,
        receiptCounter: invoices.receiptCounter
      }).from(invoices).where(eq(invoices.id, invoice.relatedInvoiceId));
      relatedInvoiceNumber = relatedInvoice?.invoiceNumber;
      relatedInvoiceDate = relatedInvoice?.issueDate;
      relatedFiscalCode = relatedInvoice?.fiscalCode || undefined;
      relatedReceiptGlobalNo = relatedInvoice?.receiptGlobalNo || undefined;
      relatedReceiptCounter = relatedInvoice?.receiptCounter || undefined;
    }

    const rows = await db
      .select({
        item: invoiceItems,
        product: products
      })
      .from(invoiceItems)
      .leftJoin(products, eq(invoiceItems.productId, products.id))
      .where(eq(invoiceItems.invoiceId, id));

    const items = rows.map(r => ({
      ...r.item,
      product: r.product || undefined
    }));

    // Fetch validation errors if any
    const validationErrorsRows = await db
      .select()
      .from(validationErrors)
      .where(eq(validationErrors.invoiceId, id))
      .orderBy(validationErrors.createdAt);

    return {
      ...invoice,
      items,
      customer,
      validationErrors: validationErrorsRows,
      relatedInvoiceNumber,
      relatedInvoiceDate,
      relatedFiscalCode,
      relatedReceiptGlobalNo,
      relatedReceiptCounter
    };
  }

  async getInvoiceWithItems(id: number): Promise<(Invoice & { items: (InvoiceItem & { product?: Product })[]; customer?: Customer; validationErrors?: any[]; relatedInvoiceNumber?: string; relatedInvoiceDate?: Date | null; relatedFiscalCode?: string; relatedReceiptGlobalNo?: number; relatedReceiptCounter?: number }) | undefined> {
    return this.getInvoice(id);
  }

  async createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem> {
    const [created] = await db.insert(invoiceItems).values(item).returning();
    return created;
  }

  async deleteInvoice(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Delete items (Foreign Key Constraint)
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

      // 2. Delete validation errors
      await tx.delete(validationErrors).where(eq(validationErrors.invoiceId, id));

      // 3. Delete payments
      await tx.delete(payments).where(eq(payments.invoiceId, id));

      // 4. Nullify zimra_logs references (preserve logs for audit, but break the link to deleted invoice)
      await tx.update(zimraLogs)
        .set({ invoiceId: null })
        .where(eq(zimraLogs.invoiceId, id));

      // 5. Finally delete the invoice
      await tx.delete(invoices).where(eq(invoices.id, id));
    });
  }

  async createInvoice(data: CreateInvoiceRequest): Promise<Invoice> {
    const { applyPartnershipToInvoiceData } = await import("./lib/partnerships.js");
    const enriched = await applyPartnershipToInvoiceData(data);

    return await db.transaction(async (tx) => {
      const { items, ...invoiceData } = enriched;

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Cannot create an invoice without at least one line item.");
      }

      // Auto-assign order number for POS/Restaurant sales if not provided
      let orderNumber = data.orderNumber;
      let receiptNums = { receiptGlobalNo: 0, receiptCounter: 0 };

      if (!orderNumber && (invoiceData.isPos || invoiceData.tableId)) {
        // We can use the company's daily receipt counter for the short order number
        // but we need to fetch/claim it here if we're not already doing it in Zimbabwe 
        // fiscalization (which happens later). 
        // For now, let's use a simple strategy: fetch current count and increment.
        const [company] = await tx.select({ dailyReceiptCount: companies.dailyReceiptCount }).from(companies).where(eq(companies.id, invoiceData.companyId));
        const nextNum = (company?.dailyReceiptCount || 0) + 1;
        orderNumber = `#${nextNum.toString().padStart(3, '0')}`;
      }

      const [invoice] = await tx.insert(invoices).values({
        ...invoiceData,
        orderNumber,
        invoiceNumber: await this.getNextInvoiceNumber(invoiceData.companyId, invoiceData.transactionType === 'CreditNote' ? 'CN' : (invoiceData.transactionType === 'DebitNote' ? 'DN' : 'INV')),
        dueDate: new Date(invoiceData.dueDate), // Ensure Date object
      }).returning();

      // Enterprise Inventory Isolation:
      // Resolve the branch warehouse location and adjust stock through inventory_location_stocks.
      const ensureCompanyInventoryLocations = async (tempTx: any, compId: number) => {
        const existing = await tempTx
          .select()
          .from(inventoryLocations)
          .where(eq(inventoryLocations.companyId, compId));

        const existingWarehouse = existing.find((l: any) => l.type === "WAREHOUSE" && !l.branchId);
        if (!existingWarehouse) {
          const [wh] = await tempTx.insert(inventoryLocations).values({
            companyId: compId,
            type: "WAREHOUSE",
            name: "Main Warehouse",
            code: "MAIN-WAREHOUSE",
            isDefaultReceiving: true,
            isDefaultDispatch: true,
            isActive: true,
          }).returning();
          existing.push(wh);
        }

        const companyBranches = await tempTx.select().from(branches).where(eq(branches.companyId, compId));
        const existingBranchLocationIds = new Set(
          existing
            .filter((l: any) => l.branchId)
            .map((l: any) => Number(l.branchId)),
        );
        for (const b of companyBranches) {
          if (existingBranchLocationIds.has(b.id)) continue;
          const [bl] = await tempTx.insert(inventoryLocations).values({
            companyId: compId,
            type: "BRANCH",
            name: b.name,
            code: b.code || `BRANCH-${b.id}`,
            address: b.address || null,
            branchId: b.id,
            isActive: b.isActive ?? true,
          }).returning();
          existing.push(bl);
        }
        return existing;
      };

      const resolveInventoryLocation = async (
        tempTx: any,
        compId: number,
        brId: number | null
      ) => {
        const locations = await ensureCompanyInventoryLocations(tempTx, compId);
        let location;
        if (brId) {
          location = locations.find((l: any) => l.branchId === brId);
        }
        if (!location) {
          location = locations.find((l: any) => l.isDefaultDispatch);
        }
        if (!location) {
          location = locations.find((l: any) => l.type === "WAREHOUSE");
        }
        if (!location) {
          throw new Error("No default inventory location or warehouse found for this company.");
        }
        return location;
      };

      const invoiceLocation = await resolveInventoryLocation(tx, invoiceData.companyId, invoiceData.branchId || null);

      const adjustLocationStock = async (
        tempTx: any,
        pId: number,
        qtyDelta: number,
        loc: any
      ) => {
        // 1. Update/Insert inventory_location_stocks
        const [stock] = await tempTx
          .select()
          .from(inventoryLocationStocks)
          .where(and(eq(inventoryLocationStocks.locationId, loc.id), eq(inventoryLocationStocks.productId, pId)))
          .limit(1);
        const next = Number(stock?.stockLevel || 0) + qtyDelta;
        const nextText = next.toString();

        if (stock) {
          await tempTx
            .update(inventoryLocationStocks)
            .set({
              stockLevel: nextText,
              availableQuantity: nextText,
              updatedAt: new Date(),
            })
            .where(eq(inventoryLocationStocks.id, stock.id));
        } else {
          await tempTx.insert(inventoryLocationStocks).values({
            locationId: loc.id,
            productId: pId,
            stockLevel: nextText,
            reservedQuantity: "0",
            availableQuantity: nextText,
          });
        }

        // 2. Sum branch stocks
        if (loc.branchId) {
          const branchLocations = await tempTx
            .select({ id: inventoryLocations.id })
            .from(inventoryLocations)
            .where(eq(inventoryLocations.branchId, loc.branchId));
          
          const locationIds = branchLocations.map((l: any) => l.id);
          let totalBranchStock = 0;
          if (locationIds.length > 0) {
            const [sumRow] = await tempTx
              .select({
                total: sql<string>`coalesce(sum(${inventoryLocationStocks.stockLevel}::numeric), 0)`
              })
              .from(inventoryLocationStocks)
              .where(and(
                inArray(inventoryLocationStocks.locationId, locationIds),
                eq(inventoryLocationStocks.productId, pId)
              ));
            totalBranchStock = Number(sumRow?.total || 0);
          }

          const [branchStock] = await tempTx
            .select()
            .from(branchStocks)
            .where(and(eq(branchStocks.branchId, loc.branchId), eq(branchStocks.productId, pId)))
            .limit(1);

          if (branchStock) {
            await tempTx.update(branchStocks).set({ stockLevel: totalBranchStock.toString() }).where(eq(branchStocks.id, branchStock.id));
          } else {
            await tempTx.insert(branchStocks).values({
              branchId: loc.branchId,
              productId: pId,
              stockLevel: totalBranchStock.toString(),
            });
          }
        }

        // 3. Sum global stock
        const companyLocations = await tempTx
          .select({ id: inventoryLocations.id })
          .from(inventoryLocations)
          .where(eq(inventoryLocations.companyId, loc.companyId));
        
        const companyLocIds = companyLocations.map((l: any) => l.id);
        let totalCompanyStock = 0;
        if (companyLocIds.length > 0) {
          const [sumRow] = await tempTx
            .select({
              total: sql<string>`coalesce(sum(${inventoryLocationStocks.stockLevel}::numeric), 0)`
            })
            .from(inventoryLocationStocks)
            .where(and(
              inArray(inventoryLocationStocks.locationId, companyLocIds),
              eq(inventoryLocationStocks.productId, pId)
            ));
          totalCompanyStock = Number(sumRow?.total || 0);
        }

        await tempTx.update(products).set({ stockLevel: totalCompanyStock.toString() }).where(eq(products.id, pId));
      };

      const { calculateCOGS } = await import("./lib/inventory.js");

      if (items.length > 0) {
        // We will process items one by one to calculate COGS for each
        for (const item of items) {
          let cogsAmount: number | null = null;

          if (item.productId) {
            const [product] = await tx.select().from(products).where(eq(products.id, item.productId));

            let actualQuantity = parseFloat(item.quantity.toString());
            let baseUnitMultiplier = 1;

            if (item.variationId) {
              const [variation] = await tx.select().from(productVariations).where(eq(productVariations.id, item.variationId));
              if (variation && variation.baseUnitMultiplier) {
                baseUnitMultiplier = parseFloat(variation.baseUnitMultiplier.toString());
                actualQuantity = actualQuantity * baseUnitMultiplier;
              }
            }

            if (product && product.batchTrackingEnabled && invoiceData.transactionType !== 'CreditNote') {
              if (item.batchId) {
                const [batch] = await tx.select().from(productBatches).where(eq(productBatches.id, item.batchId));
                if (!batch) throw new Error(`Batch not found for product ${product.name}`);
                if (new Date(batch.expiryDate) <= new Date() || batch.isExpired) {
                  throw new Error(`Cannot sell expired batch ${batch.batchNumber} for product ${product.name}`);
                }
              } else {
                // FEFO: Find oldest unexpired batch with enough stock
                const availableBatches = await tx.select().from(productBatches)
                  .where(and(
                    eq(productBatches.productId, product.id),
                    gt(productBatches.expiryDate, new Date().toISOString()),
                    sql`${productBatches.stockLevel}::numeric >= ${actualQuantity}`
                  ))
                  .orderBy(productBatches.expiryDate)
                  .limit(1);

                if (availableBatches.length > 0) {
                  item.batchId = availableBatches[0].id;
                  item.batchNumber = availableBatches[0].batchNumber;
                  item.expiryDate = availableBatches[0].expiryDate;
                }
              }
            }

            // --- BOM / Recipe Deduction Logic ---
            if (product && product.hasRecipe) {
              const recipes = await tx.select().from(recipeItems).where(eq(recipeItems.parentProductId, product.id));
              let totalRecipeCogs = 0;

              for (const recipe of recipes) {
                const ingredientQty = actualQuantity * parseFloat(recipe.quantity.toString());
                const [ingredient] = await tx.select().from(products).where(eq(products.id, recipe.ingredientProductId));

                if (ingredient && ingredient.isTracked) {
                  if (invoiceData.transactionType !== 'CreditNote') {
                    const ingredientCogs = await calculateCOGS(ingredient.id, ingredientQty, invoiceData.companyId, invoiceData.branchId || null, tx);
                    totalRecipeCogs += (ingredientCogs || 0);

                    await tx.insert(inventoryTransactions).values({
                      companyId: invoiceData.companyId,
                      branchId: invoiceData.branchId || null,
                      locationId: invoiceLocation.id,
                      productId: ingredient.id,
                      type: "STOCK_OUT",
                      quantity: (-ingredientQty).toString(),
                      totalCost: ingredientCogs?.toString() || null,
                      referenceType: "INVOICE",
                      referenceId: invoice.id.toString(),
                      notes: `Recipe Ingredient for ${product.name} - Invoice ${invoice.invoiceNumber}`,
                      remainingQuantity: (Number(ingredient.stockLevel) - ingredientQty).toString()
                    });
                  } else {
                    await tx.insert(inventoryTransactions).values({
                      companyId: invoiceData.companyId,
                      branchId: invoiceData.branchId || null,
                      locationId: invoiceLocation.id,
                      productId: ingredient.id,
                      type: "ADJUSTMENT",
                      quantity: ingredientQty.toString(),
                      referenceType: "INVOICE",
                      referenceId: invoice.id.toString(),
                      notes: `Recipe Return for ${product.name} - Credit Note ${invoice.invoiceNumber}`,
                      remainingQuantity: ingredientQty.toString()
                    });
                  }

                  const recipeStockChange = invoiceData.transactionType === 'CreditNote' ? ingredientQty : -ingredientQty;
                  await adjustLocationStock(tx, recipe.ingredientProductId, recipeStockChange, invoiceLocation);
                }
              }
              cogsAmount = totalRecipeCogs;
            }
            // --- Standard Tracked Product Logic ---
            else if (product && product.isTracked) {
              const quantity = actualQuantity;

              if (invoiceData.transactionType !== 'CreditNote') {
                // Calculate and deduct for sales
                cogsAmount = await calculateCOGS(item.productId, quantity, invoiceData.companyId, invoiceData.branchId || null, tx);

                // Record the STOCK_OUT transaction
                await tx.insert(inventoryTransactions).values({
                  companyId: invoiceData.companyId,
                  branchId: invoiceData.branchId || null,
                  locationId: invoiceLocation.id,
                  productId: item.productId,
                  type: "STOCK_OUT",
                  quantity: (-quantity).toString(),
                  totalCost: cogsAmount?.toString() || null,
                  referenceType: "INVOICE",
                  referenceId: invoice.id.toString(),
                  notes: `Sale - Invoice ${invoice.invoiceNumber}`,
                  remainingQuantity: (Number(product.stockLevel) - quantity).toString()
                });
              } else {
                // Restoring stock for Credit Note
                await tx.insert(inventoryTransactions).values({
                  companyId: invoiceData.companyId,
                  branchId: invoiceData.branchId || null,
                  locationId: invoiceLocation.id,
                  productId: item.productId,
                  type: "ADJUSTMENT",
                  quantity: quantity.toString(),
                  referenceType: "INVOICE",
                  referenceId: invoice.id.toString(),
                  notes: `Return - Credit Note ${invoice.invoiceNumber}`,
                  remainingQuantity: quantity.toString()
                });
              }

              // Update stock level through location-scoped stock logic
              const stockChange = invoiceData.transactionType === 'CreditNote' ? quantity : -quantity;
              await adjustLocationStock(tx, item.productId, stockChange, invoiceLocation);

              // Update Batch Stock if applicable
              if (item.batchId) {
                const [batch] = await tx.select().from(productBatches).where(eq(productBatches.id, item.batchId));
                if (batch) {
                  const newBatchStock = (parseFloat(batch.stockLevel || "0") + stockChange).toString();
                  await tx.update(productBatches).set({ stockLevel: newBatchStock }).where(eq(productBatches.id, item.batchId));
                }
              }
            }
          }

          const productWarrantyMonths = item.productId
            ? Number((await tx.select({ warrantyMonths: products.warrantyMonths }).from(products).where(eq(products.id, item.productId)).limit(1))[0]?.warrantyMonths || 0)
            : 0;
          const itemWarrantyMonths = Number((item as any).warrantyMonths || productWarrantyMonths || 0);
          const warrantyExpiresAt = itemWarrantyMonths > 0
            ? new Date(new Date(invoice.issueDate || new Date()).setMonth(new Date(invoice.issueDate || new Date()).getMonth() + itemWarrantyMonths))
            : null;

          // Insert the invoice item with COGS
          const [createdItem] = await tx.insert(invoiceItems).values({
            ...item,
            invoiceId: invoice.id,
            cogsAmount: cogsAmount?.toString() || null,
            warrantyMonths: itemWarrantyMonths || null,
            warrantyExpiresAt,
          } as any).returning();

          if ((item as any).serialNumber && item.productId && invoiceData.transactionType !== "CreditNote") {
            await tx.update(productSerialNumbers)
              .set({
                status: "SOLD",
                soldInvoiceId: invoice.id,
                soldInvoiceItemId: createdItem.id,
                soldAt: invoice.issueDate || new Date(),
                warrantyExpiresAt,
                updatedAt: new Date(),
              } as any)
              .where(and(
                eq(productSerialNumbers.companyId, invoiceData.companyId),
                eq(productSerialNumbers.productId, item.productId),
                eq(productSerialNumbers.serialNumber, String((item as any).serialNumber))
              ));
          }
        }
      }

      // Manually construct the full invoice object using tx to avoid transaction visibility issues
      // 1. Fetch Customer
      let customer: Customer | undefined;
      if (invoice.customerId) {
        const [c] = await tx.select().from(customers).where(eq(customers.id, invoice.customerId));
        customer = c;
      }

      // 2. Fetch Related Invoice Details
      let relatedInvoiceNumber: string | undefined;
      let relatedInvoiceDate: Date | null | undefined;
      let relatedFiscalCode: string | undefined;
      let relatedReceiptGlobalNo: number | undefined;
      let relatedReceiptCounter: number | undefined;

      if (invoice.relatedInvoiceId) {
        const [related] = await tx.select({
          invoiceNumber: invoices.invoiceNumber,
          issueDate: invoices.issueDate,
          fiscalCode: invoices.fiscalCode,
          receiptGlobalNo: invoices.receiptGlobalNo,
          receiptCounter: invoices.receiptCounter
        }).from(invoices).where(eq(invoices.id, invoice.relatedInvoiceId));

        if (related) {
          relatedInvoiceNumber = related.invoiceNumber;
          relatedInvoiceDate = related.issueDate;
          relatedFiscalCode = related.fiscalCode || undefined;
          relatedReceiptGlobalNo = related.receiptGlobalNo || undefined;
          relatedReceiptCounter = related.receiptCounter || undefined;
        }
      }

      // 3. Fetch Items with Products
      const invoiceItemsRows = await tx
        .select({
          item: invoiceItems,
          product: products
        })
        .from(invoiceItems)
        .leftJoin(products, eq(invoiceItems.productId, products.id))
        .where(eq(invoiceItems.invoiceId, invoice.id));

      const fullItems = invoiceItemsRows.map(r => ({
        ...r.item,
        product: r.product || undefined
      }));

      // --- LEDGER POSTING ---
      const total = Number(invoice.total);
      const taxAmount = Number(invoice.taxAmount);
      const totalCogs = fullItems.reduce((sum, item) => sum + Number(item.cogsAmount || 0), 0);

      const isCreditNote = invoice.transactionType === 'CreditNote';
      const description = `${isCreditNote ? 'Credit Note' : 'Invoice'} ${invoice.invoiceNumber}`;
      const arAccountCode = await this.getSystemAccountCode(invoice.companyId, "accountsReceivableCode", tx);
      const cashAccountCode = await this.getSystemAccountCode(invoice.companyId, "cashAccountCode", tx);
      const salesAccountCode = await this.getSystemAccountCode(invoice.companyId, "salesRevenueAccountCode", tx);
      const vatOutputAccountCode = await this.getSystemAccountCode(invoice.companyId, "vatOutputAccountCode", tx);
      const cogsAccountCode = await this.getSystemAccountCode(invoice.companyId, "cogsAccountCode", tx);
      const inventoryAccountCode = await this.getSystemAccountCode(invoice.companyId, "inventoryAccountCode", tx);
      const isImmediateCashSale = invoice.isPos && invoice.paymentMethod !== "CREDIT";
      const ledgerTotal = this.roundMoney(total);
      const ledgerTaxAmount = this.roundMoney(taxAmount);
      const ledgerSubtotal = this.roundMoney(ledgerTotal - ledgerTaxAmount);

      const postLines: any[] = [
        { accountCode: isImmediateCashSale ? cashAccountCode : arAccountCode, type: isCreditNote ? "CREDIT" : "DEBIT", amount: ledgerTotal },
        { accountCode: vatOutputAccountCode, type: isCreditNote ? "DEBIT" : "CREDIT", amount: ledgerTaxAmount },
      ];

      // PARTNERSHIP REVENUE SPLIT
      if (invoice.partnerShareAmount && Number(invoice.partnerShareAmount) > 0) {
        const partnerShare = this.roundMoney(Number(invoice.partnerShareAmount));
        const issuerShare = this.roundMoney(ledgerSubtotal - partnerShare);
        const rawPartnerAccount = await this.getSystemAccountCode(invoice.companyId, "partnerPayableAccountCode", tx).catch(() => null);
        const apAccountCode = await this.getSystemAccountCode(invoice.companyId, "accountsPayableCode", tx);
        const partnerPayableAccountCode = rawPartnerAccount || apAccountCode; // Default liability account if not mapped
        
        if (issuerShare > 0) {
          postLines.push({ accountCode: salesAccountCode, type: isCreditNote ? "DEBIT" : "CREDIT", amount: issuerShare });
        }
        if (partnerShare > 0) {
          postLines.push({ accountCode: partnerPayableAccountCode, type: isCreditNote ? "DEBIT" : "CREDIT", amount: partnerShare });
        }
      } else {
        // Standard full revenue recognition
        postLines.push({ accountCode: salesAccountCode, type: isCreditNote ? "DEBIT" : "CREDIT", amount: ledgerSubtotal });
      }

      const validPostLines = postLines.filter(line => Number(line.amount) > 0);
      if (validPostLines.length >= 2) {
        await this.postToLedger(invoice.companyId, {
          entryDate: invoice.issueDate || new Date(),
          description,
          referenceType: "INVOICE",
          referenceId: invoice.id.toString(),
          createdBy: invoice.createdBy || undefined,
          lines: validPostLines
        }, tx);
      }

      if (totalCogs > 0) {
        await this.postToLedger(invoice.companyId, {
          entryDate: invoice.issueDate || new Date(),
          description: `COGS for ${description}`,
          referenceType: "INVOICE",
          referenceId: invoice.id.toString(),
          createdBy: invoice.createdBy || undefined,
          lines: [
            { accountCode: cogsAccountCode, type: isCreditNote ? "CREDIT" : "DEBIT", amount: totalCogs },
            { accountCode: inventoryAccountCode, type: isCreditNote ? "DEBIT" : "CREDIT", amount: totalCogs },
          ]
        }, tx);
      }

      return {
        ...invoice,
        items: fullItems,
        customer,
        validationErrors: [],
        relatedInvoiceNumber,
        relatedInvoiceDate,
        relatedFiscalCode,
        relatedReceiptGlobalNo,
        relatedReceiptCounter
      } as Invoice;
    });
  }

  async updateInvoice(id: number, data: Partial<InsertInvoice> & { items?: any[] }): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      // 1. Update invoice details
      const { items, ...invoiceData } = data;
      const [updated] = await tx
        .update(invoices)
        .set(invoiceData)
        .where(eq(invoices.id, id))
        .returning();

      if (!updated) throw new Error("Invoice not found");

      // 2. If items provided, replace them
      if (data.items) {
        // Delete existing items
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

        // Insert new items
        await tx.insert(invoiceItems).values(
          data.items.map(item => ({
            ...item,
            invoiceId: id
          }))
        );
      }

      return updated;
    });
  }

  async fiscalizeInvoice(id: number, fiscalData: {
    fiscalCode: string;
    qrCodeData: string;
    verificationCode?: string;
    fiscalSignature?: string;
    fiscalDayNo?: number;
    receiptCounter?: number;
    receiptGlobalNo?: number;
    syncedWithFdms?: boolean;
    fdmsStatus?: string;
    submissionId?: string;
    validationStatus?: string;
    lastValidationAttempt?: Date;
  }): Promise<Invoice> {
    const { syncedWithFdms = true, fdmsStatus = "issued", validationStatus, lastValidationAttempt, submissionId, verificationCode, ...rest } = fiscalData;

    await db
      .update(invoices)
      .set({
        ...rest,
        submissionId,
        verificationCode,
        syncedWithFdms,
        fdmsStatus,
        validationStatus,
        lastValidationAttempt,
        status: syncedWithFdms ? "issued" : "draft"
      })
      .where(eq(invoices.id, id));


    // Return full invoice with items for the receipt
    const fullInvoice = await this.getInvoice(id);
    if (!fullInvoice) throw new Error("Invoice not found after fiscalization");
    return fullInvoice as Invoice;
  }

  async createValidationErrors(errors: Array<{ invoiceId: number; errorCode: string; errorMessage: string; errorColor: string; requiresPreviousReceipt: boolean }>): Promise<void> {
    if (errors.length === 0) return;

    // Import validationErrors table
    const { validationErrors } = await import("../shared/schema.js");

    // Clear existing validation errors for this invoice
    await db.delete(validationErrors).where(eq(validationErrors.invoiceId, errors[0].invoiceId));

    // Insert new validation errors
    await db.insert(validationErrors).values(
      errors.map(error => ({
        invoiceId: error.invoiceId,
        errorCode: error.errorCode,
        errorMessage: error.errorMessage,
        errorColor: error.errorColor as any,
        requiresPreviousReceipt: error.requiresPreviousReceipt
      }))
    );
  }

  async lockInvoice(id: number, userId: string): Promise<boolean> {
    // Check if locked by someone else and lock is fresh (< 5 mins)
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!existing) return false;

    if (existing.lockedBy && existing.lockedBy !== userId) {
      const lockTime = new Date(existing.lockedAt!).getTime();
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (lockTime > fiveMinutesAgo) {
        return false; // Still locked by someone else
      }
    }

    // Acquire lock
    const [locked] = await db
      .update(invoices)
      .set({ lockedBy: userId, lockedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();

    return !!locked;
  }

  async unlockInvoice(id: number, userId: string): Promise<void> {
    await db
      .update(invoices)
      .set({ lockedBy: null, lockedAt: null })
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.lockedBy, userId)
        )
      );
  }

  /**
   * Atomically increments both receipt counters in a single UPDATE...RETURNING.
   * This is the only safe way to claim numbers — no two concurrent calls can
   * get the same pair because Postgres serialises the row-level update.
   */
  async claimNextReceiptNumbers(companyId: number, branchId?: number): Promise<{ receiptGlobalNo: number; receiptCounter: number }> {
    if (branchId) {
      const [updated] = await db
        .update(branches)
        .set({
          lastReceiptGlobalNo: sql`${branches.lastReceiptGlobalNo} + 1`,
          dailyReceiptCount: sql`${branches.dailyReceiptCount} + 1`,
        })
        .where(eq(branches.id, branchId))
        .returning({
          receiptGlobalNo: branches.lastReceiptGlobalNo,
          receiptCounter: branches.dailyReceiptCount,
        });

      if (!updated) throw new Error(`Branch ${branchId} not found when claiming receipt numbers`);
      return { receiptGlobalNo: updated.receiptGlobalNo!, receiptCounter: updated.receiptCounter! };
    }

    const [updated] = await db
      .update(companies)
      .set({
        lastReceiptGlobalNo: sql`${companies.lastReceiptGlobalNo} + 1`,
        dailyReceiptCount: sql`${companies.dailyReceiptCount} + 1`,
      })
      .where(eq(companies.id, companyId))
      .returning({
        receiptGlobalNo: companies.lastReceiptGlobalNo,
        receiptCounter: companies.dailyReceiptCount,
      });

    if (!updated) throw new Error(`Company ${companyId} not found when claiming receipt numbers`);
    return { receiptGlobalNo: updated.receiptGlobalNo!, receiptCounter: updated.receiptCounter! };
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company> {
    // Check if we are switching environment to production
    if (data.zimraEnvironment === 'production') {
      const current = await this.getCompany(id);
      if (current && current.zimraEnvironment !== 'production') {
        console.log(`[ZIMRA] Environment switch to PRODUCTION for company ${id}. Performing full cleanup.`);

        // 1. Reset global counters
        data.lastReceiptGlobalNo = 0;
        data.dailyReceiptCount = 0;
        data.lastFiscalHash = null;

        // 2. Delete all test data associated with the company
        try {
          // Get all invoice IDs for this company
          const companyInvoices = await db
            .select({ id: invoices.id })
            .from(invoices)
            .where(eq(invoices.companyId, id));

          const invoiceIds = companyInvoices.map(inv => inv.id);

          if (invoiceIds.length > 0) {
            // Delete related records first due to foreign key constraints
            await db.delete(invoiceItems).where(sql`${invoiceItems.invoiceId} IN ${invoiceIds}`);
            await db.delete(validationErrors).where(sql`${validationErrors.invoiceId} IN ${invoiceIds}`);
            await db.delete(payments).where(sql`${payments.invoiceId} IN ${invoiceIds}`);

            // Finally delete the invoices themselves
            await db.delete(invoices).where(eq(invoices.companyId, id));
            console.log(`[ZIMRA] Successfully deleted ${invoiceIds.length} test invoices and related data for company ${id}.`);
          }
        } catch (cleanupErr) {
          console.error(`[ZIMRA] Error during production cleanup for company ${id}:`, cleanupErr);
          // We continue with the update even if cleanup fails, but log the error
        }
      }
    }

    const [updated] = await db
      .update(companies)
      .set(data)
      .where(eq(companies.id, id))
      .returning();
    return updated;
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies);
  }

  async getTaxTypes(companyId?: number): Promise<TaxType[]> {
    const taxes = await db
      .select()
      .from(taxTypes)
      .where(
        and(
          companyId ? or(eq(taxTypes.companyId, companyId), isNull(taxTypes.companyId)) : isNull(taxTypes.companyId),
          eq(taxTypes.isActive, true)
        )
      )
      .orderBy(taxTypes.rate);
      
    // Deduplicate by code, preferring company-specific over system defaults
    if (companyId) {
      const deduped = new Map<string, TaxType>();
      for (const tax of taxes) {
        const existing = deduped.get(tax.code);
        if (!existing || (existing.companyId === null && tax.companyId !== null)) {
          deduped.set(tax.code, tax);
        }
      }
      return Array.from(deduped.values()).sort((a, b) => Number(a.rate) - Number(b.rate));
    }
    
    return taxes;
  }

  async createTaxType(taxType: InsertTaxType & { companyId: number }): Promise<TaxType> {
    const [newTaxType] = await db.insert(taxTypes).values({
      ...taxType,
      rate: taxType.rate.toString()
    }).returning();
    return newTaxType;
  }

  async updateTaxType(id: number, companyId: number, taxType: Partial<InsertTaxType>): Promise<TaxType | undefined> {
    const updateData = { ...taxType };
    if (updateData.rate !== undefined) {
      updateData.rate = updateData.rate.toString();
    }
    const [updated] = await db
      .update(taxTypes)
      .set(updateData as any)
      .where(and(eq(taxTypes.id, id), eq(taxTypes.companyId, companyId)))
      .returning();
    return updated;
  }

  async getTaxCategories(companyId?: number): Promise<TaxCategory[]> {
    if (companyId) {
      return await db
        .select()
        .from(taxCategories)
        .where(
          and(
            or(eq(taxCategories.companyId, companyId), isNull(taxCategories.companyId)),
            eq(taxCategories.isActive, true)
          )
        );
    }
    return await db.select().from(taxCategories).where(eq(taxCategories.isActive, true));
  }

  async createTaxCategory(category: InsertTaxCategory & { companyId: number }): Promise<TaxCategory> {
    const [newCategory] = await db.insert(taxCategories).values(category).returning();
    return newCategory;
  }

  async updateTaxCategory(id: number, companyId: number, category: Partial<InsertTaxCategory>): Promise<TaxCategory | undefined> {
    const [updated] = await db.update(taxCategories).set(category).where(and(eq(taxCategories.id, id), eq(taxCategories.companyId, companyId))).returning();
    return updated;
  }


  async getCurrencies(companyId: number): Promise<Currency[]> {
    const existing = await db.select().from(currencies).where(
      eq(currencies.companyId, companyId)
    ).orderBy(currencies.id);

    if (existing.length > 0) return existing;

    await db.insert(currencies).values([
      {
        companyId,
        code: "USD",
        name: "US Dollar",
        symbol: "$",
        exchangeRate: "1.000000",
        isBase: true,
        isActive: true
      },
      {
        companyId,
        code: "ZWG",
        name: "Zimbabwe Gold",
        symbol: "ZWG",
        exchangeRate: "13.500000",
        isBase: false,
        isActive: true
      }
    ]);

    return await db.select().from(currencies).where(
      eq(currencies.companyId, companyId)
    ).orderBy(currencies.id);
  }

  async createCurrency(currency: InsertCurrency): Promise<Currency> {
    // Ensure exchangeRate is string for decimal column
    const data = {
      ...currency,
      exchangeRate: currency.exchangeRate ? String(currency.exchangeRate) : "1.000000"
    }
    const [newCurrency] = await db.insert(currencies).values(data).returning();
    return newCurrency;
  }

  async updateCurrency(id: number, currency: Partial<InsertCurrency>): Promise<Currency> {
    const updateData = { ...currency };
    if (updateData.exchangeRate !== undefined) {
      updateData.exchangeRate = updateData.exchangeRate.toString();
    }
    const [updated] = await db
      .update(currencies)
      .set(updateData as any)
      .where(eq(currencies.id, id))
      .returning();
    return updated;
  }

  async deleteCurrency(id: number): Promise<void> {
    await db.delete(currencies).where(eq(currencies.id, id));
  }
  // Tax Sync
  async syncTaxTypes(companyId: number, zimraTaxes: any[]): Promise<TaxType[]> {
    return await db.transaction(async (tx) => {
      // Delete existing tax types for THIS company only
      await tx.delete(taxTypes).where(eq(taxTypes.companyId, companyId));

      const results: TaxType[] = [];

      for (const zTax of zimraTaxes) {
        if (!zTax.taxID) continue;

        // Default to 0 if taxPercent is missing (e.g. for Exempt)
        const percent = zTax.taxPercent !== undefined ? zTax.taxPercent : 0;
        const taxRate = percent.toFixed(2);
        const zimraCode = zTax.taxCode || zTax.taxName?.substring(0, 1).toUpperCase() || "V";
        const code = zTax.taxCode ? `VAT-${zTax.taxCode}` : `VAT-${zTax.taxID}`;
        const taxName = zTax.taxName || `VAT ${percent}%`;

        // Use ZIMRA validFrom or current date, formatted for SQL DATE (YYYY-MM-DD)
        const effectiveFrom = (zTax.validFrom || new Date().toISOString()).split('T')[0];

        // Create new tax type
        const [created] = await tx.insert(taxTypes).values({
          companyId: companyId,
          code: code,
          name: taxName,
          rate: taxRate,
          description: `ZIMRA Tax Level ${zTax.taxID} (${zTax.taxName})`,
          zimraTaxId: zTax.taxID.toString(),
          zimraCode: zimraCode, // Store A, B, C etc.
          effectiveFrom: effectiveFrom,
          isActive: true
        }).returning();

        results.push(created);
      }
      return results;
    });
  }

  // User Management
  async getCompanyUsers(companyId: number): Promise<(User & { role: string; companyRoleId?: number | null; companyRoleName?: string | null })[]> {
    const result = await db
      .select({
        user: users,
        role: companyUsers.role,
        companyRoleId: companyUsers.companyRoleId,
        companyRoleName: companyRoles.name,
      })
      .from(companyUsers)
      .innerJoin(users, eq(companyUsers.userId, users.id))
      .leftJoin(companyRoles, eq(companyUsers.companyRoleId, companyRoles.id))
      .where(eq(companyUsers.companyId, companyId));

    return result.map(({ user, role, companyRoleId, companyRoleName }) => ({
      ...user,
      role: role || "member",
      companyRoleId,
      companyRoleName,
    }));
  }

  async addUserToCompany(userId: string, companyId: number, role: string, companyRoleId?: number): Promise<void> {
    await db.insert(companyUsers).values({
      userId,
      companyId,
      role,
      companyRoleId: companyRoleId ?? null,
    });
  }

  async updateUserRole(userId: string, companyId: number, role: string): Promise<void> {
    await db
      .update(companyUsers)
      .set({ role })
      .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)));
  }

  async assignUserCompanyRole(userId: string, companyId: number, companyRoleId: number | null): Promise<void> {
    await db
      .update(companyUsers)
      .set({ companyRoleId })
      .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)));
  }

  async removeUserFromCompany(userId: string, companyId: number): Promise<void> {
    await db
      .delete(companyUsers)
      .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)));
  }

  async getCompanyUserRole(userId: string, companyId: number): Promise<string | undefined> {
    const [result] = await db
      .select({ role: companyUsers.role })
      .from(companyUsers)
      .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)));
    return result?.role || undefined;
  }

  async getCompanyMembership(userId: string, companyId: number): Promise<{ legacyRole: string; companyRoleId: number | null } | undefined> {
    const [result] = await db
      .select({ role: companyUsers.role, companyRoleId: companyUsers.companyRoleId })
      .from(companyUsers)
      .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)));
    if (!result) return undefined;
    return { legacyRole: result.role || "member", companyRoleId: result.companyRoleId ?? null };
  }

  async seedDefaultRolesForCompany(companyId: number): Promise<void> {
    const existing = await db.select({ id: companyRoles.id }).from(companyRoles).where(eq(companyRoles.companyId, companyId)).limit(1);
    if (existing.length > 0) return;

    const { LEGACY_ROLE_PERMISSIONS } = await import("../shared/permissions.js");
    const templates = [
      { name: "Owner", legacyRole: "owner", description: "Full access to all features" },
      { name: "Administrator", legacyRole: "admin", description: "Manage operations and settings" },
      { name: "Staff Member", legacyRole: "member", description: "Day-to-day operations with approval workflows" },
      { name: "Cashier", legacyRole: "cashier", description: "POS and limited stock operations" },
    ];

    for (const template of templates) {
      const [role] = await db.insert(companyRoles).values({
        companyId,
        name: template.name,
        description: template.description,
        isSystem: true,
        legacyRole: template.legacyRole,
      }).returning();

      const perms = LEGACY_ROLE_PERMISSIONS[template.legacyRole] || [];
      if (perms.length > 0) {
        await db.insert(companyRolePermissions).values(
          perms.map((permission) => ({ roleId: role.id, permission }))
        );
      }
    }
  }

  async getCompanyRoles(companyId: number): Promise<(CompanyRole & { permissions: string[] })[]> {
    await this.seedDefaultRolesForCompany(companyId);
    const roles = await db.select().from(companyRoles).where(eq(companyRoles.companyId, companyId)).orderBy(asc(companyRoles.name));
    const result: (CompanyRole & { permissions: string[] })[] = [];
    for (const role of roles) {
      const permissions = await this.getRolePermissions(role.id);
      result.push({ ...role, permissions });
    }
    return result;
  }

  async getCompanyRole(roleId: number, companyId: number): Promise<(CompanyRole & { permissions: string[] }) | undefined> {
    const [role] = await db.select().from(companyRoles).where(and(eq(companyRoles.id, roleId), eq(companyRoles.companyId, companyId))).limit(1);
    if (!role) return undefined;
    const permissions = await this.getRolePermissions(roleId);
    return { ...role, permissions };
  }

  async createCompanyRole(companyId: number, data: { name: string; description?: string; permissions: string[] }): Promise<CompanyRole & { permissions: string[] }> {
    const [role] = await db.insert(companyRoles).values({
      companyId,
      name: data.name.trim(),
      description: data.description || null,
      isSystem: false,
    }).returning();

    if (data.permissions.length > 0) {
      await db.insert(companyRolePermissions).values(
        data.permissions.map((permission) => ({ roleId: role.id, permission }))
      );
    }
    return { ...role, permissions: data.permissions };
  }

  async updateCompanyRole(roleId: number, companyId: number, data: { name?: string; description?: string; permissions?: string[] }): Promise<CompanyRole & { permissions: string[] }> {
    const [existing] = await db.select().from(companyRoles).where(and(eq(companyRoles.id, roleId), eq(companyRoles.companyId, companyId))).limit(1);
    if (!existing) throw new Error("Role not found");

    const updates: Partial<InsertCompanyRole> = {};
    if (data.name) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description;

    const [role] = Object.keys(updates).length > 0
      ? await db.update(companyRoles).set(updates).where(eq(companyRoles.id, roleId)).returning()
      : [existing];

    if (data.permissions) {
      await db.delete(companyRolePermissions).where(eq(companyRolePermissions.roleId, roleId));
      if (data.permissions.length > 0) {
        await db.insert(companyRolePermissions).values(
          data.permissions.map((permission) => ({ roleId, permission }))
        );
      }
    }

    const permissions = await this.getRolePermissions(roleId);
    return { ...role, permissions };
  }

  async deleteCompanyRole(roleId: number, companyId: number): Promise<void> {
    const [existing] = await db.select().from(companyRoles).where(and(eq(companyRoles.id, roleId), eq(companyRoles.companyId, companyId))).limit(1);
    if (!existing) throw new Error("Role not found");
    if (existing.isSystem) throw new Error("System roles cannot be deleted");

    await db.update(companyUsers).set({ companyRoleId: null }).where(eq(companyUsers.companyRoleId, roleId));
    await db.delete(companyRoles).where(eq(companyRoles.id, roleId));
  }

  async getRolePermissions(roleId: number): Promise<string[]> {
    const rows = await db.select({ permission: companyRolePermissions.permission }).from(companyRolePermissions).where(eq(companyRolePermissions.roleId, roleId));
    return rows.map((r) => r.permission);
  }

  async createApprovalRequest(data: InsertApprovalRequest): Promise<ApprovalRequest> {
    const [row] = await db.insert(approvalRequests).values(data).returning();
    return row;
  }

  async getApprovalRequest(id: number, companyId: number): Promise<ApprovalRequest | undefined> {
    const [row] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.id, id), eq(approvalRequests.companyId, companyId))).limit(1);
    return row;
  }

  async getApprovalRequests(companyId: number, status?: string): Promise<(ApprovalRequest & { requesterName?: string; reviewerName?: string })[]> {
    const conditions = [eq(approvalRequests.companyId, companyId)];
    if (status) conditions.push(eq(approvalRequests.status, status));

    const rows = await db
      .select({
        request: approvalRequests,
        requesterName: users.name,
      })
      .from(approvalRequests)
      .innerJoin(users, eq(approvalRequests.requestedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(approvalRequests.createdAt));

    const result: (ApprovalRequest & { requesterName?: string; reviewerName?: string })[] = [];
    for (const row of rows) {
      let reviewerName: string | undefined;
      if (row.request.reviewedBy) {
        const [reviewer] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.request.reviewedBy)).limit(1);
        reviewerName = reviewer?.name || undefined;
      }
      result.push({ ...row.request, requesterName: row.requesterName || undefined, reviewerName });
    }
    return result;
  }

  async updateApprovalRequest(id: number, companyId: number, data: Partial<ApprovalRequest>): Promise<ApprovalRequest> {
    const [row] = await db
      .update(approvalRequests)
      .set(data)
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.companyId, companyId)))
      .returning();
    if (!row) throw new Error("Approval request not found");
    return row;
  }

  async getPendingApprovalCount(companyId: number): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.companyId, companyId), eq(approvalRequests.status, "pending")));
    return Number(row?.total || 0);
  }

  async getCompanyPartners(companyId: number, includeInactive = false): Promise<CompanyPartner[]> {
    const conditions = [eq(companyPartners.companyId, companyId)];
    if (!includeInactive) conditions.push(eq(companyPartners.isActive, true));
    return db.select().from(companyPartners).where(and(...conditions)).orderBy(asc(companyPartners.name));
  }

  async getCompanyPartner(partnerId: number, companyId: number): Promise<CompanyPartner | undefined> {
    const [row] = await db
      .select()
      .from(companyPartners)
      .where(and(eq(companyPartners.id, partnerId), eq(companyPartners.companyId, companyId)))
      .limit(1);
    return row;
  }

  async createCompanyPartner(companyId: number, data: Partial<InsertCompanyPartner>): Promise<CompanyPartner> {
    const [row] = await db.insert(companyPartners).values({
      companyId,
      name: data.name!,
      tradingName: data.tradingName || null,
      logoUrl: data.logoUrl || null,
      tin: data.tin || null,
      vatNumber: data.vatNumber || null,
      displayLabel: data.displayLabel || "In partnership with",
      defaultRevenueSharePercent: String(data.defaultRevenueSharePercent ?? 0),
      ownerGroupMatch: data.ownerGroupMatch || null,
      notes: data.notes || null,
      isActive: true,
    }).returning();
    return row;
  }

  async updateCompanyPartner(partnerId: number, companyId: number, data: Partial<InsertCompanyPartner>): Promise<CompanyPartner> {
    const updates: Record<string, unknown> = {};
    if (data.name) updates.name = data.name;
    if (data.tradingName !== undefined) updates.tradingName = data.tradingName;
    if (data.logoUrl !== undefined) updates.logoUrl = data.logoUrl;
    if (data.tin !== undefined) updates.tin = data.tin;
    if (data.vatNumber !== undefined) updates.vatNumber = data.vatNumber;
    if (data.displayLabel !== undefined) updates.displayLabel = data.displayLabel;
    if (data.defaultRevenueSharePercent !== undefined && data.defaultRevenueSharePercent !== null) {
      updates.defaultRevenueSharePercent = String(data.defaultRevenueSharePercent);
    }
    if (data.ownerGroupMatch !== undefined) updates.ownerGroupMatch = data.ownerGroupMatch;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const [row] = await db
      .update(companyPartners)
      .set(updates)
      .where(and(eq(companyPartners.id, partnerId), eq(companyPartners.companyId, companyId)))
      .returning();
    if (!row) throw new Error("Partner not found");
    return row;
  }

  async deactivateCompanyPartner(partnerId: number, companyId: number): Promise<void> {
    await db
      .update(companyPartners)
      .set({ isActive: false })
      .where(and(eq(companyPartners.id, partnerId), eq(companyPartners.companyId, companyId)));
  }

  async getReportPartnershipSales(companyId: number, startDate: Date, endDate: Date, partnerId?: number) {
    const conditions = [
      eq(invoices.companyId, companyId),
      gte(invoices.issueDate, startDate),
      lte(invoices.issueDate, endDate),
      ne(invoices.status, "cancelled"),
      ne(invoices.transactionType, "CreditNote"),
    ];
    if (partnerId) conditions.push(eq(invoices.partnerId, partnerId));

    const rows = await db
      .select({
        invoice: invoices,
        customerName: customers.name,
        partnerName: companyPartners.name,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(companyPartners, eq(invoices.partnerId, companyPartners.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.issueDate));

    const partnershipRows = rows.filter((r) => r.invoice.partnerId != null);
    const summaryMap = new Map<number, { partnerId: number; partnerName: string; invoiceCount: number; grossTotal: number; partnerShare: number; issuerShare: number }>();

    for (const row of partnershipRows) {
      const pid = row.invoice.partnerId!;
      const snapshot = row.invoice.partnerSnapshot as any;
      const name = snapshot?.name || row.partnerName || `Partner #${pid}`;
      const existing = summaryMap.get(pid) || { partnerId: pid, partnerName: name, invoiceCount: 0, grossTotal: 0, partnerShare: 0, issuerShare: 0 };
      existing.invoiceCount += 1;
      existing.grossTotal += Number(row.invoice.total || 0);
      existing.partnerShare += Number(row.invoice.partnerShareAmount || 0);
      existing.issuerShare += Number(row.invoice.issuerShareAmount || 0);
      summaryMap.set(pid, existing);
    }

    return {
      summary: Array.from(summaryMap.values()).sort((a, b) => b.grossTotal - a.grossTotal),
      invoices: partnershipRows.map((r) => ({
        id: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber,
        issueDate: r.invoice.issueDate,
        customerName: r.customerName,
        status: r.invoice.status,
        total: Number(r.invoice.total || 0),
        partnerId: r.invoice.partnerId,
        partnerName: (r.invoice.partnerSnapshot as any)?.name || r.partnerName,
        revenueSharePercent: Number(r.invoice.revenueSharePercent || 0),
        partnerShareAmount: Number(r.invoice.partnerShareAmount || 0),
        issuerShareAmount: Number(r.invoice.issuerShareAmount || 0),
      })),
    };
  }

  // Analytics
  async getCompanyStats(companyId: number) {
    const companyInvoices = await db.select().from(invoices).where(eq(invoices.companyId, companyId));
    const companyCustomers = await db.select().from(customers).where(eq(customers.companyId, companyId));

    const totalRevenue = companyInvoices
      .filter(i => (i.status === 'paid' || i.status === 'issued') && i.transactionType !== 'CreditNote')
      .reduce((sum, inv) => {
        // Normalize to base (USD) using the exchange rate at the time of invoice
        const amount = Number(inv.total) / Number(inv.exchangeRate || 1);
        return sum + amount;
      }, 0);

    const pendingAmount = companyInvoices
      .filter(i => i.status === 'issued' && i.transactionType !== 'CreditNote')
      .reduce((sum, inv) => {
        const amount = Number(inv.total) / Number(inv.exchangeRate || 1);
        return sum + amount;
      }, 0);

    // Subtract Credit Notes if any (though usually CNs are separate, let's be safe)
    const totalCNs = companyInvoices
      .filter(i => (i.status === 'paid' || i.status === 'issued') && i.transactionType === 'CreditNote')
      .reduce((sum, inv) => {
        const amount = Number(inv.total) / Number(inv.exchangeRate || 1);
        return sum + amount;
      }, 0);

    // Calculate Pending Credit Notes (Issued but not paid/cancelled) to subtract from Pending Amount
    const pendingCNs = companyInvoices
      .filter(i => i.status === 'issued' && i.transactionType === 'CreditNote')
      .reduce((sum, inv) => {
        const amount = Number(inv.total) / Number(inv.exchangeRate || 1);
        return sum + amount;
      }, 0);

    const finalRevenue = totalRevenue - totalCNs;
    const finalPending = pendingAmount - pendingCNs;

    return {
      totalRevenue: Math.round(finalRevenue * 100) / 100,
      pendingAmount: Math.round(finalPending * 100) / 100,
      invoicesCount: companyInvoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft' && i.transactionType !== 'CreditNote').length,
      customersCount: companyCustomers.length
    };
  }

  async getRevenueOverTime(companyId: number, days: number = 30) {
    const companyInvoices = await db.select().from(invoices).where(eq(invoices.companyId, companyId));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const dailyMap = new Map<string, number>();

    companyInvoices.forEach(inv => {
      if ((inv.status === 'paid' || inv.status === 'issued') && inv.issueDate && new Date(inv.issueDate) >= cutoff) {
        const dateKey = new Date(inv.issueDate).toISOString().split('T')[0];
        // Normalize to base (USD)
        const amount = Number(inv.total) / Number(inv.exchangeRate || 1);
        const current = dailyMap.get(dateKey) || 0;

        if (inv.transactionType === 'CreditNote') {
          dailyMap.set(dateKey, current - amount);
        } else {
          dailyMap.set(dateKey, current + amount);
        }
      }
    });

    const result = Array.from(dailyMap.entries())
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
    return result;
  }

  async calculateFiscalCounters(companyId: number, fiscalDayNo: number): Promise<FiscalDayCounter[]> {
    const dayInvoicesInfo = await db
      .select({
        invoice: invoices,
        item: invoiceItems
      })
      .from(invoices)
      .leftJoin(invoiceItems, eq(invoices.id, invoiceItems.invoiceId))
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.fiscalDayNo, fiscalDayNo),
        eq(invoices.syncedWithFdms, true) // ONLY COUNT SYNCED INVOICES!
      ));

    const countersMap = new Map<string, any>();

    const getCounter = (key: string, type: string, currency: string, taxPercent: number, taxID: number, moneyType: string | null = null) => {
      // Determine distinct "Exempt" status via DB lookup or fallback
      const isExempt = taxID === 1;

      if (!countersMap.has(key)) {
        const isBalanceCounter = type === 'BalanceByMoneyType';
        countersMap.set(key, {
          fiscalCounterType: type,
          fiscalCounterCurrency: currency,
          // Only include tax percent/ID for non-balance counters
          //RCPT016: "In case of exempt which does not send tax percent value"
          ...(!isExempt && !isBalanceCounter ? { fiscalCounterTaxPercent: taxPercent } : {}),
          ...(!isBalanceCounter ? { fiscalCounterTaxID: taxID } : {}),
          ...(moneyType ? { fiscalCounterMoneyType: moneyType } : {}),
          fiscalCounterValue: 0
        });
      }
      return countersMap.get(key);
    };

    // Pre-fetch tax types for the company once
    const dbTaxTypes = await this.getTaxTypes(companyId);

    const resolveCounterTaxID = (taxPercent: number, taxTypeId?: number | null, description = '') => {
      let matchingTax: TaxType | undefined;

      if (taxTypeId) {
        matchingTax = dbTaxTypes.find(t => t.id === taxTypeId);
      }

      // Fallback to rate matching if not found by ID
      if (!matchingTax) {
        matchingTax = dbTaxTypes.find(t =>
          Math.abs(Number(t.rate) - taxPercent) < 0.01
        );
      }

      let taxID = 0;

      if (matchingTax?.zimraTaxId) {
        taxID = parseInt(matchingTax.zimraTaxId);

        // Refined check for 0% ambiguity (if matchedTax is not ID 1 but item might be exempt)
        if (taxPercent === 0 && taxID !== 1) {
          const isExemptIntent = description.toLowerCase().includes('exempt');
          if (isExemptIntent) {
            const realExempt = dbTaxTypes.find(t => t.zimraTaxId === "1" || t.name.toLowerCase().includes('exempt'));
            if (realExempt && realExempt.zimraTaxId) {
              taxID = parseInt(realExempt.zimraTaxId);
            }
          }
        }
      } else {
        // Fallback by Name if ID is missing from matchingTax or matchingTax itself is missing
        const name = matchingTax?.name?.toLowerCase() || '';
        const desc = description.toLowerCase();

        if (name.includes('exempt') || desc.includes('exempt')) {
          const exemptTax = dbTaxTypes.find(t => t.name.toLowerCase().includes('exempt') && t.zimraTaxId);
          if (exemptTax) taxID = parseInt(exemptTax.zimraTaxId!);
          else taxID = 1; // Direct fallback to ID 1 for Exempt
        } else if (name.includes('zero') || name.includes('0%') || taxPercent === 0) {
          const zeroTax = dbTaxTypes.find(t => (t.name.toLowerCase().includes('zero') || t.name.includes('0%')) && t.zimraTaxId);
          if (zeroTax) taxID = parseInt(zeroTax.zimraTaxId!);
          else taxID = 2; // Direct fallback to ID 2 for Zero Rated
        } else {
          // Standard matches
          const stdTax = dbTaxTypes.find(t => (t.name.toLowerCase().includes('standard') || t.name.toLowerCase().includes('vat')) && t.zimraTaxId);
          if (stdTax) taxID = parseInt(stdTax.zimraTaxId!);
          else taxID = 3; // Direct fallback to ID 3 for Standard
        }
      }

      // Final safety fallback
      if (taxID === 0) {
        if (taxPercent === 0) taxID = 2;
        else taxID = 3;
      }

      return taxID;
    };

    const inferFallbackTaxPercent = (subtotal: number, taxAmt: number) => {
      if (subtotal <= 0 || taxAmt <= 0) return 0;

      const impliedRate = Math.round((taxAmt / subtotal) * 10000) / 100;
      const closestTaxType = dbTaxTypes
        .map(t => ({ rate: Number(t.rate), diff: Math.abs(Number(t.rate) - impliedRate) }))
        .filter(t => Number.isFinite(t.rate))
        .sort((a, b) => a.diff - b.diff)[0];

      // Small inclusive receipts can round subtotal/tax enough to produce rates like 14.94 for a 15.50% tax.
      return closestTaxType && closestTaxType.diff <= 1 ? closestTaxType.rate : impliedRate;
    };

    const addTaxCounters = (type: string, currency: string, taxPercent: number, taxID: number, amountWithTax: number, taxAmt: number) => {
      let signedAmountWithTax = Math.abs(amountWithTax);
      let signedTaxAmt = Math.abs(taxAmt);

      if (type === 'CreditNote') {
        signedAmountWithTax = -signedAmountWithTax;
        signedTaxAmt = -signedTaxAmt;
      }

      if (type === 'FiscalInvoice' || type === 'Invoice') {
        const keySale = `SaleByTax-${currency}-${taxPercent}-${taxID}`;
        const cSale = getCounter(keySale, 'SaleByTax', currency, taxPercent, taxID);
        cSale.fiscalCounterValue += signedAmountWithTax;

        const keyTax = `SaleTaxByTax-${currency}-${taxPercent}-${taxID}`;
        const cTax = getCounter(keyTax, 'SaleTaxByTax', currency, taxPercent, taxID);
        cTax.fiscalCounterValue += signedTaxAmt;
      } else if (type === 'CreditNote') {
        const keySale = `CreditNoteByTax-${currency}-${taxPercent}-${taxID}`;
        const cSale = getCounter(keySale, 'CreditNoteByTax', currency, taxPercent, taxID);
        cSale.fiscalCounterValue += signedAmountWithTax;

        const keyTax = `CreditNoteTaxByTax-${currency}-${taxPercent}-${taxID}`;
        const cTax = getCounter(keyTax, 'CreditNoteTaxByTax', currency, taxPercent, taxID);
        cTax.fiscalCounterValue += signedTaxAmt;
      } else if (type === 'DebitNote') {
        const keySale = `DebitNoteByTax-${currency}-${taxPercent}-${taxID}`;
        const cSale = getCounter(keySale, 'DebitNoteByTax', currency, taxPercent, taxID);
        cSale.fiscalCounterValue += signedAmountWithTax;

        const keyTax = `DebitNoteTaxByTax-${currency}-${taxPercent}-${taxID}`;
        const cTax = getCounter(keyTax, 'DebitNoteTaxByTax', currency, taxPercent, taxID);
        cTax.fiscalCounterValue += signedTaxAmt;
      }
    };

    const invoicesWithItems = new Set<number>();

    for (const row of dayInvoicesInfo) {
      if (!row.invoice || !row.item) continue;

      const inv = row.invoice;
      const item = row.item;
      invoicesWithItems.add(inv.id);
      const currency = inv.currency || "USD";
      const taxPercent = Number(item.taxRate);
      const taxID = resolveCounterTaxID(taxPercent, item.taxTypeId, item.description || '');

      const type = inv.transactionType || "FiscalInvoice";
      const valLineTotal = Number(item.lineTotal);
      let amountWithTax = valLineTotal;
      let taxAmt = 0;

      if (!inv.taxInclusive) {
        // net + tax
        taxAmt = valLineTotal * (taxPercent / 100);
        amountWithTax = valLineTotal + taxAmt;
      } else {
        // total - net
        taxAmt = valLineTotal - (valLineTotal / (1 + taxPercent / 100));
        amountWithTax = valLineTotal;
      }

      // Round taxAmt and amountWithTax to 2 decimals for accuracy
      taxAmt = Math.round(taxAmt * 100) / 100;
      amountWithTax = Math.round(amountWithTax * 100) / 100;

      addTaxCounters(type, currency, taxPercent, taxID, amountWithTax, taxAmt);
    }

    const uniqueInvoices = new Map();
    dayInvoicesInfo.forEach(r => {
      if (r.invoice) uniqueInvoices.set(r.invoice.id, r.invoice);
    });

    for (const inv of uniqueInvoices.values()) {
      const currency = inv.currency || "USD";
      const type = inv.transactionType || "FiscalInvoice";

      if (!invoicesWithItems.has(inv.id)) {
        const amountWithTax = Number(inv.total);
        const taxAmt = Number(inv.taxAmount || 0);
        const subtotal = Number(inv.subtotal || 0);
        const taxPercent = inferFallbackTaxPercent(subtotal, taxAmt);
        const taxID = resolveCounterTaxID(taxPercent, null, inv.notes || '');

        addTaxCounters(type, currency, taxPercent, taxID, amountWithTax, taxAmt);
      }

      const method = (inv.paymentMethod || "CASH").toUpperCase();
      let moneyType = "Other"; // Default to Other

      if (['CARD', 'SWIPE', 'POS'].includes(method)) moneyType = "Card";
      else if (['ECOCASH', 'MOBILE', 'MOBILEWALLET', 'ONE_MONEY', 'TELE_CASH', 'INNBUCKS'].includes(method)) moneyType = "MobileWallet";
      else if (['EFT', 'RTGS', 'TRANSFER', 'ZIPIT', 'BANKTRANSFER'].includes(method)) moneyType = "BankTransfer";
      else if (method === 'CASH') moneyType = "Cash";
      const keyBal = `BalanceByMoneyType-${currency}-${moneyType}`;
      // Fix: Ensure we correctly create the counter for this money type
      const cBal = getCounter(keyBal, 'BalanceByMoneyType', currency, 0, 0, moneyType);

      let amount = Number(inv.total);
      if (inv.transactionType === 'CreditNote') {
        amount = -Math.abs(amount);
      } else {
        amount = Math.abs(amount);
      }
      cBal.fiscalCounterValue += amount;
    }

    return Array.from(countersMap.values()).map(c => ({
      ...c,
      fiscalCounterValue: Math.round(c.fiscalCounterValue * 100) / 100
    }));
  }

  async getZReportData(companyId: number, fiscalDayNo: number) {
    const company = await this.getCompany(companyId);
    if (!company) throw new Error("Company not found");

    const invoicesInDay = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.fiscalDayNo, fiscalDayNo)));

    const counters = await this.calculateFiscalCounters(companyId, fiscalDayNo);

    // Group document quantities by currency and type
    const docStatsByCurrency = new Map<string, any>();

    const getDocStat = (currency: string) => {
      if (!docStatsByCurrency.has(currency)) {
        docStatsByCurrency.set(currency, {
          currency,
          invoices: { quantity: 0, total: 0 },
          creditNotes: { quantity: 0, total: 0 },
          debitNotes: { quantity: 0, total: 0 },
          totalDocuments: { quantity: 0, total: 0 }
        });
      }
      return docStatsByCurrency.get(currency);
    };

    invoicesInDay.forEach(inv => {
      const currency = inv.currency || "USD";
      const stats = getDocStat(currency);
      const type = inv.transactionType || "FiscalInvoice";
      const amount = Number(inv.total);

      if (type === 'FiscalInvoice' || type === 'Invoice') {
        stats.invoices.quantity++;
        stats.invoices.total += amount;
      } else if (type === 'CreditNote') {
        stats.creditNotes.quantity++;
        stats.creditNotes.total += amount; // Amount is expected to be negative for CN
      } else if (type === 'DebitNote') {
        stats.debitNotes.quantity++;
        stats.debitNotes.total += amount;
      }

      stats.totalDocuments.quantity++;
      stats.totalDocuments.total += amount;
    });

    // Round stats
    for (const stats of docStatsByCurrency.values()) {
      stats.invoices.total = Math.round(stats.invoices.total * 100) / 100;
      stats.creditNotes.total = Math.round(stats.creditNotes.total * 100) / 100;
      stats.debitNotes.total = Math.round(stats.debitNotes.total * 100) / 100;
      stats.totalDocuments.total = Math.round(stats.totalDocuments.total * 100) / 100;
    }

    return {
      company,
      fiscalDayNo,
      openedAt: company.fiscalDayOpenedAt,
      closedAt: new Date(), // If this is called during close, it's roughly now
      counters,
      docStats: Array.from(docStatsByCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency))
    };
  }

  async getNextInvoiceNumber(companyId: number, prefix: string = 'INV'): Promise<string> {
    const normalizedPrefix = String(prefix || 'INV').trim().toUpperCase();
    const [counter] = await db.transaction(async (tx) => {
      await tx.execute(sql`
        CREATE TABLE IF NOT EXISTS document_number_counters (
          company_id integer NOT NULL,
          prefix text NOT NULL,
          last_number integer NOT NULL DEFAULT 0,
          updated_at timestamp DEFAULT now() NOT NULL,
          PRIMARY KEY (company_id, prefix)
        )
      `);

      await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}, hashtext(${normalizedPrefix}))`);

      await tx.execute(sql`
        WITH historical_numbers AS (
          SELECT invoice_number AS document_number
          FROM invoices
          WHERE company_id = ${companyId}

          UNION ALL

          SELECT coalesce(
            request_payload #>> '{receipt,invoiceNo}',
            request_payload #>> '{receiptData,invoiceNo}',
            request_payload ->> 'invoiceNo',
            response_payload #>> '{receipt,invoiceNo}',
            response_payload #>> '{receiptData,invoiceNo}',
            response_payload ->> 'invoiceNo'
          ) AS document_number
          FROM zimra_logs
          WHERE company_id = ${companyId}
        ),
        seed AS (
          SELECT coalesce(max(substring(document_number from ${`^${normalizedPrefix}-([0-9]+)$`})::integer), 0) AS last_number
          FROM historical_numbers
          WHERE document_number ~ ${`^${normalizedPrefix}-[0-9]+$`}
        )
        INSERT INTO document_number_counters (company_id, prefix, last_number)
        SELECT ${companyId}, ${normalizedPrefix}, last_number
        FROM seed
        ON CONFLICT (company_id, prefix) DO UPDATE
        SET last_number = greatest(document_number_counters.last_number, excluded.last_number),
            updated_at = now()
      `);

      const result = await tx.execute(sql`
        UPDATE document_number_counters
        SET last_number = last_number + 1,
            updated_at = now()
        WHERE company_id = ${companyId}
          AND prefix = ${normalizedPrefix}
        RETURNING last_number
      `);

      return result.rows as Array<{ last_number: number }>;
    });

    const nextNum = Number(counter?.last_number || 1);
    return `${normalizedPrefix}-${nextNum.toString().padStart(3, '0')}`;
  }

  // Payments
  async createPayment(payment: InsertPayment & { companyId: number; skipLedger?: boolean }): Promise<Payment> {
    return await db.transaction(async (tx) => {
      const { skipLedger, ...paymentData } = payment;
      let [newPayment] = await tx.insert(payments).values(paymentData).returning();
      
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, newPayment.invoiceId));
      if (invoice) {
        if (skipLedger) {
          const newPaidAmount = (Number(invoice.paidAmount) + Number(newPayment.amount)).toFixed(2);
          const isFullyPaid = Number(newPaidAmount) >= Number(invoice.total);

          await tx.update(invoices)
            .set({
              paidAmount: newPaidAmount,
              status: isFullyPaid ? 'paid' : 'partial'
            })
            .where(eq(invoices.id, invoice.id));

          return newPayment;
        }

        let fxVariance = 0;
        const currentRate = Number(newPayment.exchangeRate || 1);
        const invoiceRate = Number(invoice.exchangeRate || 1);
        
        const originalBaseValue = Number(newPayment.amount) / invoiceRate;
        const currentBaseValue = Number(newPayment.amount) / currentRate;
        fxVariance = Math.round((currentBaseValue - originalBaseValue) * 100) / 100;
        const cashAccountCode = await this.getSystemAccountCode(invoice.companyId, "cashAccountCode", tx);
        const arAccountCode = await this.getSystemAccountCode(invoice.companyId, "accountsReceivableCode", tx);
        const fxGainAccountCode = await this.getSystemAccountCode(invoice.companyId, "fxGainAccountCode", tx);
        const fxLossAccountCode = await this.getSystemAccountCode(invoice.companyId, "fxLossAccountCode", tx);
        
        const lines: { accountCode: string, type: 'DEBIT' | 'CREDIT', amount: number }[] = [
          { accountCode: cashAccountCode, type: "DEBIT", amount: currentBaseValue },
          { accountCode: arAccountCode, type: "CREDIT", amount: originalBaseValue },
        ];

        // FX Gain/Loss automated posting
        if (fxVariance > 0) {
           lines.push({ accountCode: fxGainAccountCode, type: "CREDIT", amount: fxVariance });
        } else if (fxVariance < 0) {
           lines.push({ accountCode: fxLossAccountCode, type: "DEBIT", amount: Math.abs(fxVariance) });
        }

        const je = await this.postToLedger(invoice.companyId, {
          entryDate: newPayment.paymentDate,
          description: `Payment for Invoice ${invoice.invoiceNumber} (${newPayment.paymentMethod}) - FX Auth`,
          referenceType: "PAYMENT",
          referenceId: newPayment.id.toString(),
          createdBy: newPayment.createdBy || undefined,
          branchId: newPayment.branchId || undefined,
          lines
        }, tx);

        // Write the journal entry ID back to the payment record for full audit trail
        await tx.update(payments)
          .set({ journalEntryId: je.id })
          .where(eq(payments.id, newPayment.id));
        newPayment = { ...newPayment, journalEntryId: je.id };

        // Update Invoice Paid Amount and Status
        const newPaidAmount = (Number(invoice.paidAmount) + Number(newPayment.amount)).toFixed(2);
        const isFullyPaid = Number(newPaidAmount) >= Number(invoice.total);
        
        await tx.update(invoices)
          .set({ 
            paidAmount: newPaidAmount,
            status: isFullyPaid ? 'paid' : 'partial'
          })
          .where(eq(invoices.id, invoice.id));
      }
      
      return newPayment;
    });
  }

  async getPayments(invoiceId: number): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(desc(payments.paymentDate));
  }

  async getReceivablesAging(companyId: number, currency: string = 'USD'): Promise<{
    total: number;
    current: number;
    days1_15: number;
    days16_30: number;
    days31_45: number;
    above45: number;
  }> {
    const allInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.currency, currency),
        ne(invoices.status, "draft"),
        ne(invoices.status, "cancelled")
      ));

    const now = new Date();
    const result = {
      total: 0,
      current: 0,
      days1_15: 0,
      days16_30: 0,
      days31_45: 0,
      above45: 0,
    };

    for (const inv of allInvoices) {
      const total = Number(inv.total);

      // Calculate paid amount from payments for this invoice
      const invoicePayments = await db.select({ amount: payments.amount })
        .from(payments)
        .where(eq(payments.invoiceId, inv.id));
      const paid = invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0);

      const balance = total - paid;

      if (balance <= 0) continue;

      result.total += balance;

      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.issueDate || now);
      const diffTime = now.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        result.current += balance;
      } else if (diffDays <= 15) {
        result.days1_15 += balance;
      } else if (diffDays <= 30) {
        result.days16_30 += balance;
      } else if (diffDays <= 45) {
        result.days31_45 += balance;
      } else {
        result.above45 += balance;
      }
    }

    return result;
  }

  async getFiscalYearStats(companyId: number, currency: string = 'USD'): Promise<{
    totalSales: number;
    totalReceipts: number;
    totalExpenses: number;
    monthlyData: { month: string; sales: number; expenses: number }[];
  }> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const yearInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.currency, currency),
        gte(invoices.issueDate, startOfYear),
        lte(invoices.issueDate, endOfYear),
        ne(invoices.status, "draft"),
        ne(invoices.status, "cancelled")
      ));

    const yearPayments = await db.select()
      .from(payments)
      .where(and(
        eq(payments.companyId, companyId),
        eq(payments.currency, currency),
        gte(payments.paymentDate, startOfYear),
        lte(payments.paymentDate, endOfYear)
      ));

    const yearExpenses = await db.select()
      .from(expenses)
      .where(and(
        eq(expenses.companyId, companyId),
        eq(expenses.currency, currency),
        gte(expenses.expenseDate, startOfYear),
        lte(expenses.expenseDate, endOfYear)
      ));

    let totalSales = 0;
    let totalReceipts = 0;
    let totalExpenses = 0;

    const monthlyMap: Record<string, { sales: number; expenses: number }> = {};
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach(m => {
      monthlyMap[`${m} ${currentYear}`] = { sales: 0, expenses: 0 };
    });

    for (const inv of yearInvoices) {
      const amount = Number(inv.total);
      totalSales += amount;
      const monthDate = inv.issueDate ? new Date(inv.issueDate) : now;
      const month = months[monthDate.getMonth()];
      const key = `${month} ${currentYear}`;
      if (monthlyMap[key]) monthlyMap[key].sales += amount;
    }

    for (const pay of yearPayments) {
      totalReceipts += Number(pay.amount);
    }

    for (const exp of yearExpenses) {
      const amount = Number(exp.amount);
      totalExpenses += amount;
      const monthDate = exp.expenseDate ? new Date(exp.expenseDate) : now;
      const month = months[monthDate.getMonth()];
      const key = `${month} ${currentYear}`;
      if (monthlyMap[key]) monthlyMap[key].expenses += amount;
    }

    const monthlyData = Object.entries(monthlyMap).map(([month, data]) => ({
      month,
      sales: data.sales,
      expenses: data.expenses,
    }));

    // Ensure chronological order
    monthlyData.sort((a, b) => {
      const monthA = months.indexOf(a.month.split(" ")[0]);
      const monthB = months.indexOf(b.month.split(" ")[0]);
      return monthA - monthB;
    });

    return {
      totalSales,
      totalReceipts,
      totalExpenses,
      monthlyData,
    };
  }

  async getPayment(id: number): Promise<(Payment & { invoice?: Invoice; customer?: Customer; company?: Company }) | undefined> {
    const [result] = await db.select({
      payment: payments,
      invoice: invoices,
      customer: customers,
      company: companies
    })
      .from(payments)
      .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(companies, eq(payments.companyId, companies.id))
      .where(eq(payments.id, id));

    if (!result) return undefined;

    return {
      ...result.payment,
      invoice: result.invoice || undefined,
      customer: result.customer || undefined,
      company: result.company || undefined
    };
  }

  async deletePayment(id: number): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
  }

  // Reports - Customer Statement
  async getStatementData(customerId: number, startDate: Date, endDate: Date, currency?: string): Promise<{
    customer: Customer;
    openingBalance: number;
    closingBalance: number;
    transactions: any[];
  }> {
    const customer = (await db.select().from(customers).where(eq(customers.id, customerId)))[0];
    if (!customer) throw new Error("Customer not found");

    // Fetch all invoices (and CNs) for this customer
    let userInvoicesQuery = db.select().from(invoices).where(eq(invoices.customerId, customerId));
    const userInvoices = await userInvoicesQuery;

    // Fetch all payments for these invoices in a single query
    const invoiceIds = userInvoices.map(inv => inv.id);
    let userPayments: Payment[] = [];
    if (invoiceIds.length > 0) {
      userPayments = await db.select().from(payments).where(inArray(payments.invoiceId, invoiceIds));
      // Filter by currency if provided
      if (currency) {
        const currencyInvoiceIds = new Set(userInvoices.filter(inv => inv.currency === currency).map(inv => inv.id));
        userPayments = userPayments.filter(p => p.invoiceId && currencyInvoiceIds.has(p.invoiceId));
      }
    }

    // Filter invoices by currency if provided
    const filteredInvoices = currency
      ? userInvoices.filter(inv => inv.currency === currency)
      : userInvoices;

    // Sort all transactions by date
    // Normalize dates — end includes the full day
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Calculate Opening Balance (Transactions < start)
    let openingBalance = 0;

    // Process Invoices/CNs
    for (const inv of filteredInvoices) {
      if (!inv.issueDate) continue; // Skip if no issue date
      const date = new Date(inv.issueDate);
      // Only issued/paid/fiscalized count towards balance? 
      // Draft/Cancelled do not. 
      if (['draft', 'cancelled'].includes(inv.status || '')) continue;

      const amount = Number(inv.total);

      if (date < start) {
        if (inv.transactionType === 'CreditNote') {
          openingBalance -= amount;
        } else {
          openingBalance += amount;
        }
      }
    }

    // Process Payments
    for (const pay of userPayments) {
      const date = new Date(pay.paymentDate);
      if (date < start) {
        openingBalance -= Number(pay.amount);
      }
    }

    // Build Transaction List (start <= date <= end)
    const transactions: any[] = [];

    // 1. Invoices & CNs
    for (const inv of filteredInvoices) {
      if (!inv.issueDate) continue; // Skip if no issue date
      const date = new Date(inv.issueDate);
      if (['draft', 'cancelled'].includes(inv.status || '')) continue;

      if (date >= start && date <= end) {
        transactions.push({
          date: date,
          type: inv.transactionType === 'CreditNote' ? 'Credit Note' : 'Invoice',
          reference: inv.invoiceNumber,
          description: inv.transactionType === 'CreditNote' ? 'Credit Note Issued' : 'Invoice Issued',
          debit: inv.transactionType !== 'CreditNote' ? Number(inv.total) : 0,
          credit: inv.transactionType === 'CreditNote' ? Number(inv.total) : 0,
          id: inv.id
        });
      }
    }

    // 2. Payments
    for (const pay of userPayments) {
      const date = new Date(pay.paymentDate);
      if (date >= start && date <= end) {
        transactions.push({
          date: date,
          type: 'Payment',
          reference: pay.reference || 'PAYMENT',
          description: `Payment for ${userInvoices.find(i => i.id === pay.invoiceId)?.invoiceNumber || 'Invoice'}`,
          debit: 0,
          credit: Number(pay.amount),
          id: pay.id
        });
      }
    }

    // Sort by date
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate Running Balance
    let runningBalance = openingBalance;
    const finalTransactions = transactions.map(t => {
      runningBalance += (t.debit - t.credit);
      return { ...t, balance: runningBalance };
    });

    return {
      customer,
      openingBalance,
      closingBalance: runningBalance,
      transactions: finalTransactions
    };
  }

  async getPaymentsReport(companyId: number, startDate: Date, endDate: Date): Promise<any[]> {
    const results = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        currency: payments.currency,
        paymentDate: payments.paymentDate,
        paymentMethod: payments.paymentMethod,
        reference: payments.reference,
        notes: payments.notes,
        invoiceId: payments.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        invoiceTotal: invoices.total,
        invoicePaidAmount: sql<string>`(SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = ${invoices.id})`,
        customerId: customers.id,
        customerName: customers.name,
        customerEmail: customers.email,
      })
      .from(payments)
      .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(eq(payments.companyId, companyId))
      .orderBy(desc(payments.paymentDate));

    // Filter by date range in JS to avoid timezone/type casting issues
    const filtered = results.filter(r => {
      if (!r.paymentDate) return true;
      const d = new Date(r.paymentDate);
      return d >= startDate && d <= endDate;
    });

    console.log(`[getPaymentsReport] companyId=${companyId} → ${results.length} total, ${filtered.length} in range (${startDate.toISOString()} – ${endDate.toISOString()})`);
    return filtered;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [auditLog] = await db.insert(auditLogs).values(log).returning();
    return auditLog;
  }

  async getAuditLogs(companyId: number, limit: number = 50): Promise<AuditLog[]> {
    return await db.select()
      .from(auditLogs)
      .where(eq(auditLogs.companyId, companyId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // Recurring Invoices
  async getRecurringInvoices(companyId: number): Promise<RecurringInvoice[]> {
    return await db.select().from(recurringInvoices).where(eq(recurringInvoices.companyId, companyId));
  }

  async getDueRecurringInvoices(): Promise<RecurringInvoice[]> {
    const now = new Date();
    return await db.select().from(recurringInvoices).where(
      and(
        eq(recurringInvoices.status, "active"),
        lte(recurringInvoices.nextRunDate, now)
      )
    );
  }

  async createRecurringInvoice(data: InsertRecurringInvoice): Promise<RecurringInvoice> {
    const [recurring] = await db.insert(recurringInvoices).values(data).returning();
    return recurring;
  }

  async updateRecurringInvoice(id: number, data: Partial<InsertRecurringInvoice>): Promise<RecurringInvoice> {
    const [updated] = await db.update(recurringInvoices).set(data).where(eq(recurringInvoices.id, id)).returning();
    return updated;
  }

  async deleteRecurringInvoice(id: number): Promise<void> {
    await db.delete(recurringInvoices).where(eq(recurringInvoices.id, id));
  }

  // Quotations
  async getQuotations(companyId: number): Promise<Quotation[]> {
    return await db.select().from(quotations).where(eq(quotations.companyId, companyId)).orderBy(desc(quotations.createdAt));
  }

  async getQuotation(id: number): Promise<(Quotation & { items: QuotationItem[]; customer?: Customer }) | undefined> {
    const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id));
    if (!quotation) return undefined;

    const [customer] = await db.select().from(customers).where(eq(customers.id, quotation.customerId));
    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id));

    return { ...quotation, items, customer };
  }

  async createQuotation(data: InsertQuotation & { items: InsertQuotationItem[] }): Promise<Quotation> {
    return await db.transaction(async (tx) => {
      const { items, ...quotationData } = data;
      const [quotation] = await tx.insert(quotations).values({
        ...quotationData,
        quotationNumber: await this.getNextQuotationNumber(quotationData.companyId),
      }).returning();

      if (items.length > 0) {
        await tx.insert(quotationItems).values(
          items.map(item => ({ ...item, quotationId: quotation.id }))
        );
      }

      return quotation;
    });
  }

  async updateQuotation(id: number, data: Partial<InsertQuotation> & { items?: InsertQuotationItem[] }): Promise<Quotation> {
    return await db.transaction(async (tx) => {
      const { items, ...quotationData } = data;
      const [updated] = await tx
        .update(quotations)
        .set(quotationData)
        .where(eq(quotations.id, id))
        .returning();

      if (!updated) throw new Error("Quotation not found");

      if (items) {
        await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
        if (items.length > 0) {
          await tx.insert(quotationItems).values(
            items.map(item => ({ ...item, quotationId: id }))
          );
        }
      }

      return updated;
    });
  }

  async deleteQuotation(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
      await tx.delete(quotations).where(eq(quotations.id, id));
    });
  }

  async getNextQuotationNumber(companyId: number): Promise<string> {
    const allQuotes = await db
      .select({ quotationNumber: quotations.quotationNumber })
      .from(quotations)
      .where(eq(quotations.companyId, companyId));

    const relevant = allQuotes
      .filter(q => q.quotationNumber.startsWith("QT-"))
      .map(q => {
        const parts = q.quotationNumber.split("-");
        const numPart = parts[1];
        return numPart ? parseInt(numPart) : 0;
      })
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a);

    const nextNum = relevant.length > 0 ? relevant[0] + 1 : 1;
    return `QT-${nextNum.toString().padStart(3, "0")}`;
  }

  async createZimraLog(log: InsertZimraLog): Promise<ZimraLog> {
    const [newL] = await db.insert(zimraLogs).values(log).returning();
    return newL;
  }

  async getZimraLogs(invoiceId: number): Promise<ZimraLog[]> {
    return await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, invoiceId)).orderBy(desc(zimraLogs.createdAt));
  }

  async getCompanyZimraLogs(companyId: number, limit: number = 100): Promise<ZimraLog[]> {
    return await db.select()
      .from(zimraLogs)
      .where(eq(zimraLogs.companyId, companyId))
      .orderBy(desc(zimraLogs.createdAt))
      .limit(limit);
  }

  async resolveGreyErrors(companyId: number, fiscalDayNo: number, skipInvoiceId?: number): Promise<void> {
    const dayInvoices = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.fiscalDayNo, fiscalDayNo)))
      .orderBy(invoices.receiptCounter);

    // Find the end of the continuous synced chain (starting from 1)
    let chainCompleteUntil = 0;
    let expectedCounter = 1;
    for (const inv of dayInvoices) {
      if (inv.syncedWithFdms && inv.receiptCounter === expectedCounter) {
        chainCompleteUntil = inv.receiptCounter;
        expectedCounter++;
      } else {
        break; // Gap found (not synced or skip in sequence)
      }
    }

    if (chainCompleteUntil === 0) return;

    // "Heal" invoices that were "Grey" but are now preceding the broken part of the chain
    // Per ZIMRA Spec: "With each of the next received receipt, such 'Grey' receipt will be revalidated"
    for (const inv of dayInvoices) {
      // SKIP the invoice that was just submitted - we want to keep ZIMRA's explicit feedback for it
      if (skipInvoiceId && inv.id === skipInvoiceId) continue;

      // If it's within the completed part of the chain and has a validation status that needs re-checking
      if (inv.receiptCounter && inv.receiptCounter <= chainCompleteUntil &&
        (inv.validationStatus === 'grey' || inv.validationStatus === 'invalid' || inv.validationStatus === 'red')) {

        // Fetch current validation errors
        const errors = await db.select().from(validationErrors).where(eq(validationErrors.invoiceId, inv.id));
        const hasChainError = errors.some(e => e.requiresPreviousReceipt);

        if (hasChainError) {
          // Remove the chain-related errors locally (they are now resolved by the complete chain)
          await db.delete(validationErrors).where(and(
            eq(validationErrors.invoiceId, inv.id),
            eq(validationErrors.requiresPreviousReceipt, true)
          ));

          // Recalculate overall status from remaining errors (if any)
          const remainingErrors = await db.select().from(validationErrors)
            .where(eq(validationErrors.invoiceId, inv.id));

          let newStatus = 'valid';
          if (remainingErrors.length > 0) {
            // Priority: Red > Grey > Yellow
            if (remainingErrors.some(e => e.errorColor === 'Red')) newStatus = 'red';
            else if (remainingErrors.some(e => e.errorColor === 'Grey')) newStatus = 'grey';
            else if (remainingErrors.some(e => e.errorColor === 'Yellow')) newStatus = 'yellow';
          }

          await db.update(invoices).set({ validationStatus: newStatus }).where(eq(invoices.id, inv.id));
          console.log(`[ZIMRA] Auto-resolved Grey errors for Invoice #${inv.id} (${inv.invoiceNumber})`);
        }
      }
    }
  }

  async getInvoicesByFiscalDay(companyId: number, fiscalDayNo: number): Promise<Invoice[]> {
    return await db.select().from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.fiscalDayNo, fiscalDayNo)));
  }

  // Subscriptions implementation
  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db.insert(subscriptions).values(data).returning();
    return subscription;
  }

  async getSubscription(id: number): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return subscription;
  }

  async getSubscriptionByReference(reference: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.paynowReference, reference));
    return subscription;
  }

  async updateSubscription(id: number, data: Partial<Subscription>): Promise<Subscription> {
    const [updated] = await db.update(subscriptions).set({ ...data, updatedAt: new Date() }).where(eq(subscriptions.id, id)).returning();
    return updated;
  }

  async getActiveSubscriptionByDevice(companyId: number, deviceSerialNo: string, macAddress: string): Promise<Subscription | undefined> {
    const now = new Date();
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, companyId),
          eq(subscriptions.deviceSerialNo, deviceSerialNo),
          eq(subscriptions.deviceMacAddress, macAddress),
          eq(subscriptions.status, "paid"),
          lte(subscriptions.startDate, now),
          sql`${subscriptions.endDate} >= ${now}`
        )
      )
      .limit(1);
    return subscription;
  }

  async getSubscriptionsByCompany(companyId: number): Promise<Subscription[]> {
    return await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.companyId, companyId))
      .orderBy(sql`${subscriptions.createdAt} desc`);
  }

  async hasActiveSubscriptionByMac(companyId: number, macAddress: string): Promise<boolean> {
    const now = new Date();
    const [subscription] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, companyId),
          eq(subscriptions.deviceMacAddress, macAddress),
          eq(subscriptions.status, "paid"),
          lte(subscriptions.startDate, now),
          sql`${subscriptions.endDate} >= ${now}`
        )
      )
      .limit(1);
    return !!subscription;
  }

  // POS Shifting & Parking
  async getPosHolds(companyId: number, userId: string, branchId?: number): Promise<PosHold[]> {
    const filters = [eq(posHolds.companyId, companyId), eq(posHolds.userId, userId)];
    if (branchId) filters.push(eq(posHolds.branchId, branchId));

    return await db
      .select()
      .from(posHolds)
      .where(and(...filters))
      .orderBy(desc(posHolds.createdAt));
  }

  async createPosHold(data: InsertPosHold): Promise<PosHold> {
    const [hold] = await db.insert(posHolds).values(data).returning();
    return hold;
  }

  async deletePosHold(id: number, userId: string): Promise<void> {
    await db.delete(posHolds).where(and(eq(posHolds.id, id), eq(posHolds.userId, userId)));
  }

  async getPosShifts(companyId: number, userId: string, branchId?: number): Promise<PosShift[]> {
    const filters = [eq(posShifts.companyId, companyId), eq(posShifts.userId, userId)];
    if (branchId) filters.push(eq(posShifts.branchId, branchId));

    return await db
      .select()
      .from(posShifts)
      .where(and(...filters))
      .orderBy(desc(posShifts.startTime));
  }

  async getActivePosShift(companyId: number, userId: string, branchId?: number): Promise<PosShift | undefined> {
    const filters = [
      eq(posShifts.companyId, companyId),
      eq(posShifts.userId, userId),
      eq(posShifts.status, "open")
    ];
    if (branchId) filters.push(eq(posShifts.branchId, branchId));

    const [shift] = await db
      .select()
      .from(posShifts)
      .where(and(...filters))
      .limit(1);
    return shift;
  }

  async createPosShift(data: InsertPosShift): Promise<PosShift> {
    const [shift] = await db.insert(posShifts).values(data).returning();
    return shift;
  }

  async updatePosShift(id: number, userId: string, data: Partial<PosShift>): Promise<PosShift> {
    const [updated] = await db
      .update(posShifts)
      .set(data)
      .where(and(eq(posShifts.id, id), eq(posShifts.userId, userId)))
      .returning();
    return updated;
  }

  async getARAgingReport(companyId: number, asOfDate: Date = new Date()): Promise<any[]> {
    const rows = await db.select({
      invoice: invoices,
      customer: customers
    }).from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, 'paid'),
        ne(invoices.status, 'cancelled'),
        inArray(invoices.transactionType, ['FiscalInvoice', 'OpeningBalance'])
      ));
    
    const byCustomer = new Map<number, any>();
    
    rows.forEach(r => {
      const custId = r.customer?.id || 0;
      if (!byCustomer.has(custId)) {
        byCustomer.set(custId, {
          customerId: custId,
          customerName: r.customer?.name || "No Customer",
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          total: 0
        });
      }
      
      const cust = byCustomer.get(custId);
      const dueDate = new Date(r.invoice.dueDate || r.invoice.issueDate || new Date());
      
      // Calculate days overdue (difference from due date, not issuance)
      const diffTime = asOfDate.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      const balance = Number(r.invoice.total) - Number(r.invoice.paidAmount);
      
      if (diffDays <= 0) cust.current += balance;
      else if (diffDays <= 30) cust.days30 += balance;
      else if (diffDays <= 60) cust.days60 += balance;
      else if (diffDays <= 90) cust.days90 += balance;
      else cust.over90 += balance;
      
      cust.total += balance;
    });
    
    return Array.from(byCustomer.values());
  }

  async getDebtorAnalysis(companyId: number, customerId: number): Promise<any> {
    const [customer] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)));
    if (!customer) throw new Error("Customer not found");

    const unpaidInvoices = await db.select().from(invoices).where(and(
      eq(invoices.customerId, customerId),
      ne(invoices.status, 'paid'),
      ne(invoices.status, 'cancelled')
    )).orderBy(asc(invoices.dueDate));

    const pastPayments = await db.select().from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(and(eq(payments.companyId, companyId), eq(invoices.customerId, customerId)))
      .orderBy(desc(payments.paymentDate));

    // Calculate metrics
    const totalSales = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const totalPaid = Number(customer.creditLimit); // Placeholder? No, let's use actual payments
    const actualPaid = pastPayments.reduce((sum, p) => sum + Number(p.payments.amount), 0);
    
    const lastPayment = pastPayments.length > 0 ? pastPayments[0].payments.paymentDate : null;
    
    // Average pay lag
    let totalLag = 0;
    let lagCount = 0;
    pastPayments.forEach(p => {
      if (p.invoices.issueDate) {
        const lag = p.payments.paymentDate.getTime() - p.invoices.issueDate.getTime();
        totalLag += Math.max(0, lag);
        lagCount++;
      }
    });
    const avgPayLagDays = lagCount > 0 ? Math.floor(totalLag / (lagCount * 1000 * 60 * 60 * 24)) : 0;

    return {
      customer,
      metrics: {
        totalOutstanding: unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.paidAmount)), 0),
        totalSales: totalSales + actualPaid,
        actualPaid,
        lastPayment,
        avgPayLagDays,
        invoiceCount: unpaidInvoices.length
      },
      invoices: unpaidInvoices.map(inv => ({
        ...inv,
        daysOverdue: Math.max(0, Math.floor((new Date().getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)))
      }))
    };
  }

  async getCostCenterReport(companyId: number, startDate?: Date, endDate?: Date): Promise<any[]> {
    const allBranches = await db.select().from(branches).where(eq(branches.companyId, companyId));
    
    let invConditions = [eq(invoices.companyId, companyId), ne(invoices.status, 'cancelled')];
    if (startDate) invConditions.push(gte(invoices.issueDate, startDate));
    if (endDate) invConditions.push(lte(invoices.issueDate, endDate));
    const allInvoices = await db.select().from(invoices).where(and(...invConditions));
    
    let expConditions = [eq(expenses.companyId, companyId), eq(expenses.status, 'approved')];
    if (startDate) expConditions.push(gte(expenses.expenseDate, startDate));
    if (endDate) expConditions.push(lte(expenses.expenseDate, endDate));
    const allExpenses = await db.select().from(expenses).where(and(...expConditions));
    
    let cogsConditions = [eq(inventoryTransactions.companyId, companyId), eq(inventoryTransactions.type, 'STOCK_OUT')];
    if (startDate) cogsConditions.push(gte(inventoryTransactions.createdAt, startDate));
    if (endDate) cogsConditions.push(lte(inventoryTransactions.createdAt, endDate));
    const allCogs = await db.select().from(inventoryTransactions).where(and(...cogsConditions));
    
    return allBranches.map(branch => {
      const bInvoices = allInvoices.filter(i => i.branchId === branch.id);
      const bExpenses = allExpenses.filter(e => e.branchId === branch.id);
      const bCogs = allCogs.filter(c => c.branchId === branch.id);
      
      const revenue = bInvoices.reduce((sum, inv) => sum + Number(inv.subtotal || 0), 0);
      const cogsAmount = bCogs.reduce((sum, c) => sum + Number(c.totalCost || 0), 0); 
      const expenseAmount = bExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
      
      const grossProfit = revenue - cogsAmount;
      const netProfit = grossProfit - expenseAmount;
      
      return {
        id: branch.id,
        name: branch.name,
        revenue,
        cogs: cogsAmount,
        grossProfit,
        expenses: expenseAmount,
        netProfit,
        transactionCount: bInvoices.length + bExpenses.length
      };
    });
  }

  async getAPAgingReport(companyId: number, asOfDate: Date = new Date()): Promise<any[]> {
    const rows = await db.select({
      invoice: supplierInvoices,
      supplier: suppliers
    }).from(supplierInvoices)
      .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(
        eq(supplierInvoices.companyId, companyId),
        ne(supplierInvoices.status, 'paid'),
        ne(supplierInvoices.status, 'cancelled')
      ));
      
    const bySupplier = new Map<number, any>();
    
    rows.forEach(r => {
      const suppId = r.supplier?.id || 0;
      if (!bySupplier.has(suppId)) {
        bySupplier.set(suppId, {
          supplierId: suppId,
          supplierName: r.supplier?.name || "Unknown Supplier",
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          total: 0
        });
      }
      
      const supp = bySupplier.get(suppId);
      const dueDate = new Date(r.invoice.dueDate || r.invoice.date || new Date());
      const diffTime = asOfDate.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      const balance = Number(r.invoice.totalAmount) - Number(r.invoice.paidAmount);
      
      if (diffDays <= 0) supp.current += balance;
      else if (diffDays <= 30) supp.days30 += balance;
      else if (diffDays <= 60) supp.days60 += balance;
      else if (diffDays <= 90) supp.days90 += balance;
      else supp.over90 += balance;
      
      supp.total += balance;
    });
    
    return Array.from(bySupplier.values());
  }

  async getCreditorAnalysis(companyId: number, supplierId: number): Promise<any> {
    const [supplier] = await db.select().from(suppliers).where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)));
    if (!supplier) throw new Error("Supplier not found");

    const unpaidInvoices = await db.select().from(supplierInvoices).where(and(
      eq(supplierInvoices.supplierId, supplierId),
      ne(supplierInvoices.status, 'paid'),
      ne(supplierInvoices.status, 'cancelled')
    )).orderBy(asc(supplierInvoices.dueDate));

    const pastPayments = await db.select().from(supplierPayments).where(and(
      eq(supplierPayments.supplierId, supplierId),
      eq(supplierPayments.companyId, companyId)
    )).orderBy(desc(supplierPayments.paymentDate));

    const totalPurchases = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const actualPaid = pastPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const lastPayment = pastPayments.length > 0 ? pastPayments[0].paymentDate : null;

    return {
      supplier,
      metrics: {
        totalOutstanding: unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)), 0),
        totalPurchases: totalPurchases + actualPaid,
        actualPaid,
        lastPayment,
        invoiceCount: unpaidInvoices.length
      },
      invoices: unpaidInvoices.map(inv => ({
        ...inv,
        daysOverdue: Math.max(0, Math.floor((new Date().getTime() - new Date(inv.dueDate || inv.date).getTime()) / (1000 * 60 * 60 * 24)))
      }))
    };
  }

  // ==========================================
  // FINANCIAL PERIODS
  // ==========================================
  async getFinancialPeriods(companyId: number): Promise<FinancialPeriod[]> {
    return db.select().from(financialPeriods).where(eq(financialPeriods.companyId, companyId)).orderBy(financialPeriods.startDate);
  }

  async createFinancialPeriod(data: InsertFinancialPeriod): Promise<FinancialPeriod> {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error("Start date and end date must be valid dates");
    }
    if (startDate > endDate) {
      throw new Error("Start date cannot be after end date");
    }

    const existing = await db
      .select()
      .from(financialPeriods)
      .where(eq(financialPeriods.companyId, data.companyId));

    const overlaps = existing.some((period) => {
      const existingStart = new Date(period.startDate);
      const existingEnd = new Date(period.endDate);
      return startDate <= existingEnd && endDate >= existingStart;
    });
    if (overlaps) {
      throw new Error("Financial period dates overlap an existing period");
    }

    const [period] = await db.insert(financialPeriods).values({
      ...data,
      startDate,
      endDate,
      status: data.status || "OPEN",
    }).returning();
    return period;
  }

  async toggleFinancialPeriod(id: number, status: string): Promise<FinancialPeriod> {
    const [period] = await db.update(financialPeriods).set({ status }).where(eq(financialPeriods.id, id)).returning();
    return period;
  }

  async runYearEndClose(companyId: number, asOfDate: Date, currentYearEarningsCode: string = "3100", retainedEarningsCode: string = "3110"): Promise<void> {
    return await db.transaction(async (tx) => {
      // 1. Calculate prior balance of Current Year Earnings (3100) before close
      const [currentEarningsBalance] = await tx.select({
        netDebit: sql<number>`sum(case when ${ledgerEntries.type} = 'DEBIT' then ${ledgerEntries.amount} else 0 end)`,
        netCredit: sql<number>`sum(case when ${ledgerEntries.type} = 'CREDIT' then ${ledgerEntries.amount} else 0 end)`,
      })
      .from(ledgerEntries)
      .innerJoin(journalEntries, eq(ledgerEntries.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(and(
        eq(journalEntries.companyId, companyId),
        eq(accounts.code, currentYearEarningsCode),
        lte(journalEntries.entryDate, asOfDate)
      ));

      const debitVal = Number(currentEarningsBalance?.netDebit || 0);
      const creditVal = Number(currentEarningsBalance?.netCredit || 0);
      const netCYE = creditVal - debitVal;

      if (Math.abs(netCYE) > 0.005) {
        const transferLines: { accountCode: string, type: 'DEBIT' | 'CREDIT', amount: number }[] = [];
        if (netCYE > 0) {
          transferLines.push({ accountCode: currentYearEarningsCode, type: 'DEBIT', amount: netCYE });
          transferLines.push({ accountCode: retainedEarningsCode, type: 'CREDIT', amount: netCYE });
        } else {
          transferLines.push({ accountCode: currentYearEarningsCode, type: 'CREDIT', amount: Math.abs(netCYE) });
          transferLines.push({ accountCode: retainedEarningsCode, type: 'DEBIT', amount: Math.abs(netCYE) });
        }

        await this.postToLedger(companyId, {
          entryDate: asOfDate,
          description: "Prior Year Earnings Transfer to Retained Earnings",
          referenceType: "SYSTEM",
          referenceId: "YEC-TRANSFER",
          lines: transferLines
        }, tx);
      }

      // 2. Sweep P&L accounts -> Current Year Earnings (3100)
      const balances = await tx.select({
        accountId: ledgerEntries.accountId,
        type: accounts.type,
        accountCode: accounts.code,
        accountName: accounts.name,
        netDebit: sql<number>`sum(case when ${ledgerEntries.type} = 'DEBIT' then ${ledgerEntries.amount} else 0 end)`,
        netCredit: sql<number>`sum(case when ${ledgerEntries.type} = 'CREDIT' then ${ledgerEntries.amount} else 0 end)`,
      })
      .from(ledgerEntries)
      .innerJoin(journalEntries, eq(ledgerEntries.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(and(
        eq(journalEntries.companyId, companyId),
        lte(journalEntries.entryDate, asOfDate),
        inArray(accounts.type, ['REVENUE', 'EXPENSE'])
      ))
      .groupBy(ledgerEntries.accountId, accounts.type, accounts.code, accounts.name);

      const sweepLines: { accountCode: string, type: 'DEBIT' | 'CREDIT', amount: number }[] = [];
      let totalNetProfit = 0; 
      
      for (const bal of balances) {
        const debit = Number(bal.netDebit || 0);
        const credit = Number(bal.netCredit || 0);
        
        if (bal.type === 'REVENUE') {
            const netBalance = credit - debit;
            if (netBalance > 0) {
               sweepLines.push({ accountCode: bal.accountCode as string, type: 'DEBIT', amount: netBalance });
            } else if (netBalance < 0) {
               sweepLines.push({ accountCode: bal.accountCode as string, type: 'CREDIT', amount: Math.abs(netBalance) });
            }
            totalNetProfit += netBalance;
        } else if (bal.type === 'EXPENSE') {
            const netBalance = debit - credit;
            if (netBalance > 0) {
               sweepLines.push({ accountCode: bal.accountCode as string, type: 'CREDIT', amount: netBalance });
            } else if (netBalance < 0) {
               sweepLines.push({ accountCode: bal.accountCode as string, type: 'DEBIT', amount: Math.abs(netBalance) });
            }
            totalNetProfit -= netBalance;
        }
      }

      if (sweepLines.length > 0) {
        if (totalNetProfit > 0) {
            sweepLines.push({ accountCode: currentYearEarningsCode, type: 'CREDIT', amount: totalNetProfit });
        } else if (totalNetProfit < 0) {
            sweepLines.push({ accountCode: currentYearEarningsCode, type: 'DEBIT', amount: Math.abs(totalNetProfit) });
        }

        await this.postToLedger(companyId, {
          entryDate: asOfDate,
          description: "Automated Year-End P&L Closing Sweep",
          referenceType: "SYSTEM",
          referenceId: "YEC-SWEEP",
          lines: sweepLines
        }, tx);
      }
    });
  }

  // ==========================================
  // BANK RECONCILIATION
  // ==========================================
  async uploadBankStatement(data: InsertBankStatement, lines: InsertBankStatementLine[]): Promise<BankStatement> {
    return await db.transaction(async (tx) => {
      const [statement] = await tx.insert(bankStatements).values(data).returning();
      if (lines.length > 0) {
        const stmtLines = lines.map(l => ({ ...l, statementId: statement.id }));
        await tx.insert(bankStatementLines).values(stmtLines);
      }
      return statement;
    });
  }

  async getBankStatements(companyId: number, accountId?: number): Promise<BankStatement[]> {
    const filters = [eq(bankStatements.companyId, companyId)];
    if (accountId) filters.push(eq(bankStatements.accountId, accountId));
    return db.select().from(bankStatements).where(and(...filters)).orderBy(desc(bankStatements.statementDate));
  }

  async getBankStatementLines(statementId: number): Promise<BankStatementLine[]> {
    return db.select().from(bankStatementLines).where(eq(bankStatementLines.statementId, statementId)).orderBy(bankStatementLines.date);
  }

  async getUnreconciledLedger(companyId: number, accountId: number): Promise<any[]> {
    return db.select({
      id: ledgerEntries.id,
      date: journalEntries.entryDate,
      description: journalEntries.description,
      amount: ledgerEntries.amount,
      type: ledgerEntries.type,
      referenceId: journalEntries.referenceId
    })
    .from(ledgerEntries)
    .innerJoin(journalEntries, eq(ledgerEntries.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(ledgerEntries.accountId, accountId),
      eq(ledgerEntries.isReconciled, false)
    ))
    .orderBy(journalEntries.entryDate);
  }

  async reconcileBankLine(lineId: number, ledgerEntryId: number): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Mark line as reconciled
      await tx.update(bankStatementLines)
        .set({ isReconciled: true, matchedLedgerEntryId: ledgerEntryId })
        .where(eq(bankStatementLines.id, lineId));
      // 2. Mark ledger entry as reconciled
      await tx.update(ledgerEntries)
        .set({ isReconciled: true })
        .where(eq(ledgerEntries.id, ledgerEntryId));
    });
  }

  async autoReconcile(statementId: number): Promise<number> {
    // Basic Auto-matcher: Matches exact amount within +/- 2 days
    const lines = await this.getBankStatementLines(statementId);
    if (!lines.length) return 0;
    
    const statement = await db.select().from(bankStatements).where(eq(bankStatements.id, statementId)).then(r => r[0]);
    const unreconciledLedger = await this.getUnreconciledLedger(statement.companyId, statement.accountId);
    
    let matchedCount = 0;
    
    // Sort ledger items to optimize matching slightly, or we can just iterate.
    const availableLedger = new Set(unreconciledLedger.map(l => l.id));
    
    for (const line of lines) {
      if (line.isReconciled) continue;
      
      const lineDate = new Date(line.date);
      const lineAmt = Number(line.amount);
      const msInDay = 24 * 60 * 60 * 1000;
      
      // Look for a ledger entry that matches this line exactly in value and direction (+ is DEBIT, - is CREDIT, wait).
      // If line.amount is positive -> Bank deposit (Debit to bank in GL)
      // If line.amount is negative -> Bank withdrawal (Credit to bank in GL)
      const expectedType = lineAmt >= 0 ? "DEBIT" : "CREDIT";
      const absAmt = Math.abs(lineAmt);
      
      const match = unreconciledLedger.find(le => {
        if (!availableLedger.has(le.id)) return false;
        
        const leDate = new Date(le.date);
        const dayDiff = Math.abs(lineDate.getTime() - leDate.getTime()) / msInDay;
        
        // Exact amount, correct Debit/Credit type, within 2 days
        return (Number(le.amount) === absAmt) && (le.type === expectedType) && (dayDiff <= 2);
      });
      
      if (match) {
        await this.reconcileBankLine(line.id, match.id);
        availableLedger.delete(match.id);
        matchedCount++;
      }
    }
    
    return matchedCount;
  }

  // ==========================================
  // FIXED ASSETS & DEPRECIATION
  // ==========================================
  async getFixedAssets(companyId: number): Promise<FixedAsset[]> {
    return db.select().from(fixedAssets).where(eq(fixedAssets.companyId, companyId)).orderBy(fixedAssets.name);
  }

  async getDepreciationRuns(companyId: number): Promise<any[]> {
    return db.select({
      id: depreciationRuns.id,
      companyId: depreciationRuns.companyId,
      assetId: depreciationRuns.assetId,
      journalEntryId: depreciationRuns.journalEntryId,
      date: depreciationRuns.date,
      amount: depreciationRuns.amount,
      notes: depreciationRuns.notes,
      createdAt: depreciationRuns.createdAt,
      assetName: fixedAssets.name,
      assetSerialNumber: fixedAssets.serialNumber
    })
    .from(depreciationRuns)
    .innerJoin(fixedAssets, eq(depreciationRuns.assetId, fixedAssets.id))
    .where(eq(depreciationRuns.companyId, companyId))
    .orderBy(desc(depreciationRuns.date));
  }

  async createFixedAsset(data: InsertFixedAsset & { accumulatedDepreciation?: number, netBookValue?: number }): Promise<FixedAsset> {
    const netBookValue = data.netBookValue ?? Number(data.purchasePrice);
    const accumulatedDepreciation = data.accumulatedDepreciation ?? 0;
    
    const [asset] = await db.insert(fixedAssets).values({
      ...data,
      netBookValue: String(netBookValue),
      accumulatedDepreciation: String(accumulatedDepreciation),
    }).returning();
    
    return asset;
  }

  async runDepreciation(companyId: number, asOfDate: Date, userId: string): Promise<{ success: boolean; depreciatedCount: number; amount: number }> {
    // 1. Fetch active assets
    const activeAssets = await db.select().from(fixedAssets)
      .where(and(
        eq(fixedAssets.companyId, companyId),
        eq(fixedAssets.status, 'ACTIVE')
      ));
      
    let depreciatedCount = 0;
    let totalDepreciation = 0;
    
    for (const asset of activeAssets) {
      if (Number(asset.netBookValue) <= Number(asset.salvageValue)) {
        continue; // Fully depreciated
      }

      // Calculate days to depreciate
      const lastDepDateStr = asset.lastDepreciationDate || asset.purchaseDate;
      const lastDepDate = new Date(lastDepDateStr);
      
      // If last dep date is after or equal to asOfDate, skip
      if (lastDepDate >= asOfDate) continue;

      const msInDay = 1000 * 60 * 60 * 24;
      const daysElapsed = Math.floor((asOfDate.getTime() - lastDepDate.getTime()) / msInDay);
      if (daysElapsed <= 0) continue;

      let deprAmount = 0;
      
      if (asset.depreciationMethod === "STRAIGHT_LINE") {
        const depreciableBase = Number(asset.purchasePrice) - Number(asset.salvageValue);
        const annualDepr = depreciableBase / asset.usefulLifeYears;
        const dailyDepr = annualDepr / 365.25;
        deprAmount = dailyDepr * daysElapsed;
      } else if (asset.depreciationMethod === "DECLINING_BALANCE") {
        // e.g., Double Declining
        const rate = (1 / asset.usefulLifeYears) * 2;
        const annualDepr = Number(asset.netBookValue) * rate;
        const dailyDepr = annualDepr / 365.25;
        deprAmount = dailyDepr * daysElapsed;
      }
      
      // Ensure we don't depreciate below salvage value
      const potentialNbv = Number(asset.netBookValue) - deprAmount;
      if (potentialNbv < Number(asset.salvageValue)) {
        deprAmount = Number(asset.netBookValue) - Number(asset.salvageValue);
      }
      
      if (deprAmount <= 0.01) continue; // Too small to journal

      totalDepreciation += deprAmount;
      depreciatedCount++;

      // Post Journal Entry
      const entry = await this.postToLedger(companyId, {
        reference: `DEPR-${asset.id}-${asOfDate.getTime()}`,
        date: asOfDate.toISOString(),
        description: `Depreciation for ${asset.name}`,
        lines: [
          // Debit: Depreciation Expense
          { accountId: asset.depreciationExpenseAccountId, debit: deprAmount, credit: 0 },
          // Credit: Accumulated Depreciation (Contra-Asset)
          { accountId: asset.accumulatedDepreciationAccountId, debit: 0, credit: deprAmount }
        ],
        createdBy: userId
      });

      // Update Asset Record
      await db.update(fixedAssets)
        .set({
          accumulatedDepreciation: String(Number(asset.accumulatedDepreciation) + deprAmount),
          netBookValue: String(Number(asset.netBookValue) - deprAmount),
          lastDepreciationDate: asOfDate
        })
        .where(eq(fixedAssets.id, asset.id));

      // Log the run
      await db.insert(depreciationRuns).values({
        companyId,
        assetId: asset.id,
        journalEntryId: entry.id,
        date: asOfDate,
        amount: String(deprAmount),
        notes: `System generated depreciation for ${daysElapsed} days.`
      });
    }

    return {
      success: true,
      depreciatedCount,
      amount: totalDepreciation
    };
  }

  async addCompanyUser(userId: string, companyId: number, role: string): Promise<void> {
    await db.insert(companyUsers).values({
      userId,
      companyId,
      role
    });
  }

  async removeCompanyUser(userId: string, companyId: number): Promise<void> {
    await db.delete(companyUsers)
      .where(and(
        eq(companyUsers.userId, userId),
        eq(companyUsers.companyId, companyId)
      ));
  }

  // Reporting Implementations
  async getReportSummary(companyId: number, startDate: Date, endDate: Date): Promise<any> {
    const revenueResult = await db
      .select({
        total: sql<number>`sum(${invoices.total})`,
        count: count(invoices.id)
      })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, 'cancelled'),
        ne(invoices.status, 'draft')
      ));

    const pendingResult = await db
      .select({
        total: sql<number>`sum(${invoices.total})`
      })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.status, 'pending'),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate)
      ));

    const customersResult = await db
      .select({
        count: count(customers.id)
      })
      .from(customers)
      .where(eq(customers.companyId, companyId));

    return {
      totalRevenue: Number(revenueResult[0]?.total || 0),
      invoicesCount: Number(revenueResult[0]?.count || 0),
      pendingAmount: Number(pendingResult[0]?.total || 0),
      customersCount: Number(customersResult[0]?.count || 0)
    };
  }

  async getRevenueChart(companyId: number, startDate: Date, endDate: Date): Promise<{ name: string; total: number; byCurrency: Record<string, number> }[]> {
    const result = await db
      .select({
        date: sql`date_trunc('day', ${invoices.issueDate})`,
        total: invoices.total,
        currency: invoices.currency,
      })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, 'cancelled'),
        ne(invoices.status, 'draft')
      ))
      .orderBy(sql`date_trunc('day', ${invoices.issueDate})`);

    const dailyTotals = new Map<string, Record<string, number>>();
    for (const row of result) {
      const key = format(new Date(row.date as string), 'MMM dd');
      const currency = row.currency || "USD";
      const totals = dailyTotals.get(key) || {};
      totals[currency] = (totals[currency] || 0) + Number(row.total || 0);
      dailyTotals.set(key, totals);
    }

    return Array.from(dailyTotals.entries()).map(([name, byCurrency]) => ({
      name,
      total: Math.round(Object.values(byCurrency).reduce((sum, amount) => sum + amount, 0) * 100) / 100,
      byCurrency: Object.fromEntries(
        Object.entries(byCurrency).map(([currency, amount]) => [currency, Math.round(amount * 100) / 100])
      )
    }));
  }

  async getSalesByPaymentMethod(companyId: number, startDate: Date, endDate: Date): Promise<{ method: string; total: number; count: number; byCurrency: Record<string, number> }[]> {
    const result = await db
      .select({
        method: invoices.paymentMethod,
        total: invoices.total,
        currency: invoices.currency,
      })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, 'cancelled'),
        ne(invoices.status, 'draft')
      ));

    const byMethod = new Map<string, { method: string; total: number; count: number; byCurrency: Record<string, number> }>();
    for (const row of result) {
      const method = row.method || "CASH";
      const currency = row.currency || "USD";
      const existing = byMethod.get(method) || { method, total: 0, count: 0, byCurrency: {} };
      const amount = Number(row.total || 0);
      existing.total += amount;
      existing.byCurrency[currency] = (existing.byCurrency[currency] || 0) + amount;
      existing.count += 1;
      byMethod.set(method, existing);
    }

    return Array.from(byMethod.values()).map(row => ({
      ...row,
      total: Math.round(row.total * 100) / 100,
      byCurrency: Object.fromEntries(
        Object.entries(row.byCurrency).map(([currency, amount]) => [currency, Math.round(amount * 100) / 100])
      )
    }));
  }

  async getSalesReport(companyId: number, startDate: Date, endDate: Date, cashierId?: string, ownerGroup?: string): Promise<any[]> {
    const filters = [
      eq(invoices.companyId, companyId),
      gte(invoices.issueDate, startDate),
      lte(invoices.issueDate, endDate),
      ne(invoices.status, 'cancelled'),
      ne(invoices.status, 'draft'),
      ne(invoices.status, 'quote')
    ];

    if (cashierId && cashierId !== 'all') {
      filters.push(eq(invoices.createdBy, cashierId));
    }

    const ownerGroups = parseOwnerGroups(ownerGroup).map((group) => group.toLowerCase());

    const rows = await db
      .select({
        invoice: invoices,
        customerName: customers.name,
        cashierName: users.name,
        cashierUsername: users.username,
        cashierEmail: users.email,
        itemId: invoiceItems.id,
        itemLineTotal: invoiceItems.lineTotal,
        itemProductId: invoiceItems.productId,
        itemOwnerGroup: products.ownerGroup,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(...filters))
      .orderBy(desc(invoices.createdAt));

    const byInvoice = new Map<number, {
      invoice: Invoice;
      customerName: string | null;
      cashierName: string | null;
      cashierUsername: string | null;
      cashierEmail: string | null;
      segments: Map<string, { costCenter: string; lineTotal: number }>;
      invoiceLineTotal: number;
    }>();

    for (const row of rows) {
      const existing = byInvoice.get(row.invoice.id) ?? {
        invoice: row.invoice,
        customerName: row.customerName,
        cashierName: row.cashierName,
        cashierUsername: row.cashierUsername,
        cashierEmail: row.cashierEmail,
        segments: new Map<string, { costCenter: string; lineTotal: number }>(),
        invoiceLineTotal: 0,
      };

      if (row.itemId) {
        const costCenter = (row.itemOwnerGroup || "Unassigned").trim() || "Unassigned";
        const key = costCenter.toLowerCase();
        const lineTotal = Number(row.itemLineTotal || 0);
        const segment = existing.segments.get(key) ?? { costCenter, lineTotal: 0 };
        segment.lineTotal += lineTotal;
        existing.segments.set(key, segment);
        existing.invoiceLineTotal += lineTotal;
      }

      byInvoice.set(row.invoice.id, existing);
    }

    const reportRows: any[] = [];
    for (const entry of byInvoice.values()) {
      const segments = entry.segments.size > 0
        ? Array.from(entry.segments.values())
        : [{ costCenter: "Unassigned", lineTotal: Number(entry.invoice.total || 0) }];

      const allocated = segments.map((segment) => {
        const allocationBase = entry.invoiceLineTotal > 0 ? entry.invoiceLineTotal : Number(entry.invoice.total || 0);
        const share = allocationBase > 0 ? segment.lineTotal / allocationBase : 1 / segments.length;
        return {
          segment,
          total: Number(entry.invoice.total || 0) * share,
          subtotal: Number(entry.invoice.subtotal || 0) * share,
          taxAmount: Number(entry.invoice.taxAmount || 0) * share,
          discountAmount: Number(entry.invoice.discountAmount || 0) * share,
        };
      });

      if (allocated.length > 1) {
        const last = allocated[allocated.length - 1];
        const sumBeforeLast = allocated.slice(0, -1).reduce((sum, row) => ({
          total: sum.total + Number(row.total.toFixed(2)),
          subtotal: sum.subtotal + Number(row.subtotal.toFixed(2)),
          taxAmount: sum.taxAmount + Number(row.taxAmount.toFixed(2)),
          discountAmount: sum.discountAmount + Number(row.discountAmount.toFixed(2)),
        }), { total: 0, subtotal: 0, taxAmount: 0, discountAmount: 0 });
        last.total = Number(entry.invoice.total || 0) - sumBeforeLast.total;
        last.subtotal = Number(entry.invoice.subtotal || 0) - sumBeforeLast.subtotal;
        last.taxAmount = Number(entry.invoice.taxAmount || 0) - sumBeforeLast.taxAmount;
        last.discountAmount = Number(entry.invoice.discountAmount || 0) - sumBeforeLast.discountAmount;
      }

      for (const allocation of allocated) {
        const segment = allocation.segment;
        const costCenterKey = segment.costCenter.toLowerCase();
        if (ownerGroups.length > 0 && !ownerGroups.includes(costCenterKey)) continue;

        reportRows.push({
          ...entry.invoice,
          id: `${entry.invoice.id}:${costCenterKey}`,
          invoiceId: entry.invoice.id,
          costCenter: segment.costCenter,
          costCenterLineTotal: segment.lineTotal.toFixed(2),
          total: allocation.total.toFixed(2),
          subtotal: allocation.subtotal.toFixed(2),
          taxAmount: allocation.taxAmount.toFixed(2),
          discountAmount: allocation.discountAmount.toFixed(2),
          customerName: entry.customerName,
          cashierName: entry.cashierName || entry.cashierUsername || entry.cashierEmail?.split("@")[0] || "System"
        });
      }
    }

    return reportRows.sort((a, b) => new Date(b.createdAt || b.issueDate).getTime() - new Date(a.createdAt || a.issueDate).getTime());
  }


  // Reporting Implementations
  async getSalesByCategory(companyId: number, startDate: Date, endDate: Date): Promise<{ category: string; totalSales: number; count: number; byCurrency: Record<string, number> }[]> {
    const result = await db
      .select({
        category: products.category,
        lineTotal: invoiceItems.lineTotal,
        currency: invoices.currency,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .innerJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, 'cancelled'),
        ne(invoices.status, 'draft')
      ));

    const byCategory = new Map<string, { category: string; totalSales: number; count: number; byCurrency: Record<string, number> }>();
    for (const row of result) {
      const category = row.category || "Uncategorized";
      const currency = row.currency || "USD";
      const existing = byCategory.get(category) || { category, totalSales: 0, count: 0, byCurrency: {} };
      const amount = Number(row.lineTotal || 0);
      existing.totalSales += amount;
      existing.byCurrency[currency] = (existing.byCurrency[currency] || 0) + amount;
      existing.count += 1;
      byCategory.set(category, existing);
    }

    return Array.from(byCategory.values())
      .map(row => ({
        ...row,
        totalSales: Math.round(row.totalSales * 100) / 100,
        byCurrency: Object.fromEntries(
          Object.entries(row.byCurrency).map(([currency, amount]) => [currency, Math.round(amount * 100) / 100])
        )
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  async getSalesByUser(companyId: number, startDate: Date, endDate: Date): Promise<{ userId: string; userName: string; totalSales: number; count: number; byCurrency: Record<string, number> }[]> {
    const rows = await db
      .select({
        createdBy: invoices.createdBy,
        shiftId: invoices.shiftId,
        total: invoices.total,
        currency: invoices.currency,
        directName: users.name,
        directUsername: users.username,
        directEmail: users.email
      })
      .from(invoices)
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, 'cancelled'),
        ne(invoices.status, 'draft')
      ));

    const unresolvedShiftIds = Array.from(
      new Set(
        rows
          .filter((r) => !r.directName && !r.directUsername && !r.directEmail && r.shiftId)
          .map((r) => Number(r.shiftId))
      )
    );

    const shiftCashierMap = new Map<number, { userId: string | null; name: string | null; username: string | null; email: string | null }>();
    if (unresolvedShiftIds.length > 0) {
      const shiftRows = await db
        .select({
          shiftId: posShifts.id,
          userId: posShifts.userId,
          name: users.name,
          username: users.username,
          email: users.email
        })
        .from(posShifts)
        .leftJoin(users, eq(posShifts.userId, users.id))
        .where(inArray(posShifts.id, unresolvedShiftIds));

      shiftRows.forEach((r) => {
        shiftCashierMap.set(r.shiftId, {
          userId: r.userId ?? null,
          name: r.name ?? null,
          username: r.username ?? null,
          email: r.email ?? null
        });
      });
    }

    const byCashier = new Map<string, { userId: string; userName: string; totalSales: number; count: number; byCurrency: Record<string, number> }>();
    for (const row of rows) {
      const shiftCashier = row.shiftId ? shiftCashierMap.get(Number(row.shiftId)) : undefined;
      const resolvedUserId = row.createdBy || shiftCashier?.userId || "system";
      const resolvedUserName =
        row.directName ||
        row.directUsername ||
        row.directEmail?.split("@")[0] ||
        shiftCashier?.name ||
        shiftCashier?.username ||
        shiftCashier?.email?.split("@")[0] ||
        "System";

      const existing = byCashier.get(resolvedUserId) || {
        userId: resolvedUserId,
        userName: resolvedUserName,
        totalSales: 0,
        count: 0,
        byCurrency: {}
      };
      const currency = row.currency || "USD";
      const amount = Number(row.total || 0);
      existing.totalSales += amount;
      existing.byCurrency[currency] = (existing.byCurrency[currency] || 0) + amount;
      existing.count += 1;
      byCashier.set(resolvedUserId, existing);
    }

    return Array.from(byCashier.values())
      .map(row => ({
        ...row,
        totalSales: Math.round(row.totalSales * 100) / 100,
        byCurrency: Object.fromEntries(
          Object.entries(row.byCurrency).map(([currency, amount]) => [currency, Math.round(amount * 100) / 100])
        )
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  async getProductPerformance(companyId: number, startDate: Date, endDate: Date, isPosOnly?: boolean): Promise<{ productId: number; productName: string; quantity: number; revenue: number }[]> {
    const conditions = [
      eq(invoices.companyId, companyId),
      gte(invoices.issueDate, startDate),
      lte(invoices.issueDate, endDate),
      ne(invoices.status, 'cancelled'),
      ne(invoices.status, 'draft')
    ];

    if (isPosOnly) {
      // isPosOnly is ignored now as requested to show all sales
    }

    const result = await db
      .select({
        productId: products.id,
        productName: products.name,
        quantity: sql<number>`sum(${invoiceItems.quantity})`,
        revenue: sql<number>`sum(${invoiceItems.lineTotal})`
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .innerJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(...conditions))
      .groupBy(products.id, products.name)
      .orderBy(desc(sql`sum(${invoiceItems.lineTotal})`));

    return result.map(r => ({
      productId: r.productId,
      productName: r.productName,
      quantity: Number(r.quantity || 0),
      revenue: Number(r.revenue || 0)
    }));
  }

  async getPosSales(
    companyId: number,
    startDate: Date,
    endDate: Date,
    cashierId?: string,
    paymentMethod?: string,
    status?: string,
    search?: string,
    branchId?: number,
    ownerGroup?: string
  ): Promise<any[]> {
    const conditions = [
      eq(invoices.companyId, companyId),
      eq(invoices.isPos, true),
      gte(invoices.issueDate, startDate),
      lte(invoices.issueDate, endDate)
    ] as any[];

    if (branchId) {
      conditions.push(eq(invoices.branchId, branchId));
    }

    if (cashierId && cashierId !== 'all') {
      conditions.push(eq(invoices.createdBy, cashierId));
    }

    if (status && status !== 'all') {
      if (status === 'fiscalized') {
        conditions.push(eq(invoices.syncedWithFdms, true));
      } else if (status === 'pending') {
        conditions.push(eq(invoices.syncedWithFdms, false));
      } else {
        conditions.push(eq(invoices.status, status));
      }
    }

    if (search) {
      conditions.push(or(
        ilike(invoices.invoiceNumber, `%${search}%`),
        ilike(customers.name, `%${search}%`)
      ) as any);
    }

    const ownerGroups = parseOwnerGroups(ownerGroup);
    if (ownerGroups.length > 0) {
      const normalizedOwnerGroups = ownerGroups.map((g) => g.toLowerCase());
      const ownerGroupPredicate = ownerGroups.length === 1
        ? sql`lower(coalesce(p.owner_group, '')) = ${normalizedOwnerGroups[0]}`
        : sql`lower(coalesce(p.owner_group, '')) in (${sql.join(normalizedOwnerGroups.map((g) => sql`${g}`), sql`, `)})`;
      conditions.push(
        sql`exists (
          select 1
          from ${invoiceItems} ii
          inner join ${products} p on p.id = ii.product_id
          where ii.invoice_id = ${invoices.id}
            and ${ownerGroupPredicate}
        )`
      );
    }

    const query = db
      .select({
        invoice: invoices,
        cashierName: users.name,
        cashierUsername: users.username,
        cashierEmail: users.email,
        customerName: customers.name
      })
      .from(invoices)
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt));

    const results = await query;
    const unresolvedShiftIds = Array.from(
      new Set(
        results
          .filter((r) => !r.cashierName && !r.cashierUsername && !r.cashierEmail && r.invoice.shiftId)
          .map((r) => Number(r.invoice.shiftId))
      )
    );

    const shiftCashierMap = new Map<number, { name: string | null; username: string | null; email: string | null }>();
    if (unresolvedShiftIds.length > 0) {
      const shiftRows = await db
        .select({
          shiftId: posShifts.id,
          name: users.name,
          username: users.username,
          email: users.email
        })
        .from(posShifts)
        .leftJoin(users, eq(posShifts.userId, users.id))
        .where(inArray(posShifts.id, unresolvedShiftIds));

      shiftRows.forEach((r) => {
        shiftCashierMap.set(r.shiftId, {
          name: r.name ?? null,
          username: r.username ?? null,
          email: r.email ?? null
        });
      });
    }

    return results.map(r => ({
      ...r.invoice,
      cashierName:
        r.cashierName ||
        r.cashierUsername ||
        r.cashierEmail?.split("@")[0] ||
        shiftCashierMap.get(Number(r.invoice.shiftId || 0))?.name ||
        shiftCashierMap.get(Number(r.invoice.shiftId || 0))?.username ||
        shiftCashierMap.get(Number(r.invoice.shiftId || 0))?.email?.split("@")[0] ||
        "System",
      customerName: r.customerName
    }));
  }

  // Product Categories Implementation
  async getProductCategories(companyId: number): Promise<ProductCategory[]> {
    return await db.select().from(productCategories).where(
      and(
        eq(productCategories.companyId, companyId),
        eq(productCategories.isActive, true)
      )
    ).orderBy(productCategories.name);
  }

  async createProductCategory(data: InsertProductCategory & { companyId: number }): Promise<ProductCategory> {
    const [category] = await db.insert(productCategories).values(data).returning();
    return category;
  }

  async deleteProductCategory(id: number, companyId: number): Promise<void> {
    await db.delete(productCategories).where(and(eq(productCategories.id, id), eq(productCategories.companyId, companyId)));
  }

  async clearTestInvoices(companyId: number): Promise<number> {
    return await db.transaction(async (tx) => {
      // 1. Identify IDs of invoices to be deleted
      // We look for qrCodeData containing 'fdmstest.zimra.co.zw'
      const invoicesToDelete = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            ilike(invoices.qrCodeData, '%fdmstest.zimra.co.zw%')
          )
        );

      if (invoicesToDelete.length === 0) return 0;

      const ids = invoicesToDelete.map(inv => inv.id);

      // 2. Delete from related tables
      await tx.delete(invoiceItems).where(sql`${invoiceItems.invoiceId} IN (${sql.join(ids, sql`, `)})`);
      await tx.delete(validationErrors).where(sql`${validationErrors.invoiceId} IN (${sql.join(ids, sql`, `)})`);
      await tx.delete(payments).where(sql`${payments.invoiceId} IN (${sql.join(ids, sql`, `)})`);
      await tx.delete(zimraLogs).where(sql`${zimraLogs.invoiceId} IN (${sql.join(ids, sql`, `)})`);

      // 3. Nullify self-references (related_invoice_id)
      await tx
        .update(invoices)
        .set({ relatedInvoiceId: null })
        .where(sql`${invoices.relatedInvoiceId} IN (${sql.join(ids, sql`, `)})`);

      // 4. Delete the invoices
      const result = await tx
        .delete(invoices)
        .where(sql`${invoices.id} IN (${sql.join(ids, sql`, `)})`)
        .returning({ id: invoices.id });

      return result.length;
    });
  }

  // Suppliers
  async getSuppliers(companyId: number): Promise<(Supplier & { balance?: number })[]> {
    const results = await db.select({
      supplier: suppliers,
      balance: sql<number>`COALESCE(SUM(
        CASE 
          WHEN ${supplierInvoices.status} != 'cancelled' 
          THEN ${supplierInvoices.totalAmount} - ${supplierInvoices.paidAmount} 
          ELSE 0 
        END
      ), 0)`
    })
    .from(suppliers)
    .leftJoin(supplierInvoices, eq(suppliers.id, supplierInvoices.supplierId))
    .where(
      and(
        eq(suppliers.companyId, companyId),
        eq(suppliers.isActive, true)
      )
    )
    .groupBy(suppliers.id)
    .orderBy(suppliers.name);

    return results.map(r => ({
      ...r.supplier,
      balance: Number(r.balance)
    }));
  }

  async getSupplier(id: number): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }

  async createSupplier(data: InsertSupplier & { companyId: number }): Promise<Supplier> {
    const [supplier] = await db.insert(suppliers).values(data).returning();
    return supplier;
  }

  async updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [updated] = await db.update(suppliers).set(data).where(eq(suppliers.id, id)).returning();
    return updated;
  }

  async getSupplierInvoices(companyId: number): Promise<any[]> {
    const rows = await db
      .select({
        invoice: supplierInvoices,
        supplier: suppliers
      })
      .from(supplierInvoices)
      .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(eq(supplierInvoices.companyId, companyId))
      .orderBy(desc(supplierInvoices.createdAt));

    return rows.map(r => ({
      ...r.invoice,
      supplier: r.supplier
    }));
  }

  async getSupplierInvoice(id: number, companyId: number): Promise<any | null> {
    const [row] = await db
      .select({ invoice: supplierInvoices, supplier: suppliers })
      .from(supplierInvoices)
      .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.companyId, companyId)));

    if (!row) return null;

    const itemRows = await db
      .select({ item: supplierInvoiceItems, product: products })
      .from(supplierInvoiceItems)
      .leftJoin(products, eq(supplierInvoiceItems.productId, products.id))
      .where(eq(supplierInvoiceItems.supplierInvoiceId, id));

    // Load linked GDN if present
    let gdn = null;
    if (row.invoice.referenceGdnId) {
      const [gdnRow] = await db
        .select()
        .from(goodsDeliveryNotes)
        .where(eq(goodsDeliveryNotes.id, row.invoice.referenceGdnId!));
      gdn = gdnRow || null;
    }

    return {
      ...row.invoice,
      supplier: row.supplier,
      gdn,
      items: itemRows.map(i => ({ ...i.item, product: i.product })),
    };
  }

  async getSupplierPayments(companyId: number): Promise<any[]> {
    const rows = await db
      .select({
        payment: supplierPayments,
        supplier: suppliers
      })
      .from(supplierPayments)
      .leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
      .where(eq(supplierPayments.companyId, companyId))
      .orderBy(desc(supplierPayments.paymentDate));

    return rows.map(r => ({
      ...r.payment,
      supplier: r.supplier
    }));
  }

  async createSupplierInvoice(data: InsertSupplierInvoice & { items: InsertSupplierInvoiceItem[], createdBy?: string }): Promise<SupplierInvoice> {
    return await db.transaction(async (tx) => {
      const { items, createdBy, ...invoiceData } = data;
      const invoiceTotal = Number(invoiceData.totalAmount || 0);
      const invoiceTax = Number(invoiceData.taxAmount || 0);
      if (invoiceTotal <= 0) {
        throw new Error("Supplier invoice total must be greater than zero");
      }
      if (invoiceTax < 0 || invoiceTax > invoiceTotal) {
        throw new Error("Supplier invoice VAT cannot exceed the total amount");
      }

      const [invoice] = await tx.insert(supplierInvoices).values(invoiceData).returning();

      if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
          ...item,
          supplierInvoiceId: invoice.id
        }));
        await tx.insert(supplierInvoiceItems).values(itemsToInsert);
      }

      const vatInputAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "vatInputAccountCode", tx);
      const apAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "accountsPayableCode", tx);
      const defaultInventoryCode = await this.getSystemAccountCode(invoiceData.companyId, "inventoryAccountCode", tx);
      const grniAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "grniAccountCode", tx);

      const lines: { accountCode: string, type: 'DEBIT'|'CREDIT', amount: number }[] = [];
      let totalRecoverableTax = 0;
      let totalAP = invoiceTotal;

      if (items && items.length > 0) {
        for (const item of items) {
          const itemTotal = Number(item.totalPrice || 0); // This is quantity * unitCost (which is subtotal when exclusive, total when inclusive)
          const itemTax = Number(item.taxAmount || 0);
          
          // Let's get the base cost for this line
          const itemBase = invoiceData.taxInclusive ? itemTotal - itemTax : itemTotal;

          let lineAccountCode = defaultInventoryCode;
          if (invoiceData.referenceGdnId) {
            lineAccountCode = grniAccountCode;
          } else if (item.accountCode) {
            lineAccountCode = item.accountCode;
          } else if (invoiceData.debitAccountId) {
             const [acc] = await tx.select().from(accounts).where(eq(accounts.id, invoiceData.debitAccountId));
             if (acc) lineAccountCode = acc.code;
          }

          let amountToCapitalize = itemBase;
          if (itemTax > 0) {
            if (item.isRecoverable !== false) { // Default true
              totalRecoverableTax += itemTax;
            } else {
              amountToCapitalize += itemTax; // Non-recoverable tax gets added to expense/inventory
            }
          }

          lines.push({ accountCode: lineAccountCode, type: 'DEBIT', amount: Number(amountToCapitalize.toFixed(2)) });
        }
      } else {
         // Fallback if no items were provided (legacy invoices)
         const subtotal = invoiceTotal - invoiceTax;
         let debitAccountCode = defaultInventoryCode;
         if (invoiceData.referenceGdnId) {
            debitAccountCode = grniAccountCode;
         } else if (invoiceData.debitAccountId) {
            const [acc] = await tx.select().from(accounts).where(eq(accounts.id, invoiceData.debitAccountId));
            if (acc) debitAccountCode = acc.code;
         }
         lines.push({ accountCode: debitAccountCode, type: 'DEBIT', amount: Number(subtotal.toFixed(2)) });
         if (invoiceTax > 0) {
           totalRecoverableTax += invoiceTax;
         }
      }

      if (totalRecoverableTax > 0) {
        lines.push({ accountCode: vatInputAccountCode, type: 'DEBIT', amount: Number(totalRecoverableTax.toFixed(2)) });
      }

      lines.push({ accountCode: apAccountCode, type: 'CREDIT', amount: Number(invoiceTotal.toFixed(2)) });

      await this.postToLedger(invoiceData.companyId, {
        entryDate: invoiceData.date || new Date(),
        description: `Supplier Invoice: ${invoiceData.invoiceNumber}`,
        referenceType: 'SupplierInvoice',
        referenceId: invoice.id.toString(),
        createdBy: createdBy,
        lines
      }, tx);

      return invoice;
    });
  }

  async createSupplierPayment(data: InsertSupplierPayment): Promise<SupplierPayment> {
    return await db.transaction(async (tx) => {
      const [payment] = await tx.insert(supplierPayments).values(data).returning();

      // Automated Journaling: Debit Accounts Payable (2000), Credit Cash/Bank (1000)
      const apAccountCode = await this.getSystemAccountCode(data.companyId, "accountsPayableCode", tx);
      const cashAccountCode = await this.getSystemAccountCode(data.companyId, "cashAccountCode", tx);
      const lines: { accountCode: string, type: 'DEBIT'|'CREDIT', amount: number }[] = [
        { accountCode: apAccountCode, type: 'DEBIT', amount: Number(data.amount) },
        { accountCode: cashAccountCode, type: 'CREDIT', amount: Number(data.amount) }
      ];

      await this.postToLedger(data.companyId, {
        description: `Supplier Payment: ${data.reference || 'N/A'}`,
        entryDate: data.paymentDate || new Date(),
        referenceType: 'SupplierPayment',
        referenceId: payment.id.toString(),
        createdBy: data.createdBy || undefined,
        lines
      }, tx);

      // If allocated to an invoice, update that invoice
      if (data.supplierInvoiceId) {
        const [invoice] = await tx.select().from(supplierInvoices).where(eq(supplierInvoices.id, data.supplierInvoiceId));
        if (invoice) {
          const newPaidAmount = (Number(invoice.paidAmount) + Number(data.amount)).toFixed(2);
          const isFullyPaid = Number(newPaidAmount) >= Number(invoice.totalAmount);
          
          await tx.update(supplierInvoices)
            .set({ 
              paidAmount: newPaidAmount,
              status: isFullyPaid ? 'paid' : 'partial'
            })
            .where(eq(supplierInvoices.id, invoice.id));
        }
      }

      return payment;
    });
  }

  async createInventoryValuationSnapshot(companyId: number, asOfDate: Date, userId?: string, branchId?: number): Promise<any> {
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    const method = company?.inventoryValuationMethod || "WAC";

    let productsList: any[] = [];
    if (branchId) {
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          costPrice: products.costPrice,
          stockLevel: branchStocks.stockLevel,
        })
        .from(products)
        .leftJoin(branchStocks, and(eq(branchStocks.productId, products.id), eq(branchStocks.branchId, branchId)))
        .where(eq(products.companyId, companyId));
      productsList = rows;
    } else {
      productsList = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          costPrice: products.costPrice,
          stockLevel: products.stockLevel,
        })
        .from(products)
        .where(eq(products.companyId, companyId));
    }

    const lines = productsList.map((p) => {
      const quantity = Number(p.stockLevel || 0);
      const unitCost = Number(p.costPrice || 0);
      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku || null,
        branchId: branchId || null,
        quantity,
        unitCost,
        totalValue: quantity * unitCost,
        valuationMethod: method,
      };
    });

    const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
    const totalValue = lines.reduce((sum, l) => sum + l.totalValue, 0);

    const [snapshot] = await db
      .insert(inventoryValuationSnapshots)
      .values({
        companyId,
        branchId: branchId || null,
        asOfDate,
        valuationMethod: method,
        totalQuantity: totalQuantity.toFixed(2),
        totalValue: totalValue.toFixed(2),
        lines,
        createdBy: userId || null,
      })
      .returning();

    return snapshot;
  }

  // Inventory Transactions
  async getInventoryTransactions(companyId: number, productId?: number, ownerGroup?: string): Promise<any[]> {
    const filters = [eq(inventoryTransactions.companyId, companyId)];
    if (productId) filters.push(eq(inventoryTransactions.productId, productId));
    const ownerGroups = parseOwnerGroups(ownerGroup);
    if (ownerGroups.length === 1) {
      filters.push(eq(products.ownerGroup, ownerGroups[0]));
    } else if (ownerGroups.length > 1) {
      filters.push(inArray(products.ownerGroup, ownerGroups));
    }

    return await db
      .select({
        id: inventoryTransactions.id,
        companyId: inventoryTransactions.companyId,
        branchId: inventoryTransactions.branchId,
        productId: inventoryTransactions.productId,
        variationId: inventoryTransactions.variationId,
        supplierId: inventoryTransactions.supplierId,
        type: inventoryTransactions.type,
        quantity: inventoryTransactions.quantity,
        unitCost: inventoryTransactions.unitCost,
        totalCost: inventoryTransactions.totalCost,
        referenceId: inventoryTransactions.referenceId,
        referenceType: inventoryTransactions.referenceType,
        notes: inventoryTransactions.notes,
        remainingQuantity: inventoryTransactions.remainingQuantity,
        batchNumber: inventoryTransactions.batchNumber,
        expiryDate: inventoryTransactions.expiryDate,
        createdBy: inventoryTransactions.createdBy,
        createdAt: inventoryTransactions.createdAt,
        userName: users.username,
        variationName: productVariations.name
      })
      .from(inventoryTransactions)
      .leftJoin(products, eq(products.id, inventoryTransactions.productId))
      .leftJoin(users, eq(users.id, inventoryTransactions.createdBy))
      .leftJoin(productVariations, eq(productVariations.id, inventoryTransactions.variationId))
      .where(and(...filters))
      .orderBy(desc(inventoryTransactions.createdAt));
  }

  async createInventoryTransaction(data: InsertInventoryTransaction & { companyId: number }): Promise<InventoryTransaction> {
    const [transaction] = await db.insert(inventoryTransactions).values(data).returning();
    return transaction;
  }

  // Price Adjustments
  async recordPriceAdjustment(data: InsertPriceAdjustment): Promise<PriceAdjustment> {
    const [adjustment] = await db.insert(priceAdjustments).values(data).returning();
    return adjustment;
  }

  async getPriceHistory(productId: number, variationId?: number): Promise<(PriceAdjustment & { user?: { username: string } })[]> {
    const filters = [eq(priceAdjustments.productId, productId)];
    if (variationId) filters.push(eq(priceAdjustments.variationId, variationId));

    const result = await db
      .select({
        adjustment: priceAdjustments,
        username: users.username
      })
      .from(priceAdjustments)
      .leftJoin(users, eq(priceAdjustments.createdBy, users.id))
      .where(and(...filters))
      .orderBy(desc(priceAdjustments.createdAt));

    return result.map(r => ({
      ...r.adjustment,
      user: r.username ? { username: r.username } : undefined
    }));
  }

  async adjustInventory(companyId: number, data: { productId: number, variationId?: number, branchId?: number, quantity: string | number, type: string, notes?: string, userId: string }): Promise<void> {
    const { recordAdjustment } = await import("./lib/inventory.js");
    await recordAdjustment(companyId, {
      ...data,
      quantity: Number(data.quantity)
    });
  }

  // Expenses
  async getExpenses(companyId: number): Promise<Expense[]> {
    return await db.select().from(expenses).where(eq(expenses.companyId, companyId)).orderBy(desc(expenses.expenseDate));
  }

  async createExpense(data: InsertExpense & { companyId: number }): Promise<Expense> {
    return await db.transaction(async (tx) => {
      const [expense] = await tx.insert(expenses).values(data).returning();
      
      // Determine accounts
      let debitAccountCode = await this.getSystemAccountCode(data.companyId, "generalExpenseAccountCode", tx); // Default General Expenses
      if (data.debitAccountId) {
        const [acc] = await tx.select().from(accounts).where(eq(accounts.id, data.debitAccountId));
        if (acc) debitAccountCode = acc.code;
      }

      let creditAccountCode = await this.getSystemAccountCode(data.companyId, "cashAccountCode", tx); // Default Cash
      if (data.creditAccountId) {
        const [acc] = await tx.select().from(accounts).where(eq(accounts.id, data.creditAccountId));
        if (acc) creditAccountCode = acc.code;
      }

      await this.postToLedger(data.companyId, {
        entryDate: expense.expenseDate,
        description: `Expense: ${expense.category} - ${expense.description}`,
        referenceType: "EXPENSE",
        referenceId: expense.id.toString(),
        createdBy: undefined,
        lines: [
          { accountCode: debitAccountCode, type: "DEBIT", amount: Number(expense.amount) },
          { accountCode: creditAccountCode, type: "CREDIT", amount: Number(expense.amount) },
        ]
      }, tx);

      return expense;
    });
  }

  async updateExpense(id: number, data: Partial<InsertExpense>): Promise<Expense | undefined> {
    const [updated] = await db.update(expenses).set(data).where(eq(expenses.id, id)).returning();
    return updated;
  }

  // Reports
  async getStockValuationReport(companyId: number, ownerGroup?: string) {
    const [company] = await db
      .select({ method: companies.inventoryValuationMethod })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const valuationMethod = (company?.method === "FIFO" || company?.method === "LIFO" || company?.method === "WAC")
      ? company.method
      : "WAC";

    const filters: any[] = [eq(products.companyId, companyId), eq(products.isTracked, true), ne(products.isActive, false)];
    const ownerGroupFilter = buildOwnerGroupSql(products.ownerGroup, ownerGroup);
    if (ownerGroupFilter) {
      filters.push(ownerGroupFilter);
    }
    const trackedProducts = await db
      .select()
      .from(products)
      .where(and(...filters));

    if (trackedProducts.length === 0) return [];

    const productIds = trackedProducts.map((p) => p.id);
    const ledgerRows = await db
      .select({
        productId: inventoryTransactions.productId,
        quantity: inventoryTransactions.quantity,
        unitCost: inventoryTransactions.unitCost,
        totalCost: inventoryTransactions.totalCost,
        createdAt: inventoryTransactions.createdAt,
        id: inventoryTransactions.id,
      })
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.companyId, companyId),
        inArray(inventoryTransactions.productId, productIds)
      ))
      .orderBy(asc(inventoryTransactions.createdAt), asc(inventoryTransactions.id));

    const ledgerByProduct = new Map<number, typeof ledgerRows>();
    for (const row of ledgerRows) {
      const rows = ledgerByProduct.get(row.productId) || [];
      rows.push(row);
      ledgerByProduct.set(row.productId, rows);
    }

    const consumeLayers = (
      layers: Array<{ quantity: number; unitCost: number }>,
      quantity: number,
      method: "FIFO" | "LIFO"
    ) => {
      let remaining = quantity;
      while (remaining > 0.000001 && layers.length > 0) {
        const index = method === "FIFO" ? 0 : layers.length - 1;
        const layer = layers[index];
        const consumed = Math.min(layer.quantity, remaining);
        layer.quantity -= consumed;
        remaining -= consumed;
        if (layer.quantity <= 0.000001) layers.splice(index, 1);
      }
    };

    return trackedProducts.map((product) => {
      const currentStock = Number(product.stockLevel || 0);
      const fallbackUnitCost = Number(product.costPrice || 0);
      const rows = ledgerByProduct.get(product.id) || [];
      let totalValuation = 0;

      if (valuationMethod === "WAC") {
        let poolQuantity = 0;
        let poolValue = 0;

        for (const row of rows) {
          const quantity = Number(row.quantity || 0);
          if (!Number.isFinite(quantity) || quantity === 0) continue;
          const unitCost = Number(row.unitCost ?? (quantity !== 0 ? Number(row.totalCost || 0) / Math.abs(quantity) : fallbackUnitCost)) || fallbackUnitCost;

          if (quantity > 0) {
            poolQuantity += quantity;
            poolValue += quantity * unitCost;
          } else {
            const averageCost = poolQuantity > 0 ? poolValue / poolQuantity : fallbackUnitCost;
            const consumed = Math.min(Math.abs(quantity), Math.max(poolQuantity, 0));
            poolQuantity -= consumed;
            poolValue -= consumed * averageCost;
          }
        }

        const averageCost = poolQuantity > 0 ? poolValue / poolQuantity : fallbackUnitCost;
        totalValuation = currentStock * averageCost;
      } else {
        const layers: Array<{ quantity: number; unitCost: number }> = [];

        for (const row of rows) {
          const quantity = Number(row.quantity || 0);
          if (!Number.isFinite(quantity) || quantity === 0) continue;
          const unitCost = Number(row.unitCost ?? (quantity !== 0 ? Number(row.totalCost || 0) / Math.abs(quantity) : fallbackUnitCost)) || fallbackUnitCost;

          if (quantity > 0) {
            layers.push({ quantity, unitCost });
          } else {
            consumeLayers(layers, Math.abs(quantity), valuationMethod);
          }
        }

        const layerQuantity = layers.reduce((sum, layer) => sum + layer.quantity, 0);
        if (currentStock < layerQuantity) {
          consumeLayers(layers, layerQuantity - currentStock, valuationMethod);
        } else if (currentStock > layerQuantity) {
          layers.push({ quantity: currentStock - layerQuantity, unitCost: fallbackUnitCost });
        }

        totalValuation = layers.reduce((sum, layer) => sum + (layer.quantity * layer.unitCost), 0);
      }

      const unitCost = currentStock > 0 ? totalValuation / currentStock : fallbackUnitCost;

      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        stockLevel: product.stockLevel || "0",
        unitCost: unitCost.toFixed(4),
        valuationMethod,
        totalValuation: Number(totalValuation.toFixed(2)),
        totalValue: totalValuation.toFixed(2),
      };
    });
  }

  async getFiscalReportData(companyId: number, date: Date, cashierId?: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const filters = [
      eq(invoices.companyId, companyId),
      gte(invoices.issueDate, start),
      lte(invoices.issueDate, end),
      ne(invoices.transactionType, 'CreditNote')
    ];
    if (cashierId) filters.push(eq(invoices.createdBy, cashierId));

    const dayInvoices = await db
      .select()
      .from(invoices)
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .where(and(...filters));

    const invoiceIds = dayInvoices.map(r => r.invoices.id);
    let allItems: any[] = [];
    if (invoiceIds.length > 0) {
      allItems = await db
        .select()
        .from(invoiceItems)
        .where(inArray(invoiceItems.invoiceId, invoiceIds));
    }

    const companyCurrencies = await this.getCurrencies(companyId);
    const taxTypesList = await this.getTaxTypes(companyId);

    // Grouping
    const currencyMap = new Map();
    const cashierMap = new Map();
    const itemMap = new Map();
    const taxMap = new Map();
    const paymentMethodMap = new Map();

    let totalRevenue = 0;
    let totalTax = 0;

    dayInvoices.forEach(({ invoices: inv, users: user }) => {
      totalRevenue += Number(inv.total);
      totalTax += Number(inv.taxAmount);

      // Currency
      const curr = currencyMap.get(inv.currency) || {
        code: inv.currency,
        name: companyCurrencies.find(c => c.code === inv.currency)?.name || inv.currency,
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        count: 0
      };
      curr.subtotal += Number(inv.subtotal);
      curr.taxAmount += Number(inv.taxAmount);
      curr.total += Number(inv.total);
      curr.count += 1;
      currencyMap.set(inv.currency, curr);

      // Cashier
      const cashierName = user?.username || 'System';
      const csh = cashierMap.get(user?.id || 'system') || {
        id: user?.id || 'system',
        name: cashierName,
        total: 0,
        count: 0
      };
      csh.total += Number(inv.total);
      csh.count += 1;
      cashierMap.set(user?.id || 'system', csh);

      const addPaymentMethod = (rawMethod: unknown, rawAmount: unknown) => {
        const method = String(rawMethod || "UNKNOWN").trim().toUpperCase();
        const amount = Number(rawAmount || 0);
        if (!Number.isFinite(amount) || amount <= 0) return;
        const current = paymentMethodMap.get(method) || {
          method,
          total: 0,
          count: 0
        };
        current.total += amount;
        current.count += 1;
        paymentMethodMap.set(method, current);
      };

      const split = inv.splitPayments as any;
      if (Array.isArray(split) && split.length > 0) {
        split.forEach((entry: any) => addPaymentMethod(entry?.method, entry?.amount));
      } else {
        addPaymentMethod(inv.paymentMethod, inv.total);
      }
    });

    allItems.forEach(item => {
      // Item Sales
      const itm = itemMap.get(item.productId || item.description) || {
        id: item.productId,
        name: item.description,
        sku: '',
        quantity: 0,
        total: 0
      };
      itm.quantity += Number(item.quantity);
      itm.total += Number(item.lineTotal);
      itemMap.set(item.productId || item.description, itm);

      // Tax Breakdown
      const taxTypeId = item.taxTypeId;
      if (taxTypeId) {
        const taxInfo = taxTypesList.find(t => t.id === taxTypeId);
        if (taxInfo) {
          const tKey = taxInfo.id;
          const tx = taxMap.get(tKey) || {
            taxID: taxInfo.id,
            taxCode: taxInfo.code,
            taxName: taxInfo.name,
            taxPercent: Number(taxInfo.rate),
            taxableAmount: 0,
            taxAmount: 0
          };

          // Calculate tax from lineTotal if not explicit
          // Assuming lineTotal is inclusive for some, exclusive for others?
          // Actually shared/schema says lineTotal is the final line item amount.
          const lineTax = (Number(item.lineTotal) * Number(item.taxRate)) / (100 + Number(item.taxRate));
          tx.taxableAmount += Number(item.lineTotal) - lineTax;
          tx.taxAmount += lineTax;
          taxMap.set(tKey, tx);
        }
      }
    });

    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));

    return {
      summary: {
        totalRevenue,
        revenue: totalRevenue,
        totalTax,
        tax: totalTax,
        receiptsCount: dayInvoices.length,
        invoiceCount: dayInvoices.length,
        productsSold: Array.from(itemMap.values()).reduce((acc, i) => acc + i.quantity, 0),
        fiscalDayNo: comp?.currentFiscalDayNo || null,
        date: date.toISOString()
      },
      currencies: Array.from(currencyMap.values()).map(c => ({
        ...c,
        tax: c.taxAmount
      })),
      cashiers: Array.from(cashierMap.values()).map(c => ({
        ...c,
        cashierId: c.id
      })),
      paymentMethods: Array.from(paymentMethodMap.values())
        .sort((a, b) => Number(b.total) - Number(a.total)),
      items: Array.from(itemMap.values()).map(i => ({
        ...i,
        productId: i.id
      })),
      taxes: Array.from(taxMap.values()).map(t => ({
        ...t,
        taxRate: t.taxPercent,
        net: t.taxableAmount,
        tax: t.taxAmount
      }))
    };
  }

  async getFinancialSummary(companyId: number, dateFrom?: Date, dateTo?: Date, cashierId?: string, drillDown?: boolean) {
    // 1. Revenue (Sum of Invoices - Sum of Credit Notes)
    const invoiceFilters = [eq(invoices.companyId, companyId)];
    if (dateFrom) invoiceFilters.push(gte(invoices.createdAt, dateFrom));
    if (dateTo) invoiceFilters.push(lte(invoices.createdAt, dateTo));
    if (cashierId) invoiceFilters.push(eq(invoices.createdBy, cashierId));

    const companyInvoices = await db
      .select()
      .from(invoices)
      .where(and(...invoiceFilters));

    let revenue = 0;
    const revenueItems: any[] = [];

    companyInvoices.forEach(inv => {
      const amount = Number(inv.total);
      if (inv.transactionType === 'CreditNote') {
        revenue -= amount;
        if (drillDown) revenueItems.push({ ...inv, total: -amount });
      } else {
        revenue += amount;
        if (drillDown) revenueItems.push(inv);
      }
    });

    // 2. COGS (Sum of totalCost in inventory_transactions for 'STOCK_OUT')
    let txFilters = [
      eq(inventoryTransactions.companyId, companyId),
      eq(inventoryTransactions.type, 'STOCK_OUT')
    ];
    if (dateFrom) txFilters.push(gte(inventoryTransactions.createdAt, dateFrom));
    if (dateTo) txFilters.push(lte(inventoryTransactions.createdAt, dateTo));

    let salesTransactions;
    if (cashierId) {
      salesTransactions = await db
        .select({ tx: inventoryTransactions })
        .from(inventoryTransactions)
        .innerJoin(invoices, eq(inventoryTransactions.referenceId, invoices.id.toString()))
        .where(and(
          ...txFilters,
          eq(invoices.createdBy, cashierId),
          eq(inventoryTransactions.referenceType, 'INVOICE')
        ));
      salesTransactions = salesTransactions.map(r => r.tx);
    } else {
      salesTransactions = await db
        .select()
        .from(inventoryTransactions)
        .where(and(...txFilters));
    }

    const cogs = salesTransactions.reduce((acc, curr) => acc + Number(curr.totalCost || 0), 0);

    // 3. Expenses
    const expenseFilters = [eq(expenses.companyId, companyId)];
    if (dateFrom) expenseFilters.push(gte(expenses.expenseDate, dateFrom));
    if (dateTo) expenseFilters.push(lte(expenses.expenseDate, dateTo));

    const companyExpenses = await db
      .select()
      .from(expenses)
      .where(and(...expenseFilters));

    const totalExpenses = companyExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);

    // 4. Expense Breakdown
    const breakdownMap = new Map<string, number>();
    companyExpenses.forEach(e => {
      const current = breakdownMap.get(e.category) || 0;
      breakdownMap.set(e.category, current + Number(e.amount));
    });

    const expenseBreakdown = Array.from(breakdownMap.entries()).map(([category, amount]) => ({
      category,
      amount
    })).sort((a, b) => b.amount - a.amount);

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - totalExpenses;

    return {
      revenue,
      cogs,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      grossMarginPercent: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      netProfitPercent: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      pnl: {
        revenue: {
          grossSales: revenue,
          discounts: 0,
          returns: 0,
          netSales: revenue,
        },
        costOfGoodsSold: {
          openingStock: 0,
          purchases: 0,
          landedCosts: 0,
          closingStock: 0,
          totalCogs: cogs,
        },
        grossProfit,
        expenses: expenseBreakdown,
        netProfit,
      },
      expenseBreakdown,
      drillDown: drillDown ? {
        revenueItems,
        cogsItems: salesTransactions,
        expenseItems: companyExpenses
      } : undefined
    };
  }
  // ── Report Module Methods ──────────────────────────────────────────────────

  async getReportSalesSummary(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const byDate = new Map<string, { invoiceCount: number; subtotal: number; taxAmount: number; total: number }>();
    for (const { invoices: inv } of rows) {
      const dateKey = inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : 'unknown';
      const existing = byDate.get(dateKey) ?? { invoiceCount: 0, subtotal: 0, taxAmount: 0, total: 0 };
      existing.invoiceCount += 1;
      existing.subtotal += Number(inv.subtotal);
      existing.taxAmount += Number(inv.taxAmount);
      existing.total += Number(inv.total);
      byDate.set(dateKey, existing);
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        invoiceCount: v.invoiceCount,
        subtotal: v.subtotal.toFixed(2),
        taxAmount: v.taxAmount.toFixed(2),
        total: v.total.toFixed(2),
      }));
  }

  async getReportSalesByCustomer(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const byCustomer = new Map<number, { customerName: string; invoiceCount: number; total: number }>();
    for (const { invoices: inv, customers: cust } of rows) {
      const custId = inv.customerId;
      const existing = byCustomer.get(custId) ?? { customerName: cust?.name ?? 'Unknown', invoiceCount: 0, total: 0 };
      existing.invoiceCount += 1;
      existing.total += Number(inv.total);
      byCustomer.set(custId, existing);
    }

    return Array.from(byCustomer.entries()).map(([customerId, v]) => ({
      customerId,
      customerName: v.customerName,
      invoiceCount: v.invoiceCount,
      total: v.total.toFixed(2),
    }));
  }

  async getReportSalesByItem(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const byItem = new Map<string, { productId: number | null; quantitySold: number; revenue: number }>();
    for (const { invoice_items: item } of rows) {
      const key = item.description;
      const existing = byItem.get(key) ?? { productId: item.productId ?? null, quantitySold: 0, revenue: 0 };
      existing.quantitySold += Number(item.quantity);
      existing.revenue += Number(item.lineTotal);
      byItem.set(key, existing);
    }

    return Array.from(byItem.entries()).map(([description, v]) => ({
      productId: v.productId,
      description,
      quantitySold: v.quantitySold.toFixed(2),
      revenue: v.revenue.toFixed(2),
    }));
  }

  async getReportSalesBySalesperson(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const byUser = new Map<string, { userName: string; invoiceCount: number; total: number }>();
    for (const { invoices: inv, users: u } of rows) {
      const userId = inv.createdBy ?? 'unknown';
      const existing = byUser.get(userId) ?? { userName: u?.name ?? u?.email ?? userId, invoiceCount: 0, total: 0 };
      existing.invoiceCount += 1;
      existing.total += Number(inv.total);
      byUser.set(userId, existing);
    }

    return Array.from(byUser.entries()).map(([userId, v]) => ({
      userId,
      userName: v.userName,
      invoiceCount: v.invoiceCount,
      total: v.total.toFixed(2),
    }));
  }

  async getReportArAgingSummary(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const today = new Date();
    const byCustomer = new Map<number, { customerName: string; current: number; days31_60: number; days61_90: number; days90plus: number }>();
    const paidByInvoice = new Map<number, number>();

    for (const { invoices: inv, payments: pmt } of rows) {
      if (pmt) {
        paidByInvoice.set(inv.id, (paidByInvoice.get(inv.id) ?? 0) + Number(pmt.amount));
      }
    }

    const seen = new Set<number>();
    for (const { invoices: inv, customers: cust } of rows) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);

      const paid = paidByInvoice.get(inv.id) ?? 0;
      const balance = Number(inv.total) - paid;
      if (balance <= 0) continue;

      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date();
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      const custId = inv.customerId;
      const existing = byCustomer.get(custId) ?? { customerName: cust?.name ?? 'Unknown', current: 0, days31_60: 0, days61_90: 0, days90plus: 0 };

      if (daysOverdue <= 30) existing.current += balance;
      else if (daysOverdue <= 60) existing.days31_60 += balance;
      else if (daysOverdue <= 90) existing.days61_90 += balance;
      else existing.days90plus += balance;

      byCustomer.set(custId, existing);
    }

    return Array.from(byCustomer.entries()).map(([customerId, v]) => ({
      customerId,
      customerName: v.customerName,
      current: v.current.toFixed(2),
      days31_60: v.days31_60.toFixed(2),
      days61_90: v.days61_90.toFixed(2),
      days90plus: v.days90plus.toFixed(2),
      total: (v.current + v.days31_60 + v.days61_90 + v.days90plus).toFixed(2),
    }));
  }

  async getReportArAgingDetails(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const today = new Date();
    const paidByInvoice = new Map<number, number>();
    for (const { payments: pmt, invoices: inv } of rows) {
      if (pmt) paidByInvoice.set(inv.id, (paidByInvoice.get(inv.id) ?? 0) + Number(pmt.amount));
    }

    const seen = new Set<number>();
    const result: any[] = [];
    for (const { invoices: inv, customers: cust } of rows) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);

      const paid = paidByInvoice.get(inv.id) ?? 0;
      const balance = Number(inv.total) - paid;
      if (balance <= 0) continue;

      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date();
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      let bucket: "current" | "31-60" | "61-90" | "90+";
      if (daysOverdue <= 30) bucket = "current";
      else if (daysOverdue <= 60) bucket = "31-60";
      else if (daysOverdue <= 90) bucket = "61-90";
      else bucket = "90+";

      result.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: cust?.name ?? 'Unknown',
        dueDate: dueDate.toISOString().slice(0, 10),
        daysOverdue,
        balanceDue: balance.toFixed(2),
        bucket,
      });
    }
    return result;
  }

  async getReportInvoiceDetails(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end)
      ));

    const paidByInvoice = new Map<number, number>();
    for (const { payments: pmt, invoices: inv } of rows) {
      if (pmt) paidByInvoice.set(inv.id, (paidByInvoice.get(inv.id) ?? 0) + Number(pmt.amount));
    }

    const seen = new Set<number>();
    const result: any[] = [];
    for (const { invoices: inv, customers: cust } of rows) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const balance = Math.max(0, Number(inv.total) - paid);
      result.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: cust?.name ?? 'Unknown',
        issueDate: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : '',
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : '',
        status: inv.status ?? 'draft',
        total: Number(inv.total).toFixed(2),
        paidAmount: paid.toFixed(2),
        balanceDue: balance.toFixed(2),
      });
    }
    return result;
  }

  async getReportQuoteDetails(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(quotations)
      .leftJoin(customers, eq(quotations.customerId, customers.id))
      .where(and(
        eq(quotations.companyId, companyId),
        gte(quotations.issueDate, start),
        lte(quotations.issueDate, end)
      ));

    return rows.map(({ quotations: q, customers: cust }) => ({
      quotationId: q.id,
      quotationNumber: q.quotationNumber,
      customerName: cust?.name ?? 'Unknown',
      issueDate: q.issueDate ? q.issueDate.toISOString().slice(0, 10) : '',
      expiryDate: q.expiryDate ? q.expiryDate.toISOString().slice(0, 10) : null,
      status: q.status ?? 'draft',
      total: Number(q.total).toFixed(2),
    }));
  }

  async getReportCustomerBalanceSummary(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const paidByInvoice = new Map<number, number>();
    for (const { payments: pmt, invoices: inv } of rows) {
      if (pmt) paidByInvoice.set(inv.id, (paidByInvoice.get(inv.id) ?? 0) + Number(pmt.amount));
    }

    const byCustomer = new Map<number, { customerName: string; totalInvoiced: number; totalPaid: number }>();
    const seen = new Set<number>();
    for (const { invoices: inv, customers: cust } of rows) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      const custId = inv.customerId;
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const existing = byCustomer.get(custId) ?? { customerName: cust?.name ?? 'Unknown', totalInvoiced: 0, totalPaid: 0 };
      existing.totalInvoiced += Number(inv.total);
      existing.totalPaid += paid;
      byCustomer.set(custId, existing);
    }

    return Array.from(byCustomer.entries()).map(([customerId, v]) => ({
      customerId,
      customerName: v.customerName,
      totalInvoiced: v.totalInvoiced.toFixed(2),
      totalPaid: v.totalPaid.toFixed(2),
      balance: (v.totalInvoiced - v.totalPaid).toFixed(2),
    }));
  }

  async getReportReceivableSummary(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const paidByInvoice = new Map<number, number>();
    for (const { payments: pmt, invoices: inv } of rows) {
      if (pmt) paidByInvoice.set(inv.id, (paidByInvoice.get(inv.id) ?? 0) + Number(pmt.amount));
    }

    let totalInvoiced = 0;
    let totalCollected = 0;
    const seen = new Set<number>();
    for (const { invoices: inv } of rows) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      totalInvoiced += Number(inv.total);
      totalCollected += paidByInvoice.get(inv.id) ?? 0;
    }

    return {
      totalInvoiced: totalInvoiced.toFixed(2),
      totalCollected: totalCollected.toFixed(2),
      totalOutstanding: Math.max(0, totalInvoiced - totalCollected).toFixed(2),
    };
  }

  async getReportReceivableDetails(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const paidByInvoice = new Map<number, number>();
    for (const { payments: pmt, invoices: inv } of rows) {
      if (pmt) paidByInvoice.set(inv.id, (paidByInvoice.get(inv.id) ?? 0) + Number(pmt.amount));
    }

    const seen = new Set<number>();
    const result: any[] = [];
    for (const { invoices: inv, customers: cust } of rows) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const balance = Math.max(0, Number(inv.total) - paid);
      result.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: cust?.name ?? 'Unknown',
        issueDate: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : '',
        total: Number(inv.total).toFixed(2),
        paidAmount: paid.toFixed(2),
        balanceDue: balance.toFixed(2),
        status: inv.status ?? 'draft',
      });
    }
    return result;
  }

  async getReportBadDebts(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    const today = new Date();
    const paidByInvoice = new Map<number, number>();
    for (const { payments: pmt, invoices: inv } of rows) {
      if (pmt) paidByInvoice.set(inv.id, (paidByInvoice.get(inv.id) ?? 0) + Number(pmt.amount));
    }

    const seen = new Set<number>();
    const result: any[] = [];
    for (const { invoices: inv, customers: cust } of rows) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const balance = Number(inv.total) - paid;
      if (balance <= 0) continue;
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date();
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      if (daysOverdue <= 90) continue;
      result.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: cust?.name ?? 'Unknown',
        dueDate: dueDate.toISOString().slice(0, 10),
        daysOverdue,
        balanceDue: balance.toFixed(2),
      });
    }
    return result;
  }

  async getReportBankCharges(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(payments)
      .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(payments.companyId, companyId),
        gte(payments.paymentDate, start),
        lte(payments.paymentDate, end),
        eq(payments.paymentMethod, 'BANK_TRANSFER')
      ));

    return rows.map(({ payments: pmt, invoices: inv, customers: cust }) => ({
      paymentId: pmt.id,
      invoiceNumber: inv?.invoiceNumber ?? '',
      customerName: cust?.name ?? 'Unknown',
      paymentDate: pmt.paymentDate.toISOString().slice(0, 10),
      reference: pmt.reference ?? '',
      amount: Number(pmt.amount).toFixed(2),
    }));
  }

  async getReportTimeToGetPaid(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(payments)
      .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(payments.companyId, companyId),
        gte(payments.paymentDate, start),
        lte(payments.paymentDate, end)
      ));

    return rows.map(({ payments: pmt, invoices: inv, customers: cust }) => {
      const issueDate = inv?.issueDate ? new Date(inv.issueDate) : new Date();
      const paymentDate = new Date(pmt.paymentDate);
      const daysToPayment = Math.max(0, Math.floor((paymentDate.getTime() - issueDate.getTime()) / 86400000));
      return {
        invoiceId: inv?.id ?? 0,
        invoiceNumber: inv?.invoiceNumber ?? '',
        customerName: cust?.name ?? 'Unknown',
        issueDate: issueDate.toISOString().slice(0, 10),
        paymentDate: paymentDate.toISOString().slice(0, 10),
        daysToPayment,
        amount: Number(pmt.amount).toFixed(2),
      };
    });
  }

  async getReportRefundHistory(companyId: number, start: Date, end: Date) {
    const creditNotes = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        eq(invoices.transactionType, 'CreditNote')
      ));

    const relatedIds = creditNotes
      .map(r => r.invoices.relatedInvoiceId)
      .filter((id): id is number => id != null);

    const relatedInvoices = relatedIds.length > 0
      ? await db.select().from(invoices).where(inArray(invoices.id, relatedIds))
      : [];

    const relatedMap = new Map(relatedInvoices.map(inv => [inv.id, inv.invoiceNumber]));

    return creditNotes.map(({ invoices: inv, customers: cust }) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: cust?.name ?? 'Unknown',
      issueDate: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : '',
      amount: Number(inv.total).toFixed(2),
      relatedInvoiceNumber: inv.relatedInvoiceId ? (relatedMap.get(inv.relatedInvoiceId) ?? null) : null,
    }));
  }

  async getReportWithholdingTax(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .innerJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    // Group by invoice, sum withheld amounts from items with negative tax (withholding)
    const byInvoice = new Map<number, { invoiceNumber: string; customerName: string; issueDate: string; withheldAmount: number; total: number }>();
    for (const { invoices: inv, customers: cust, invoice_items: item } of rows) {
      const taxRate = Number(item.taxRate);
      if (taxRate >= 0) continue; // Only negative tax rates represent withholding
      const withheld = Math.abs(Number(item.lineTotal));
      const existing = byInvoice.get(inv.id) ?? {
        invoiceNumber: inv.invoiceNumber,
        customerName: cust?.name ?? 'Unknown',
        issueDate: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : '',
        withheldAmount: 0,
        total: Number(inv.total),
      };
      existing.withheldAmount += withheld;
      byInvoice.set(inv.id, existing);
    }

    return Array.from(byInvoice.entries()).map(([invoiceId, v]) => ({
      invoiceId,
      invoiceNumber: v.invoiceNumber,
      customerName: v.customerName,
      issueDate: v.issueDate,
      withheldAmount: v.withheldAmount.toFixed(2),
      total: v.total.toFixed(2),
    }));
  }

  async getReportExpenseDetails(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(expenses)
      .leftJoin(suppliers, eq(expenses.supplierId, suppliers.id))
      .where(and(
        eq(expenses.companyId, companyId),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end)
      ));

    return rows.map(({ expenses: exp, suppliers: sup }) => ({
      expenseId: exp.id,
      expenseDate: exp.expenseDate.toISOString().slice(0, 10),
      category: exp.category,
      description: exp.description,
      supplierName: sup?.name ?? null,
      paymentMethod: exp.paymentMethod ?? null,
      reference: exp.reference ?? null,
      amount: Number(exp.amount).toFixed(2),
      currency: exp.currency,
    }));
  }

  async getReportExpensesByCategory(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(expenses)
      .where(and(
        eq(expenses.companyId, companyId),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end)
      ));

    const byCategory = new Map<string, { total: number; count: number }>();
    let grandTotal = 0;
    for (const exp of rows) {
      const amt = Number(exp.amount);
      grandTotal += amt;
      const existing = byCategory.get(exp.category) ?? { total: 0, count: 0 };
      existing.total += amt;
      existing.count += 1;
      byCategory.set(exp.category, existing);
    }

    return Array.from(byCategory.entries()).map(([category, v]) => ({
      category,
      total: v.total.toFixed(2),
      percentage: grandTotal > 0 ? ((v.total / grandTotal) * 100).toFixed(2) : '0.00',
      count: v.count,
    }));
  }

  async getReportExpensesByCustomer(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(expenses)
      .leftJoin(suppliers, eq(expenses.supplierId, suppliers.id))
      .where(and(
        eq(expenses.companyId, companyId),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end)
      ));

    const bySupplier = new Map<string, { supplierId: number | null; supplierName: string; total: number; count: number }>();
    for (const { expenses: exp, suppliers: sup } of rows) {
      const key = sup ? String(sup.id) : 'no-supplier';
      const existing = bySupplier.get(key) ?? { supplierId: sup?.id ?? null, supplierName: sup?.name ?? 'No Supplier', total: 0, count: 0 };
      existing.total += Number(exp.amount);
      existing.count += 1;
      bySupplier.set(key, existing);
    }

    return Array.from(bySupplier.values()).map(v => ({
      supplierId: v.supplierId,
      supplierName: v.supplierName,
      total: v.total.toFixed(2),
      count: v.count,
    }));
  }

  async getReportExpensesByProject(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(expenses)
      .where(and(
        eq(expenses.companyId, companyId),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end)
      ));

    const byProject = new Map<string, { total: number; count: number }>();
    for (const exp of rows) {
      const project = exp.notes ?? 'Unassigned';
      const existing = byProject.get(project) ?? { total: 0, count: 0 };
      existing.total += Number(exp.amount);
      existing.count += 1;
      byProject.set(project, existing);
    }

    return Array.from(byProject.entries()).map(([project, v]) => ({
      project,
      total: v.total.toFixed(2),
      count: v.count,
    }));
  }

  async getReportBillableExpenseDetails(companyId: number, start: Date, end: Date) {
    const rows = await db
      .select()
      .from(expenses)
      .where(and(
        eq(expenses.companyId, companyId),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end),
        eq(expenses.status, 'pending')
      ));

    return rows.map(exp => ({
      expenseId: exp.id,
      expenseDate: exp.expenseDate.toISOString().slice(0, 10),
      category: exp.category,
      description: exp.description,
      amount: Number(exp.amount).toFixed(2),
      status: exp.status ?? 'pending',
    }));
  }

  async getReportTaxSummary(companyId: number, start: Date, end: Date) {
    // Output tax from invoices grouped by tax type
    const invoiceRows = await db
      .select()
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .leftJoin(taxTypes, eq(invoiceItems.taxTypeId, taxTypes.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, 'CreditNote')
      ));

    // Input tax from expenses grouped by category (using category as tax code proxy)
    const expenseRows = await db
      .select()
      .from(expenses)
      .where(and(
        eq(expenses.companyId, companyId),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end)
      ));

    type TaxEntry = { taxName: string; taxRate: string; taxableAmount: number; outputTax: number; inputTax: number };
    const taxMap = new Map<string, TaxEntry>();

    for (const { invoice_items: item, tax_types: tt } of invoiceRows) {
      const taxCode = tt?.code ?? 'UNKNOWN';
      const taxRate = Number(item.taxRate);
      const lineTotal = Number(item.lineTotal);
      const taxAmt = lineTotal * (taxRate / (100 + taxRate)); // back-calculate tax from inclusive total
      const taxable = lineTotal - taxAmt;

      const existing = taxMap.get(taxCode) ?? {
        taxName: tt?.name ?? taxCode,
        taxRate: Number(tt?.rate ?? item.taxRate).toFixed(2),
        taxableAmount: 0,
        outputTax: 0,
        inputTax: 0,
      };
      existing.taxableAmount += taxable;
      existing.outputTax += taxAmt;
      taxMap.set(taxCode, existing);
    }

    // Estimate input tax from expenses: assume a standard VAT rate of 15% on expenses
    const VAT_RATE = 0.15;
    for (const exp of expenseRows) {
      const amt = Number(exp.amount);
      const inputTax = amt * VAT_RATE;
      const taxCode = 'VAT-STD';
      const existing = taxMap.get(taxCode) ?? {
        taxName: 'Standard VAT',
        taxRate: '15.00',
        taxableAmount: 0,
        outputTax: 0,
        inputTax: 0,
      };
      existing.inputTax += inputTax;
      taxMap.set(taxCode, existing);
    }

    return Array.from(taxMap.entries()).map(([taxCode, v]) => ({
      taxCode,
      taxName: v.taxName,
      taxRate: v.taxRate,
      taxableAmount: v.taxableAmount.toFixed(2),
      outputTax: v.outputTax.toFixed(2),
      inputTax: v.inputTax.toFixed(2),
      netVat: (v.outputTax - v.inputTax).toFixed(2),
    }));
  }

  async getHourlySalesDistribution(companyId: number, startDate: Date, endDate: Date): Promise<{ hour: number; count: number; total: number }[]> {
    const periodInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, "draft"),
        ne(invoices.status, "cancelled")
      ));

    const distribution: Record<number, { count: number; total: number }> = {};
    for (let i = 0; i < 24; i++) {
      distribution[i] = { count: 0, total: 0 };
    }

    periodInvoices.forEach(inv => {
      const date = inv.issueDate ? new Date(inv.issueDate) : new Date();
      const hour = date.getHours();
      const amount = Number(inv.total);

      distribution[hour].count++;
      distribution[hour].total += amount;
    });

    return Object.entries(distribution).map(([hour, data]) => ({
      hour: parseInt(hour),
      count: data.count,
      total: data.total
    }));
  }

  async getOperationalMetrics(companyId: number, startDate: Date, endDate: Date): Promise<{ atv: number; profitMargin: number; itemsPerReceipt: number; totalRevenue: number; totalCogs: number; totalRevenueByCurrency: Record<string, number> }> {
    const periodInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, "draft"),
        ne(invoices.status, "cancelled")
      ));

    if (periodInvoices.length === 0) {
      return { atv: 0, profitMargin: 0, itemsPerReceipt: 0, totalRevenue: 0, totalCogs: 0, totalRevenueByCurrency: {} };
    }

    const invoiceIds = periodInvoices.map(inv => inv.id);
    const items = await db.select()
      .from(invoiceItems)
      .where(inArray(invoiceItems.invoiceId, invoiceIds));

    const totalRevenueByCurrency = periodInvoices.reduce((totals: Record<string, number>, inv) => {
      const currency = inv.currency || "USD";
      totals[currency] = (totals[currency] || 0) + Number(inv.total || 0);
      return totals;
    }, {});
    const roundedRevenueByCurrency = Object.fromEntries(
      Object.entries(totalRevenueByCurrency).map(([currency, amount]) => [currency, Math.round(amount * 100) / 100])
    );
    const totalRevenue = Object.values(totalRevenueByCurrency).reduce((sum, amount) => sum + amount, 0);
    const totalCogs = items.reduce((sum, item) => sum + Number(item.cogsAmount || 0), 0);
    const totalItems = items.reduce((sum, item) => sum + Number(item.quantity), 0);

    const atv = totalRevenue / periodInvoices.length;
    const itemsPerReceipt = totalItems / periodInvoices.length;
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0;

    return {
      atv,
      profitMargin,
      itemsPerReceipt,
      totalRevenue,
      totalCogs,
      totalRevenueByCurrency: roundedRevenueByCurrency
    };
  }

  async getLowStockItems(companyId: number): Promise<(Product & { categoryName?: string })[]> {
    const results = await db
      .select({
        product: products,
        categoryName: productCategories.name
      })
      .from(products)
      .leftJoin(productCategories, eq(products.category, productCategories.name))
      .where(and(
        eq(products.companyId, companyId),
        eq(products.isTracked, true),
        sql`${products.stockLevel} <= ${products.lowStockThreshold}`
      ))
      .orderBy(products.stockLevel);

    return results.map(r => ({
      ...r.product,
      categoryName: r.categoryName || undefined
    }));
  }

  async getReportStockOnHand(companyId: number, ownerGroup?: string): Promise<{ productId: number; name: string; sku: string | null; category: string | null; stockLevel: string; unitCost: string; totalValue: string }[]> {
    const valuationRows = await this.getStockValuationReport(companyId, ownerGroup);
    return valuationRows
      .map((row) => ({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        category: row.category ?? null,
        stockLevel: String(row.stockLevel || "0"),
        unitCost: String(row.unitCost || "0"),
        valuationMethod: row.valuationMethod,
        totalValue: String(row.totalValue ?? row.totalValuation ?? "0"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAbcAnalysis(companyId: number, ownerGroup?: string): Promise<{
    productId: number;
    name: string;
    sku: string | null;
    revenue: number;
    share: number;
    cumulativeShare: number;
    category: "A" | "B" | "C";
  }[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Get revenue by product
    const filters: any[] = [
      eq(invoices.companyId, companyId),
      gte(invoices.issueDate, thirtyDaysAgo),
      ne(invoices.status, 'cancelled'),
      ne(invoices.status, 'draft')
    ];
    const ownerGroupFilter = buildOwnerGroupSql(products.ownerGroup, ownerGroup);
    if (ownerGroupFilter) {
      filters.push(ownerGroupFilter);
    }

    const productRevenue = await db
      .select({
        productId: products.id,
        name: products.name,
        sku: products.sku,
        lineTotal: invoiceItems.lineTotal,
        exchangeRate: invoices.exchangeRate,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .innerJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(...filters));

    const byProduct = new Map<number, { productId: number; name: string; sku: string | null; revenue: number }>();
    for (const row of productRevenue) {
      const rate = Number(row.exchangeRate || 1) || 1;
      const existing = byProduct.get(row.productId) || {
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        revenue: 0,
      };
      existing.revenue += Number(row.lineTotal || 0) / rate;
      byProduct.set(row.productId, existing);
    }

    const productRevenueUsd = Array.from(byProduct.values())
      .map(row => ({ ...row, revenue: Math.round(row.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = productRevenueUsd.reduce((sum, p) => sum + Number(p.revenue), 0);

    if (totalRevenue === 0) return [];

    let currentCumulative = 0;
    return productRevenueUsd.map(p => {
      const revenue = Number(p.revenue);
      const share = (revenue / totalRevenue) * 100;
      currentCumulative += share;

      let category: "A" | "B" | "C" = "C";
      if (currentCumulative <= 70) category = "A";
      else if (currentCumulative <= 90) category = "B";

      return {
        productId: p.productId,
        name: p.name,
        sku: p.sku,
        revenue,
        share,
        cumulativeShare: currentCumulative,
        category
      };
    });
  }

  async getReportInventoryMovements(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; type: string; quantity: string; unitCost: string | null; reference: string | null; notes: string | null }[]> {
    const filters: any[] = [
      eq(inventoryTransactions.companyId, companyId),
      gte(inventoryTransactions.createdAt, start),
      lte(inventoryTransactions.createdAt, end)
    ];
    const ownerGroupFilter = buildOwnerGroupSql(products.ownerGroup, ownerGroup);
    if (ownerGroupFilter) {
      filters.push(ownerGroupFilter);
    }
    const results = await db.select({
      transactionId: inventoryTransactions.id,
      date: inventoryTransactions.createdAt,
      productName: products.name,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      reference: inventoryTransactions.referenceId,
      notes: inventoryTransactions.notes
    })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .where(and(...filters))
      .orderBy(desc(inventoryTransactions.createdAt));

    return results.map(r => ({
      ...r,
      date: r.date?.toISOString() || "",
      quantity: String(r.quantity),
      unitCost: r.unitCost ? String(r.unitCost) : null
    }));
  }

  async getReportStockAdjustments(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; sku: string | null; type: string; quantity: string; unitCost: string | null; totalCost: string | null; referenceType: string | null; reference: string | null; notes: string | null; userName: string | null }[]> {
    const filters: any[] = [
      eq(inventoryTransactions.companyId, companyId),
      gte(inventoryTransactions.createdAt, start),
      lte(inventoryTransactions.createdAt, end),
      inArray(inventoryTransactions.type, ["ADJUSTMENT", "SHRINKAGE", "CORRECTION", "DAMAGE", "EXPIRY"])
    ];
    const ownerGroupFilter = buildOwnerGroupSql(products.ownerGroup, ownerGroup);
    if (ownerGroupFilter) {
      filters.push(ownerGroupFilter);
    }

    const results = await db.select({
      transactionId: inventoryTransactions.id,
      date: inventoryTransactions.createdAt,
      productName: products.name,
      sku: products.sku,
      type: inventoryTransactions.type,
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      totalCost: inventoryTransactions.totalCost,
      referenceType: inventoryTransactions.referenceType,
      reference: inventoryTransactions.referenceId,
      notes: inventoryTransactions.notes,
      userName: users.username
    })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .leftJoin(users, eq(inventoryTransactions.createdBy, users.id))
      .where(and(...filters))
      .orderBy(desc(inventoryTransactions.createdAt));

    return results.map(r => ({
      transactionId: r.transactionId,
      date: r.date?.toISOString() || "",
      productName: r.productName,
      sku: r.sku,
      type: r.type,
      quantity: String(r.quantity),
      unitCost: r.unitCost ? String(r.unitCost) : null,
      totalCost: r.totalCost ? String(r.totalCost) : null,
      referenceType: r.referenceType,
      reference: r.reference,
      notes: r.notes,
      userName: r.userName
    }));
  }

  async getReportPurchaseHistory(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; supplierName: string | null; quantity: string; unitCost: string; totalCost: string; reference: string | null }[]> {
    const filters: any[] = [
      eq(inventoryTransactions.companyId, companyId),
      eq(inventoryTransactions.type, 'STOCK_IN'),
      gte(inventoryTransactions.createdAt, start),
      lte(inventoryTransactions.createdAt, end)
    ];
    const ownerGroupFilter = buildOwnerGroupSql(products.ownerGroup, ownerGroup);
    if (ownerGroupFilter) {
      filters.push(ownerGroupFilter);
    }
    const results = await db.select({
      transactionId: inventoryTransactions.id,
      date: inventoryTransactions.createdAt,
      productName: products.name,
      supplierName: suppliers.name,
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      totalCost: inventoryTransactions.totalCost,
      reference: inventoryTransactions.referenceId
    })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .leftJoin(suppliers, eq(inventoryTransactions.supplierId, suppliers.id))
      .where(and(...filters))
      .orderBy(desc(inventoryTransactions.createdAt));

    return results.map(r => ({
      ...r,
      date: r.date?.toISOString() || "",
      quantity: String(r.quantity),
      unitCost: String(r.unitCost || "0"),
      totalCost: String(r.totalCost || "0")
    }));
  }

  async getReportAutoSparesDailySales(companyId: number, start: Date, end: Date): Promise<any[]> {
    const saleRows = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.status, "draft"),
        ne(invoices.status, "quote")
      ));

    const invoiceIds = saleRows.map(inv => inv.id);
    const paymentRows = invoiceIds.length
      ? await db.select().from(payments).where(inArray(payments.invoiceId, invoiceIds))
      : [];

    const paymentsByInvoice = new Map<number, typeof paymentRows>();
    for (const pmt of paymentRows) {
      const list = paymentsByInvoice.get(pmt.invoiceId) || [];
      list.push(pmt);
      paymentsByInvoice.set(pmt.invoiceId, list);
    }

    const byDate = new Map<string, any>();
    const classifyPayment = (method?: string | null) => {
      const value = (method || "CASH").toLowerCase();
      if (value.includes("card") || value.includes("visa") || value.includes("master")) return "card";
      if (value.includes("mobile") || value.includes("eco") || value.includes("innbucks") || value.includes("wallet")) return "mobileMoney";
      if (value.includes("cash")) return "cash";
      return "other";
    };

    for (const inv of saleRows) {
      const date = inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : "unknown";
      const existing = byDate.get(date) || {
        date,
        invoiceCount: 0,
        returnCount: 0,
        totalSales: 0,
        returns: 0,
        cash: 0,
        card: 0,
        mobileMoney: 0,
        other: 0,
        netSales: 0,
      };

      const total = Number(inv.total || 0);
      const isReturn = inv.transactionType === "CreditNote" || inv.status === "cancelled";
      if (isReturn) {
        existing.returnCount += 1;
        existing.returns += Math.abs(total);
      } else {
        existing.invoiceCount += 1;
        existing.totalSales += total;
      }

      const invoicePayments = paymentsByInvoice.get(inv.id) || [];
      if (invoicePayments.length > 0) {
        for (const pmt of invoicePayments) {
          const bucket = classifyPayment(pmt.paymentMethod);
          existing[bucket] += Number(pmt.amount || 0);
        }
      } else if (!isReturn) {
        const bucket = classifyPayment(inv.paymentMethod);
        existing[bucket] += total;
      }

      existing.netSales = existing.totalSales - existing.returns;
      byDate.set(date, existing);
    }

    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(row => ({
        ...row,
        totalSales: row.totalSales.toFixed(2),
        returns: row.returns.toFixed(2),
        cash: row.cash.toFixed(2),
        card: row.card.toFixed(2),
        mobileMoney: row.mobileMoney.toFixed(2),
        other: row.other.toFixed(2),
        netSales: row.netSales.toFixed(2),
      }));
  }

  async getReportTopSellingParts(companyId: number, start: Date, end: Date): Promise<any[]> {
    const rows = await db.select({
      item: invoiceItems,
      invoice: invoices,
      product: products,
    })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, "CreditNote"),
        ne(invoices.status, "cancelled"),
        ne(invoices.status, "draft")
      ));

    const byPart = new Map<string, any>();
    for (const row of rows) {
      const key = row.item.productId ? `product:${row.item.productId}` : `desc:${row.item.description}`;
      const existing = byPart.get(key) || {
        productId: row.item.productId,
        part: row.product?.name || row.item.description,
        sku: row.product?.sku || null,
        category: row.product?.category || "Uncategorized",
        brand: row.product?.brandName || null,
        quantitySold: 0,
        revenue: 0,
      };
      existing.quantitySold += Number(row.item.quantity || 0);
      existing.revenue += Number(row.item.lineTotal || 0);
      byPart.set(key, existing);
    }

    return Array.from(byPart.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map(row => ({
        ...row,
        quantitySold: row.quantitySold.toFixed(2),
        revenue: row.revenue.toFixed(2),
      }));
  }

  async getReportDeadStock(companyId: number, start: Date, end: Date): Promise<any[]> {
    const productRows = await db.select().from(products).where(eq(products.companyId, companyId));
    const salesRows = await db.select({
      productId: invoiceItems.productId,
      issueDate: invoices.issueDate,
      quantity: invoiceItems.quantity,
    })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, "CreditNote"),
        ne(invoices.status, "cancelled"),
        ne(invoices.status, "draft")
      ));

    const salesByProduct = new Map<number, { lastSoldAt: Date; quantitySold: number }>();
    for (const row of salesRows) {
      if (!row.productId || !row.issueDate) continue;
      const existing = salesByProduct.get(row.productId);
      const issueDate = new Date(row.issueDate);
      if (!existing || issueDate > existing.lastSoldAt) {
        salesByProduct.set(row.productId, {
          lastSoldAt: issueDate,
          quantitySold: (existing?.quantitySold || 0) + Number(row.quantity || 0),
        });
      } else {
        existing.quantitySold += Number(row.quantity || 0);
      }
    }

    const asOf = end || new Date();
    return productRows
      .map(product => {
        const sale = salesByProduct.get(product.id);
        const daysSinceLastSale = sale
          ? Math.floor((asOf.getTime() - sale.lastSoldAt.getTime()) / 86400000)
          : 9999;
        const stockLevel = Number(product.stockLevel || 0);
        return {
          productId: product.id,
          part: product.name,
          sku: product.sku,
          category: product.category || "Uncategorized",
          brand: product.brandName,
          stockLevel: stockLevel.toFixed(2),
          stockValue: (stockLevel * Number(product.costPrice || 0)).toFixed(2),
          lastSoldAt: sale?.lastSoldAt.toISOString().slice(0, 10) || "Never",
          daysSinceLastSale,
          ageingBucket: daysSinceLastSale >= 90 ? "90+ days" : daysSinceLastSale >= 60 ? "60-89 days" : daysSinceLastSale >= 30 ? "30-59 days" : "Active",
        };
      })
      .filter(row => Number(row.stockLevel) > 0 && row.daysSinceLastSale >= 30)
      .sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);
  }

  async getReportProfitMargins(companyId: number, start: Date, end: Date): Promise<any[]> {
    const rows = await db.select({
      item: invoiceItems,
      invoice: invoices,
      product: products,
      userName: users.name,
      username: users.username,
      userEmail: users.email,
    })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceItems.productId, products.id))
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, "CreditNote"),
        ne(invoices.status, "cancelled"),
        ne(invoices.status, "draft")
      ));

    const latestSuppliers = await db.select({
      productId: inventoryTransactions.productId,
      supplierName: suppliers.name,
      createdAt: inventoryTransactions.createdAt,
    })
      .from(inventoryTransactions)
      .leftJoin(suppliers, eq(inventoryTransactions.supplierId, suppliers.id))
      .where(and(eq(inventoryTransactions.companyId, companyId), eq(inventoryTransactions.type, "STOCK_IN")))
      .orderBy(desc(inventoryTransactions.createdAt));

    const supplierByProduct = new Map<number, string>();
    for (const row of latestSuppliers) {
      if (!supplierByProduct.has(row.productId) && row.supplierName) {
        supplierByProduct.set(row.productId, row.supplierName);
      }
    }

    const buckets = new Map<string, any>();
    const addBucket = (dimensionType: string, dimension: string, revenue: number, cogs: number, quantity: number) => {
      const key = `${dimensionType}:${dimension}`;
      const existing = buckets.get(key) || { dimensionType, dimension, quantitySold: 0, revenue: 0, cogs: 0, grossProfit: 0, marginPercent: 0 };
      existing.quantitySold += quantity;
      existing.revenue += revenue;
      existing.cogs += cogs;
      existing.grossProfit = existing.revenue - existing.cogs;
      existing.marginPercent = existing.revenue > 0 ? (existing.grossProfit / existing.revenue) * 100 : 0;
      buckets.set(key, existing);
    };

    for (const row of rows) {
      const quantity = Number(row.item.quantity || 0);
      const revenue = Number(row.item.lineTotal || 0);
      const cogs = Number(row.item.cogsAmount ?? (Number(row.product?.costPrice || 0) * quantity));
      const salesperson = row.userName || row.username || row.userEmail || "System";
      const supplier = row.item.productId ? supplierByProduct.get(row.item.productId) || "No Supplier" : "No Supplier";

      addBucket("Item", row.product?.name || row.item.description, revenue, cogs, quantity);
      addBucket("Category", row.product?.category || "Uncategorized", revenue, cogs, quantity);
      addBucket("Brand", row.product?.brandName || "No Brand", revenue, cogs, quantity);
      addBucket("Supplier", supplier, revenue, cogs, quantity);
      addBucket("Salesperson", salesperson, revenue, cogs, quantity);
    }

    return Array.from(buckets.values())
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .map(row => ({
        ...row,
        quantitySold: row.quantitySold.toFixed(2),
        revenue: row.revenue.toFixed(2),
        cogs: row.cogs.toFixed(2),
        grossProfit: row.grossProfit.toFixed(2),
        marginPercent: row.marginPercent.toFixed(2),
      }));
  }

  async getReportSupplierPerformance(companyId: number, start: Date, end: Date): Promise<any[]> {
    const poRows = await db.select({
      po: purchaseOrders,
      supplier: suppliers,
    })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(eq(purchaseOrders.companyId, companyId), gte(purchaseOrders.createdAt, start), lte(purchaseOrders.createdAt, end)));

    const stockRows = await db.select({
      supplierId: inventoryTransactions.supplierId,
      supplierName: suppliers.name,
      quantity: inventoryTransactions.quantity,
      totalCost: inventoryTransactions.totalCost,
      unitCost: inventoryTransactions.unitCost,
    })
      .from(inventoryTransactions)
      .leftJoin(suppliers, eq(inventoryTransactions.supplierId, suppliers.id))
      .where(and(
        eq(inventoryTransactions.companyId, companyId),
        eq(inventoryTransactions.type, "STOCK_IN"),
        gte(inventoryTransactions.createdAt, start),
        lte(inventoryTransactions.createdAt, end)
      ));

    const claimRows = await db.select({
      supplierId: productSerialNumbers.supplierId,
      supplierName: suppliers.name,
      claimId: warrantyClaims.id,
    })
      .from(warrantyClaims)
      .leftJoin(productSerialNumbers, eq(warrantyClaims.serialNumberId, productSerialNumbers.id))
      .leftJoin(suppliers, eq(productSerialNumbers.supplierId, suppliers.id))
      .where(and(eq(warrantyClaims.companyId, companyId), gte(warrantyClaims.receivedAt, start), lte(warrantyClaims.receivedAt, end)));

    const bySupplier = new Map<string, any>();
    const ensure = (supplierId: number | null | undefined, supplierName: string | null | undefined) => {
      const key = supplierId ? String(supplierId) : supplierName || "No Supplier";
      const existing = bySupplier.get(key) || {
        supplierId: supplierId || null,
        supplierName: supplierName || "No Supplier",
        purchaseOrders: 0,
        receivedOrders: 0,
        lateOrders: 0,
        quantityReceived: 0,
        purchaseValue: 0,
        minUnitCost: null as number | null,
        maxUnitCost: null as number | null,
        warrantyReturns: 0,
      };
      bySupplier.set(key, existing);
      return existing;
    };

    for (const row of poRows) {
      const supplier = ensure(row.po.supplierId, row.supplier?.name);
      supplier.purchaseOrders += 1;
      if (row.po.status === "RECEIVED") supplier.receivedOrders += 1;
      if (row.po.status === "RECEIVED" && row.po.expectedDate && row.po.updatedAt && new Date(row.po.updatedAt) > new Date(row.po.expectedDate)) {
        supplier.lateOrders += 1;
      }
    }

    for (const row of stockRows) {
      const supplier = ensure(row.supplierId, row.supplierName);
      const unitCost = Number(row.unitCost || 0);
      supplier.quantityReceived += Number(row.quantity || 0);
      supplier.purchaseValue += Number(row.totalCost || 0);
      supplier.minUnitCost = supplier.minUnitCost === null ? unitCost : Math.min(supplier.minUnitCost, unitCost);
      supplier.maxUnitCost = supplier.maxUnitCost === null ? unitCost : Math.max(supplier.maxUnitCost, unitCost);
    }

    for (const row of claimRows) {
      ensure(row.supplierId, row.supplierName).warrantyReturns += 1;
    }

    return Array.from(bySupplier.values()).map(row => ({
      ...row,
      onTimeRate: row.receivedOrders > 0 ? (((row.receivedOrders - row.lateOrders) / row.receivedOrders) * 100).toFixed(2) : "0.00",
      quantityReceived: row.quantityReceived.toFixed(2),
      purchaseValue: row.purchaseValue.toFixed(2),
      priceRange: row.minUnitCost === null ? "N/A" : `${row.minUnitCost.toFixed(2)} - ${row.maxUnitCost.toFixed(2)}`,
    })).sort((a, b) => Number(b.purchaseValue) - Number(a.purchaseValue));
  }

  async getReportCustomerCredit(companyId: number, start: Date, end: Date): Promise<any[]> {
    const rows = await db.select({
      invoice: invoices,
      customer: customers,
      payment: payments,
    })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, "CreditNote"),
        ne(invoices.status, "cancelled"),
        ne(invoices.status, "draft")
      ));

    const paidByInvoice = new Map<number, number>();
    for (const row of rows) {
      if (row.payment) paidByInvoice.set(row.invoice.id, (paidByInvoice.get(row.invoice.id) || 0) + Number(row.payment.amount || 0));
    }

    const byCustomer = new Map<number, any>();
    const seenInvoices = new Set<number>();
    for (const row of rows) {
      if (seenInvoices.has(row.invoice.id)) continue;
      seenInvoices.add(row.invoice.id);
      const paid = paidByInvoice.get(row.invoice.id) || 0;
      const total = Number(row.invoice.total || 0);
      const balance = Math.max(0, total - paid);
      const daysOverdue = row.invoice.dueDate ? Math.max(0, Math.floor((end.getTime() - new Date(row.invoice.dueDate).getTime()) / 86400000)) : 0;
      const existing = byCustomer.get(row.invoice.customerId) || {
        customerId: row.invoice.customerId,
        customerName: row.customer?.name || row.invoice.customerName || "Walk-in Customer",
        invoices: 0,
        totalInvoiced: 0,
        totalPaid: 0,
        balance: 0,
        overdueInvoices: 0,
        overdueBalance: 0,
        lastPaymentAt: null as string | null,
      };
      existing.invoices += 1;
      existing.totalInvoiced += total;
      existing.totalPaid += paid;
      existing.balance += balance;
      if (balance > 0 && daysOverdue > 0) {
        existing.overdueInvoices += 1;
        existing.overdueBalance += balance;
      }
      byCustomer.set(row.invoice.customerId, existing);
    }

    for (const row of rows) {
      if (!row.payment) continue;
      const existing = byCustomer.get(row.invoice.customerId);
      const paidAt = row.payment.paymentDate?.toISOString().slice(0, 10) || null;
      if (existing && paidAt && (!existing.lastPaymentAt || paidAt > existing.lastPaymentAt)) {
        existing.lastPaymentAt = paidAt;
      }
    }

    return Array.from(byCustomer.values()).map(row => ({
      ...row,
      totalInvoiced: row.totalInvoiced.toFixed(2),
      totalPaid: row.totalPaid.toFixed(2),
      balance: row.balance.toFixed(2),
      overdueBalance: row.overdueBalance.toFixed(2),
      lastPaymentAt: row.lastPaymentAt || "No payments",
    })).sort((a, b) => Number(b.balance) - Number(a.balance));
  }

  async getReportSalespersonPerformance(companyId: number, start: Date, end: Date): Promise<any[]> {
    const rows = await db.select({
      invoice: invoices,
      item: invoiceItems,
      userName: users.name,
      username: users.username,
      userEmail: users.email,
    })
      .from(invoices)
      .leftJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
      .leftJoin(users, eq(invoices.createdBy, users.id))
      .where(and(eq(invoices.companyId, companyId), gte(invoices.issueDate, start), lte(invoices.issueDate, end), ne(invoices.status, "draft")));

    const byUser = new Map<string, any>();
    const seenInvoicesByUser = new Set<string>();
    for (const row of rows) {
      const userId = row.invoice.createdBy || "system";
      const existing = byUser.get(userId) || {
        userId,
        userName: row.userName || row.username || row.userEmail || "System",
        invoices: 0,
        returns: 0,
        revenue: 0,
        discounts: 0,
        cogs: 0,
        profit: 0,
      };

      const invoiceKey = `${userId}:${row.invoice.id}`;
      if (!seenInvoicesByUser.has(invoiceKey)) {
        seenInvoicesByUser.add(invoiceKey);
        if (row.invoice.transactionType === "CreditNote" || row.invoice.status === "cancelled") {
          existing.returns += Math.abs(Number(row.invoice.total || 0));
        } else {
          existing.invoices += 1;
          existing.revenue += Number(row.invoice.total || 0);
          existing.discounts += Number(row.invoice.discountAmount || 0);
        }
      }
      if (row.item && row.invoice.transactionType !== "CreditNote" && row.invoice.status !== "cancelled") {
        existing.cogs += Number(row.item.cogsAmount || 0);
      }
      existing.profit = existing.revenue - existing.cogs;
      byUser.set(userId, existing);
    }

    return Array.from(byUser.values()).map(row => ({
      ...row,
      revenue: row.revenue.toFixed(2),
      profit: row.profit.toFixed(2),
      discounts: row.discounts.toFixed(2),
      returns: row.returns.toFixed(2),
      marginPercent: row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(2) : "0.00",
    })).sort((a, b) => Number(b.revenue) - Number(a.revenue));
  }

  async getReportCategoryBrandPerformance(companyId: number, start: Date, end: Date): Promise<any[]> {
    const rows = await db.select({
      item: invoiceItems,
      invoice: invoices,
      product: products,
    })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .leftJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, "CreditNote"),
        ne(invoices.status, "cancelled"),
        ne(invoices.status, "draft")
      ));

    const buckets = new Map<string, any>();
    const add = (type: string, name: string, qty: number, revenue: number) => {
      const key = `${type}:${name}`;
      const existing = buckets.get(key) || { type, name, quantitySold: 0, revenue: 0, lineCount: 0 };
      existing.quantitySold += qty;
      existing.revenue += revenue;
      existing.lineCount += 1;
      buckets.set(key, existing);
    };

    for (const row of rows) {
      add("Category", row.product?.category || "Uncategorized", Number(row.item.quantity || 0), Number(row.item.lineTotal || 0));
      add("Brand", row.product?.brandName || "No Brand", Number(row.item.quantity || 0), Number(row.item.lineTotal || 0));
    }

    return Array.from(buckets.values()).map(row => ({
      ...row,
      quantitySold: row.quantitySold.toFixed(2),
      revenue: row.revenue.toFixed(2),
    })).sort((a, b) => Number(b.revenue) - Number(a.revenue));
  }

  async getReportReturnWarranty(companyId: number, start: Date, end: Date): Promise<any[]> {
    const creditNotes = await db.select({
      invoice: invoices,
      customer: customers,
    })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(eq(invoices.companyId, companyId), gte(invoices.issueDate, start), lte(invoices.issueDate, end), eq(invoices.transactionType, "CreditNote")));

    const claims = await db.select({
      claim: warrantyClaims,
      product: products,
      customer: customers,
    })
      .from(warrantyClaims)
      .leftJoin(products, eq(warrantyClaims.productId, products.id))
      .leftJoin(customers, eq(warrantyClaims.customerId, customers.id))
      .where(and(eq(warrantyClaims.companyId, companyId), gte(warrantyClaims.receivedAt, start), lte(warrantyClaims.receivedAt, end)));

    const rows = [
      ...creditNotes.map(row => ({
        type: "Return",
        reference: row.invoice.invoiceNumber,
        date: row.invoice.issueDate?.toISOString().slice(0, 10) || "",
        customerName: row.customer?.name || row.invoice.customerName || "Walk-in Customer",
        part: "Credit note",
        reason: row.invoice.notes || "Returned sale",
        status: row.invoice.status || "issued",
        amount: Number(row.invoice.total || 0).toFixed(2),
      })),
      ...claims.map(row => ({
        type: "Warranty",
        reference: row.claim.claimNumber,
        date: row.claim.receivedAt?.toISOString().slice(0, 10) || "",
        customerName: row.customer?.name || "Unknown",
        part: row.product?.name || `Product #${row.claim.productId}`,
        reason: row.claim.reason,
        status: row.claim.status,
        amount: "0.00",
      })),
    ];

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getReportReorderSuggestions(companyId: number, start: Date, end: Date): Promise<any[]> {
    const productRows = await db.select().from(products).where(and(eq(products.companyId, companyId), eq(products.isTracked, true)));
    const salesRows = await db.select({
      productId: invoiceItems.productId,
      quantity: invoiceItems.quantity,
    })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        ne(invoices.transactionType, "CreditNote"),
        ne(invoices.status, "cancelled"),
        ne(invoices.status, "draft")
      ));

    const soldByProduct = new Map<number, number>();
    for (const row of salesRows) {
      if (!row.productId) continue;
      soldByProduct.set(row.productId, (soldByProduct.get(row.productId) || 0) + Number(row.quantity || 0));
    }

    const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const coverDays = 30;
    return productRows.map(product => {
      const sold = soldByProduct.get(product.id) || 0;
      const dailyVelocity = sold / periodDays;
      const stockLevel = Number(product.stockLevel || 0);
      const lowStockThreshold = Number(product.lowStockThreshold || 0);
      const suggestedQty = Math.max(0, Math.ceil((dailyVelocity * coverDays + lowStockThreshold) - stockLevel));
      return {
        productId: product.id,
        part: product.name,
        sku: product.sku,
        category: product.category || "Uncategorized",
        stockLevel: stockLevel.toFixed(2),
        lowStockThreshold: lowStockThreshold.toFixed(2),
        soldInPeriod: sold.toFixed(2),
        dailyVelocity: dailyVelocity.toFixed(2),
        suggestedQty,
        estimatedCost: (suggestedQty * Number(product.costPrice || 0)).toFixed(2),
      };
    }).filter(row => row.suggestedQty > 0).sort((a, b) => b.suggestedQty - a.suggestedQty);
  }

  async getReportPriceChanges(companyId: number, start: Date, end: Date): Promise<any[]> {
    const rows = await db.select({
      adjustment: priceAdjustments,
      product: products,
      userName: users.name,
      username: users.username,
      userEmail: users.email,
    })
      .from(priceAdjustments)
      .innerJoin(products, eq(priceAdjustments.productId, products.id))
      .leftJoin(users, eq(priceAdjustments.createdBy, users.id))
      .where(and(eq(priceAdjustments.companyId, companyId), gte(priceAdjustments.createdAt, start), lte(priceAdjustments.createdAt, end)))
      .orderBy(desc(priceAdjustments.createdAt));

    return rows.map(row => {
      const oldPrice = Number(row.adjustment.oldPrice || 0);
      const newPrice = Number(row.adjustment.newPrice || 0);
      const change = newPrice - oldPrice;
      return {
        adjustmentId: row.adjustment.id,
        date: row.adjustment.createdAt?.toISOString().slice(0, 10) || "",
        part: row.product.name,
        sku: row.product.sku,
        category: row.product.category || "Uncategorized",
        oldPrice: oldPrice.toFixed(2),
        newPrice: newPrice.toFixed(2),
        change: change.toFixed(2),
        changePercent: oldPrice > 0 ? ((change / oldPrice) * 100).toFixed(2) : "0.00",
        reason: row.adjustment.reason || "",
        changedBy: row.userName || row.username || row.userEmail || "System",
      };
    });
  }

  // Stock Takes Implementation
  async getStockTakes(companyId: number): Promise<StockTake[]> {
    return await db.select().from(stockTakes).where(eq(stockTakes.companyId, companyId)).orderBy(desc(stockTakes.createdAt));
  }

  async getStockTake(id: number): Promise<(StockTake & { items: (StockTakeItem & { product: Product })[] }) | undefined> {
    const [stockTake] = await db.select().from(stockTakes).where(eq(stockTakes.id, id));
    if (!stockTake) return undefined;

    const itemsWithProducts = await db
      .select({
        item: stockTakeItems,
        product: products
      })
      .from(stockTakeItems)
      .innerJoin(products, eq(stockTakeItems.productId, products.id))
      .where(eq(stockTakeItems.stockTakeId, id));

    return {
      ...stockTake,
      items: itemsWithProducts.map(r => ({
        ...r.item,
        product: r.product
      }))
    };
  }

  async createStockTake(data: InsertStockTake): Promise<StockTake> {
    const [stockTake] = await db.insert(stockTakes).values(data).returning();
    return stockTake;
  }

  async updateStockTake(id: number, data: Partial<StockTake>): Promise<StockTake> {
    const [updated] = await db.update(stockTakes).set(data).where(eq(stockTakes.id, id)).returning();
    if (!updated) throw new Error("Stock take not found");
    return updated;
  }

  async createStockTakeItems(items: InsertStockTakeItem[]): Promise<void> {
    if (items.length === 0) return;
    await db.insert(stockTakeItems).values(items);
  }

  async updateStockTakeItem(id: number, data: Partial<StockTakeItem>): Promise<void> {
    await db.update(stockTakeItems).set(data).where(eq(stockTakeItems.id, id));
  }

  async deleteStockTakeItem(id: number): Promise<void> {
    await db.delete(stockTakeItems).where(eq(stockTakeItems.id, id));
  }
  // --- PHARMACY / BATCHES / VARIATIONS CRUD ---
  async getProductVariations(productId: number): Promise<ProductVariation[]> {
    return await db.select().from(productVariations).where(eq(productVariations.productId, productId)).orderBy(productVariations.id);
  }

  async createProductVariation(variation: InsertProductVariation): Promise<ProductVariation> {
    const [newVariation] = await db.insert(productVariations).values(variation).returning();
    return newVariation;
  }

  async getProductBatches(productId: number): Promise<ProductBatch[]> {
    return await db.select().from(productBatches).where(eq(productBatches.productId, productId)).orderBy(productBatches.expiryDate);
  }

  async getExpiringBatches(companyId: number, days: number): Promise<any[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);

    const rows = await db.select({
      batch: productBatches,
      product: products
    })
    .from(productBatches)
    .innerJoin(products, eq(productBatches.productId, products.id))
    .where(and(
      eq(products.companyId, companyId),
      eq(products.batchTrackingEnabled, true),
      sql`${productBatches.expiryDate} <= ${thresholdDate.toISOString()}`,
      sql`${productBatches.stockLevel}::numeric > 0`
    ))
    .orderBy(productBatches.expiryDate);

    return rows.map(r => ({
      ...r.batch,
      productName: r.product.name,
      productSku: r.product.sku
    }));
  }

  async createProductBatch(batch: InsertProductBatch): Promise<ProductBatch> {
    const [newBatch] = await db.insert(productBatches).values(batch).returning();
    return newBatch;
  }

  async getActiveBatches(productId: number): Promise<ProductBatch[]> {
    return await db.select().from(productBatches).where(
      and(
        eq(productBatches.productId, productId),
        eq(productBatches.isExpired, false),
        gt(productBatches.stockLevel, "0")
      )
    ).orderBy(productBatches.expiryDate); // FEFO: First Expiry, First Out
  }

  // --- RESTAURANT & BOM CRUD ---

  async getRestaurantSections(companyId: number): Promise<RestaurantSection[]> {
    return await db.select().from(restaurantSections).where(eq(restaurantSections.companyId, companyId)).orderBy(restaurantSections.id);
  }

  async createRestaurantSection(section: InsertRestaurantSection): Promise<RestaurantSection> {
    const [newSection] = await db.insert(restaurantSections).values(section).returning();
    return newSection;
  }

  async getRestaurantTables(sectionId: number): Promise<RestaurantTable[]> {
    return await db.select().from(restaurantTables).where(eq(restaurantTables.sectionId, sectionId)).orderBy(restaurantTables.id);
  }

  async updateRestaurantTable(id: number, table: Partial<RestaurantTable>): Promise<RestaurantTable> {
    const [updated] = await db.update(restaurantTables).set(table).where(eq(restaurantTables.id, id)).returning();
    return updated;
  }

  async createRestaurantTable(table: InsertRestaurantTable): Promise<RestaurantTable> {
    const [newTable] = await db.insert(restaurantTables).values(table).returning();
    return newTable;
  }

  async getRecipeItems(productId: number): Promise<any[]> {
    return await db
      .select({
        id: recipeItems.id,
        ingredientId: recipeItems.ingredientProductId,
        ingredientName: products.name,
        quantity: recipeItems.quantity,
        unit: recipeItems.unit,
        unitCost: products.costPrice
      })
      .from(recipeItems)
      .innerJoin(products, eq(recipeItems.ingredientProductId, products.id))
      .where(eq(recipeItems.parentProductId, productId));
  }

    async setRecipeItems(productId: number, items: InsertRecipeItem[]): Promise<void> {
    await db.transaction(async (tx) => {
      const { recipeItems, products, billOfMaterials, bomLines } = await import("@shared/schema.js");
      const { eq, and } = await import("drizzle-orm");

      await tx.delete(recipeItems).where(eq(recipeItems.parentProductId, productId));
      
      const [prod] = await tx.select().from(products).where(eq(products.id, productId));
      if (!prod) return;

      if (items.length > 0) {
        await tx.insert(recipeItems).values(items);
        await tx.update(products).set({ hasRecipe: true }).where(eq(products.id, productId));
        
        // Sync with Bill of Materials system
        const bomName = `${prod.name} Recipe`;
        let [bom] = await tx.select().from(billOfMaterials).where(and(eq(billOfMaterials.productId, productId), eq(billOfMaterials.name, bomName)));
        
        if (!bom) {
           [bom] = await tx.insert(billOfMaterials).values({
               companyId: prod.companyId,
               productId: prod.id,
               name: bomName,
               version: "1.0",
               isActive: true
           }).returning();
        } else {
           await tx.update(billOfMaterials).set({ isActive: true }).where(eq(billOfMaterials.id, bom.id));
        }
        
        await tx.delete(bomLines).where(eq(bomLines.bomId, bom.id));
        
        const linesToInsert = items.map(item => ({
            bomId: bom.id,
            componentProductId: item.ingredientProductId,
            quantity: String(item.quantity),
            unitOfMeasure: item.unit
        }));
        await tx.insert(bomLines).values(linesToInsert);

      } else {
        await tx.update(products).set({ hasRecipe: false }).where(eq(products.id, productId));
        const bomName = `${prod.name} Recipe`;
        const [bom] = await tx.select().from(billOfMaterials).where(and(eq(billOfMaterials.productId, productId), eq(billOfMaterials.name, bomName)));
        if (bom) {
           await tx.update(billOfMaterials).set({ isActive: false }).where(eq(billOfMaterials.id, bom.id));
        }
      }
    });
  }

  async getActiveOrders(companyId: number): Promise<any[]> {
    const orders = await db.select()
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          inArray(invoices.orderStatus, ['pending', 'preparing', 'ready']),
          gte(invoices.issueDate, new Date(new Date().setHours(0, 0, 0, 0)))
        )
      )
      .orderBy(desc(invoices.createdAt));

    if (orders.length === 0) return [];

    const orderIds = orders.map(o => o.id);
    const items = await db.select({
      item: invoiceItems,
      product: products
    })
      .from(invoiceItems)
      .leftJoin(products, eq(invoiceItems.productId, products.id))
      .where(inArray(invoiceItems.invoiceId, orderIds));

    return orders.map(o => ({
      ...o,
      items: items.filter(i => i.item.invoiceId === o.id).map(i => ({
        ...i.item,
        productName: i.product?.name
      }))
    }));
  }

  // Branches Implementation
  async getBranches(companyId: number): Promise<Branch[]> {
    return await db.select().from(branches).where(eq(branches.companyId, companyId));
  }

  async getBranch(id: number): Promise<Branch | undefined> {
    const [branch] = await db.select().from(branches).where(eq(branches.id, id));
    return branch;
  }

  async createBranch(data: InsertBranch): Promise<Branch> {
    const [branch] = await db.insert(branches).values(data).returning();
    return branch;
  }

  async updateBranch(id: number, data: Partial<Branch>): Promise<Branch> {
    const [branch] = await db
      .update(branches)
      .set(data)
      .where(eq(branches.id, id))
      .returning();
    return branch;
  }

  async deleteBranch(id: number): Promise<void> {
    await db.delete(branches).where(eq(branches.id, id));
  }

  // Cost Centers Implementation
  async getCostCenters(companyId: number): Promise<CostCenter[]> {
    return await db.select().from(costCenters).where(eq(costCenters.companyId, companyId));
  }

  async getCostCenter(id: number): Promise<CostCenter | undefined> {
    const [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, id));
    return costCenter;
  }

  async createCostCenter(data: InsertCostCenter): Promise<CostCenter> {
    const [costCenter] = await db.insert(costCenters).values(data).returning();
    return costCenter;
  }

  async updateCostCenter(id: number, data: Partial<CostCenter>): Promise<CostCenter> {
    const [costCenter] = await db
      .update(costCenters)
      .set(data)
      .where(eq(costCenters.id, id))
      .returning();
    return costCenter;
  }

  async deleteCostCenter(id: number): Promise<void> {
    await db.delete(costCenters).where(eq(costCenters.id, id));
  }

  async getUserBranches(userId: string): Promise<Branch[]> {
    const result = await db
      .select({
        branch: branches
      })
      .from(branchUsers)
      .innerJoin(branches, eq(branchUsers.branchId, branches.id))
      .where(eq(branchUsers.userId, userId));

    return result.map(r => r.branch);
  }

  async addUserToBranch(userId: string, branchId: number, role: string = "staff"): Promise<void> {
    await db.insert(branchUsers).values({
      userId,
      branchId,
      role
    }).onConflictDoNothing();
  }

  // Branch Stock Implementation
  async getBranchStock(branchId: number, productId: number): Promise<BranchStock | undefined> {
    const [stock] = await db
      .select()
      .from(branchStocks)
      .where(
        and(
          eq(branchStocks.branchId, branchId),
          eq(branchStocks.productId, productId)
        )
      );
    return stock;
  }

  async updateBranchStock(branchId: number, productId: number, stockLevel: string): Promise<void> {
    await db
      .insert(branchStocks)
      .values({
        branchId,
        productId,
        stockLevel
      })
      .onConflictDoUpdate({
        target: [branchStocks.branchId, branchStocks.productId],
        set: { stockLevel }
      });
  }

  async getBranchStocks(branchId: number): Promise<(BranchStock & { product: Product })[]> {
    const result = await db
      .select({
        stock: branchStocks,
        product: products
      })
      .from(branchStocks)
      .innerJoin(products, eq(branchStocks.productId, products.id))
      .where(eq(branchStocks.branchId, branchId));

    return result.map(r => ({
      ...r.stock,
      product: r.product
    }));
  }

  // --- ACCOUNTING IMPLEMENTATION ---

  async getAccounts(companyId: number): Promise<Account[]> {
    let companyAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(accounts.code);
    if (companyAccounts.length === 0) {
      await this.initializeCompanyAccounts(companyId);
      companyAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(accounts.code);
    }
    return companyAccounts;
  }

  async getAccountByCode(companyId: number, code: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.code, code)));
    return account;
  }

  async getAccountById(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account;
  }

  async generateAccountCode(companyId: number, type?: string, category?: string, tx?: any): Promise<string> {
    const executor = tx || db;
    const range = getAccountCodeRange(type, category);
    const companyAccounts = await executor
      .select({ code: accounts.code })
      .from(accounts)
      .where(eq(accounts.companyId, companyId));

    const usedCodes = new Set(companyAccounts.map((account: { code: string }) => account.code));
    const numericCodes = companyAccounts
      .map((account: { code: string }) => Number(account.code))
      .filter((code: number) => Number.isFinite(code) && code >= range.start && code <= range.end);

    let nextCode = numericCodes.length > 0 ? Math.max(...numericCodes) + 10 : range.start;
    while (usedCodes.has(String(nextCode)) && nextCode <= range.end) {
      nextCode += 10;
    }
    if (nextCode > range.end) {
      throw new Error(`No available account codes remain in the ${range.start}-${range.end} range`);
    }
    return String(nextCode);
  }

  async createAccount(data: InsertAccount): Promise<Account> {
    return await db.transaction(async (tx) => {
      const code = data.code?.trim() || await this.generateAccountCode(data.companyId, data.type, data.category || undefined, tx);
      const [account] = await tx.insert(accounts).values({ ...data, code }).returning();
      return account;
    });
  }

  async initializeCompanyAccounts(companyId: number, tx?: any): Promise<void> {
    const executeInTx = async (t: any) => {
      const defaultAccounts = [
        // --- ASSETS ---
        // Current Assets
        { code: "1000", name: "Cash & Cash Equivalents", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-7", category: "Current Assets", cashFlowCategory: "Operating", isControlAccount: true, isSystem: true },
        { code: "1001", name: "Petty Cash", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-7", category: "Current Assets", cashFlowCategory: "Operating", isControlAccount: false, isSystem: true },
        { code: "1002", name: "Short-term Investments", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Current Assets", cashFlowCategory: "Investing", isControlAccount: false, isSystem: true },
        { code: "1005", name: "Work-in-Progress Inventory", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Current Assets", isControlAccount: true, isSystem: true },
        { code: "1008", name: "Inter-Branch Receivables", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: true, isSystem: true },
        { code: "1009", name: "Allowance for Doubtful Accounts", type: "ASSET", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Current Assets", isControlAccount: true, isSystem: true },
        { code: "1013", name: "VAT Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1014", name: "Tax Refund Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1015", name: "Supplier Prepayments", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1006", name: "Prepaid Expenses", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1007", name: "Other Current Assets", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1010", name: "Sales Tax Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1011", name: "Purchase Tax Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1012", name: "Input Tax Receivable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1200", name: "Trade Receivables", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Current Assets", isControlAccount: true, isSystem: true },
        { code: "1300", name: "Inventory", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Current Assets", isControlAccount: true, isSystem: true },
        { code: "1400", name: "Prepayments", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        { code: "1420", name: "VAT Input Recoverable", type: "ASSET", subType: "Current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Current Assets", isControlAccount: false, isSystem: true },
        
        // Non-Current Assets
        { code: "1500", name: "Property, Plant and Equipment", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Non-current Assets", cashFlowCategory: "Investing", isControlAccount: true, isSystem: true },
        { code: "1501", name: "Buildings", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Non-current Assets", cashFlowCategory: "Investing", isControlAccount: false, isSystem: true },
        { code: "1502", name: "Machinery & Equipment", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Non-current Assets", cashFlowCategory: "Investing", isControlAccount: false, isSystem: true },
        { code: "1503", name: "Vehicles", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Non-current Assets", cashFlowCategory: "Investing", isControlAccount: false, isSystem: true },
        { code: "1504", name: "Furniture & Fixtures", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Non-current Assets", cashFlowCategory: "Investing", isControlAccount: false, isSystem: true },
        { code: "1505", name: "Computer Equipment", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Non-current Assets", cashFlowCategory: "Investing", isControlAccount: false, isSystem: true },
        { code: "1506", name: "Accumulated Depreciation", type: "ASSET", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-16", category: "Non-current Assets", isControlAccount: true, isSystem: true },
        { code: "1600", name: "Right-of-Use Assets", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-16", category: "Non-current Assets", isControlAccount: false, isSystem: true },
        { code: "1700", name: "Intangibles", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-38", category: "Non-current Assets", cashFlowCategory: "Investing", isControlAccount: false, isSystem: true },
        { code: "1800", name: "Deferred Tax Assets", type: "ASSET", subType: "Non-current", normalBalance: "DEBIT", ifrsMappingTag: "IAS-12", category: "Non-current Assets", isControlAccount: false, isSystem: true },

        // --- LIABILITIES ---
        // Current Liabilities
        { code: "2000", name: "Trade Payables", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Current Liabilities", isControlAccount: true, isSystem: true },
        { code: "2006", name: "Inter-Branch Payables", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Current Liabilities", isControlAccount: true, isSystem: true },
        { code: "2009", name: "Customer Prepayments", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Current Liabilities", isControlAccount: true, isSystem: true },
        { code: "2012", name: "Withholding Tax Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: true, isSystem: true },
        { code: "2013", name: "Payroll Tax Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: true, isSystem: true },
        { code: "2014", name: "Inter-Branch Clearing", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Current Liabilities", isControlAccount: true, isSystem: true },
        { code: "2001", name: "Short-term Loans", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2003", name: "Taxes Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2004", name: "Wages Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-19", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2005", name: "Unearned Revenue", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2007", name: "Sales Tax Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2008", name: "Purchase Tax Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2011", name: "VAT Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2100", name: "Accrued Expenses", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-37", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2200", name: "VAT Output Payable", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Current Liabilities", isControlAccount: false, isSystem: true },
        { code: "2250", name: "Contract Liabilities", type: "LIABILITY", subType: "Current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Current Liabilities", isControlAccount: false, isSystem: true },

        // Non-Current Liabilities
        { code: "2300", name: "Loans", type: "LIABILITY", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Non-current Liabilities", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },
        { code: "2400", name: "Lease Liabilities", type: "LIABILITY", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-16", category: "Non-current Liabilities", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },
        { code: "2500", name: "Deferred Tax Liabilities", type: "LIABILITY", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IAS-12", category: "Non-current Liabilities", isControlAccount: false, isSystem: true },

        { code: "2501", name: "Mortgages", type: "LIABILITY", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Non-current Liabilities", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },
        { code: "2502", name: "Bonds Payable", type: "LIABILITY", subType: "Non-current", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Non-current Liabilities", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },
        // --- EQUITY ---
        { code: "3000", name: "Share Capital", type: "EQUITY", subType: "Finance", normalBalance: "CREDIT", ifrsMappingTag: "IAS-32", category: "Equity", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },
        { code: "3100", name: "Current Year Earnings", type: "EQUITY", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Equity", isControlAccount: false, isSystem: true },
        { code: "3110", name: "Retained Earnings", type: "EQUITY", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Equity", isControlAccount: false, isSystem: true },
        { code: "3200", name: "Reserves", type: "EQUITY", subType: "Finance", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Equity", isControlAccount: false, isSystem: true },
        { code: "9999", name: "Suspense Account", type: "EQUITY", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Equity", isControlAccount: false, isSystem: true },

        { code: "3002", name: "Additional Paid-in Capital", type: "EQUITY", subType: "Finance", normalBalance: "CREDIT", ifrsMappingTag: "IAS-32", category: "Equity", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },
        { code: "3003", name: "Treasury Stock", type: "EQUITY", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IAS-32", category: "Equity", cashFlowCategory: "Financing", isControlAccount: false, isSystem: true },
        { code: "3105", name: "Opening Balance Equity", type: "EQUITY", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Equity", isControlAccount: false, isSystem: true },
        // --- REVENUE ---
        { code: "4000", name: "Revenue", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: true, isSystem: true },
        { code: "4003", name: "Discount Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },
        { code: "4006", name: "Sales Returns & Allowances", type: "REVENUE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },
        { code: "4007", name: "Sales Discounts", type: "REVENUE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },
        { code: "4001", name: "Service Revenue", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },
        { code: "4002", name: "Commission Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },
        { code: "4004", name: "Product Sales", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },
        { code: "4005", name: "Freight Revenue", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-15", category: "Revenue", isControlAccount: false, isSystem: true },
        { code: "4500", name: "Interest Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Other Income", isControlAccount: false, isSystem: true },
        { code: "4501", name: "Dividend Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Other Income", isControlAccount: false, isSystem: true },
        { code: "4503", name: "Investment Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Other Income", isControlAccount: false, isSystem: true },
        { code: "4100", name: "Other Income", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Other Income", isControlAccount: false, isSystem: true },
        { code: "4504", name: "Rounding Gain", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-1", category: "Other Income", isControlAccount: false, isSystem: true },
        { code: "4505", name: "Foreign Exchange Gain", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-21", category: "Other Income", isControlAccount: false, isSystem: true },
        { code: "4506", name: "Bad Debt Recovery", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IFRS-9", category: "Other Income", isControlAccount: false, isSystem: true },
        { code: "4507", name: "Unrealized Exchange Gain", type: "REVENUE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-21", category: "Other Income", isControlAccount: false, isSystem: true },

        // --- EXPENSES ---
        { code: "5000", name: "Cost of Sales", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Cost of Sales", isControlAccount: false, isSystem: true },
        { code: "5001", name: "Inventory Adjustments", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5004", name: "Payroll Expenses", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-19", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5005", name: "Rent Expense", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-16", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5006", name: "Utilities", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5016", name: "Purchase Discounts", type: "EXPENSE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-2", category: "Cost of Sales", isControlAccount: false, isSystem: true },
        { code: "5017", name: "Purchase Returns", type: "EXPENSE", subType: "Operating", normalBalance: "CREDIT", ifrsMappingTag: "IAS-2", category: "Cost of Sales", isControlAccount: false, isSystem: true },
        { code: "5018", name: "Bad Debt Expense", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5019", name: "Depreciation Expense", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5002", name: "Purchase Price Variance", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Cost of Sales", isControlAccount: false, isSystem: true },
        { code: "5003", name: "Administrative Expenses", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5007", name: "Insurance", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5008", name: "Marketing & Advertising", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5009", name: "Professional Services", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5010", name: "Freight & Shipping", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-2", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5011", name: "Office Supplies", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5012", name: "Travel & Entertainment", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5013", name: "Repairs & Maintenance", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-16", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5014", name: "Training & Development", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5015", name: "Research & Development", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-38", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5501", name: "Investment Losses", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Finance Costs", isControlAccount: false, isSystem: true },
        { code: "5503", name: "Interest Expense", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Finance Costs", isControlAccount: false, isSystem: true },
        { code: "5505", name: "Professional Fees", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Finance Costs", isControlAccount: false, isSystem: true },
        { code: "5100", name: "Operating Expenses", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5200", name: "Finance Costs", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Finance Costs", isControlAccount: false, isSystem: true },
        { code: "5300", name: "Other Expenses", type: "EXPENSE", subType: "Operating", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Operating Expenses", isControlAccount: false, isSystem: true },
        { code: "5504", name: "Bank Charges", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IFRS-9", category: "Finance Costs", isControlAccount: false, isSystem: true },
        { code: "5506", name: "Rounding Loss", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IAS-1", category: "Finance Costs", isControlAccount: false, isSystem: true },
        { code: "5507", name: "Foreign Exchange Loss", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IAS-21", category: "Finance Costs", isControlAccount: false, isSystem: true },
        { code: "5508", name: "Unrealized Exchange Loss", type: "EXPENSE", subType: "Finance", normalBalance: "DEBIT", ifrsMappingTag: "IAS-21", category: "Finance Costs", isControlAccount: false, isSystem: true },
      ];

      for (const acc of defaultAccounts) {
        await t.insert(accounts).values({
          companyId,
          ...acc,
          isActive: true
        }).onConflictDoUpdate({
          target: [accounts.companyId, accounts.code],
          set: { 
            name: acc.name, 
            type: acc.type, 
            subType: acc.subType,
            category: acc.category, 
            normalBalance: acc.normalBalance,
            ifrsMappingTag: acc.ifrsMappingTag,
            isControlAccount: acc.isControlAccount,
            isSystem: acc.isSystem 
          }
        });
      }

      // Cleanup obsolete/orphan accounts that are not in defaultAccounts
      const defaultCodes = new Set(defaultAccounts.map(acc => acc.code));
      const allCompanyAccounts = await t.select().from(accounts).where(eq(accounts.companyId, companyId));
      for (const acc of allCompanyAccounts) {
        if (!defaultCodes.has(acc.code)) {
          try {
            // Nested transaction / savepoint to catch FK constraint errors safely without aborting the outer transaction
            await t.transaction(async (tx2: any) => {
              await tx2.delete(accounts).where(eq(accounts.id, acc.id));
            });
          } catch (e) {
            // If there's a constraint violation or any error, deactivate it and mark as not system
            await t.update(accounts).set({ isActive: false, isSystem: false }).where(eq(accounts.id, acc.id));
          }
        }
      }
    };
    
    if (tx) return await executeInTx(tx);
    return await db.transaction(executeInTx);
  }

  async createCashTransaction(data: { companyId: number, type: 'RECEIPT' | 'PAYMENT', bankAccountId: number, counterpartyAccountId: number, amount: number, date: Date, description: string, reference?: string, createdBy?: string }): Promise<JournalEntry> {
    return await db.transaction(async (tx) => {
      const [bankAcc] = await tx.select().from(accounts).where(eq(accounts.id, data.bankAccountId));
      const [cpAcc] = await tx.select().from(accounts).where(eq(accounts.id, data.counterpartyAccountId));

      if (!bankAcc || !cpAcc) throw new Error("Bank or Counterparty account not found");

      const lines = [
        {
          accountCode: bankAcc.code,
          type: data.type === 'RECEIPT' ? 'DEBIT' : 'CREDIT' as 'DEBIT' | 'CREDIT',
          amount: data.amount
        },
        {
          accountCode: cpAcc.code,
          type: data.type === 'RECEIPT' ? 'CREDIT' : 'DEBIT' as 'DEBIT' | 'CREDIT',
          amount: data.amount
        }
      ];

      return await this.postToLedger(data.companyId, {
        entryDate: data.date,
        description: data.description,
        referenceType: "CASHBOOK",
        referenceId: data.reference,
        createdBy: data.createdBy,
        lines
      }, tx);
    });
  }

  async getJournalEntries(companyId: number, dateFrom?: Date, dateTo?: Date): Promise<any[]> {
    const filters = [eq(journalEntries.companyId, companyId)];
    if (dateFrom) filters.push(gte(journalEntries.entryDate, dateFrom));
    if (dateTo) filters.push(lte(journalEntries.entryDate, dateTo));

    const entries = await db.select({
        entry: journalEntries,
        createdByName: users.name,
      })
      .from(journalEntries)
      .leftJoin(users, eq(journalEntries.createdBy, users.id))
      .where(and(...filters))
      .orderBy(desc(journalEntries.entryDate));

    const result = [];
    for (const row of entries) {
      const entry = row.entry;
      const lines = await db.select({
        id: ledgerEntries.id,
        accountId: ledgerEntries.accountId,
        accountName: accounts.name,
        accountCode: accounts.code,
        type: ledgerEntries.type,
        amount: ledgerEntries.amount
      })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(eq(ledgerEntries.journalEntryId, entry.id));
      
      result.push({ ...entry, createdByName: row.createdByName || "System", lines });
    }
    return result;
  }

  async getJournalEntryDrafts(companyId: number): Promise<any[]> {
    const drafts = await db.select()
      .from(journalEntryDrafts)
      .where(eq(journalEntryDrafts.companyId, companyId))
      .orderBy(desc(journalEntryDrafts.createdAt));

    const result = [];
    for (const draft of drafts) {
      const lines = await db.select({
        id: journalEntryDraftLines.id,
        accountId: journalEntryDraftLines.accountId,
        accountName: accounts.name,
        accountCode: accounts.code,
        type: journalEntryDraftLines.type,
        amount: journalEntryDraftLines.amount,
        memo: journalEntryDraftLines.memo,
      })
      .from(journalEntryDraftLines)
      .innerJoin(accounts, eq(journalEntryDraftLines.accountId, accounts.id))
      .where(eq(journalEntryDraftLines.draftId, draft.id));

      result.push({ ...draft, lines });
    }
    return result;
  }

  async createJournalEntryDraft(companyId: number, data: InsertJournalEntryDraft & { lines: LedgerPostLine[] }): Promise<any> {
    return await db.transaction(async (tx) => {
      const normalizedLines = await this.normalizeLedgerLines(companyId, data.lines, tx);
      this.assertBalancedLedgerLines(normalizedLines);
      await this.checkControlAccounts(companyId, normalizedLines, data.referenceType || "JOURNAL", tx);

      const [draft] = await tx.insert(journalEntryDrafts).values({
        companyId,
        entryDate: data.entryDate ? new Date(data.entryDate) : new Date(),
        description: data.description,
        referenceType: data.referenceType || "JOURNAL",
        referenceId: data.referenceId,
        status: "DRAFT",
        createdBy: data.createdBy,
        updatedAt: new Date(),
      }).returning();

      for (const line of normalizedLines) {
        await tx.insert(journalEntryDraftLines).values({
          draftId: draft.id,
          accountId: line.accountId,
          type: line.type,
          amount: line.amount.toFixed(2),
          memo: line.memo,
        });
      }

      return {
        ...draft,
        lines: normalizedLines.map((line) => ({
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          type: line.type,
          amount: line.amount.toFixed(2),
          memo: line.memo,
        })),
      };
    });
  }

  async postJournalEntryDraft(companyId: number, draftId: number, userId?: string): Promise<JournalEntry> {
    return await db.transaction(async (tx) => {
      const [draft] = await tx.select()
        .from(journalEntryDrafts)
        .where(and(eq(journalEntryDrafts.id, draftId), eq(journalEntryDrafts.companyId, companyId)));

      if (!draft) throw new Error("Journal draft not found");
      if (draft.status !== "DRAFT") throw new Error("Only draft journal entries can be posted");

      const lines = await tx.select({
        accountId: journalEntryDraftLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        type: journalEntryDraftLines.type,
        amount: journalEntryDraftLines.amount,
      })
      .from(journalEntryDraftLines)
      .innerJoin(accounts, eq(journalEntryDraftLines.accountId, accounts.id))
      .where(eq(journalEntryDraftLines.draftId, draftId));

      const normalizedLines = lines.map((line) => ({
        accountId: line.accountId,
        accountCode: line.accountCode,
        accountName: line.accountName,
        type: line.type as "DEBIT" | "CREDIT",
        amount: Number(line.amount),
      }));
      this.assertBalancedLedgerLines(normalizedLines);

      const posted = await this.postToLedger(companyId, {
        entryDate: draft.entryDate,
        description: draft.description,
        referenceType: draft.referenceType || "JOURNAL",
        referenceId: draft.referenceId || `JD-${draft.id}`,
        createdBy: userId || draft.createdBy || undefined,
        lines: normalizedLines,
      }, tx);

      await tx.update(journalEntryDrafts)
        .set({
          status: "POSTED",
          postedJournalEntryId: posted.id,
          postedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(journalEntryDrafts.id, draftId));

      return posted;
    });
  }

  async getLedgerEntries(companyId: number, accountId?: number, dateFrom?: Date, dateTo?: Date): Promise<any[]> {
    const filters: any[] = [eq(accounts.companyId, companyId)];
    if (accountId) filters.push(eq(ledgerEntries.accountId, accountId));
    if (dateFrom) filters.push(gte(journalEntries.entryDate, dateFrom));
    if (dateTo) filters.push(lte(journalEntries.entryDate, dateTo));

    return await db.select({
      id: ledgerEntries.id,
      date: journalEntries.entryDate,
      description: journalEntries.description,
      type: ledgerEntries.type,
      amount: ledgerEntries.amount,
      referenceType: journalEntries.referenceType,
      referenceId: journalEntries.referenceId,
      account: accounts
    })
    .from(ledgerEntries)
    .innerJoin(journalEntries, eq(ledgerEntries.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
    .where(and(...filters))
    .orderBy(journalEntries.entryDate);
  }

  async getTrialBalance(companyId: number, date?: Date): Promise<any[]> {
    const filters: any[] = [eq(accounts.companyId, companyId)];
    const entriesFilters: any[] = [];
    if (date) entriesFilters.push(lte(journalEntries.entryDate, date));

    const allAccounts = await db.select().from(accounts).where(and(...filters));
    const result = [];

    for (const acc of allAccounts) {
      const entries = await db.select({
        type: ledgerEntries.type,
        amount: ledgerEntries.amount
      })
      .from(ledgerEntries)
      .innerJoin(journalEntries, eq(ledgerEntries.journalEntryId, journalEntries.id))
      .where(and(eq(ledgerEntries.accountId, acc.id), ...entriesFilters));

      let debitMovement = 0;
      let creditMovement = 0;
      entries.forEach(e => {
        if (e.type === 'DEBIT') debitMovement += Number(e.amount);
        else creditMovement += Number(e.amount);
      });

      const signedBalance = debitMovement - creditMovement;
      const debit = signedBalance > 0 ? signedBalance : 0;
      const credit = signedBalance < 0 ? Math.abs(signedBalance) : 0;

      if (debitMovement !== 0 || creditMovement !== 0) {
        result.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          accountCategory: acc.category,
          debit,
          credit,
          balance: signedBalance,
          debitMovement,
          creditMovement
        });
      }
    }
    return result;
  }

  async postToLedger(companyId: number, data: LedgerPostData, tx?: any): Promise<JournalEntry> {
    const executeInTx = async (t: any) => {
      // POSTING GUARD: Cannot post to a CLOSED period
      const entryDate = data.entryDate ?? (data.date ? new Date(data.date) : new Date());
      const postingDate = new Date(entryDate);
      const periods = await t.select().from(financialPeriods).where(eq(financialPeriods.companyId, companyId));
      const applicablePeriod = periods.find((p: any) => {
        const pStart = new Date(p.startDate);
        const pEnd = new Date(p.endDate);
        return postingDate >= pStart && postingDate <= pEnd;
      });

      if (applicablePeriod && applicablePeriod.status === "CLOSED") {
        throw new Error(`Cannot post journal entry: The financial period '${applicablePeriod.name}' is closed.`);
      }

      // 1. Create Journal Entry
      const [je] = await t.insert(journalEntries).values({
        companyId,
        branchId: data.branchId ?? null,
        entryDate,
        description: data.description,
        referenceType: data.referenceType,
        referenceId: data.referenceId ?? data.reference,
        createdBy: data.createdBy,
      }).returning();

      const normalizedLines = await this.normalizeLedgerLines(companyId, data.lines, t);
      this.assertBalancedLedgerLines(normalizedLines);
      await this.checkControlAccounts(companyId, normalizedLines, data.referenceType, t);

      // 2. Create Ledger Entries (denormalize branchId for efficient branch-level querying)
      for (const line of normalizedLines) {
        await t.insert(ledgerEntries).values({
          journalEntryId: je.id,
          accountId: line.accountId,
          branchId: data.branchId ?? null,
          type: line.type,
          amount: line.amount.toFixed(2),
        });
      }

      return je;
    };

    if (tx) {
      return await executeInTx(tx);
    } else {
      return await db.transaction(async (t) => await executeInTx(t));
    }
  }

  async getVatReturn(companyId: number, fromDate?: Date, toDate?: Date): Promise<{ outputVat: number; inputVat: number; netVat: number; inputVatBreakdown?: any[]; outputVatBreakdown?: any[] }> {
    // Output VAT: Sum of tax amount from sales invoices
    const salesInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerName: invoices.customerName,
      date: invoices.issueDate,
      total: invoices.total,
      tax: invoices.taxAmount,
      currency: invoices.currency
    })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, 'CANCELLED'),
        ...(fromDate ? [gte(invoices.createdAt, fromDate)] : []),
        ...(toDate ? [lte(invoices.createdAt, toDate)] : [])
      ));
    const outputVat = salesInvoices.reduce((sum, inv) => sum + Number(inv.tax || 0), 0);

    // Input VAT: Sum of tax amount from supplier invoices
    const purchases = await db.select({
      id: supplierInvoices.id,
      invoiceNumber: supplierInvoices.invoiceNumber,
      date: supplierInvoices.date,
      total: supplierInvoices.totalAmount,
      tax: supplierInvoices.taxAmount,
      currency: supplierInvoices.currency,
      transactionType: supplierInvoices.transactionType,
      supplierName: suppliers.name,
      supplierVat: suppliers.vatNumber
    })
      .from(supplierInvoices)
      .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(
        eq(supplierInvoices.companyId, companyId),
        ne(supplierInvoices.status, 'CANCELLED'),
        ...(fromDate ? [gte(supplierInvoices.createdAt, fromDate)] : []),
        ...(toDate ? [lte(supplierInvoices.createdAt, toDate)] : [])
      ));
    
    // Calculate net input VAT (subtract Credit Notes)
    const inputVat = purchases.reduce((sum, inv) => {
      const amount = Number(inv.tax || 0);
      return sum + (inv.transactionType === "CreditNote" ? -amount : amount);
    }, 0);

    return {
      outputVat,
      inputVat,
      netVat: outputVat - inputVat,
      inputVatBreakdown: purchases,
      outputVatBreakdown: salesInvoices
    };
  }

  // ==============================================================================
  // RECOVERED METHODS (DUMMY/MINIMAL IMPLEMENTATION)
  // ==============================================================================

  async getBudgets(companyId: number): Promise<any[]> { return []; }
  async createBudget(data: any): Promise<any> { return data; }
  async getCostAllocationRules(companyId: number): Promise<any[]> { return []; }
  async createCostAllocationRule(data: any): Promise<any> { return data; }
  async runCostAllocations(companyId: number, asOfDate: Date, userId: string): Promise<any> { return { processed: 0 }; }
  async getConsolidatedTrialBalance(companyId: number, asOfDate: Date): Promise<any[]> { return []; }
  async runConsolidationEliminations(companyId: number, asOfDate: Date, userId: string): Promise<any> { return { processed: 0 }; }
  
  async createBillOfMaterial(data: any): Promise<any> {
    return await db.transaction(async (tx) => {
      const { billOfMaterials, bomLines } = await import("@shared/schema.js");
      const { lines, ...bomData } = data;
      const [bom] = await tx.insert(billOfMaterials).values(bomData).returning();
      if (lines && lines.length > 0) {
        const linesToInsert = lines.map((line: any) => ({ ...line, bomId: bom.id }));
        await tx.insert(bomLines).values(linesToInsert);
      }
      return bom;
    });
  }

  async createWorkOrder(data: any): Promise<any> {
    const { workOrders } = await import("@shared/schema.js");
    const [wo] = await db.insert(workOrders).values(data).returning();
    return wo;
  }

  async completeWorkOrder(id: number, qty: number, userId: string): Promise<any> {
    const { 
      workOrders, billOfMaterials, bomLines, workOrderConsumptions, 
      manufacturingMaterialTransactions, products, inventoryLocations,
      inventoryLocationStocks, branchStocks, accounts, journalEntries, ledgerEntries,
      financialPeriods
    } = await import("@shared/schema.js");
    const { eq, and, inArray, sql } = await import("drizzle-orm");

    return await db.transaction(async (tx) => {
      // 1. Fetch work order
      const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, id));
      if (!wo) throw new Error("Work order not found");
      if (wo.status === "COMPLETED") throw new Error("Work order already completed");

      // 2. Fetch BOM + lines (components)
      const [bom] = await tx.select().from(billOfMaterials).where(eq(billOfMaterials.id, wo.bomId));
      if (!bom) throw new Error("BOM not found for this work order");

      const lines = await tx.select({
        line: bomLines,
        product: products,
      })
        .from(bomLines)
        .leftJoin(products, eq(bomLines.componentProductId, products.id))
        .where(eq(bomLines.bomId, wo.bomId));

      // 3. Find a default inventory location for this company
      const [defaultLocation] = await tx
        .select()
        .from(inventoryLocations)
        .where(eq(inventoryLocations.companyId, wo.companyId))
        .limit(1);

      const adjustProductStock = async (productId: number, qtyDelta: number) => {
        if (!defaultLocation) {
          // Fallback: just update the products.stockLevel directly
          const [prod] = await tx.select().from(products).where(eq(products.id, productId));
          const newLevel = (Number(prod?.stockLevel || 0) + qtyDelta).toString();
          await tx.update(products).set({ stockLevel: newLevel }).where(eq(products.id, productId));
          return;
        }

        // Update inventory_location_stocks
        const [locStock] = await tx
          .select()
          .from(inventoryLocationStocks)
          .where(and(eq(inventoryLocationStocks.locationId, defaultLocation.id), eq(inventoryLocationStocks.productId, productId)))
          .limit(1);

        const current = Number(locStock?.stockLevel || 0);
        const next = (current + qtyDelta).toString();

        if (locStock) {
          await tx.update(inventoryLocationStocks)
            .set({ stockLevel: next, availableQuantity: next, updatedAt: new Date() })
            .where(eq(inventoryLocationStocks.id, locStock.id));
        } else {
          await tx.insert(inventoryLocationStocks).values({
            locationId: defaultLocation.id,
            productId,
            stockLevel: next,
            reservedQuantity: "0",
            availableQuantity: next,
          });
        }

        // Sync branch stock if location has a branch
        if (defaultLocation.branchId) {
          const branchLocs = await tx.select({ id: inventoryLocations.id })
            .from(inventoryLocations)
            .where(eq(inventoryLocations.branchId, defaultLocation.branchId));
          const locIds = branchLocs.map((l: any) => l.id);
          let branchTotal = 0;
          if (locIds.length > 0) {
            const [sumRow] = await tx.select({ total: sql<string>`coalesce(sum(${inventoryLocationStocks.stockLevel}::numeric), 0)` })
              .from(inventoryLocationStocks)
              .where(and(inArray(inventoryLocationStocks.locationId, locIds), eq(inventoryLocationStocks.productId, productId)));
            branchTotal = Number(sumRow?.total || 0);
          }
          const [bs] = await tx.select().from(branchStocks)
            .where(and(eq(branchStocks.branchId, defaultLocation.branchId), eq(branchStocks.productId, productId))).limit(1);
          if (bs) {
            await tx.update(branchStocks).set({ stockLevel: branchTotal.toString() }).where(eq(branchStocks.id, bs.id));
          } else {
            await tx.insert(branchStocks).values({ branchId: defaultLocation.branchId, productId, stockLevel: branchTotal.toString() });
          }
        }

        // Sync global product stock
        const companyLocs = await tx.select({ id: inventoryLocations.id })
          .from(inventoryLocations)
          .where(eq(inventoryLocations.companyId, wo.companyId));
        const compLocIds = companyLocs.map((l: any) => l.id);
        let globalTotal = 0;
        if (compLocIds.length > 0) {
          const [gSum] = await tx.select({ total: sql<string>`coalesce(sum(${inventoryLocationStocks.stockLevel}::numeric), 0)` })
            .from(inventoryLocationStocks)
            .where(and(inArray(inventoryLocationStocks.locationId, compLocIds), eq(inventoryLocationStocks.productId, productId)));
          globalTotal = Number(gSum?.total || 0);
        }
        await tx.update(products).set({ stockLevel: globalTotal.toString() }).where(eq(products.id, productId));
      };

      // 4. Deduct raw materials (Goods Issue) & log consumptions
      let totalMaterialCost = 0;
      for (const { line, product } of lines) {
        const neededQty = Number(line.quantity) * qty;
        const scrapFactor = 1 + (Number(line.scrapPercentage || 0) / 100);
        const actualQty = neededQty * scrapFactor;

        // Deduct from stock (negative delta)
        await adjustProductStock(line.componentProductId, -actualQty);

        // Log consumption
        await tx.insert(workOrderConsumptions).values({
          workOrderId: id,
          productId: line.componentProductId,
          quantityConsumed: actualQty.toString(),
          date: new Date(),
        });

        // Log material transaction
        await tx.insert(manufacturingMaterialTransactions).values({
          workOrderId: id,
          productId: line.componentProductId,
          type: "ISSUE",
          quantity: actualQty.toString(),
          date: new Date(),
          reason: `Auto-issued for WO #${id} completion`,
        });

        totalMaterialCost += actualQty * Number(product?.costPrice || 0);
      }

      // 5. Credit finished good stock (Goods Receipt)
      await adjustProductStock(bom.productId, qty);

      // Log finished good material transaction
      await tx.insert(manufacturingMaterialTransactions).values({
        workOrderId: id,
        productId: bom.productId,
        type: "FINISHED_GOOD",
        quantity: qty.toString(),
        date: new Date(),
        reason: `Finished good receipt for WO #${id}`,
      });

      // 6. Update finished good cost price (weighted average with material cost)
      if (totalMaterialCost > 0 && qty > 0) {
        const unitCost = totalMaterialCost / qty;
        const [fg] = await tx.select().from(products).where(eq(products.id, bom.productId));
        if (fg) {
          const existingStock = Number(fg.stockLevel || 0);
          const existingCost = Number(fg.costPrice || 0);
          // Weighted average cost
          const totalStock = existingStock + qty;
          const newCost = totalStock > 0
            ? ((existingStock * existingCost) + (qty * unitCost)) / totalStock
            : unitCost;
          await tx.update(products).set({ costPrice: newCost.toFixed(4) } as any).where(eq(products.id, bom.productId));
        }
      }

      // 7. Post GL Journal: Dr Inventory (1300) / Cr WIP (1005)
      try {
        const [invAccount] = await tx.select().from(accounts)
          .where(and(eq(accounts.companyId, wo.companyId), eq(accounts.code, "1300")));
        const [wipAccount] = await tx.select().from(accounts)
          .where(and(eq(accounts.companyId, wo.companyId), eq(accounts.code, "1005")));

        if (invAccount && wipAccount && totalMaterialCost > 0) {
          const entryDate = new Date();
          // Check no closed period
          const periods = await tx.select().from(financialPeriods).where(eq(financialPeriods.companyId, wo.companyId));
          const period = periods.find((p: any) => {
            const s = new Date(p.startDate); const e = new Date(p.endDate);
            return entryDate >= s && entryDate <= e;
          });
          if (!period || period.status !== "CLOSED") {
            const [je] = await tx.insert(journalEntries).values({
              companyId: wo.companyId,
              entryDate,
              description: `Manufacturing WO #${id} Completion — ${bom.name}`,
              referenceType: "MANUFACTURING",
              referenceId: `WO-${id}`,
              createdBy: userId || null,
            }).returning();

            // Dr Inventory (finished good value)
            await tx.insert(ledgerEntries).values({
              journalEntryId: je.id,
              accountId: invAccount.id,
              type: "DEBIT",
              amount: totalMaterialCost.toFixed(2),
            });
            // Cr WIP
            await tx.insert(ledgerEntries).values({
              journalEntryId: je.id,
              accountId: wipAccount.id,
              type: "CREDIT",
              amount: totalMaterialCost.toFixed(2),
            });
          }
        }
      } catch (glErr) {
        // GL posting failure should not block WO completion - just log it
        console.warn("Manufacturing GL posting failed (non-fatal):", glErr);
      }

      // 8. Mark work order as completed
      const [updated] = await tx.update(workOrders)
        .set({ status: "COMPLETED", completedQuantity: String(qty) })
        .where(eq(workOrders.id, id))
        .returning();

      return { ...updated, materialCost: totalMaterialCost };
    });
  }

  async disposeFixedAsset(assetId: number, companyId: number, disposalDate: Date, disposalType: string, proceedsAmount: string, notes: string, userId: string): Promise<any> { return null; }
  async runForexRevaluation(companyId: number, date: Date, userId: string): Promise<any> { return { processed: 0 }; }
  async createAndReconcile(statementLineId: number, targetAccountId: number, description: string, userId: string): Promise<any> { return null; }

  // Payroll Elements & Audits
  async createPayrollElement(data: InsertPayrollElement): Promise<PayrollElement> {
    const [element] = await db.insert(payrollElements).values(data as any).returning();
    return element;
  }

  async updatePayrollElement(id: number, data: Partial<InsertPayrollElement>): Promise<PayrollElement> {
    const [updated] = await db.update(payrollElements).set(data as any).where(eq(payrollElements.id, id)).returning();
    if (!updated) throw new Error("Payroll element not found");
    return updated;
  }

  async deletePayrollElement(id: number): Promise<void> {
    await db.delete(payrollElements).where(eq(payrollElements.id, id));
  }

  async listPayrollElements(companyId: number): Promise<PayrollElement[]> {
    return await db.select().from(payrollElements).where(eq(payrollElements.companyId, companyId)).orderBy(asc(payrollElements.priorityOrder));
  }

  async createPayrollAudit(data: InsertPayrollCalculationAudit): Promise<PayrollCalculationAudit> {
    const [audit] = await db.insert(payrollCalculationAudits).values(data as any).returning();
    return audit;
  }

  async listPayrollAudits(runEmployeeId: number): Promise<PayrollCalculationAudit[]> {
    return await db.select().from(payrollCalculationAudits).where(eq(payrollCalculationAudits.payrollRunEmployeeId, runEmployeeId)).orderBy(desc(payrollCalculationAudits.createdAt));
  }

  async getOperationalDailyReport(companyId: number, start: Date, end: Date) {
    const { getOperationalDailyReport } = await import("./services/operationalReports.js");
    return getOperationalDailyReport(companyId, start, end);
  }

  async getOperationalWeeklyReport(companyId: number, start: Date, end: Date) {
    const { getOperationalWeeklyReport } = await import("./services/operationalReports.js");
    return getOperationalWeeklyReport(companyId, start, end);
  }

  async getOperationalMonthlyReport(companyId: number, start: Date, end: Date) {
    const { getOperationalMonthlyReport } = await import("./services/operationalReports.js");
    return getOperationalMonthlyReport(companyId, start, end);
  }

  async getStockMovementReport(companyId: number, start: Date, end: Date) {
    const { getStockMovementReport } = await import("./services/operationalReports.js");
    return getStockMovementReport(companyId, start, end);
  }
}

export const storage = new DatabaseStorage();
