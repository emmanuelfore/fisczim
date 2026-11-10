import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CustomerStatementPDF } from "@/components/reports/customer-statement-pdf";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { cn } from "@/lib/utils";
import { fmtMoney, useVehicles } from "@/hooks/use-vehicles";
import { useCustomers } from "@/hooks/use-customers";
import { useCompany } from "@/hooks/use-companies";
import { format } from "date-fns";
import { Download, FileText, Loader2, Printer, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";

/* ── helpers ── */
function fmt(value: any, decimals = 2): string {
  const n = Number(value);
  if (isNaN(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}
function fmtDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}
const defaultFrom = "2020-01-01";
const defaultTo = () => new Date().toISOString().split("T")[0];

type VehicleRow = {
  id: number;
  stockNumber: string;
  make: string;
  model: string;
  year: number | null;
  customerId: number | null;
  customerName?: string | null;
  status: string;
  summary?: { sellingPrice?: number; paid?: number; balance?: number; isProjected?: boolean };
};

export default function VehicleStatementsPage() {
  const { activeCompanyId } = useActiveCompany();
  const { data: company } = useCompany(activeCompanyId);
  const { data: customers = [] } = useCustomers(activeCompanyId);
  const { data: vehicles = [] } = useVehicles(activeCompanyId);

  const qp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(qp.get("customerId") || "");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo());
  const [search, setSearch] = useState("");

  /* Vehicle-linked customers with their vehicle exposure */
  const vehicleCustomers = useMemo(() => {
    const map = new Map<number, { id: number; name: string; vehicles: VehicleRow[]; balance: number; selling: number }>();
    (vehicles as VehicleRow[]).forEach((v) => {
      if (!v.customerId) return;
      const existing = map.get(v.customerId) ?? {
        id: v.customerId,
        name: v.customerName || `Customer #${v.customerId}`,
        vehicles: [],
        balance: 0,
        selling: 0,
      };
      existing.vehicles.push(v);
      existing.balance += Number(v.summary?.balance || 0);
      existing.selling += Number(v.summary?.sellingPrice || 0);
      map.set(v.customerId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
  }, [vehicles]);

  const filteredVehicleCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehicleCustomers;
    return vehicleCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.vehicles.some(
          (v) =>
            v.stockNumber?.toLowerCase().includes(q) ||
            `${v.make} ${v.model}`.toLowerCase().includes(q),
        ),
    );
  }, [vehicleCustomers, search]);

  const { data: stmt, isLoading } = useQuery<any>({
    queryKey: ["/api/customers", selectedCustomerId, "statement-view", dateFrom, dateTo, activeCompanyId],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        ...(activeCompanyId ? { companyId: String(activeCompanyId) } : {}),
      });
      const res = await apiFetch(`/api/customers/${selectedCustomerId}/statement-view?${params}`);
      if (!res.ok) throw new Error("Failed to fetch statement");
      return res.json();
    },
    enabled: !!selectedCustomerId,
  });

  const companyName = stmt?.company?.trading_name || stmt?.company?.name || company?.tradingName || company?.name || "";
  const companyAddress = stmt?.company?.address || (company as any)?.address || "";
  const companyCity = stmt?.company?.city || (company as any)?.city || "";
  const companyPhone = stmt?.company?.phone || (company as any)?.phone || "";
  const companyTin = stmt?.company?.tin || (company as any)?.tin || "";
  const customerName = stmt?.customer?.name || "";
  const customerAddress = stmt?.customer?.address || "";
  const customerEmail = stmt?.customer?.email || "";
  const customerPhone = stmt?.customer?.phone || "";
  const printDate = fmtDate(new Date().toISOString());
  const selectedCustomerVehicles = vehicleCustomers.find((c) => String(c.id) === selectedCustomerId)?.vehicles ?? [];

  const selectCustomer = (id: number) => {
    setSelectedCustomerId(String(id));
    const url = new URL(window.location.href);
    url.searchParams.set("customerId", String(id));
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <Layout>
      <style>{`
        @media print {
          body > * { visibility: hidden !important; }
          #statement-root, #statement-root * { visibility: visible !important; }
          #statement-root { position: fixed; top: 0; left: 0; width: 100%; padding: 20px; background: white; }
          .no-print { display: none !important; }
          @page { margin: 15mm; size: A4 portrait; }
        }
      `}</style>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── Left rail: customer picker ── */}
        <div className="no-print space-y-4">
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Vehicle customers</p>
                  <p className="text-xs text-slate-500">{vehicleCustomers.length} with vehicles linked</p>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customer, stock no…"
                  className="pl-8 h-9"
                />
              </div>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {filteredVehicleCustomers.length === 0 && (
                  <p className="py-8 text-center text-xs text-slate-400">No vehicle customers found.</p>
                )}
                {filteredVehicleCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                      String(c.id) === selectedCustomerId
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{c.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border-0 text-[10px]",
                          c.balance > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700",
                        )}
                      >
                        {c.vehicles.length} vehicle{c.vehicles.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="truncate">
                        {c.vehicles.map((v) => `${v.make} ${v.model}`).join(", ")}
                      </span>
                      <span className={cn("font-semibold", c.balance > 0 ? "text-amber-700" : "text-emerald-700")}>
                        {fmtMoney(c.balance)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Statement period</p>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Customer</Label>
                <Select
                  value={selectedCustomerId}
                  onValueChange={(v) => selectCustomer(Number(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a customer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => window.print()}
                  disabled={!stmt}
                >
                  <Printer className="h-4 w-4" /> Print
                </Button>
                {stmt && (
                  <PDFDownloadLink
                    document={
                      <CustomerStatementPDF
                        data={{
                          customer: stmt.customer,
                          openingBalance: stmt.opening_balance,
                          closingBalance: stmt.balance_due,
                          transactions: stmt.transactions || [],
                        }}
                        company={company}
                        startDate={new Date(dateFrom)}
                        endDate={new Date(dateTo)}
                        currency={stmt.customer?.currency || "USD"}
                      />
                    }
                    fileName={`Statement-${customerName}-${format(new Date(), "yyyyMMdd")}.pdf`}
                    className="flex-1"
                  >
                    {({ loading, error }) => (
                      <Button variant="default" disabled={loading} title={error ? String(error) : undefined} className="w-full gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {error ? "PDF error" : "Download PDF"}
                      </Button>
                    )}
                  </PDFDownloadLink>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: statement ── */}
        <div className="min-w-0">
          {isLoading && (
            <div className="flex justify-center py-20">
              <LoadingRows rows={6} />
            </div>
          )}

          {!selectedCustomerId && !isLoading && (
            <Card className="border-dashed border-slate-300 bg-slate-50/50 shadow-none">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
                <FileText className="h-10 w-10" />
                <p className="text-base font-medium text-slate-500">Select a vehicle customer to view their statement</p>
                <p className="max-w-md text-center text-sm">
                  Statements include every invoice and payment for the customer, including vehicle sales invoices.
                </p>
              </CardContent>
            </Card>
          )}

          {stmt && !isLoading && (
            <div className="space-y-4">
              {selectedCustomerVehicles.length > 0 && (
                <Card className="no-print border-slate-200/80 shadow-sm">
                  <CardContent className="flex flex-wrap items-center gap-2 p-3">
                    <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Vehicles</span>
                    {selectedCustomerVehicles.map((v) => (
                      <Badge key={v.id} variant="outline" className="bg-slate-50 font-normal">
                        {v.stockNumber} · {v.year ? `${v.year} ` : ""}{v.make} {v.model}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div
                id="statement-root"
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="border-b border-slate-200 px-8 py-6">
                  <div className="mb-6 flex items-start justify-between">
                    <div>
                      <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Statement of Account</h1>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {fmtDate(stmt.date_from)} – {fmtDate(stmt.date_to)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <p>Printed: {printDate}</p>
                    </div>
                  </div>
                  <div className="grid gap-8 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">From</p>
                      <p className="text-sm font-bold text-slate-900">{companyName}</p>
                      {companyAddress && <p className="text-sm text-slate-600">{companyAddress}</p>}
                      {companyCity && <p className="text-sm text-slate-600">{companyCity}</p>}
                      {companyPhone && <p className="text-sm text-slate-600">{companyPhone}</p>}
                      {companyTin && <p className="text-sm text-slate-600">TIN: {companyTin}</p>}
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">To</p>
                      <p className="text-sm font-bold text-slate-900">{customerName}</p>
                      {customerAddress && <p className="text-sm text-slate-600">{customerAddress}</p>}
                      {customerEmail && <p className="text-sm text-slate-600">{customerEmail}</p>}
                      {customerPhone && <p className="text-sm text-slate-600">Phone: {customerPhone}</p>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200 md:grid-cols-4">
                  {[
                    { label: "Opening Balance", value: stmt.opening_balance, color: "text-slate-700" },
                    { label: "Total Invoiced", value: stmt.period_total_invoiced, color: "text-slate-700" },
                    { label: "Total Paid", value: stmt.period_total_paid, color: "text-emerald-700" },
                    { label: "Balance Due", value: stmt.balance_due, color: "text-rose-600 font-black" },
                  ].map((box) => (
                    <div key={box.label} className="px-6 py-5">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{box.label}</p>
                      <p className={cn("text-xl font-bold", box.color)}>
                        {stmt.customer?.currency || "USD"} {fmt(box.value)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="w-28 py-3 px-4 text-left text-xs font-bold uppercase tracking-wide">Date</th>
                        <th className="w-32 px-4 text-left text-xs font-bold uppercase tracking-wide">Reference</th>
                        <th className="px-4 text-left text-xs font-bold uppercase tracking-wide">Description</th>
                        <th className="w-24 px-4 text-right text-xs font-bold uppercase tracking-wide">Debit</th>
                        <th className="w-24 px-4 text-right text-xs font-bold uppercase tracking-wide">Credit</th>
                        <th className="w-28 px-4 text-right text-xs font-bold uppercase tracking-wide">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(stmt.date_from)}</td>
                        <td className="px-4 text-xs text-slate-400">—</td>
                        <td className="px-4 text-xs italic text-slate-500">Opening Balance</td>
                        <td className="px-4 text-right text-xs text-slate-400">—</td>
                        <td className="px-4 text-right text-xs text-slate-400">—</td>
                        <td className="px-4 text-right text-xs font-semibold text-slate-700">{fmt(stmt.opening_balance)}</td>
                      </tr>
                      {stmt.transactions?.length > 0 ? (
                        stmt.transactions.map((tx: any, i: number) => {
                          const isPayment = tx.entry_type === "payment";
                          return (
                            <tr key={i} className={cn("border-b border-slate-100", isPayment ? "bg-emerald-50/40" : "hover:bg-slate-50/50")}>
                              <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">{fmtDate(tx.date)}</td>
                              <td className="whitespace-nowrap px-4 font-mono text-xs font-semibold text-slate-800">{tx.reference}</td>
                              <td className="px-4 text-xs text-slate-600">{tx.description}</td>
                              <td className="px-4 text-right font-mono text-xs text-slate-800">{Number(tx.debit) > 0 ? fmt(tx.debit) : "—"}</td>
                              <td className={cn("px-4 text-right font-mono text-xs", isPayment ? "font-bold text-emerald-700" : "text-slate-400")}>
                                {Number(tx.credit) > 0 ? fmt(tx.credit) : "—"}
                              </td>
                              <td
                                className={cn(
                                  "px-4 text-right font-mono text-xs font-semibold",
                                  Number(tx.balance) > 0 ? "text-slate-800" : Number(tx.balance) < 0 ? "text-emerald-700" : "text-slate-500",
                                )}
                              >
                                {fmt(Math.abs(Number(tx.balance)))}
                                {Number(tx.balance) < 0 && <span className="ml-1 text-[9px] text-emerald-600">CR</span>}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                            No transactions in this date range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-800 text-white">
                        <td colSpan={5} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">
                          Closing Balance
                        </td>
                        <td className="px-4 text-right text-base font-black">{fmt(stmt.balance_due)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="border-t border-slate-200 px-8 py-4 text-center text-xs text-slate-400">
                  This is a computer-generated statement and requires no signature · {companyName} · {printDate}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
