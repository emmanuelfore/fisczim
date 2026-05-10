import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { useInvoices } from "@/hooks/use-invoices";
import { useProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
import { useDeviceStatus } from "@/hooks/use-device-status";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { buildUrl, api } from "@shared/routes";
import {
  ArrowUp,
  CheckCircle2,
  Cloud,
  Package,
  AlertTriangle,
  TriangleAlert,
  Users,
  ArrowRight,
  Banknote,
} from "lucide-react";
import { Link } from "wouter";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PAYMENT_COLORS: Record<string, string> = {
  CASH: "#2563EB",
  CARD: "#0EA5B7",
  MOBILE_PAYMENT: "#F59E0B",
  BANK_TRANSFER: "#84CC16",
  OTHER: "#8B5CF6",
};

function currency(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);
}

function formatStatus(invoice: any): "FISCALIZED" | "PENDING" | "FAILED" {
  const fdms = String(invoice?.fdmsStatus || "").toLowerCase();
  if (invoice?.syncedWithFdms || fdms === "fiscalized") return "FISCALIZED";
  if (fdms === "failed") return "FAILED";
  return "PENDING";
}

export default function Dashboard() {
  const { activeCompany } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const companyId = activeCompany?.id || 0;

  const { data: invoicesResult } = useInvoices(companyId, { limit: 6, branchId: selectedBranchId || undefined });
  const invoices = (Array.isArray((invoicesResult as any)?.data) ? (invoicesResult as any).data : []) as any[];
  const invoicesTotal = Number((invoicesResult as any)?.total || invoices.length || 0);

  const { data: products = [] } = useProducts(companyId, selectedBranchId || undefined);
  const { data: customers = [] } = useCustomers(companyId);
  const { data: deviceStatus } = useDeviceStatus(companyId);

  const { data: operationalMetrics } = useQuery<any>({
    queryKey: [api.reports.operationalMetrics.path, companyId],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.operationalMetrics.path, { companyId }));
      if (!res.ok) return null;
      return await res.json();
    },
    enabled: !!companyId,
  });

  const { data: revenueData = [] } = useQuery<any[]>({
    queryKey: [api.reports.revenueChart.path, companyId],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.revenueChart.path, { id: companyId }));
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!companyId,
  });

  const { data: paymentDataRaw = [] } = useQuery<any[]>({
    queryKey: ["sales-by-payment-method-dashboard", companyId],
    queryFn: async () => {
      const now = new Date();
      const start = new Date();
      start.setDate(now.getDate() - 6);
      const params = new URLSearchParams({
        startDate: start.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      });
      const res = await apiFetch(`/api/reports/charts/sales-by-payment-method/${companyId}?${params.toString()}`);
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!companyId,
  });

  const { data: abcAnalysis = [] } = useQuery<any[]>({
    queryKey: ["abc-analysis-dashboard", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/reports/abc-analysis`);
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!companyId,
  });

  const { data: stockAlerts = [] } = useQuery<any[]>({
    queryKey: [api.reports.stockAlerts.path, companyId],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(api.reports.stockAlerts.path, { companyId }));
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!companyId,
  });
  const { data: cashCollectionBalances = [] } = useQuery<any[]>({
    queryKey: ["dashboard-cash-collection-balances", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/reports/cash-collection-balances`);
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!companyId,
  });

  const paymentData = paymentDataRaw.map((row: any) => {
    const rawName = String(row.method || "OTHER").toUpperCase();
    return {
      name: rawName.replace(/\s+/g, "_"),
      label: rawName.replace(/_/g, " "),
      value: Number(row.total || 0),
    };
  });
  const paymentTotal = paymentData.reduce((acc, p) => acc + p.value, 0);

  const totalSales = Number(operationalMetrics?.totalRevenue || 0);
  const vatCollected = invoices.reduce((acc, inv) => acc + Number(inv.taxAmount || 0), 0);
  const connected = Boolean(deviceStatus?.isConfigured && deviceStatus?.isOnline);
  const lowStockCount = stockAlerts.filter((x: any) => Number(x?.stockLevel || 0) > 0).length;
  const outOfStockCount = stockAlerts.filter((x: any) => Number(x?.stockLevel || 0) <= 0).length;
  const expectedCashCollections = cashCollectionBalances.reduce((sum: number, row: any) => sum + Number(row.expectedCash || 0), 0);

  if (!activeCompany) {
    return (
      <Layout>
        <div className="min-h-[420px] rounded-2xl border border-[#E5E7EB] bg-white p-10 flex flex-col items-center justify-center text-center">
          <h2 className="text-xl font-bold text-[#071437]">No company selected</h2>
          <p className="text-sm text-[#64748B] mt-2">Select or create a business to load dashboard metrics.</p>
          <Link href="/onboarding">
            <Button className="mt-6 h-11 rounded-[10px] bg-[#155EEF] hover:bg-[#1D4ED8]">Setup Business</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="-mt-1 space-y-4">
          <section className="mt-0 mb-0 flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/reports/cash-collection">
                <Button variant="outline" className="h-10 rounded-[10px] border-[#E5E7EB] text-[#334155] font-semibold text-sm">
                  <Banknote className="w-4 h-4 mr-2" />
                  Collect Cash
                </Button>
              </Link>
              <Link href="/invoices/new">
                <Button className="h-10 w-[148px] rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-sm">
                  Create Invoice
                </Button>
              </Link>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-[#64748B]">Total Sales</p>
              <div className="flex items-center gap-2">
                <svg width="56" height="20" viewBox="0 0 56 20" fill="none" aria-hidden="true">
                  <path d="M1 14L10 10L19 12L28 7L37 9L46 4L55 6" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="h-9 w-9 rounded-[10px] bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#1D4ED8] text-sm font-extrabold">$</div>
              </div>
            </div>
            <p className="mt-3 text-[26px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{currency(totalSales)}</p>
            <p className="mt-3 text-sm text-[#16A34A] font-semibold inline-flex items-center gap-1"><ArrowUp className="w-3 h-3" /> 18.7% vs last week</p>
          </div>

            <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-[#64748B]">Invoices Issued</p>
              <div className="flex items-center gap-2">
                <svg width="56" height="20" viewBox="0 0 56 20" fill="none" aria-hidden="true">
                  <path d="M1 13L10 11L19 8L28 10L37 7L46 5L55 3" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="h-9 w-9 rounded-[10px] bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#1D4ED8] text-sm font-extrabold">#</div>
              </div>
            </div>
            <p className="mt-3 text-[26px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{invoicesTotal.toLocaleString()}</p>
            <p className="mt-3 text-sm text-[#16A34A] font-semibold inline-flex items-center gap-1"><ArrowUp className="w-3 h-3" /> 15.3% vs last week</p>
          </div>

            <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-[#64748B]">VAT Collected</p>
              <div className="h-9 w-9 rounded-[10px] bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#1D4ED8] text-sm font-extrabold">%</div>
            </div>
            <p className="mt-3 text-[26px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{currency(vatCollected)}</p>
            <p className="mt-3 text-sm text-[#16A34A] font-semibold inline-flex items-center gap-1"><ArrowUp className="w-3 h-3" /> 12.5% vs last week</p>
          </div>

            <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-[#64748B]">FDMS Status</p>
              <Cloud className="w-5 h-5 text-[#2563EB]" />
            </div>
            <p className="mt-3 text-[26px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{connected ? "Connected" : "Offline"}</p>
            <p className={`mt-3 text-sm font-semibold inline-flex items-center gap-1 ${connected ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
              <CheckCircle2 className="w-3 h-3" />
              Last sync: {deviceStatus?.lastSync ? "2 mins ago" : "Not available"}
            </p>
            </div>
          </section>
        </div>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-[14px] border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-bold text-[#0F172A]">Sales Overview</h3>
              <Button variant="outline" className="h-9 rounded-[10px] border-[#E5E7EB] text-[#334155]">This Week</Button>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="salesAreaBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748B", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#071437", border: "none", borderRadius: 12, color: "#fff" }}
                    labelFormatter={(label: any) => `Date: ${String(label ?? "-")}`}
                    formatter={(value: any) => [currency(Number(value)), "Sales"]}
                  />
                  <Area
                    type="linear"
                    dataKey="total"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#salesAreaBlue)"
                    dot={{ r: 4, fill: "#2563EB", stroke: "#FFFFFF", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#1D4ED8", stroke: "#FFFFFF", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h3 className="mb-3 text-[15px] font-bold text-[#0F172A]">Sales by Payment Method</h3>
            <div className="grid grid-cols-[minmax(128px,0.9fr)_minmax(0,1.1fr)] items-center gap-3">
              <div className="h-[190px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {paymentData.map((entry, idx) => (
                        <Cell key={`${entry.name}-${idx}`} fill={PAYMENT_COLORS[entry.name] || "#94A3B8"} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-0 space-y-1.5">
                {paymentData.map((p) => (
                  <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5 text-[#334155]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[p.name] || "#94A3B8" }} />
                      <span className="truncate font-medium">{p.label}</span>
                    </div>
                    <div className="text-right leading-tight">
                      <p className="whitespace-nowrap text-[11px] font-semibold text-[#071437]">{currency(p.value)}</p>
                      <p className="text-[10px] text-[#64748B]">{paymentTotal > 0 ? `${((p.value / paymentTotal) * 100).toFixed(1)}%` : "0.0%"}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between border-t border-[#E5E7EB] pt-2">
                  <span className="text-xs font-semibold text-[#111827]">Total</span>
                  <span className="text-sm font-semibold text-[#111827]">{currency(paymentTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-[16px] font-bold text-[#0F172A]">Cash Collections</h3>
              <p className="mt-1 text-sm text-[#64748B]">Expected uncollected cash by cashier</p>
            </div>
            <Link href="/reports/cash-collection">
              <Button variant="outline" className="h-9 rounded-[10px] border-[#E5E7EB] text-[#334155]">
                Collect Cash
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-[12px] bg-[#FFFBEB] border border-[#FEF3C7] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#B45309]">Expected Uncollected</p>
              <p className="mt-2 text-2xl font-bold text-[#0F172A]">{currency(expectedCashCollections)}</p>
              <p className="mt-1 text-xs text-[#92400E]">{cashCollectionBalances.length} cashier balance{cashCollectionBalances.length === 1 ? "" : "s"}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {cashCollectionBalances.slice(0, 4).map((row: any) => (
                <div key={row.userId || row.cashierName} className="rounded-[12px] border border-[#E5E7EB] p-4">
                  <p className="truncate text-sm font-semibold text-[#0F172A]">{row.cashierName}</p>
                  <p className="mt-1 text-xs text-[#64748B]">Collected {currency(Number(row.collections || 0))}</p>
                  <p className="mt-3 text-lg font-bold text-[#B45309]">{currency(Number(row.expectedCash || 0))}</p>
                </div>
              ))}
              {cashCollectionBalances.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[#E5E7EB] p-4 text-sm font-semibold text-[#94A3B8]">
                  No outstanding cash balances.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-[#0F172A]">Recent Invoices</h3>
              <Link href="/invoices" className="text-sm font-semibold text-[#2563EB]">View all</Link>
            </div>
            <div>
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[19%]" />
                  <col className="w-[27%]" />
                  <col className="w-[11%]" />
                  <col className="w-[17%]" />
                  <col className="w-[26%]" />
                </colgroup>
                <thead>
                  <tr className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                    <th className="px-3 py-2.5">Invoice #</th>
                    <th className="px-3 py-2.5">Customer</th>
                    <th className="px-2 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 pr-5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-sm text-[#64748B]">No invoices yet. Create your first fiscalized invoice to get started.</td>
                    </tr>
                  ) : invoices.map((inv) => {
                    const status = formatStatus(inv);
                    return (
                      <tr key={inv.id} className="border-t border-[#F1F5F9] text-xs transition-colors hover:bg-[#F8FAFC]">
                        <td className="px-3 py-2.5"><Link href={`/invoices/${inv.id}`} className="block truncate font-mono font-semibold text-[#2563EB]">{inv.invoiceNumber || `INV-${inv.id}`}</Link></td>
                        <td className="truncate px-3 py-2.5 font-medium text-[#334155]">{inv.customer?.name || "Walk In Customer"}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-[#64748B]">{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-[#0F172A]">{currency(Number(inv.total || 0))}</td>
                        <td className="px-3 py-2.5 pr-5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${status === "FISCALIZED" ? "bg-[#DCFCE7] text-[#166534] border-emerald-100" : status === "PENDING" ? "bg-[#FEF3C7] text-[#92400E] border-amber-100" : "bg-[#FEE2E2] text-[#991B1B] border-red-100"}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-[#0F172A]">Top Selling Products</h3>
              <Link href="/products" className="text-sm font-semibold text-[#2563EB]">View all</Link>
            </div>
            <div>
              <table className="w-full table-fixed">
                <thead>
                  <tr className="text-left text-[12px] font-semibold uppercase tracking-wide text-[#64748B] bg-[#F8FAFC]">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Sold</th>
                    <th className="px-5 py-3">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {abcAnalysis.slice(0, 6).map((product: any) => (
                    <tr key={product.productId} className="border-t border-[#F1F5F9] text-sm transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 text-[#334155]">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 rounded-md bg-[#EEF4FF] text-[#1D4ED8] inline-flex items-center justify-center text-xs font-bold">P</span>
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[#334155]">{Math.round(Number(product.share || 0))}</td>
                      <td className="px-5 py-3 font-semibold text-[#0F172A]">{currency(Number(product.revenue || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="h-9 w-9 rounded-[10px] bg-[#EEF4FF] text-[#1D4ED8] flex items-center justify-center"><Package className="w-4 h-4" /></div>
            <p className="mt-4 text-sm text-[#64748B] font-semibold">Inventory Summary</p>
            <p className="mt-1 text-[30px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{products.length.toLocaleString()}</p>
            <p className="mt-2 text-sm text-[#64748B]">Total items</p>
            <Link href="/products" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB]">View inventory <ArrowRight className="w-4 h-4" /></Link>
          </div>

          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="h-9 w-9 rounded-[10px] bg-[#FFEDD5] text-[#F97316] flex items-center justify-center"><AlertTriangle className="w-4 h-4" /></div>
            <p className="mt-4 text-sm text-[#64748B] font-semibold">Low Stock Items</p>
            <p className="mt-1 text-[30px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{lowStockCount}</p>
            <p className="mt-2 text-sm text-[#64748B]">Items running low</p>
            <Link href="/reports/inventory" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB]">View low stock <ArrowRight className="w-4 h-4" /></Link>
          </div>

          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="h-9 w-9 rounded-[10px] bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center"><TriangleAlert className="w-4 h-4" /></div>
            <p className="mt-4 text-sm text-[#64748B] font-semibold">Out of Stock Items</p>
            <p className="mt-1 text-[30px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{outOfStockCount}</p>
            <p className="mt-2 text-sm text-[#64748B]">Items out of stock</p>
            <Link href="/reports/inventory" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB]">View out of stock <ArrowRight className="w-4 h-4" /></Link>
          </div>

          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="h-9 w-9 rounded-[10px] bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center"><Users className="w-4 h-4" /></div>
            <p className="mt-4 text-sm text-[#64748B] font-semibold">Active Customers</p>
            <p className="mt-1 text-[30px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">{customers.length.toLocaleString()}</p>
            <p className="mt-2 text-sm text-[#64748B]">Total customers</p>
            <Link href="/customers" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB]">View customers <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
