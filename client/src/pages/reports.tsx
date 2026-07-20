import { Layout } from "@/components/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { SalesReport, SalesByCustomerReport, SalesByItemReport } from "@/components/reports/sales-reports";
import { InventoryHealthReport, StockOnHandReport, InventoryMovementsReport, PurchaseHistoryReport } from "@/components/reports/retail-reports";
import { DailyOperationalReport, WeeklyOperationalReport, MonthlyOperationalReport, StockMovementReport, ProductProfitMarginsReport } from "@/components/reports/operational-reports";
import { ArAgingSummaryReport, InvoiceDetailsReport, CustomerBalanceSummaryReport, ReceivableDetailsReport } from "@/components/reports/receivables-reports";
import { CashCollectionReport, PaymentsReceivedReport } from "@/components/reports/payments-reports";
import { ExpenseDetailsReport, ExpensesByCategoryReport } from "@/components/reports/expenses-reports";
import { TaxSummaryReport } from "@/components/reports/tax-reports";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, BarChart3, FileText, CreditCard, ShoppingCart, ShoppingBag, Receipt, Search, Download, Loader2, RefreshCw, Calendar as CalendarIcon, Calculator, ShieldCheck, History, LayoutDashboard, TrendingUp, Sparkles, ArrowRight, CalendarDays, Package } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, format, isValid } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DateRange } from "react-day-picker";
import { downloadCsv, generateCsv } from "@/lib/report-utils";

// ── Report definitions ────────────────────────────────────────────────────────

interface ReportDefinition {
  key: string;
  label: string;
  category: string;
  description: string;
  endpoint?: string;
  externalHref?: string;
}

