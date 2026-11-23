import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  format,
  isValid,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileText,
  LayoutDashboard,
  Loader2,
  MonitorCheck,
  Package,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Layout } from "@/components/layout";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import {
  SalesByCategoryChart,
  SalesByPaymentMethodChart,
} from "@/components/charts/sales-charts";
import {
  SalesByCustomerReport,
  SalesByItemReport,
  SalesReport,
} from "@/components/reports/sales-reports";
import { ProductProfitMarginsReport } from "@/components/reports/operational-reports";
import {
  ReportExportContext,
  type ReportExportDef,
  useReportExport,
} from "@/components/reports/report-export";
import { downloadCsv, generateCsv, generateCsvFilename } from "@/lib/report-utils";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-companies";

interface DateRangeState {
  from: Date;
  to: Date;
}

interface SalesReportComponentProps {
  companyId: number;
  dateRange: DateRangeState;
  search: string;
  hideZeroActivity: boolean;
}

interface SalesNavItem {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  internal?: boolean;
}

const ANALYSIS_REPORTS: SalesNavItem[] = [
  {
    key: "summary",
    label: "Sales Summary",
    description: "Daily revenue, invoices, tax and net sales.",
    href: "/sales-reports/summary",
    icon: BarChart3,
    internal: true,
  },
  {
    key: "customers",
    label: "Sales by Customer",
    description: "Revenue and invoice counts by customer.",
    href: "/sales-reports/customers",
    icon: Users,
    internal: true,
  },
  {
    key: "items",
    label: "Sales by Item",
    description: "Quantity and revenue by product or service.",
    href: "/sales-reports/items",
    icon: Package,
    internal: true,
  },
  {
    key: "profitability",
    label: "Product Profitability",
    description: "Gross profit and margin per product sold.",
    href: "/sales-reports/profitability",
    icon: CircleDollarSign,
    internal: true,
  },
];

const SALES_WORKFLOWS: SalesNavItem[] = [
  {
    key: "daily",
    label: "Daily Sales Ledger",
    description: "Invoice-level sales ledger with payment methods.",
    href: "/reports/daily",
    icon: CalendarDays,
  },
  {
    key: "orders",
    label: "Order Reports",
    description: "Preorders, lay-bys and bundle orders.",
    href: "/sales-order-reports",
    icon: ClipboardList,
  },
  {
    key: "pos",
    label: "POS Reports",
    description: "Till closures, Z-reports and cashier shifts.",
    href: "/reports/pos",
    icon: MonitorCheck,
  },
  {
    key: "statements",
    label: "Customer Statements",
    description: "Printable customer account statements.",
    href: "/reports/customer-statements",
    icon: FileText,
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Open, issue and reconcile sales invoices.",
    href: "/invoices",
    icon: Receipt,
  },
  {
    key: "quotations",
    label: "Quotations",
    description: "Review and approve customer quotations.",
    href: "/quotations",
    icon: FileText,
  },
  {
    key: "partnerships",
    label: "Partnership Sales",
    description: "Partner revenue share and commissions.",
    href: "/reports/partnership-sales",
    icon: Users,
  },
];

function reportUrl(
  companyId: number,
  endpoint: string,
  dateRange: DateRangeState,
) {
  return `/api/companies/${companyId}/reports/${endpoint}?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
}

function useSalesReportData(
  companyId: number,
  endpoint: string,
  dateRange: DateRangeState,
) {
  return useQuery<any[]>({
    queryKey: [`reports/${endpoint}`, companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(reportUrl(companyId, endpoint, dateRange));
      if (!res.ok) throw new Error(`Failed to load ${endpoint}`);
      return res.json();
    },
    enabled: !!companyId,
  });
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sumByCurrency(rows: any[], field: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = String(row.currency || "USD");
    totals.set(currency, (totals.get(currency) || 0) + toNumber(row[field]));
  }
  return totals;
}

function countByCurrency(rows: any[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const currency = String(row.currency || "USD");
    counts.set(currency, (counts.get(currency) || 0) + toNumber(row.invoiceCount));
  }
  return counts;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyMap(values: Map<string, number>) {
  if (values.size === 0) return "—";
  return Array.from(values.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${currency} ${formatNumber(amount)}`)
    .join(" · ");
}

