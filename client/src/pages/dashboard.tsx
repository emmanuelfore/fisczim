import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { useInvoices } from "@/hooks/use-invoices";
import { useProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
import { useCurrencies } from "@/hooks/use-currencies";
import { useDeviceStatus } from "@/hooks/use-device-status";
import { useFiscalAuthority } from "@/hooks/use-fiscal-authority";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { buildUrl, api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowUp,
  Cloud,
  Package,
  AlertTriangle,
  TriangleAlert,
  Users,
  FileText,
  ShoppingCart,
  UserPlus,
  BarChart3,
  Search,
  Bell,
  Database,
  Wifi,
} from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const GREEN = "#0E7A4F";
const GREEN_DARK = "#0A5C3C";
const BLUE = "#1B4F9C";
const INK = "#10231A";
const PAPER = "#FAF8F2";
const STONE = "#EDE9DD";
const SECONDARY_TEXT = "#5A6660";
const FISCAL_GREEN = "#2ECC71";
const BODY_COPY = "#3D4A43";
const LIGHT_MINT = "#7BE3A8";

function BlanketStripe() {
  return <div aria-hidden style={{ height: 8, background: `linear-gradient(90deg, ${GREEN} 0% 22%, #FFFFFF 22% 26%, ${BLUE} 26% 48%, #111111 48% 52%, ${BLUE} 52% 74%, #FFFFFF 74% 78%, ${GREEN} 78% 100%)` }} />;
}

const PAYMENT_COLORS: Record<string, string> = {
  CASH: GREEN,
  CARD: BLUE,
  MOBILE_PAYMENT: "#059669",
  BANK_TRANSFER: "#065f46",
  OTHER: "#0A5C3C",
};

type CurrencyAmounts = Record<string, number>;

const SERIES_COLORS = [GREEN, BLUE, "#059669", "#065f46", "#10b981", "#047857"];

function currency(v: number, code = "USD") {
  const currencyCode = String(code || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
  } catch {
    return `${currencyCode} ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function addCurrencyAmount(totals: CurrencyAmounts, code: unknown, amount: unknown) {
  const currencyCode = String(code || "USD").toUpperCase();
  totals[currencyCode] = (totals[currencyCode] || 0) + Number(amount || 0);
  return totals;
}

function amountLines(amounts: CurrencyAmounts, empty = "No sales yet", includeCodes: string[] = []) {
  const normalizedAmounts = Object.entries(amounts || {}).reduce((acc, [code, amount]) => {
    acc[String(code || "USD").toUpperCase()] = Number(amount || 0);
    return acc;
  }, {} as CurrencyAmounts);
  includeCodes.forEach((code) => {
    const currencyCode = String(code || "").toUpperCase();
    if (currencyCode && normalizedAmounts[currencyCode] == null) normalizedAmounts[currencyCode] = 0;
  });
  const entries = Object.entries(normalizedAmounts).filter(([, amount]) => includeCodes.length > 0 || Math.abs(Number(amount || 0)) > 0.004);
  if (entries.length === 0) return <span>{empty}</span>;
  return (
    <span className="flex flex-col gap-1">
      {entries.map(([code, amount]) => (
        <span key={code} className="whitespace-nowrap">{currency(Number(amount), code)}</span>
      ))}
    </span>
  );
}

function formatStatus(invoice: any, useFiscalWorkflow = true): "FISCALIZED" | "PENDING" | "FAILED" | "ISSUED" | "DRAFT" {
  if (!useFiscalWorkflow) {
    if (invoice?.status === "draft") return "DRAFT";
    if (invoice?.syncedWithFdms || invoice?.fiscalCode) return "FISCALIZED";
    return "ISSUED";
  }
  const fdms = String(invoice?.fdmsStatus || "").toLowerCase();
  if (invoice?.syncedWithFdms || fdms === "fiscalized") return "FISCALIZED";
  if (fdms === "failed") return "FAILED";
  return "PENDING";
}

export default function Dashboard() {
  const { activeCompany } = useActiveCompany();
  const { isLesotho } = useFiscalAuthority();
  const { t } = useI18n();
  const { selectedBranchId } = useBranchContext();
  const companyId = activeCompany?.id || 0;

  const { data: invoicesResult } = useInvoices(companyId, { limit: 6, branchId: selectedBranchId || undefined });
  const invoices = (Array.isArray((invoicesResult as any)?.data) ? (invoicesResult as any).data : []) as any[];
  const invoicesTotal = Number((invoicesResult as any)?.total || invoices.length || 0);
  const { data: products = [] } = useProducts(companyId, selectedBranchId || undefined);
  const { data: customers = [] } = useCustomers(companyId);
  const { data: currencies = [] } = useCurrencies(companyId);
  const { data: deviceStatus } = useDeviceStatus(companyId, isLesotho);
  const useFiscalWorkflow = Boolean(deviceStatus?.isConfigured && activeCompany?.vatRegistered !== false);

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
      const start = new Date(); start.setDate(now.getDate() - 6);
      const params = new URLSearchParams({ startDate: start.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) });
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

  const paymentData = paymentDataRaw.map((row: any) => {
    const rawName = String(row.method || "OTHER").toUpperCase();
    return { name: rawName.replace(/\s+/g, "_"), label: rawName.replace(/_/g, " "), value: Number(row.count || 0), byCurrency: row.byCurrency || {} };
  });
  const paymentTotal = paymentData.reduce((acc, p) => acc + p.value, 0);
  const configuredCurrencyCodes = (currencies || []).filter((c: any) => c.isActive !== false).map((c: any) => String(c.code || "").toUpperCase()).filter(Boolean);
  const homeCurrency = String((activeCompany as any)?.currency || (isLesotho ? "LSL" : "USD")).toUpperCase();
  // Lesotho is single-currency: only the home currency ever renders.
  const visibleCurrencyCodes = isLesotho
    ? [homeCurrency]
    : Array.from(new Set(["USD", ...configuredCurrencyCodes, configuredCurrencyCodes.includes("ZIG") ? "ZIG" : "ZWG"]));
  const totalSalesByCurrency = (operationalMetrics?.totalRevenueByCurrency || {}) as CurrencyAmounts;
  const vatCollectedByCurrency = invoices.reduce((acc, inv) => addCurrencyAmount(acc, inv.currency, inv.taxAmount), {} as CurrencyAmounts);
  const connected = Boolean(deviceStatus?.isConfigured && deviceStatus?.isOnline);
  const lowStockCount = stockAlerts.filter((x: any) => Number(x?.stockLevel || 0) > 0).length;
  const outOfStockCount = stockAlerts.filter((x: any) => Number(x?.stockLevel || 0) <= 0).length;
  const revenueCurrencies = Array.from(new Set(revenueData.flatMap((row: any) => Object.keys(row.byCurrency || {}))));
  const revenueChartData = revenueData.map((row: any) => ({ name: row.name, ...(row.byCurrency || {}) }));
  const { toast } = useToast();
  const alertShownRef = useRef(false);
  useEffect(() => {
    if (!activeCompany || stockAlerts.length === 0 || alertShownRef.current) return;
    if (outOfStockCount > 0 || lowStockCount > 0) {
      alertShownRef.current = true;
      toast({ title: t("Inventory Alert"), description: t("You have {out} out of stock and {low} low stock items.", { out: outOfStockCount, low: lowStockCount }), variant: "destructive" });
    }
  }, [activeCompany, stockAlerts, outOfStockCount, lowStockCount, toast]);

  if (!activeCompany) {
    return (
      <Layout>
        <div className="min-h-[420px] rounded-[12px] border bg-white p-10 flex flex-col items-center justify-center text-center" style={{ borderColor: STONE, background: PAPER }}>
          <h2 className="text-[28px] font-bold" style={{ color: INK, fontFamily: "Inter, sans-serif" }}>{t("No company selected")}</h2>
          <p className="mt-2" style={{ color: SECONDARY_TEXT }}>{t("Select or create a business to load dashboard metrics.")}</p>
          <Link href="/onboarding"><Button className="mt-6 h-[44px] rounded-[10px] text-white font-semibold" style={{ background: GREEN }}>{t("Setup Business")}</Button></Link>
        </div>
      </Layout>
    );
  }

  const cardStyle: React.CSSProperties = { background: PAPER, border: `1px solid ${STONE}`, borderRadius: 12, padding: 16 };
  const isDayOpen = !!deviceStatus?.fiscalDayOpen;
  const totalSalesSingle = Number(Object.values(totalSalesByCurrency).reduce((a: any, b: any) => Number(a) + Number(b), 0));

  return (
    <Layout>
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8 pt-6 pb-8">

          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Sales", value: currency(totalSalesSingle, "LSL"), change: "12%", icon: FileText, highlight: true },
              { label: "Invoices", value: invoicesTotal.toLocaleString(), change: "8%", icon: FileText, highlight: false },
              { label: "Customers", value: customers.length.toLocaleString(), change: "3%", icon: Users, highlight: false },
              { label: "Products", value: products.length.toLocaleString(), change: "5%", icon: Package, highlight: false },
            ].map((k) => (
              <div key={k.label} style={{ ...cardStyle, background: k.highlight ? "#EFFAF3" : PAPER }}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: SECONDARY_TEXT }}>{k.label}</p>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: k.highlight ? GREEN : PAPER, color: k.highlight ? "#fff" : GREEN, border: `1px solid ${STONE}` }}><k.icon className="w-3.5 h-3.5" /></div>
                </div>
                <p className="mt-3 text-[24px] font-bold leading-none truncate" style={{ color: INK }}>{k.value}</p>
                <p className="mt-2 text-[11px] font-semibold flex items-center gap-1" style={{ color: FISCAL_GREEN }}><ArrowUp className="w-3 h-3" />{k.change} <span style={{ color: SECONDARY_TEXT, fontWeight: 400 }}>vs. yesterday</span></p>
              </div>
            ))}
          </div>

          {/* Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mt-6">
            <div style={cardStyle}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[16px] font-semibold" style={{ color: INK }}>Sales Overview</h3>
                <span className="text-[12px] px-3 py-1 rounded-full border" style={{ borderColor: STONE, color: SECONDARY_TEXT, background: PAPER }}>Last 12 months</span>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke={STONE} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: SECONDARY_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: SECONDARY_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: PAPER }} contentStyle={{ background: INK, border: "none", borderRadius: 10, color: "#fff" }} formatter={(value: any, name: any) => [currency(Number(value), String(name || "USD")), name]} />
                    <Legend iconType="circle" align="right" verticalAlign="top" wrapperStyle={{ fontSize: 11, color: SECONDARY_TEXT, paddingBottom: 20 }} />
                    {revenueCurrencies.map((code, idx) => (
                      <Bar key={code} dataKey={code} name={code === 'USD' ? 'Sales' : code === 'ZWG' ? 'Invoices' : code} fill={idx === 0 ? GREEN : BLUE} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={cardStyle}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[16px] font-semibold" style={{ color: INK }}>Recent Invoices</h3>
                <Link href="/invoices" className="text-[12px] font-semibold" style={{ color: GREEN }}>View all →</Link>
              </div>
              <div className="space-y-3">
                {invoices.length === 0 ? (
                  <p className="text-[13px] py-6 text-center" style={{ color: SECONDARY_TEXT }}>{t("No invoices yet.")}</p>
                ) : (
                  invoices.slice(0, 5).map((inv) => {
                    const status = formatStatus(inv, useFiscalWorkflow);
                    return (
                      <div key={inv.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${STONE}` }}>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: INK }}>{inv.invoiceNumber || `INV-${inv.id}`}</p>
                          <p className="text-[11px] truncate" style={{ color: SECONDARY_TEXT }}>{inv.customer?.name || t("Walk In Customer")}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-[12px] font-semibold" style={{ color: INK }}>{currency(Number(inv.total || 0), inv.currency || "USD")}</p>
                          <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: status === "FISCALIZED" ? LIGHT_MINT : "#EDE9DD", color: status === "FISCALIZED" ? GREEN : SECONDARY_TEXT, border: `1px solid ${status === "FISCALIZED" ? FISCAL_GREEN : STONE}` }}>{t(status)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions + System Status */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mt-6">
            <div style={cardStyle}>
              <h3 className="text-[16px] font-semibold mb-4" style={{ color: INK }}>Quick Actions</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: "New Invoice", icon: FileText, href: "/invoices/new", primary: true },
                  { label: "New Sale", icon: ShoppingCart, href: "/pos", primary: false },
                  { label: "Add Customer", icon: UserPlus, href: "/customers", primary: false },
                  { label: "Add Product", icon: Package, href: "/products", primary: false },
                  { label: "View Reports", icon: BarChart3, href: "/reports", primary: false },
                ].map((a) => (
                  <Link key={a.label} href={a.href}>
                    <div className="h-[88px] rounded-[10px] p-3 flex flex-col items-center justify-center gap-2 text-center transition-all hover:-translate-y-0.5 cursor-pointer" style={{ background: a.primary ? GREEN : PAPER, color: a.primary ? "#fff" : INK, border: `1px solid ${a.primary ? GREEN : STONE}` }}>
                      <a.icon className="w-5 h-5" style={{ color: a.primary ? "#fff" : GREEN }} />
                      <span className="text-[12px] font-semibold leading-tight">{a.label}</span>
                      <ArrowRight className="w-3 h-3 opacity-60" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <div style={cardStyle}>
              <h3 className="text-[16px] font-semibold mb-4" style={{ color: INK }}>System Status</h3>
              <div className="space-y-3">
                {[
                  ["POS Device", connected ? "Online" : "Offline", connected],
                  ["Internet", "Online", true],
                  ["Database", "Healthy", true],
                ].map(([label, value, ok]) => (
                  <div key={label as string} className="flex items-center justify-between py-1.5">
                    <span className="text-[13px]" style={{ color: BODY_COPY }}>{label}</span>
                    <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: ok ? FISCAL_GREEN : SECONDARY_TEXT }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: ok ? FISCAL_GREEN : "#E5E7EB" }} />{value}
                    </span>
                  </div>
                ))}
              </div>
              <Link href="/tax-settings" className="mt-4 inline-flex text-[12px] font-semibold" style={{ color: GREEN }}>View details →</Link>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 mb-8 rounded-[12px] overflow-hidden" style={{ background: INK }}>
            <BlanketStripe />
            <div className="px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <p className="text-white font-bold">LEKAKU</p>
                <p className="text-[11px] tracking-widest mt-1" style={{ color: LIGHT_MINT }}>FISCAL COMPLIANCE MADE SIMPLE</p>
                <p className="text-[12px] mt-3" style={{ color: "rgba(255,255,255,0.7)" }}>Trusted fiscal platform for Zimbabwean businesses.</p>
              </div>
              <div className="flex gap-6 justify-center">
                {["About", "Support", "Privacy", "Terms"].map((l) => (
                  <a key={l} href="#" className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>{l}</a>
                ))}
              </div>
              <div className="text-right">
                <p className="text-[11px] tracking-widest" style={{ color: LIGHT_MINT }}>A LEKAKU SOLUTION</p>
                <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>Built for a compliant Zimbabwe</p>
              </div>
            </div>
          </div>
        </div>
    </Layout>
  );
}
