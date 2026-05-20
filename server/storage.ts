
import {
  users, companies, customers, products, invoices, invoiceItems, companyUsers,
  type User, type InsertUser, type Company, type InsertCompany,
  type Customer, type Product, type Invoice, type InvoiceItem,
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
  productCategories, type ProductCategory, type InsertProductCategory,
  resetTokens, insertResetTokenSchema,
  suppliers, inventoryTransactions, expenses,
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
  type LaybyPayment, type InsertLaybyPayment
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, asc, desc, lte, gte, lt, ne, or, isNull, sql, ilike, count, inArray, gt } from "drizzle-orm";
import { type FiscalDayCounter } from "./zimra.js";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { format } from "date-fns";

const scryptAsync = promisify(scrypt);

const DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS = {
  cashAccountCode: "1000",
  accountsReceivableCode: "1200",
  inventoryAccountCode: "1300",
  accountsPayableCode: "2000",
  vatOutputAccountCode: "2100",
  vatInputAccountCode: "2110",
  salesRevenueAccountCode: "4000",
  cogsAccountCode: "5000",
  generalExpenseAccountCode: "5100",
  fxGainAccountCode: "4900",
  fxLossAccountCode: "5900",
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
  getCustomers(companyId: number): Promise<Customer[]>;
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
  getProductSerialNumbers(companyId: number, productId?: number, status?: string): Promise<ProductSerialNumber[]>;
  createProductSerialNumbers(data: Array<InsertProductSerialNumber & { companyId: number }>): Promise<ProductSerialNumber[]>;
  updateProductSerialNumber(id: number, companyId: number, data: Partial<InsertProductSerialNumber>): Promise<ProductSerialNumber>;
  getWarrantyClaims(companyId: number): Promise<WarrantyClaim[]>;
  createWarrantyClaim(data: InsertWarrantyClaim & { companyId: number; createdBy?: string | null }): Promise<WarrantyClaim>;
  updateWarrantyClaim(id: number, companyId: number, data: Partial<InsertWarrantyClaim>): Promise<WarrantyClaim>;
  getLaybys(companyId: number): Promise<(Layby & { items: LaybyItem[]; payments: LaybyPayment[] })[]>;
  createLayby(companyId: number, data: InsertLayby & { items: InsertLaybyItem[]; createdBy?: string | null; branchId?: number | null }): Promise<Layby>;
  addLaybyPayment(laybyId: number, companyId: number, data: InsertLaybyPayment & { createdBy?: string | null; branchId?: number | null }): Promise<LaybyPayment>;

  // Invoices
  getInvoicesPaginated(companyId: number, page?: number, limit?: number, search?: string, status?: string, type?: string, dateFrom?: Date, dateTo?: Date, isPos?: boolean, branchId?: number): Promise<{ data: (Invoice & { customer?: Customer; latestError?: { message: string, color: string } })[]; total: number; pages: number }>;
  getInvoices(companyId: number, branchId?: number): Promise<(Invoice & { customer?: Customer })[]>;
  getInvoice(id: number): Promise<(Invoice & { items: (InvoiceItem & { product?: Product })[]; customer?: Customer; validationErrors?: any[]; relatedInvoiceNumber?: string; relatedInvoiceDate?: Date | null; relatedFiscalCode?: string; relatedReceiptGlobalNo?: number; relatedReceiptCounter?: number }) | undefined>;
  createInvoice(invoice: CreateInvoiceRequest): Promise<Invoice>;
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
  getCompanyUsers(companyId: number): Promise<(User & { role: string })[]>;
  addCompanyUser(userId: string, companyId: number, role: string): Promise<void>;
  updateUserRole(userId: string, companyId: number, role: string): Promise<void>;
  removeCompanyUser(userId: string, companyId: number): Promise<void>;
  getCompanyUserRole(userId: string, companyId: number): Promise<string | undefined>;

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
  
  // Financial Periods
  getFinancialPeriods(companyId: number): Promise<FinancialPeriod[]>;
  createFinancialPeriod(data: InsertFinancialPeriod): Promise<FinancialPeriod>;
  toggleFinancialPeriod(id: number, status: string): Promise<FinancialPeriod>;
  runYearEndClose(companyId: number, asOfDate: Date, retainedEarningsCode?: string): Promise<void>;
  createPosShift(data: InsertPosShift): Promise<PosShift>;
  updatePosShift(id: number, userId: string, data: Partial<PosShift>): Promise<PosShift>;

  // Product Categories
  getProductCategories(companyId: number): Promise<ProductCategory[]>;
  createProductCategory(data: InsertProductCategory & { companyId: number }): Promise<ProductCategory>;
  deleteProductCategory(id: number, companyId: number): Promise<void>;

  // Reports
  getSalesByCategory(companyId: number, startDate: Date, endDate: Date): Promise<{ category: string; totalSales: number; count: number }[]>;
  getSalesByUser(companyId: number, startDate: Date, endDate: Date): Promise<{ userId: string; userName: string; totalSales: number; count: number }[]>;
  getProductPerformance(companyId: number, startDate: Date, endDate: Date, isPosOnly?: boolean): Promise<{ productId: number; productName: string; quantity: number; revenue: number }[]>;

  // Maintenance
  clearTestInvoices(companyId: number): Promise<number>;

  // Suppliers
  getSuppliers(companyId: number): Promise<Supplier[]>;
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
  getOperationalMetrics(companyId: number, startDate: Date, endDate: Date): Promise<{ atv: number; profitMargin: number; itemsPerReceipt: number; totalRevenue: number; totalCogs: number }>;
  getLowStockItems(companyId: number): Promise<(Product & { categoryName?: string })[]>;
  getReportStockOnHand(companyId: number, ownerGroup?: string): Promise<{ productId: number; name: string; sku: string | null; category: string | null; stockLevel: string; unitCost: string; totalValue: string }[]>;
  getReportInventoryMovements(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; type: string; quantity: string; unitCost: string | null; reference: string | null; notes: string | null }[]>;
  getReportStockAdjustments(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; sku: string | null; type: string; quantity: string; unitCost: string | null; totalCost: string | null; referenceType: string | null; reference: string | null; notes: string | null; userName: string | null }[]>;
  getReportPurchaseHistory(companyId: number, start: Date, end: Date, ownerGroup?: string): Promise<{ transactionId: number; date: string; productName: string; supplierName: string | null; quantity: string; unitCost: string; totalCost: string; reference: string | null }[]>;

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
  getVatReturn(companyId: number, fromDate?: Date, toDate?: Date): Promise<{ outputVat: number; inputVat: number; netVat: number }>;
  postToLedger(companyId: number, entryData: LedgerPostData, tx?: any): Promise<JournalEntry>;
  
  // Bank Reconciliation
  uploadBankStatement(data: InsertBankStatement, lines: InsertBankStatementLine[]): Promise<BankStatement>;
  getBankStatements(companyId: number, accountId?: number): Promise<BankStatement[]>;
  getBankStatementLines(statementId: number): Promise<BankStatementLine[]>;
  getUnreconciledLedger(companyId: number, accountId: number): Promise<any[]>;
  reconcileBankLine(lineId: number, ledgerEntryId: number): Promise<void>;
  autoReconcile(statementId: number): Promise<number>;
  createCashTransaction(data: { companyId: number, type: 'RECEIPT' | 'PAYMENT', bankAccountId: number, counterpartyAccountId: number, amount: number, date: Date, description: string, reference?: string, createdBy?: string }): Promise<JournalEntry>;
}

