import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { useInvoices } from "@/hooks/use-invoices";
import { useProducts } from "@/hooks/use-products";
import { useCustomers } from "@/hooks/use-customers";
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
  Package,
  Users,
  FileText,
  ShoppingCart,
  UserPlus,
  BarChart3,
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
} from "recharts";

const PRIMARY = "#2563EB";
const PRIMARY_DARK = "#1D4ED8";
const TEAL = "#0EA5B7";
const INK = "#0F172A";
const PAPER = "#FFFFFF";
const STONE = "#E2E8F0";
const SECONDARY_TEXT = "#64748B";
const BODY_COPY = "#475569";
const SUCCESS = "#16A34A";
const SUCCESS_SOFT = "#DCFCE7";
const HIGHLIGHT = "#EFF6FF";

function BlanketStripe() {
  return (
    <div
      aria-hidden
      style={{
        height: 8,
        background: `linear-gradient(90deg, ${PRIMARY_DARK} 0% 22%, #FFFFFF 22% 26%, ${PRIMARY} 26% 48%, ${INK} 48% 52%, ${PRIMARY} 52% 74%, #FFFFFF 74% 78%, ${PRIMARY_DARK} 78% 100%)`,
      }}
    />
  );
}

type CurrencyAmounts = Record<string, number>;