function SalesToolbar({
  dateRange,
  onDateRangeChange,
  search,
  onSearchChange,
  hideZeroActivity,
  onHideZeroActivityChange,
  onExport,
}: {
  dateRange: DateRangeState;
  onDateRangeChange: (range: DateRangeState) => void;
  search: string;
  onSearchChange: (value: string) => void;
  hideZeroActivity: boolean;
  onHideZeroActivityChange: (value: boolean) => void;
  onExport: () => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const quickSelect = (
    preset: "this-month" | "last-month" | "this-quarter" | "all-time",
  ) => {
    const now = new Date();
    if (preset === "this-month") {
      onDateRangeChange({ from: startOfMonth(now), to: endOfMonth(now) });
    } else if (preset === "last-month") {
      const last = subMonths(now, 1);
      onDateRangeChange({ from: startOfMonth(last), to: endOfMonth(last) });
    } else if (preset === "this-quarter") {
      onDateRangeChange({ from: startOfQuarter(now), to: endOfQuarter(now) });
    } else {
      onDateRangeChange({
        from: new Date("2000-01-01"),
        to: new Date("2099-12-31"),
      });
    }
  };

  const selectedRange: DateRange = {
    from: dateRange.from,
    to: dateRange.to,
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-5 py-3">
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 gap-1.5 rounded-lg border-slate-200 px-3 text-sm font-medium",
              calendarOpen && "border-indigo-300 bg-indigo-50 text-indigo-700",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {isValid(dateRange.from) && isValid(dateRange.to)
              ? `${format(dateRange.from, "dd MMM yyyy")} – ${format(dateRange.to, "dd MMM yyyy")}`
              : "Select date range"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-2xl p-0 shadow-2xl" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange.from}
            selected={selectedRange}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onDateRangeChange({ from: range.from, to: range.to });
                setCalendarOpen(false);
              } else if (range?.from) {
                onDateRangeChange({ from: range.from, to: range.from });
              }
            }}
            numberOfMonths={2}
            className="p-3"
          />
        </PopoverContent>
      </Popover>

      <div className="flex gap-1">
        {(
          [
            ["this-month", "This Month"],
            ["last-month", "Last Month"],
            ["this-quarter", "This Quarter"],
            ["all-time", "All Time"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant="ghost"
            size="sm"
            className="h-9 rounded-lg px-2.5 text-xs font-semibold text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
            onClick={() => quickSelect(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <label className="flex cursor-pointer items-center gap-2 border-l border-slate-200 py-1 pl-4 text-xs font-semibold text-slate-500">
        <input
          type="checkbox"
          checked={hideZeroActivity}
          onChange={(event) => onHideZeroActivityChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        Hide empty records
      </label>

      <div className="flex-1" />

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-9 w-52 rounded-lg border-slate-200 pl-8 text-sm"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 rounded-lg border-slate-200 px-3 text-sm"
        onClick={onExport}
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
    </div>
  );
}

function SalesSidebar({ activeReport }: { activeReport: string }) {
  return (
    <div className="sticky top-[88px] flex h-[calc(100vh-96px)] w-72 shrink-0 flex-col overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <span className="text-base font-black uppercase tracking-tight text-slate-800">
          Sales Reports
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <Link href="/sales-reports" className="block px-2 pb-2">
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
              activeReport === "overview"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800",
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span>Dashboard</span>
          </div>
        </Link>

        <p className="px-5 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Analysis
        </p>
        {ANALYSIS_REPORTS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} className="block px-2">
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                  activeReport === item.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
            </Link>
          );
        })}

        <p className="px-5 pb-1 pt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Sales workflows
        </p>
        {SALES_WORKFLOWS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} className="block px-2">
              <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MiniRankingTable({
  title,
  rows,
  labelKey,
  valueKey,
  countKey,
  countLabel,
  href,
}: {
  title: string;
  rows: any[];
  labelKey: string;
  valueKey: string;
  countKey: string;
  countLabel: string;
  href: string;
}) {
  return (
    <Card className="border-none shadow-sm ring-1 ring-slate-100">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-bold text-slate-800">{title}</CardTitle>
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            No sales in this period
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-2">Name</th>
                <th className="py-2 text-right">{countLabel}</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, index) => (
                <tr key={index} className="border-b border-slate-50 last:border-none">
                  <td className="py-2 pr-2 font-medium text-slate-700">
                    {String(row[labelKey] || "Unknown")}
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {formatNumber(toNumber(row[countKey]))}
                  </td>
                  <td className="py-2 text-right font-bold text-slate-800">
                    {String(row.currency || "USD")} {formatNumber(toNumber(row[valueKey]))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function SalesDashboardOverview({
  companyId,
  dateRange,
  search,
  hideZeroActivity,
  companyCurrency,
}: SalesReportComponentProps & { companyCurrency: string }) {
  const summaryQuery = useSalesReportData(companyId, "sales-summary", dateRange);
  const customerQuery = useSalesReportData(companyId, "sales-by-customer", dateRange);
  const itemQuery = useSalesReportData(companyId, "sales-by-item", dateRange);

  const summaryRows = summaryQuery.data || [];
  const customerRows = customerQuery.data || [];
  const itemRows = itemQuery.data || [];

  const revenueByCurrency = useMemo(
    () => sumByCurrency(summaryRows, "total"),
    [summaryRows],
  );
  const taxByCurrency = useMemo(
    () => sumByCurrency(summaryRows, "taxAmount"),
    [summaryRows],
  );
  const invoiceCounts = useMemo(() => countByCurrency(summaryRows), [summaryRows]);
  const invoiceCount = Array.from(invoiceCounts.values()).reduce((a, b) => a + b, 0);
  const activeCustomers = customerRows.filter(
    (row) => toNumber(row.invoiceCount) > 0,
  ).length;
  const topItem = [...itemRows].sort(
    (a, b) => toNumber(b.revenue) - toNumber(a.revenue),
  )[0];

  const averageByCurrency = useMemo(() => {
    const averages = new Map<string, number>();
    for (const [currency, total] of revenueByCurrency.entries()) {
      const count = invoiceCounts.get(currency) || 0;
      averages.set(currency, count > 0 ? total / count : 0);
    }
    return averages;
  }, [invoiceCounts, revenueByCurrency]);

  const matchesSearch = (value: unknown) =>
    String(value || "").toLowerCase().includes(search.toLowerCase());

  const filteredSummaryRows = summaryRows.filter(
    (row) =>
      matchesSearch(row.date) &&
      (!hideZeroActivity || toNumber(row.invoiceCount) > 0),
  );
  const filteredCustomers = customerRows.filter(
    (row) =>
      matchesSearch(row.customerName) &&
      (!hideZeroActivity || toNumber(row.invoiceCount) > 0),
  );
  const filteredItems = itemRows.filter(
    (row) =>
      matchesSearch(row.description) &&
      (!hideZeroActivity || toNumber(row.quantitySold) > 0),
  );

  useReportExport(() => ({
    label: "sales-dashboard",
    columns: [
      { key: "date", header: "Date" },
      { key: "invoiceCount", header: "Invoices" },
      { key: "currency", header: "Currency" },
      { key: "subtotal", header: "Subtotal" },
      { key: "taxAmount", header: "Tax" },
      { key: "total", header: "Total" },
    ],
    rows: filteredSummaryRows,
  }));

  const isLoading = summaryQuery.isLoading || customerQuery.isLoading || itemQuery.isLoading;
  const hasError = summaryQuery.isError || customerQuery.isError || itemQuery.isError;

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
            Sales performance
          </p>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">
            Sales Dashboard
          </h2>
          <p className="text-sm text-slate-500">
            Revenue, customers and product performance for the selected period.
          </p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading sales data…
          </div>
        )}
      </div>

      {hasError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          Some sales reports could not be loaded. Check your connection and try again.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard
          label="Net sales"
          value={formatCurrencyMap(revenueByCurrency)}
          valueClassName="text-lg"
          icon={CircleDollarSign}
          tone="emerald"
        />
        <SummaryStatCard
          label="Invoices"
          value={formatNumber(invoiceCount)}
          icon={FileText}
          tone="blue"
        />
        <SummaryStatCard
          label="Active customers"
          value={formatNumber(activeCustomers)}
          icon={Users}
          tone="violet"
        />
        <SummaryStatCard
          label="Top product"
          value={topItem ? String(topItem.description || "—") : "—"}
          valueClassName="text-lg"
          icon={Package}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard
          label="Sales tax"
          value={formatCurrencyMap(taxByCurrency)}
          valueClassName="text-lg"
          icon={Receipt}
          tone="slate"
        />
        <SummaryStatCard
          label="Average invoice"
          value={formatCurrencyMap(averageByCurrency)}
          valueClassName="text-lg"
          icon={BarChart3}
          tone="slate"
        />
        <SummaryStatCard
          label="Top product revenue"
          value={
            topItem
              ? `${String(topItem.currency || "USD")} ${formatNumber(toNumber(topItem.revenue))}`
              : "—"
          }
          valueClassName="text-lg"
          icon={CircleDollarSign}
          tone="emerald"
        />
        <SummaryStatCard
          label="Reporting currency"
          value={companyCurrency || "USD"}
          icon={LayoutDashboard}
          tone="slate"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SalesByCategoryChart
          companyId={companyId}
          dateRange={dateRange}
          consolidatedSymbol={`${companyCurrency || "USD"} `}
          consolidatedRate={1}
        />
        <SalesByPaymentMethodChart
          companyId={companyId}
          dateRange={dateRange}
          consolidatedSymbol={`${companyCurrency || "USD"} `}
          consolidatedRate={1}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniRankingTable
          title="Top customers"
          rows={filteredCustomers}
          labelKey="customerName"
          valueKey="total"
          countKey="invoiceCount"
          countLabel="Invoices"
          href="/sales-reports/customers"
        />
        <MiniRankingTable
          title="Top items"
          rows={filteredItems}
          labelKey="description"
          valueKey="revenue"
          countKey="quantitySold"
          countLabel="Qty"
          href="/sales-reports/items"
        />
      </div>

      <Card className="border-none shadow-sm ring-1 ring-slate-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-slate-800">
            Open a sales workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SALES_WORKFLOWS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-700">
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ActiveSalesReport({
  activeReport,
  props,
  companyCurrency,
}: {
  activeReport: string;
  props: SalesReportComponentProps;
  companyCurrency: string;
}) {
  switch (activeReport) {
    case "summary":
      return <SalesReport {...props} />;
    case "customers":
      return <SalesByCustomerReport {...props} />;
    case "items":
      return <SalesByItemReport {...props} />;
    case "profitability":
      return <ProductProfitMarginsReport {...props} />;
    default:
      return (
        <SalesDashboardOverview {...props} companyCurrency={companyCurrency} />
      );
  }
}

export default function SalesReportsDashboardPage() {
  const [, params] = useRoute("/sales-reports/:reportKey");
  const [, setLocation] = useLocation();
  const activeReport = params?.reportKey || "overview";

  const { user } = useAuth();
  const { activeCompanyId, isLoading } = useActiveCompany(!!user);
  const { data: company } = useCompany(activeCompanyId || 0);
  const companyCurrency = String((company as any)?.currency || "USD");

  const [dateRange, setDateRange] = useState<DateRangeState>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [search, setSearch] = useState("");
  const [hideZeroActivity, setHideZeroActivity] = useState(true);

  const exportBuilder = useRef<{
    reportKey: string;
    build: () => ReportExportDef;
  } | null>(null);
  const exportContext = useMemo(
    () => ({
      register: (build: () => ReportExportDef) => {
        exportBuilder.current = { reportKey: activeReport, build };
      },
    }),
    [activeReport],
  );

  const handleExport = () => {
    const entry = exportBuilder.current;
    if (!entry || entry.reportKey !== activeReport) return;
    const { rows, columns, label } = entry.build();
    if (rows.length === 0) return;
    downloadCsv(
      generateCsvFilename(label, dateRange.from, dateRange.to),
      generateCsv(rows, columns),
    );
  };

  useEffect(() => {
    setSearch("");
  }, [activeReport]);

  if (isLoading) {
    return (
      <Layout>
        <PageSkeleton />
      </Layout>
    );
  }

  if (!activeCompanyId) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <p className="font-medium text-slate-500">
            Please select a company to view sales reports
          </p>
        </div>
      </Layout>
    );
  }

  const reportProps: SalesReportComponentProps = {
    companyId: activeCompanyId,
    dateRange,
    search,
    hideZeroActivity,
  };

  return (
    <Layout>
      <style>{`
        .sales-reports-workspace table { font-size: 0.875rem; }
        .sales-reports-workspace th { font-size: 0.75rem !important; }
        .sales-reports-workspace td { font-size: 0.875rem !important; }
      `}</style>
      <div className="sales-reports-workspace flex flex-col gap-4 lg:flex-row">
        <div className="lg:hidden">
          <select
            value={activeReport}
            onChange={(event) =>
              setLocation(
                event.target.value === "overview"
                  ? "/sales-reports"
                  : `/sales-reports/${event.target.value}`,
              )
            }
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="overview">Dashboard</option>
            {ANALYSIS_REPORTS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden lg:block">
          <SalesSidebar activeReport={activeReport} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
          <SalesToolbar
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            search={search}
            onSearchChange={setSearch}
            hideZeroActivity={hideZeroActivity}
            onHideZeroActivityChange={setHideZeroActivity}
            onExport={handleExport}
          />
          <div className="flex-1 overflow-auto">
            <ReportExportContext.Provider value={exportContext}>
              <ActiveSalesReport
                activeReport={activeReport}
                props={reportProps}
                companyCurrency={companyCurrency}
              />
            </ReportExportContext.Provider>
          </div>
        </div>
      </div>
    </Layout>
  );
}