export class DatabaseStorage implements IStorage {
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
        const systemAdminOnlyCompanies = new Set(['goosehill trading', 'spares arena']);
        allCompanies = allCompanies.filter(c => {
          const companyName = (c.name || "").toLowerCase();
          const tradingName = (c.tradingName || "").toLowerCase();
          return !systemAdminOnlyCompanies.has(companyName) && !systemAdminOnlyCompanies.has(tradingName);
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

  async getCustomers(companyId: number): Promise<Customer[]> {
    return await db.select().from(customers).where(
      and(
        eq(customers.companyId, companyId),
        eq(customers.isActive, true)
      )
    );
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

  async getProductSerialNumbers(companyId: number, productId?: number, status?: string): Promise<ProductSerialNumber[]> {
    const filters: any[] = [eq(productSerialNumbers.companyId, companyId)];
    if (productId) filters.push(eq(productSerialNumbers.productId, productId));
    if (status) filters.push(eq(productSerialNumbers.status, status));
    return await db
      .select()
      .from(productSerialNumbers)
      .where(and(...filters))
      .orderBy(desc(productSerialNumbers.createdAt));
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
  ): Promise<{ data: (Invoice & { customer?: Customer; latestError?: { message: string, color: string } })[]; total: number; pages: number }> {
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
        latestErrorColor: latestErrorSubquery.errorColor
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(latestErrorSubquery, and(
        eq(invoices.id, latestErrorSubquery.invoiceId),
        eq(latestErrorSubquery.rn, 1)
      ))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(invoices.createdAt));

    const data = rows.map(r => ({
      ...r.invoice,
      customer: r.customer || undefined,
      latestError: r.latestErrorMsg ? {
        message: r.latestErrorMsg,
        color: r.latestErrorColor || 'Red'
      } : undefined
    }));

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
    return await db.transaction(async (tx) => {
      const { items, ...invoiceData } = data;

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

      const { calculateCOGS } = await import("./lib/inventory.js");

      if (items.length > 0) {
        // We will process items one by one to calculate COGS for each
        for (const item of items) {
          let cogsAmount: number | null = null;

          if (item.productId) {
            const [product] = await tx.select().from(products).where(eq(products.id, item.productId));

            // --- BOM / Recipe Deduction Logic ---
            if (product && product.hasRecipe) {
              const recipes = await tx.select().from(recipeItems).where(eq(recipeItems.parentProductId, product.id));
              let totalRecipeCogs = 0;

              for (const recipe of recipes) {
                const ingredientQty = parseFloat(item.quantity.toString()) * parseFloat(recipe.quantity.toString());
                const [ingredient] = await tx.select().from(products).where(eq(products.id, recipe.ingredientProductId));

                if (ingredient && ingredient.isTracked) {
                  if (invoiceData.transactionType !== 'CreditNote') {
                    const ingredientCogs = await calculateCOGS(ingredient.id, ingredientQty, invoiceData.companyId, tx);
                    totalRecipeCogs += (ingredientCogs || 0);

                    await tx.insert(inventoryTransactions).values({
                      companyId: invoiceData.companyId,
                      branchId: invoiceData.branchId || null,
                      productId: ingredient.id,
                      type: "STOCK_OUT",
                      quantity: (-ingredientQty).toString(),
                      totalCost: ingredientCogs?.toString() || null,
                      referenceType: "INVOICE",
                      referenceId: invoice.id.toString(),
                      notes: `Recipe Ingredient for ${product.name} - Invoice ${invoice.invoiceNumber}`
                    });
                  } else {
                    await tx.insert(inventoryTransactions).values({
                      companyId: invoiceData.companyId,
                      branchId: invoiceData.branchId || null,
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
                  const newIngStock = (parseFloat(ingredient.stockLevel || "0") + recipeStockChange).toString();
                  await tx.update(products).set({ stockLevel: newIngStock }).where(eq(products.id, ingredient.id));

                  if (invoiceData.branchId) {
                    const [currentBranchStock] = await tx
                      .select()
                      .from(branchStocks)
                      .where(and(
                        eq(branchStocks.branchId, invoiceData.branchId),
                        eq(branchStocks.productId, ingredient.id)
                      ));

                    const newBranchStock = (parseFloat(currentBranchStock?.stockLevel || "0") + recipeStockChange).toString();
                    await tx
                      .insert(branchStocks)
                      .values({
                        branchId: invoiceData.branchId,
                        productId: ingredient.id,
                        stockLevel: newBranchStock
                      })
                      .onConflictDoUpdate({
                        target: [branchStocks.branchId, branchStocks.productId],
                        set: { stockLevel: newBranchStock }
                      });
                  }
                }
              }
              cogsAmount = totalRecipeCogs;
            }
            // --- Standard Tracked Product Logic ---
            else if (product && product.isTracked) {
              const quantity = parseFloat(item.quantity.toString());

              if (invoiceData.transactionType !== 'CreditNote') {
                // Calculate and deduct for sales
                cogsAmount = await calculateCOGS(item.productId, quantity, invoiceData.companyId, tx);

                // Record the STOCK_OUT transaction
                await tx.insert(inventoryTransactions).values({
                  companyId: invoiceData.companyId,
                  branchId: invoiceData.branchId || null,
                  productId: item.productId,
                  type: "STOCK_OUT",
                  quantity: (-quantity).toString(),
                  totalCost: cogsAmount?.toString() || null,
                  referenceType: "INVOICE",
                  referenceId: invoice.id.toString(),
                  notes: `Sale - Invoice ${invoice.invoiceNumber}`
                });
              } else {
                // Restoring stock for Credit Note
                await tx.insert(inventoryTransactions).values({
                  companyId: invoiceData.companyId,
                  branchId: invoiceData.branchId || null,
                  productId: item.productId,
                  type: "ADJUSTMENT",
                  quantity: quantity.toString(),
                  referenceType: "INVOICE",
                  referenceId: invoice.id.toString(),
                  notes: `Return - Credit Note ${invoice.invoiceNumber}`,
                  remainingQuantity: quantity.toString()
                });
              }

              // Update stock level on product (Global)
              const stockChange = invoiceData.transactionType === 'CreditNote' ? quantity : -quantity;
              const newStockLevel = (parseFloat(product.stockLevel || "0") + stockChange).toString();
              await tx.update(products)
                .set({ stockLevel: newStockLevel })
                .where(eq(products.id, item.productId));

              // --- Branch Specific Stock Update ---
              if (invoiceData.branchId) {
                const [currentBranchStock] = await tx
                  .select()
                  .from(branchStocks)
                  .where(and(
                    eq(branchStocks.branchId, invoiceData.branchId),
                    eq(branchStocks.productId, item.productId)
                  ));

                const newBranchStock = (parseFloat(currentBranchStock?.stockLevel || "0") + stockChange).toString();

                await tx
                  .insert(branchStocks)
                  .values({
                    branchId: invoiceData.branchId,
                    productId: item.productId,
                    stockLevel: newBranchStock
                  })
                  .onConflictDoUpdate({
                    target: [branchStocks.branchId, branchStocks.productId],
                    set: { stockLevel: newBranchStock }
                  });
              }

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
      const subtotal = Number(invoice.subtotal);
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

      await this.postToLedger(invoice.companyId, {
        entryDate: invoice.issueDate || new Date(),
        description,
        referenceType: "INVOICE",
        referenceId: invoice.id.toString(),
        createdBy: invoice.createdBy || undefined,
        lines: ([
          { accountCode: isImmediateCashSale ? cashAccountCode : arAccountCode, type: isCreditNote ? "CREDIT" : "DEBIT", amount: total },
          { accountCode: salesAccountCode, type: isCreditNote ? "DEBIT" : "CREDIT", amount: subtotal },
          { accountCode: vatOutputAccountCode, type: isCreditNote ? "DEBIT" : "CREDIT", amount: taxAmount },
        ] as LedgerPostLine[]).filter(line => Number(line.amount) > 0)
      }, tx);

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
    if (companyId) {
      return await db
        .select()
        .from(taxTypes)
        .where(
          and(
            or(eq(taxTypes.companyId, companyId), isNull(taxTypes.companyId)),
            eq(taxTypes.isActive, true)
          )
        )
        .orderBy(taxTypes.rate);
    }
    return await db.select().from(taxTypes).where(eq(taxTypes.isActive, true)).orderBy(taxTypes.rate);
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
  async getCompanyUsers(companyId: number): Promise<(User & { role: string })[]> {
    const result = await db
      .select({
        user: users,
        role: companyUsers.role
      })
      .from(companyUsers)
      .innerJoin(users, eq(companyUsers.userId, users.id))
      .where(eq(companyUsers.companyId, companyId));

    return result.map(({ user, role }) => ({ ...user, role: role || "member" }));
  }

  async addUserToCompany(userId: string, companyId: number, role: string): Promise<void> {
    await db.insert(companyUsers).values({
      userId,
      companyId,
      role
    });
  }

  async updateUserRole(userId: string, companyId: number, role: string): Promise<void> {
    await db
      .update(companyUsers)
      .set({ role })
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

    for (const row of dayInvoicesInfo) {
      if (!row.invoice || !row.item) continue;

      const inv = row.invoice;
      const item = row.item;
      const currency = inv.currency || "USD";
      const taxPercent = Number(item.taxRate);

      // Look up taxID from database taxTypes using strict ID match first
      let matchingTax: TaxType | undefined;

      if (item.taxTypeId) {
        matchingTax = dbTaxTypes.find(t => t.id === item.taxTypeId);
      }

      // Fallback to rate matching if not found by ID
      if (!matchingTax) {
        matchingTax = dbTaxTypes.find(t =>
          Math.abs(Number(t.rate) - taxPercent) < 0.01
        );
      }

      // ZIMRA Tax ID Mapping - Dynamic Lookup
      let taxID = 0;

      if (matchingTax?.zimraTaxId) {
        taxID = parseInt(matchingTax.zimraTaxId);

        // Refined check for 0% ambiguity (if matchedTax is not ID 1 but item might be exempt)
        if (taxPercent === 0 && taxID !== 1) {
          const isExemptIntent = (item.description || '').toLowerCase().includes('exempt');
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
        const desc = (item.description || '').toLowerCase();

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

      // Handle sign based on transaction type
      // ZIMRA counters should ALWAYS BE POSITIVE ACCUMULATORS!
      // Even Credit/Debit notes are reported as positive quantities of those types.
      amountWithTax = Math.abs(amountWithTax);
      taxAmt = Math.abs(taxAmt);

      if (type === 'FiscalInvoice' || type === 'Invoice') {
        const keySale = `SaleByTax-${currency}-${taxPercent}-${taxID}`;
        const cSale = getCounter(keySale, 'SaleByTax', currency, taxPercent, taxID);
        cSale.fiscalCounterValue += amountWithTax;

        const keyTax = `SaleTaxByTax-${currency}-${taxPercent}-${taxID}`;
        const cTax = getCounter(keyTax, 'SaleTaxByTax', currency, taxPercent, taxID);
        cTax.fiscalCounterValue += taxAmt;
      } else if (type === 'CreditNote') {
        const keySale = `CreditNoteByTax-${currency}-${taxPercent}-${taxID}`;
        const cSale = getCounter(keySale, 'CreditNoteByTax', currency, taxPercent, taxID);
        cSale.fiscalCounterValue += amountWithTax;

        const keyTax = `CreditNoteTaxByTax-${currency}-${taxPercent}-${taxID}`;
        const cTax = getCounter(keyTax, 'CreditNoteTaxByTax', currency, taxPercent, taxID);
        cTax.fiscalCounterValue += taxAmt;
      } else if (type === 'DebitNote') {
        const keySale = `DebitNoteByTax-${currency}-${taxPercent}-${taxID}`;
        const cSale = getCounter(keySale, 'DebitNoteByTax', currency, taxPercent, taxID);
        cSale.fiscalCounterValue += amountWithTax;

        const keyTax = `DebitNoteTaxByTax-${currency}-${taxPercent}-${taxID}`;
        const cTax = getCounter(keyTax, 'DebitNoteTaxByTax', currency, taxPercent, taxID);
        cTax.fiscalCounterValue += taxAmt;
      }
    }

    const uniqueInvoices = new Map();
    dayInvoicesInfo.forEach(r => {
      if (r.invoice) uniqueInvoices.set(r.invoice.id, r.invoice);
    });

    for (const inv of uniqueInvoices.values()) {
      const currency = inv.currency || "USD";
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
    // We strictly use client-side filtering for simplicity and safety against mixed formats
    // Get all invoice numbers for the company
    const allInvoices = await db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.companyId, companyId));

    // Filter and parse
    const relevant = allInvoices
      .filter(i => i.invoiceNumber.startsWith(`${prefix}-`))
      .map(i => {
        const parts = i.invoiceNumber.split('-');
        // handle cases like INV-123, INV-001
        const numPart = parts[1];
        return numPart ? parseInt(numPart) : 0;
      })
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a);

    const nextNum = relevant.length > 0 ? relevant[0] + 1 : 1;

    // Pad with leading zeros, e.g., 001
    return `${prefix}-${nextNum.toString().padStart(3, '0')}`;
  }

  // Payments
  async createPayment(payment: InsertPayment & { companyId: number; skipLedger?: boolean }): Promise<Payment> {
    return await db.transaction(async (tx) => {
      const { skipLedger, ...paymentData } = payment;
      const [newPayment] = await tx.insert(payments).values(paymentData).returning();
      
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

        await this.postToLedger(invoice.companyId, {
          entryDate: newPayment.paymentDate,
          description: `Payment for Invoice ${invoice.invoiceNumber} (${newPayment.paymentMethod}) - FX Auth`,
          referenceType: "PAYMENT",
          referenceId: newPayment.id.toString(),
          createdBy: newPayment.createdBy || undefined,
          lines
        }, tx);

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
        eq(invoices.transactionType, 'FiscalInvoice')
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

  async runYearEndClose(companyId: number, asOfDate: Date, retainedEarningsCode: string = "3000"): Promise<void> {
    return await db.transaction(async (tx) => {
      // 1. Get trial balance of REVENUE and EXPENSE up to asOfDate
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

      const lines: { accountCode: string, type: 'DEBIT' | 'CREDIT', amount: number }[] = [];
      let totalNetProfit = 0; 
      
      for (const bal of balances) {
        const debit = Number(bal.netDebit || 0);
        const credit = Number(bal.netCredit || 0);
        
        if (bal.type === 'REVENUE') {
            const netBalance = credit - debit;
            if (netBalance > 0) {
               lines.push({ accountCode: bal.accountCode as string, type: 'DEBIT', amount: netBalance });
            } else if (netBalance < 0) {
               lines.push({ accountCode: bal.accountCode as string, type: 'CREDIT', amount: Math.abs(netBalance) });
            }
            totalNetProfit += netBalance;
        } else if (bal.type === 'EXPENSE') {
            const netBalance = debit - credit;
            if (netBalance > 0) {
               lines.push({ accountCode: bal.accountCode as string, type: 'CREDIT', amount: netBalance });
            } else if (netBalance < 0) {
               lines.push({ accountCode: bal.accountCode as string, type: 'DEBIT', amount: Math.abs(netBalance) });
            }
            totalNetProfit -= netBalance;
        }
      }

      if (lines.length === 0) return; // Nothing to sweep

      // Balance goes to Retained Earnings
      if (totalNetProfit > 0) {
          lines.push({ accountCode: retainedEarningsCode, type: 'CREDIT', amount: totalNetProfit });
      } else if (totalNetProfit < 0) {
          lines.push({ accountCode: retainedEarningsCode, type: 'DEBIT', amount: Math.abs(totalNetProfit) });
      }

      await this.postToLedger(companyId, {
        entryDate: asOfDate,
        description: "Automated Year-End Closing Sweep",
        referenceType: "SYSTEM",
        referenceId: "YEC",
        lines
      }, tx);
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

  async getRevenueChart(companyId: number, startDate: Date, endDate: Date): Promise<{ name: string; total: number }[]> {
    const result = await db
      .select({
        date: sql`date_trunc('day', ${invoices.issueDate})`,
        total: sql<number>`sum(${invoices.total})`
      })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, startDate),
        lte(invoices.issueDate, endDate),
        ne(invoices.status, 'cancelled'),
        ne(invoices.status, 'draft')
      ))
      .groupBy(sql`date_trunc('day', ${invoices.issueDate})`)
      .orderBy(sql`date_trunc('day', ${invoices.issueDate})`);

    return result.map(r => ({
      name: format(new Date(r.date as string), 'MMM dd'),
      total: Number(r.total || 0)
    }));
  }

  async getSalesByPaymentMethod(companyId: number, startDate: Date, endDate: Date): Promise<{ method: string; total: number; count: number }[]> {
    const result = await db
      .select({
        method: invoices.paymentMethod,
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
      ))
      .groupBy(invoices.paymentMethod);

    return result.map(r => ({
      method: r.method || "CASH",
      total: Number(r.total || 0),
      count: Number(r.count || 0)
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
  async getSalesByCategory(companyId: number, startDate: Date, endDate: Date): Promise<{ category: string; totalSales: number; count: number }[]> {
    const result = await db
      .select({
        category: products.category,
        totalSales: sql<number>`sum(${invoiceItems.lineTotal})`,
        count: count(invoiceItems.id)
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
      ))
      .groupBy(products.category)
      .orderBy(desc(sql`sum(${invoiceItems.lineTotal})`));

    return result.map(r => ({
      category: r.category || "Uncategorized",
      totalSales: Number(r.totalSales || 0),
      count: Number(r.count || 0)
    }));
  }

  async getSalesByUser(companyId: number, startDate: Date, endDate: Date): Promise<{ userId: string; userName: string; totalSales: number; count: number }[]> {
    const rows = await db
      .select({
        createdBy: invoices.createdBy,
        shiftId: invoices.shiftId,
        total: invoices.total,
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

    const byCashier = new Map<string, { userId: string; userName: string; totalSales: number; count: number }>();
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
        count: 0
      };
      existing.totalSales += Number(row.total || 0);
      existing.count += 1;
      byCashier.set(resolvedUserId, existing);
    }

    return Array.from(byCashier.values()).sort((a, b) => b.totalSales - a.totalSales);
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
  async getSuppliers(companyId: number): Promise<Supplier[]> {
    return await db.select().from(suppliers).where(
      and(
        eq(suppliers.companyId, companyId),
        eq(suppliers.isActive, true)
      )
    ).orderBy(suppliers.name);
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

      // Automated Journaling: Credit Accounts Payable (2000), Debit Inventory (1300) or appropriate account
      const subtotal = invoiceTotal - invoiceTax;
      const tax = invoiceTax;

      // Determine the debit account (Control Account for Inventory is 1300 by default)
      let debitAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "inventoryAccountCode", tx);
      if (invoiceData.debitAccountId) {
        const [acc] = await tx.select().from(accounts).where(eq(accounts.id, invoiceData.debitAccountId));
        if (acc) {
          debitAccountCode = acc.code;
        }
      }
      const vatInputAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "vatInputAccountCode", tx);
      const apAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "accountsPayableCode", tx);

      const lines: { accountCode: string, type: 'DEBIT'|'CREDIT', amount: number }[] = [
        { accountCode: debitAccountCode, type: 'DEBIT', amount: subtotal }
      ];
      
      if (tax > 0) {
        lines.push({ accountCode: vatInputAccountCode, type: 'DEBIT', amount: tax }); // VAT Input (VAT Receivable)
      }

      lines.push({ accountCode: apAccountCode, type: 'CREDIT', amount: invoiceTotal }); // Accounts Payable

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
    const filters: any[] = [eq(products.companyId, companyId), eq(products.isTracked, true)];
    const ownerGroupFilter = buildOwnerGroupSql(products.ownerGroup, ownerGroup);
    if (ownerGroupFilter) {
      filters.push(ownerGroupFilter);
    }
    const trackedProducts = await db
      .select()
      .from(products)
      .where(and(...filters));

    return trackedProducts.map(p => ({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      stockLevel: p.stockLevel || "0",
      unitCost: p.costPrice || "0",
      totalValuation: Number(p.stockLevel || 0) * Number(p.costPrice || 0)
    }));
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

  async getOperationalMetrics(companyId: number, startDate: Date, endDate: Date): Promise<{ atv: number; profitMargin: number; itemsPerReceipt: number; totalRevenue: number; totalCogs: number }> {
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
      return { atv: 0, profitMargin: 0, itemsPerReceipt: 0, totalRevenue: 0, totalCogs: 0 };
    }

    const invoiceIds = periodInvoices.map(inv => inv.id);
    const items = await db.select()
      .from(invoiceItems)
      .where(inArray(invoiceItems.invoiceId, invoiceIds));

    const totalRevenue = periodInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
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
      totalCogs
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
    const filters: any[] = [eq(products.companyId, companyId), eq(products.isTracked, true)];
    const ownerGroupFilter = buildOwnerGroupSql(products.ownerGroup, ownerGroup);
    if (ownerGroupFilter) {
      filters.push(ownerGroupFilter);
    }
    const results = await db.select({
      productId: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      stockLevel: products.stockLevel,
      unitCost: products.costPrice,
      totalValue: sql<string>`(${products.stockLevel} * ${products.costPrice})`
    })
      .from(products)
      .where(and(...filters))
      .orderBy(products.name);
    return results.map(r => ({
      ...r,
      stockLevel: String(r.stockLevel),
      unitCost: String(r.unitCost || "0"),
      totalValue: String(r.totalValue || "0")
    }));
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
        revenue: sql<number>`SUM(${invoiceItems.lineTotal})`
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .innerJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(...filters))
      .groupBy(products.id, products.name, products.sku)
      .orderBy(desc(sql`SUM(${invoiceItems.lineTotal})`));

    const totalRevenue = productRevenue.reduce((sum, p) => sum + Number(p.revenue), 0);

    if (totalRevenue === 0) return [];

    let currentCumulative = 0;
    return productRevenue.map(p => {
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
      await tx.delete(recipeItems).where(eq(recipeItems.parentProductId, productId));
      if (items.length > 0) {
        await tx.insert(recipeItems).values(items);
        await tx.update(products).set({ hasRecipe: true }).where(eq(products.id, productId));
      } else {
        await tx.update(products).set({ hasRecipe: false }).where(eq(products.id, productId));
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
        // --- ASSETS (IFRS presentation: current and non-current) ---
        { code: "1000", name: "Cash on Hand", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1010", name: "Cash at Bank - USD", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1020", name: "Cash at Bank - ZiG", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1050", name: "Petty Cash", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1100", name: "Short-term Investments", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1200", name: "Trade Receivables", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1210", name: "Allowance for Expected Credit Losses", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1300", name: "Inventories", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1400", name: "Prepayments", type: "ASSET", category: "Current Assets", isSystem: true },
        { code: "1500", name: "Property, Plant and Equipment - Cost", type: "ASSET", category: "Non-current Assets", isSystem: true },
        { code: "1510", name: "Accumulated Depreciation - PPE", type: "ASSET", category: "Non-current Assets", isSystem: true },
        { code: "1520", name: "Right-of-use Assets", type: "ASSET", category: "Non-current Assets", isSystem: true },
        { code: "1530", name: "Intangible Assets", type: "ASSET", category: "Non-current Assets", isSystem: true },
        { code: "1540", name: "Accumulated Amortisation", type: "ASSET", category: "Non-current Assets", isSystem: true },
        { code: "2110", name: "VAT Input Recoverable", type: "ASSET", category: "Current Assets", isSystem: true },

        // --- LIABILITIES (IFRS presentation: current and non-current) ---
        { code: "2000", name: "Trade Payables", type: "LIABILITY", category: "Current Liabilities", isSystem: true },
        { code: "2100", name: "VAT Output Payable", type: "LIABILITY", category: "Current Liabilities", isSystem: true },
        { code: "2120", name: "Income Tax Payable", type: "LIABILITY", category: "Current Liabilities", isSystem: true },
        { code: "2200", name: "Accrued Expenses", type: "LIABILITY", category: "Current Liabilities", isSystem: true },
        { code: "2300", name: "Related Party Loans", type: "LIABILITY", category: "Non-current Liabilities", isSystem: true },
        { code: "2400", name: "Lease Liabilities", type: "LIABILITY", category: "Non-current Liabilities", isSystem: true },
        { code: "2500", name: "Deferred Tax Liabilities", type: "LIABILITY", category: "Non-current Liabilities", isSystem: true },

        // --- EQUITY ---
        { code: "3000", name: "Retained Earnings", type: "EQUITY", category: "Equity", isSystem: true },
        { code: "3100", name: "Opening Balance Equity", type: "EQUITY", category: "Equity", isSystem: true },
        { code: "3200", name: "Share Capital", type: "EQUITY", category: "Equity", isSystem: true },
        { code: "3300", name: "Other Reserves", type: "EQUITY", category: "Equity", isSystem: true },

        // --- INCOME ---
        { code: "4000", name: "Revenue from Contracts with Customers", type: "REVENUE", category: "Revenue", isSystem: true },
        { code: "4100", name: "Service Revenue", type: "REVENUE", category: "Revenue", isSystem: true },
        { code: "4200", name: "Finance Income", type: "REVENUE", category: "Other Income", isSystem: true },
        { code: "4900", name: "Foreign Exchange Gains", type: "REVENUE", category: "Other Income", isSystem: true },

        // --- EXPENSES ---
        { code: "5000", name: "Cost of Sales", type: "EXPENSE", category: "Cost of Sales", isSystem: true },
        { code: "5100", name: "Administrative Expenses", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5110", name: "Rent and Occupancy Expenses", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5120", name: "Utilities", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5130", name: "Employee Benefits Expense", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5140", name: "Printing and Stationery", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5150", name: "Bank Charges", type: "EXPENSE", category: "Finance Costs", isSystem: true },
        { code: "5160", name: "Repairs and Maintenance", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5170", name: "Communication Expenses", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5180", name: "Depreciation and Amortisation", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5190", name: "Impairment Losses", type: "EXPENSE", category: "Operating Expenses", isSystem: true },
        { code: "5900", name: "Foreign Exchange Losses", type: "EXPENSE", category: "Other Expenses", isSystem: true },
      ];

      for (const acc of defaultAccounts) {
        await t.insert(accounts).values({
          companyId,
          ...acc,
          isActive: true
        }).onConflictDoUpdate({
          target: [accounts.companyId, accounts.code],
          set: { name: acc.name, type: acc.type, category: acc.category, isSystem: acc.isSystem }
        });
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

    const entries = await db.select()
      .from(journalEntries)
      .where(and(...filters))
      .orderBy(desc(journalEntries.entryDate));

    const result = [];
    for (const entry of entries) {
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
      
      result.push({ ...entry, lines });
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

      let debit = 0;
      let credit = 0;
      entries.forEach(e => {
        if (e.type === 'DEBIT') debit += Number(e.amount);
        else credit += Number(e.amount);
      });

      if (debit !== 0 || credit !== 0) {
        result.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          debit,
          credit,
          balance: debit - credit
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
        entryDate,
        description: data.description,
        referenceType: data.referenceType,
        referenceId: data.referenceId ?? data.reference,
        createdBy: data.createdBy,
      }).returning();

      const normalizedLines = await this.normalizeLedgerLines(companyId, data.lines, t);
      this.assertBalancedLedgerLines(normalizedLines);

      // 2. Create Ledger Entries
      for (const line of normalizedLines) {
        await t.insert(ledgerEntries).values({
          journalEntryId: je.id,
          accountId: line.accountId,
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

  async getVatReturn(companyId: number, fromDate?: Date, toDate?: Date): Promise<{ outputVat: number; inputVat: number; netVat: number }> {
    // Output VAT: Sum of tax amount from sales invoices
    const salesInvoices = await db.select({ tax: invoices.taxAmount })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, 'CANCELLED'),
        ...(fromDate ? [gte(invoices.createdAt, fromDate)] : []),
        ...(toDate ? [lte(invoices.createdAt, toDate)] : [])
      ));
    const outputVat = salesInvoices.reduce((sum, inv) => sum + Number(inv.tax || 0), 0);

    // Input VAT: Sum of tax amount from supplier invoices
    const purchases = await db.select({ tax: supplierInvoices.taxAmount })
      .from(supplierInvoices)
      .where(and(
        eq(supplierInvoices.companyId, companyId),
        ne(supplierInvoices.status, 'CANCELLED'),
        ...(fromDate ? [gte(supplierInvoices.createdAt, fromDate)] : []),
        ...(toDate ? [lte(supplierInvoices.createdAt, toDate)] : [])
      ));
    const inputVat = purchases.reduce((sum, inv) => sum + Number(inv.tax || 0), 0);

    return {
      outputVat,
      inputVat,
      netVat: outputVat - inputVat
    };
  }
}

export const storage = new DatabaseStorage();