function currency(v: number, code = "LSL") {
  const currencyCode = String(code || "LSL").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v || 0);
  } catch {
    return `${currencyCode} ${Number(v || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
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

export default function LekakuDashboard() {
  const { activeCompany } = useActiveCompany();
  const { isLesotho } = useFiscalAuthority();
  const { t } = useI18n();
  const { selectedBranchId } = useBranchContext();
  const companyId = activeCompany?.id || 0;

  const { data: invoicesResult } = useInvoices(companyId, {
    limit: 6,
    branchId: selectedBranchId || undefined,
  });
  const invoices = (
    Array.isArray((invoicesResult as any)?.data)
      ? (invoicesResult as any).data
      : []
  ) as any[];
  const invoicesTotal = Number(
    (invoicesResult as any)?.total || invoices.length || 0,
  );
  const { data: products = [] } = useProducts(companyId, selectedBranchId || undefined);
  const { data: customers = [] } = useCustomers(companyId);
  const { data: deviceStatus } = useDeviceStatus(companyId, isLesotho);
  const useFiscalWorkflow = Boolean(
    deviceStatus?.isConfigured && activeCompany?.vatRegistered !== false,
  );

  const { data: operationalMetrics } = useQuery<any>({
    queryKey: [api.reports.operationalMetrics.path, companyId],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(api.reports.operationalMetrics.path, { companyId }),
      );
      if (!res.ok) return null;
      return await res.json();
    },
    enabled: !!companyId,
  });
  const { data: revenueData = [] } = useQuery<any[]>({
    queryKey: [api.reports.revenueChart.path, companyId],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(api.reports.revenueChart.path, { id: companyId }),
      );
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!companyId,
  });
  const { data: stockAlerts = [] } = useQuery<any[]>({
    queryKey: [api.reports.stockAlerts.path, companyId],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(api.reports.stockAlerts.path, { companyId }),
      );
      if (!res.ok) return [];
      return await res.json();
    },
    enabled: !!companyId,
  });

  // Lesotho companies invoice in loti only — never mix currencies here.
  const homeCurrency = String(
    (activeCompany as any)?.currency || "LSL",
  ).toUpperCase();
  const totalSalesByCurrency = (operationalMetrics?.totalRevenueByCurrency ||
    {}) as CurrencyAmounts;
  const connected = Boolean(deviceStatus?.isConfigured && deviceStatus?.isOnline);
  const lowStockCount = stockAlerts.filter(
    (x: any) => Number(x?.stockLevel || 0) > 0,
  ).length;
  const outOfStockCount = stockAlerts.filter(
    (x: any) => Number(x?.stockLevel || 0) <= 0,
  ).length;
  const revenueCurrencies = Array.from(
    new Set(revenueData.flatMap((row: any) => Object.keys(row.byCurrency || {}))),
  );
  const revenueChartData = revenueData.map((row: any) => ({
    name: row.name,
    ...(row.byCurrency || {}),
  }));
  const { toast } = useToast();
  const alertShownRef = useRef(false);
  useEffect(() => {
    if (!activeCompany || stockAlerts.length === 0 || alertShownRef.current) return;
    if (outOfStockCount > 0 || lowStockCount > 0) {
      alertShownRef.current = true;
      toast({
        title: t("Inventory Alert"),
        description: t("You have {out} out of stock and {low} low stock items.", {
          out: outOfStockCount,
          low: lowStockCount,
        }),
        variant: "destructive",
      });
    }
  }, [activeCompany, stockAlerts, outOfStockCount, lowStockCount, toast]);

  if (!activeCompany) {
    return (
      <Layout>
        <div
          className="min-h-[420px] rounded-[12px] border bg-white p-10 flex flex-col items-center justify-center text-center"
          style={{ borderColor: STONE }}
        >
          <h2 className="text-[28px] font-bold" style={{ color: INK }}>
            {t("No company selected")}
          </h2>
          <p className="mt-2" style={{ color: SECONDARY_TEXT }}>
            {t("Select or create a business to load dashboard metrics.")}
          </p>
          <Link href="/onboarding">
            <Button
              className="mt-6 h-[44px] rounded-[10px] text-white font-semibold"
              style={{ background: PRIMARY }}
            >
              {t("Setup Business")}
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const cardStyle: React.CSSProperties = {
    background: PAPER,
    border: `1px solid ${STONE}`,
    borderRadius: 12,
    padding: 16,
  };
  const totalSalesSingle = Number(
    Object.values(totalSalesByCurrency).reduce(
      (a: any, b: any) => Number(a) + Number(b),
      0,
    ),
  );

  return (
    <Layout>
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Sales",
            value: currency(totalSalesSingle, homeCurrency),
            change: "12%",
            icon: FileText,
            highlight: true,
          },
          {
            label: "Invoices",
            value: invoicesTotal.toLocaleString(),
            change: "8%",
            icon: FileText,
            highlight: false,
          },
          {
            label: "Customers",
            value: customers.length.toLocaleString(),
            change: "3%",
            icon: Users,
            highlight: false,
          },
          {
            label: "Products",
            value: products.length.toLocaleString(),
            change: "5%",
            icon: Package,
            highlight: false,
          },
        ].map((k) => (
          <div
            key={k.label}
            style={{ ...cardStyle, background: k.highlight ? HIGHLIGHT : PAPER }}
          >
            <div className="flex items-center justify-between">
              <p
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: SECONDARY_TEXT }}
              >
                {k.label}
              </p>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: k.highlight ? PRIMARY : PAPER,
                  color: k.highlight ? "#fff" : PRIMARY,
                  border: `1px solid ${STONE}`,
                }}
              >
                <k.icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <p
              className="mt-3 text-[24px] font-bold leading-none truncate"
              style={{ color: INK }}
            >
              {k.value}
            </p>
            <p
              className="mt-2 text-[11px] font-semibold flex items-center gap-1"
              style={{ color: SUCCESS }}
            >
              <ArrowUp className="w-3 h-3" />
              {k.change}{" "}
              <span style={{ color: SECONDARY_TEXT, fontWeight: 400 }}>
                vs. yesterday
              </span>
            </p>
          </div>
        ))}
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mt-6">
        <div style={cardStyle}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold" style={{ color: INK }}>
              Sales Overview
            </h3>
            <span
              className="text-[12px] px-3 py-1 rounded-full border"
              style={{
                borderColor: STONE,
                color: SECONDARY_TEXT,
                background: PAPER,
              }}
            >
              Last 12 months
            </span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={revenueChartData}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                barSize={12}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={STONE} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: SECONDARY_TEXT, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: SECONDARY_TEXT, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: HIGHLIGHT }}
                  contentStyle={{
                    background: INK,
                    border: "none",
                    borderRadius: 10,
                    color: "#fff",
                  }}
                  formatter={(value: any, name: any) => [
                    currency(Number(value), String(name || homeCurrency)),
                    name,
                  ]}
                />
                <Legend
                  iconType="circle"
                  align="right"
                  verticalAlign="top"
                  wrapperStyle={{
                    fontSize: 11,
                    color: SECONDARY_TEXT,
                    paddingBottom: 20,
                  }}
                />
                {revenueCurrencies.map((code, idx) => (
                  <Bar
                    key={code}
                    dataKey={code}
                    name={code}
                    fill={idx === 0 ? PRIMARY : TEAL}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardStyle}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold" style={{ color: INK }}>
              Recent Invoices
            </h3>
            <Link
              href="/invoices"
              className="text-[12px] font-semibold"
              style={{ color: PRIMARY }}
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {invoices.length === 0 ? (
              <p
                className="text-[13px] py-6 text-center"
                style={{ color: SECONDARY_TEXT }}
              >
                {t("No invoices yet.")}
              </p>
            ) : (
              invoices.slice(0, 5).map((inv) => {
                const status = formatStatus(inv, useFiscalWorkflow);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: `1px solid ${STONE}` }}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-[13px] font-semibold truncate"
                        style={{ color: INK }}
                      >
                        {inv.invoiceNumber || `INV-${inv.id}`}
                      </p>
                      <p
                        className="text-[11px] truncate"
                        style={{ color: SECONDARY_TEXT }}
                      >
                        {inv.customer?.name || t("Walk In Customer")}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p
                        className="text-[12px] font-semibold"
                        style={{ color: INK }}
                      >
                        {currency(Number(inv.total || 0), inv.currency || homeCurrency)}
                      </p>
                      <span
                        className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            status === "FISCALIZED" ? SUCCESS_SOFT : "#F1F5F9",
                          color: status === "FISCALIZED" ? "#15803D" : SECONDARY_TEXT,
                          border: `1px solid ${
                            status === "FISCALIZED" ? "#BBF7D0" : STONE
                          }`,
                        }}
                      >
                        {t(status)}
                      </span>
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
          <h3 className="text-[16px] font-semibold mb-4" style={{ color: INK }}>
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "New Invoice", icon: FileText, href: "/invoices/new", primary: true },
              { label: "New Sale", icon: ShoppingCart, href: "/pos", primary: false },
              { label: "Add Customer", icon: UserPlus, href: "/customers", primary: false },
              { label: "Add Product", icon: Package, href: "/products", primary: false },
              { label: "View Reports", icon: BarChart3, href: "/reports", primary: false },
            ].map((a) => (
              <Link key={a.label} href={a.href}>
                <div
                  className="h-[88px] rounded-[10px] p-3 flex flex-col items-center justify-center gap-2 text-center transition-all hover:-translate-y-0.5 cursor-pointer"
                  style={{
                    background: a.primary ? PRIMARY : PAPER,
                    color: a.primary ? "#fff" : INK,
                    border: `1px solid ${a.primary ? PRIMARY : STONE}`,
                  }}
                >
                  <a.icon
                    className="w-5 h-5"
                    style={{ color: a.primary ? "#fff" : PRIMARY }}
                  />
                  <span className="text-[12px] font-semibold leading-tight">
                    {a.label}
                  </span>
                  <ArrowRight className="w-3 h-3 opacity-60" />
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div style={cardStyle}>
          <h3 className="text-[16px] font-semibold mb-4" style={{ color: INK }}>
            System Status
          </h3>
          <div className="space-y-3">
            {[
              ["POS Device", connected ? "Online" : "Offline", connected],
              ["Internet", "Online", true],
              ["Database", "Healthy", true],
            ].map(([label, value, ok]) => (
              <div
                key={label as string}
                className="flex items-center justify-between py-1.5"
              >
                <span className="text-[13px]" style={{ color: BODY_COPY }}>
                  {label}
                </span>
                <span
                  className="flex items-center gap-2 text-[12px] font-semibold"
                  style={{ color: ok ? SUCCESS : SECONDARY_TEXT }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: ok ? SUCCESS : "#E5E7EB" }}
                  />
                  {value}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/tax-settings"
            className="mt-4 inline-flex text-[12px] font-semibold"
            style={{ color: PRIMARY }}
          >
            View details →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div
        className="mt-8 mb-8 rounded-[12px] overflow-hidden"
        style={{ background: INK }}
      >
        <BlanketStripe />
        <div className="px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <p className="text-white font-bold">LEKAKU</p>
            <p
              className="text-[11px] tracking-widest mt-1"
              style={{ color: "#93C5FD" }}
            >
              FISCAL COMPLIANCE MADE SIMPLE
            </p>
            <p
              className="text-[12px] mt-3"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              Trusted fiscal platform for Basotho businesses.
            </p>
          </div>
          <div className="flex gap-6 justify-center">
            {["About", "Support", "Privacy", "Terms"].map((l) => (
              <a
                key={l}
                href="#"
                className="text-[12px]"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {l}
              </a>
            ))}
          </div>
          <div className="text-right">
            <p
              className="text-[11px] tracking-widest"
              style={{ color: "#93C5FD" }}
            >
              A LEKAKU SOLUTION
            </p>
            <p
              className="text-[11px] mt-1"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              Built for a compliant Lesotho
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