const REPORT_CATEGORIES: {
  key: string;
  label: string;
  icon: React.ElementType;
  reports: ReportDefinition[];
}[] = [
  {
    key: "operational",
    label: "Operational Reports",
    icon: CalendarDays,
    reports: [
      { key: "operational-daily", label: "Daily Report", category: "operational", description: "Per-day view: opening cash, cash/credit sales, collections, expenses, money banked, production, sales & stock by product.", endpoint: "operational-daily" },
      { key: "operational-weekly", label: "Weekly Report", category: "operational", description: "Weekly rollup of sales, collections, expenses, money banked, and stock movement per product.", endpoint: "operational-weekly" },
      { key: "operational-monthly", label: "Monthly Report", category: "operational", description: "Monthly summary auto-rolled up from daily and weekly operational data.", endpoint: "operational-monthly" },
      { key: "stock-movement", label: "Stock Movement", category: "operational", description: "Opening stock + production + purchases − sales + adjustments = closing stock per product.", endpoint: "stock-movement" },
    ],
  },
  {
    key: "financials",
    label: "Financials & Accounting",
    icon: Calculator,
    reports: [
      { key: "profit-loss", label: "Profit & Loss", category: "financials", description: "Analyze revenue, cost of sales, operating expenses, and net profitability.", externalHref: "/accounting/reports/financial?tab=pl" },
      { key: "balance-sheet", label: "Balance Sheet", category: "financials", description: "Summarize company assets, liabilities, and equity at a specific point in time.", externalHref: "/accounting/reports/financial?tab=bs" },
      { key: "cash-flow", label: "Cash Flow Statement", category: "financials", description: "Monitor the inflows and outflows of cash from operations, investments, and finance.", externalHref: "/accounting/reports/financial?tab=cf" },
      { key: "trial-balance", label: "Trial Balance", category: "financials", description: "Review closing balances for all accounts to verify double-entry bookkeeping accuracy.", externalHref: "/accounting/reports/trial-balance" },
      { key: "general-ledger", label: "General Ledger", category: "financials", description: "Extract detailed transaction listings for all accounts for deep dive audits.", externalHref: "/accounting/reports/ledger" },
      { key: "cost-centers", label: "Cost Centers", category: "financials", description: "Track performance, income, and expenses across specific branches or cost centers.", externalHref: "/accounting/reports/cost-centers" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    icon: BarChart3,
    reports: [
      { key: "sales", label: "Sales Summary", category: "sales", description: "Analyze total sales volume, discounts, taxes, cost, and net margins.", endpoint: "sales-summary" },
      { key: "sales-by-customer", label: "Sales by Customer", category: "sales", description: "View breakdown of total sales and collection statuses per customer.", endpoint: "sales-by-customer" },
      { key: "sales-by-item", label: "Sales by Item", category: "sales", description: "Track product performance by quantity sold, gross revenue, and margin.", endpoint: "sales-by-item" },
      { key: "daily-sales", label: "Daily Sales Ledger", category: "sales", description: "A granular, date-by-date list of invoice transactions and payment types.", externalHref: "/reports/daily" },
      { key: "pos-reports", label: "POS Reports", category: "sales", description: "Audit register closures, Z-Reports, cashier shifts, and terminal sales.", externalHref: "/reports/pos" },
      { key: "partnership-sales", label: "Partnership Sales", category: "sales", description: "Track sales commissions, revenue sharing, and partner transactions.", externalHref: "/reports/partnership-sales" },
    ],
  },
  {
    key: "receivables",
    label: "Receivables & Payables",
    icon: FileText,
    reports: [
      { key: "ar-aging-summary", label: "AR Aging Summary", category: "receivables", description: "Categorize unpaid customer invoices into aging buckets (30, 60, 90+ days).", endpoint: "ar-aging-summary" },
      { key: "customer-balance-summary", label: "Customer Balances", category: "receivables", description: "Summarize accounts receivable balances, credit, and limits for all clients.", endpoint: "customer-balance-summary" },
      { key: "receivable-details", label: "Receivable Details", category: "receivables", description: "Granular list of all unpaid invoices with due dates and customer contacts.", endpoint: "receivable-details" },
      { key: "ap-aging-summary", label: "AP Aging Summary", category: "receivables", description: "Track outstanding bills to vendors categorized by aging brackets.", externalHref: "/accounting/reports/aging?tab=ap" },
      { key: "customer-statements", label: "Customer Statements", category: "receivables", description: "Generate printable transaction statements for customers showing running balances.", externalHref: "/reports/customer-statements" },
    ],
  },
  {
    key: "payments-received",
    label: "Payments & Cash",
    icon: CreditCard,
    reports: [
      { key: "payments-received", label: "Payments Received", category: "payments-received", description: "Detailed log of all customer payments received and invoice allocations.", endpoint: "payments-received" },
      { key: "cash-collection", label: "Cash Collection Report", category: "payments-received", description: "Audit cash, card, bank, and mobile collections by cashier or currency.", externalHref: "/reports/cash-collection" },
    ],
  },
  {
    key: "purchases-expenses",
    label: "Expenses",
    icon: ShoppingCart,
    reports: [
      { key: "expense-details", label: "Expense Details", category: "purchases-expenses", description: "List of all recorded business expenses including vendor and tax details.", endpoint: "expense-details" },
      { key: "expenses-by-category", label: "Expenses by Category", category: "purchases-expenses", description: "Visualize where money is spent by grouping expenses into categories.", endpoint: "expenses-by-category" },
    ],
  },
  {
    key: "taxes",
    label: "Taxes & Compliance",
    icon: Receipt,
    reports: [
      { key: "tax-summary", label: "Tax Summary", category: "taxes", description: "Summarize collected and paid sales taxes across categories for reporting.", endpoint: "tax-summary" },
      { key: "tax-zimra", label: "Tax & ZIMRA Report", category: "taxes", description: "Monitor ZIMRA fiscal submissions, signature statuses, and device reports.", externalHref: "/reports/tax" },
      { key: "vat-return", label: "VAT Returns", category: "taxes", description: "Generate localized tax calculation returns for revenue authority compliance.", externalHref: "/accounting/reports/vat-return" },
    ],
  },
  {
    key: "stock-management",
    label: "Stock Management",
    icon: Package,
    reports: [
      { key: "stock-alerts", label: "Low Stock Alerts", category: "stock-management", description: "Items at or below minimum threshold — reorder before you run out.", endpoint: "stock-alerts" },
      { key: "purchase-report", label: "Purchases Report", category: "stock-management", description: "Incoming stock purchases with supplier, quantity, unit cost, and total cost.", endpoint: "purchase-report" },
      { key: "profit-margins-product", label: "Profit Margins per Product", category: "stock-management", description: "Gross profit and margin percentage for each product sold in the period.", endpoint: "profit-margins" },
    ],
  },
  {
    key: "retail",
    label: "Retail & Inventory",
    icon: ShoppingBag,
    reports: [
      { key: "stock-on-hand", label: "Stock on Hand (Valuation)", category: "retail", description: "Current inventory levels, unit costs, pricing, and total stock valuation.", endpoint: "stock-on-hand" },
      { key: "inventory-movements", label: "Inventory Movements", category: "retail", description: "Trace full history of stock additions, sales, transfers, and adjustments.", endpoint: "inventory-movements" },
      { key: "stock-adjustments", label: "Stock Adjustments Report", category: "retail", description: "Audit physical stock adjustments, shrinkage, damages, and reasons.", externalHref: "/inventory/adjustments/report" },
      { key: "branch-performance", label: "Branch Performance", category: "retail", description: "Compare stock levels, sales velocity, and gross margins across branches.", externalHref: "/reports/branches" },
    ],
  },
  {
    key: "audit",
    label: "Audit & Safety",
    icon: ShieldCheck,
    reports: [
      { key: "audit-trail", label: "Posting Audit Trail", category: "audit", description: "Audit general ledger postings, trace transactions, and identify system creators.", externalHref: "/accounting/audit-trail" },
      { key: "zimra-logs", label: "ZIMRA Logs Audit", category: "audit", description: "Deep-dive technical logs of messages exchanged with ZIMRA servers.", externalHref: "/zimra-logs" },
    ],
  },
];

// ── Shared types ──────────────────────────────────────────────────────────────

interface DateRangeState {
  from: Date;
  to: Date;
}

interface ReportContentProps {
  reportKey: string;
  companyId: number;
  dateRange: DateRangeState;
  onDateRangeChange: (range: DateRangeState) => void;
  search: string;
  onSearchChange: (s: string) => void;
  hideZeroActivity?: boolean;
  onHideZeroActivityChange: (hide: boolean) => void;
  children?: React.ReactNode;
  // For StatBar
  totalAmount?: number;
  recordCount?: number;
  totalLabel?: string;
  // For CSV export
  csvData?: any[];
  csvColumns?: string[];
  csvFilename?: string;
  // Loading/error state
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

// ── ReportSidebar ─────────────────────────────────────────────────────────────

interface ReportSidebarProps {
  activeReport: string;
  onSelect: (key: string) => void;
  openCategories: Set<string>;
  onToggleCategory: (key: string) => void;
}

// ── ReportsOverview ──────────────────────────────────────────────────────────

interface ReportsOverviewProps {
  onSelectReport: (key: string) => void;
}

function ReportsOverview({ onSelectReport }: ReportsOverviewProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCategories = REPORT_CATEGORIES.map((category) => {
    const matchingReports = category.reports.filter(
      (r) =>
        r.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        category.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return { ...category, reports: matchingReports };
  }).filter((category) => category.reports.length > 0);

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Hero section */}
      <div className="px-8 py-8 border-b border-slate-100 bg-white relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-50 rounded-full blur-3xl opacity-60 -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-indigo-50 rounded-full blur-3xl opacity-40 pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unified Reports Hub</span>
            </div>
            <h1 className="text-2xl font-black font-display text-slate-800 tracking-tight">
              Reports &amp; Analytics
            </h1>
            <p className="text-sm text-slate-500 font-medium">
              Access comprehensive financial statements, transaction histories, inventory audits, and localized ZIMRA compliance reports from one single dashboard.
            </p>
          </div>

          <div className="relative w-full md:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search all reports by name or keyword..."
              className="pl-9 h-10 text-sm border-slate-200 rounded-xl focus-visible:ring-violet-500 shadow-sm w-full bg-white font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Grid view */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-12 h-12 text-slate-300 mb-3" />
            <p className="font-bold text-slate-600">No reports found</p>
            <p className="text-xs text-slate-400 mt-1">Try refining your search keyword or browse the categories</p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map((category) => {
              const CategoryIcon = category.icon;
              return (
                <div key={category.key} className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <div className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                      <CategoryIcon className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">
                      {category.label}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 ml-auto">
                      {category.reports.length} report{category.reports.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {category.reports.map((report) => {
                      const cardContent = (
                        <div className="flex flex-col h-full p-4 rounded-xl border border-slate-200/80 bg-white hover:border-violet-300 hover:shadow-md hover:shadow-violet-500/5 transition-all duration-200 group relative">
                          <div className="flex-1 space-y-1">
                            <h3 className="text-sm font-bold text-slate-800 group-hover:text-violet-700 transition-colors">
                              {report.label}
                            </h3>
                            <p className="text-xs text-slate-400 font-medium leading-relaxed">
                              {report.description}
                            </p>
                          </div>
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50 text-[10px] font-bold text-slate-400 shrink-0">
                            <span className="uppercase tracking-widest text-[9px] px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-slate-505">
                              {category.label.split(" ")[0]}
                            </span>
                            <div className="flex items-center gap-1 text-slate-450 group-hover:text-violet-600 transition-colors">
                              <span>Open</span>
                              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </div>
                      );

                      if (report.externalHref) {
                        return (
                          <Link key={report.key} href={report.externalHref} className="h-full block">
                            {cardContent}
                          </Link>
                        );
                      }

                      return (
                        <div
                          key={report.key}
                          onClick={() => onSelectReport(report.key)}
                          className="cursor-pointer h-full"
                        >
                          {cardContent}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ReportSidebar ─────────────────────────────────────────────────────────────

interface ReportSidebarProps {
  activeReport: string;
  onSelect: (key: string) => void;
  openCategories: Set<string>;
  onToggleCategory: (key: string) => void;
}

function ReportSidebar({ activeReport, onSelect, openCategories, onToggleCategory }: ReportSidebarProps) {
  return (
    <div className="sticky top-[88px] flex h-[calc(100vh-96px)] w-72 shrink-0 flex-col overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-slate-100 shrink-0 flex items-center justify-between">
        <span className="text-base font-black text-slate-800 uppercase tracking-tight">Reports Hub</span>
      </div>

      {/* Overview Dashboard Button */}
      <div className="px-2 pt-2 shrink-0">
        <div
          className={cn(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-bold transition-all duration-150 cursor-pointer select-none",
            activeReport === "overview"
              ? "bg-violet-600 text-white shadow-sm shadow-violet-500/20"
              : "text-slate-600 hover:text-slate-800 hover:bg-slate-50"
          )}
          onClick={() => onSelect("overview")}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>Overview Dashboard</span>
        </div>
      </div>

      {/* Category groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {REPORT_CATEGORIES.map((category) => {
          const isOpen = openCategories.has(category.key);
          const CategoryIcon = category.icon;

          return (
            <Collapsible
              key={category.key}
              open={isOpen}
              onOpenChange={() => onToggleCategory(category.key)}
              className="mb-0.5"
            >
              <CollapsibleTrigger asChild>
                <div className={cn(
                  "flex items-center justify-between w-full px-3 py-2.5 text-base font-semibold transition-all duration-200 cursor-pointer select-none group",
                  category.reports.some(r => r.key === activeReport)
                    ? "text-violet-700 bg-violet-50"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                )}>
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
                      category.reports.some(r => r.key === activeReport)
                        ? "bg-violet-100 text-violet-600"
                        : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
                    )}>
                      <CategoryIcon className="w-5 h-5" />
                    </div>
                    <span className="text-base tracking-tight">{category.label}</span>
                  </div>
                  <ChevronDown className={cn(
                    "w-5 h-5 transition-transform duration-200 shrink-0",
                    isOpen ? "rotate-180 text-violet-400" : "text-slate-300"
                  )} />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="ml-3 pl-3 border-l-2 border-slate-100 space-y-0.5 mt-0.5 pb-1">
                  {category.reports.map((report) => {
                    const isActive = report.key === activeReport;

                    if (report.externalHref) {
                      return (
                        <Link key={report.key} href={report.externalHref} className="block">
                          <div className={cn(
                            "flex items-center gap-2 px-3 py-2.5 rounded-lg text-base font-semibold transition-all duration-150 cursor-pointer",
                            isActive
                              ? "bg-violet-600 text-white shadow-sm shadow-violet-500/20"
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                          )}>
                            <span className="truncate">{report.label}</span>
                          </div>
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={report.key}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg text-base font-semibold transition-all duration-150 cursor-pointer",
                          isActive
                            ? "bg-violet-600 text-white shadow-sm shadow-violet-500/20"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                        )}
                        onClick={() => onSelect(report.key)}
                      >
                        <span className="truncate">{report.label}</span>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

// ── ReportContent ─────────────────────────────────────────────────────────────

function ReportContent({
  reportKey,
  companyId,
  dateRange,
  onDateRangeChange,
  search,
  onSearchChange,
  hideZeroActivity,
  onHideZeroActivityChange,
  children,
  totalAmount,
  recordCount,
  totalLabel = "Total",
  csvData,
  csvColumns,
  csvFilename,
  isLoading,
  error,
  onRetry,
}: ReportContentProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleQuickSelect = (preset: "this-month" | "last-month" | "this-quarter" | "all-time") => {
    const now = new Date();
    switch (preset) {
      case "this-month":
        onDateRangeChange({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case "last-month": {
        const last = subMonths(now, 1);
        onDateRangeChange({ from: startOfMonth(last), to: endOfMonth(last) });
        break;
      }
      case "this-quarter":
        onDateRangeChange({ from: startOfQuarter(now), to: endOfQuarter(now) });
        break;
      case "all-time":
        onDateRangeChange({ from: new Date("2000-01-01"), to: new Date("2099-12-31") });
        break;
    }
  };

  const handleExport = () => {
    if (!csvData || !csvColumns || !csvFilename) return;
    const csv = generateCsv(csvData, csvColumns);
    downloadCsv(csvFilename, csv);
  };

  const calendarRange: DateRange = { from: dateRange.from, to: dateRange.to };

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-100 bg-white shrink-0">
        {/* Date range picker */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 px-3 text-sm gap-1.5 border-slate-200 rounded-lg font-medium",
                calendarOpen && "border-violet-300 bg-violet-50 text-violet-700"
              )}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              {isValid(dateRange.from) && isValid(dateRange.to)
                ? `${format(dateRange.from, "dd MMM yyyy")} – ${format(dateRange.to, "dd MMM yyyy")}`
                : "Select date range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-2xl shadow-2xl" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange.from}
              selected={calendarRange}
              onSelect={(r) => {
                if (r?.from && r?.to) {
                  onDateRangeChange({ from: r.from, to: r.to });
                  setCalendarOpen(false);
                } else if (r?.from) {
                  onDateRangeChange({ from: r.from, to: r.from });
                }
              }}
              numberOfMonths={2}
              className="p-3"
            />
          </PopoverContent>
        </Popover>

        {/* Quick-select buttons */}
        <div className="flex gap-1">
          {(["this-month", "last-month", "this-quarter", "all-time"] as const).map((preset) => (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-sm font-semibold text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg capitalize"
              onClick={() => handleQuickSelect(preset)}
            >
              {preset === "this-month" ? "This Month" : preset === "last-month" ? "Last Month" : preset === "this-quarter" ? "This Quarter" : "All Time"}
            </Button>
          ))}
        </div>

        {/* Empty records toggle */}
        <div className="flex items-center gap-2 select-none border-l border-slate-200 pl-4 py-1">
          <input
            type="checkbox"
            id="hide-zero"
            checked={hideZeroActivity}
            onChange={(e) => onHideZeroActivityChange(e.target.checked)}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-4 w-4 cursor-pointer"
          />
          <label htmlFor="hide-zero" className="text-xs font-semibold text-slate-500 cursor-pointer">
            Hide empty records
          </label>
        </div>

        <div className="flex-1" />

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Search..."
            className="pl-8 h-9 text-sm border-slate-200 rounded-lg w-56"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-sm gap-1.5 border-slate-200 rounded-lg"
          disabled={!csvData || csvData.length === 0}
          onClick={handleExport}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Stat bar */}
      {(totalAmount !== undefined || recordCount !== undefined) && (
        <div className="flex items-center gap-6 px-6 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
          {totalAmount !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{totalLabel}</span>
              <span className="text-base font-black text-slate-800">{totalAmount.toFixed(2)}</span>
            </div>
          )}
          {recordCount !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Records</span>
              <span className="text-base font-black text-slate-800">{recordCount}</span>
            </div>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <span className="text-sm font-medium">Loading report...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
            <p className="text-sm font-medium text-red-500">Failed to load report</p>
            <p className="text-xs text-slate-400">{error.message}</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={onRetry}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ── ActiveReportComponent ─────────────────────────────────────────────────────

function ActiveReportComponent({ reportKey, companyId, dateRange, search, hideZeroActivity }: {
  reportKey: string;
  companyId: number;
  dateRange: { from: Date; to: Date };
  search: string;
  hideZeroActivity?: boolean;
}) {
  const props = { companyId, dateRange, search, hideZeroActivity };
  switch (reportKey) {
    case "sales": return <SalesReport {...props} />;
    case "sales-by-customer": return <SalesByCustomerReport {...props} />;
    case "sales-by-item": return <SalesByItemReport {...props} />;
    case "ar-aging-summary": return <ArAgingSummaryReport {...props} />;
    case "invoice-details": return <InvoiceDetailsReport {...props} />;
    case "customer-balance-summary": return <CustomerBalanceSummaryReport {...props} />;
    case "receivable-details": return <ReceivableDetailsReport {...props} />;
    case "cash-collection": return <CashCollectionReport {...props} />;
    case "payments-received": return <PaymentsReceivedReport {...props} />;
    case "expense-details": return <ExpenseDetailsReport {...props} />;
    case "expenses-by-category": return <ExpensesByCategoryReport {...props} />;
    case "tax-summary": return <TaxSummaryReport {...props} />;
    case "operational-daily": return <DailyOperationalReport {...props} />;
    case "operational-weekly": return <WeeklyOperationalReport {...props} />;
    case "operational-monthly": return <MonthlyOperationalReport {...props} />;
    case "stock-movement": return <StockMovementReport {...props} />;
    case "purchase-report": return <PurchaseHistoryReport {...props} />;
    case "profit-margins-product": return <ProductProfitMarginsReport {...props} />;
    case "stock-alerts": return <InventoryHealthReport {...props} />;
    case "stock-on-hand": return <StockOnHandReport {...props} />;
    case "inventory-movements": return <InventoryMovementsReport {...props} />;
    default: return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <p className="text-sm">Select a report from the sidebar</p>
      </div>
    );
  }
}

// ── ReportsPage ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [match, params] = useRoute("/reports/:reportKey");
  const [, setLocation] = useLocation();
  const reportKeyFromRoute = params?.reportKey || "overview";

  const { user } = useAuth();
  const { activeCompanyId, isLoading } = useActiveCompany(!!user);

  const activeReport = reportKeyFromRoute;

  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(["operational", "financials", "sales", "receivables", "payments-received", "stock-management"])
  );
  const [dateRange, setDateRange] = useState<DateRangeState>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [search, setSearch] = useState("");
  const [hideZeroActivity, setHideZeroActivity] = useState(true);

  useEffect(() => {
    if (activeReport && activeReport !== "overview") {
      const category = REPORT_CATEGORIES.find(c => c.reports.some(r => r.key === activeReport));
      if (category) {
        setOpenCategories((prev) => {
          if (prev.has(category.key)) return prev;
          const next = new Set(prev);
          next.add(category.key);
          return next;
        });
      }
    }
  }, [activeReport]);

  const handleToggleCategory = (key: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectReport = (key: string) => {
    setLocation(key === "overview" ? "/reports" : `/reports/${key}`);
    // Auto-expand the category containing this report
    const category = REPORT_CATEGORIES.find(c => c.reports.some(r => r.key === key));
    if (category) {
      setOpenCategories(prev => new Set([...prev, category.key]));
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-slate-400">
          Loading...
        </div>
      </Layout>
    );
  }

  if (!activeCompanyId) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500 font-medium">Please select a company to view reports</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <style>{`
        .reports-workspace table {
          font-size: 0.875rem;
        }
        .reports-workspace th {
          font-size: 0.75rem !important;
        }
        .reports-workspace td {
          font-size: 0.875rem !important;
        }
        .reports-workspace .text-xs,
        .reports-workspace .text-\\[11px\\],
        .reports-workspace .text-\\[12px\\] {
          font-size: 0.875rem !important;
          line-height: 1.35rem !important;
        }
        .reports-workspace .text-\\[10px\\] {
          font-size: 0.75rem !important;
          line-height: 1rem !important;
        }
      `}</style>
      <div className="reports-workspace flex flex-col lg:flex-row gap-4">
        {/* Mobile Select Navigation */}
        <div className="lg:hidden w-full bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm shrink-0 z-10 sticky top-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 py-1 mb-1.5">Reports Menu</h4>
          <select 
            value={activeReport} 
            onChange={(e) => handleSelectReport(e.target.value)}
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-sm"
          >
            <option value="overview">Overview Dashboard</option>
            {REPORT_CATEGORIES.map((category) => (
              <optgroup key={category.key} label={category.label}>
                {category.reports.map((report) => (
                  <option key={report.key} value={report.key}>
                    {report.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Left: Report Sidebar */}
        <div className="hidden lg:block shrink-0">
          <ReportSidebar
            activeReport={activeReport}
            onSelect={handleSelectReport}
            openCategories={openCategories}
            onToggleCategory={handleToggleCategory}
          />
        </div>

        {/* Right: Report Content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {activeReport === "overview" ? (
            <ReportsOverview onSelectReport={handleSelectReport} />
          ) : !activeReport ? (
            <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium text-slate-500">Select a report from the sidebar</p>
                <p className="text-sm text-slate-400 mt-1">Choose a category and report to get started</p>
              </div>
            </div>
          ) : (
            <ReportContent
              reportKey={activeReport}
              companyId={activeCompanyId}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              search={search}
              onSearchChange={setSearch}
              hideZeroActivity={hideZeroActivity}
              onHideZeroActivityChange={setHideZeroActivity}
            >
              <ActiveReportComponent
                reportKey={activeReport}
                companyId={activeCompanyId}
                dateRange={dateRange}
                search={search}
                hideZeroActivity={hideZeroActivity}
              />
            </ReportContent>
          )}
        </div>
      </div>
    </Layout>
  );
}
