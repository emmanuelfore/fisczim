import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, Download } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers } from "@/hooks/use-customers";
import { cn } from "@/lib/utils";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CustomerStatementPDF } from "@/components/reports/customer-statement-pdf";
import { useCompany } from "@/hooks/use-companies";
import { format } from "date-fns";

/* ── helpers ── */
function fmt(value: any, decimals = 2): string {
  const n = Number(value);
  if (isNaN(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}
function fmtDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return "—"; }
}
function defaultFrom() {
  // Show full history by default
  return "2020-01-01";
}
function defaultTo() {
  return new Date().toISOString().split("T")[0];
}

/* ─────────────────────────────────────────────────────────── */
export default function CustomerStatements() {
  const { activeCompanyId } = useActiveCompany();
  const { data: company } = useCompany(activeCompanyId);

  const qp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(qp.get("customerId") || "");
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(defaultTo());

  const { data: customers } = useCustomers(activeCompanyId);

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

  /* ── derived ── */
  const companyName = stmt?.company?.trading_name || stmt?.company?.name || "";
  const companyAddress = stmt?.company?.address || "";
  const companyCity = stmt?.company?.city || "";
  const companyPhone = stmt?.company?.phone || "";
  const companyTin = stmt?.company?.tin || "";
  const customerName = stmt?.customer?.name || stmt?.customer_name || "";
  const customerAddress = stmt?.customer?.address || "";
  const customerEmail = stmt?.customer?.email || "";
  const customerPhone = stmt?.customer?.phone || "";
  const printDate = fmtDate(new Date().toISOString());

  const handlePrint = () => window.print();

  /* ────────────────────────────── UI ────────────────────────────── */
  return (
    <Layout>
      <style>{`
        @media print {
          /* hide everything except the statement */
          body > * { visibility: hidden !important; }
          #statement-root, #statement-root * { visibility: visible !important; }
          #statement-root {
            position: fixed; top: 0; left: 0;
            width: 100%; padding: 20px;
            background: white;
          }
          .no-print { display: none !important; }
          @page { margin: 15mm; size: A4 portrait; }
        }
      `}</style>

      {/* ── Controls bar (hidden on print) ── */}
      <div className="no-print flex flex-wrap gap-4 items-end mb-6">
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</Label>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a customer…" />
            </SelectTrigger>
            <SelectContent>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
        </div>
        {stmt && (
          <>
            <Button onClick={handlePrint} className="gap-2 bg-slate-900 hover:bg-slate-700 text-white">
              <Printer className="w-4 h-4" /> Print
            </Button>
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
            >
              {({ loading, error }) => (
                <Button
                  variant="outline"
                  disabled={loading}
                  title={error ? String(error) : undefined}
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {error ? "PDF Error" : "Download PDF"}
                </Button>
              )}
            </PDFDownloadLink>
          </>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty prompt */}
      {!selectedCustomerId && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <span className="text-5xl">📋</span>
          <p className="text-base font-medium">Select a customer to generate their statement</p>
        </div>
      )}

      {/* ── Printable Statement ── */}
      {stmt && !isLoading && (
        <div id="statement-root" className="space-y-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* ══ Statement Header ══ */}
          <div className="border-b border-slate-200 px-8 py-6">
            {/* Title row */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  Statement of Account
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {fmtDate(stmt.date_from)} – {fmtDate(stmt.date_to)}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Printed: {printDate}</p>
              </div>
            </div>

            {/* FROM / TO addresses */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">FROM</p>
                <p className="font-bold text-slate-900 text-sm">{companyName}</p>
                {companyAddress && <p className="text-sm text-slate-600">{companyAddress}</p>}
                {companyCity && <p className="text-sm text-slate-600">{companyCity}</p>}
                {companyPhone && <p className="text-sm text-slate-600">{companyPhone}</p>}
                {companyTin && <p className="text-sm text-slate-600">TIN: {companyTin}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">TO</p>
                <p className="font-bold text-slate-900 text-sm">{customerName}</p>
                {customerAddress && <p className="text-sm text-slate-600">{customerAddress}</p>}
                {customerEmail && <p className="text-sm text-slate-600">{customerEmail}</p>}
                {customerPhone && <p className="text-sm text-slate-600">Phone: {customerPhone}</p>}
              </div>
            </div>
          </div>

          {/* ══ Summary Boxes ══ */}
          <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
            {[
              { label: "Opening Balance", value: stmt.opening_balance, color: "text-slate-700" },
              { label: "Total Invoiced", value: stmt.period_total_invoiced, color: "text-slate-700" },
              { label: "Total Paid", value: stmt.period_total_paid, color: "text-green-700" },
              { label: "Balance Due", value: stmt.balance_due, color: "text-red-600 font-black" },
            ].map((box) => (
              <div key={box.label} className="px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{box.label}</p>
                <p className={cn("text-xl font-bold", box.color)}>
                  {stmt.customer?.currency || "USD"} {fmt(box.value)}
                </p>
              </div>
            ))}
          </div>

          {/* ══ Transaction Ledger ══ */}
          <div className="px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wide w-32">Date</th>
                  <th className="px-4 text-left text-xs font-bold uppercase tracking-wide w-36">Reference</th>
                  <th className="px-4 text-left text-xs font-bold uppercase tracking-wide">Description</th>
                  <th className="px-4 text-right text-xs font-bold uppercase tracking-wide w-28">Debit</th>
                  <th className="px-4 text-right text-xs font-bold uppercase tracking-wide w-28">Credit</th>
                  <th className="px-4 text-right text-xs font-bold uppercase tracking-wide w-32">Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td className="py-2.5 px-4 text-slate-500 text-xs">
                    {fmtDate(stmt.date_from)}
                  </td>
                  <td className="px-4 text-slate-400 text-xs">—</td>
                  <td className="px-4 text-slate-500 text-xs italic">Opening Balance</td>
                  <td className="px-4 text-right text-slate-400 text-xs">—</td>
                  <td className="px-4 text-right text-slate-400 text-xs">—</td>
                  <td className="px-4 text-right font-semibold text-slate-700 text-xs">
                    {fmt(stmt.opening_balance)}
                  </td>
                </tr>

                {/* Transaction rows */}
                {stmt.transactions?.length > 0 ? (
                  stmt.transactions.map((tx: any, i: number) => {
                    const isPayment = tx.entry_type === "payment";
                    return (
                      <tr
                        key={i}
                        className={cn(
                          "border-b border-slate-100",
                          isPayment ? "bg-green-50/40" : "hover:bg-slate-50/50"
                        )}
                      >
                        <td className="py-2.5 px-4 text-slate-600 text-xs whitespace-nowrap">
                          {fmtDate(tx.date)}
                        </td>
                        <td className="px-4 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {tx.reference}
                        </td>
                        <td className="px-4 text-slate-600 text-xs">{tx.description}</td>
                        <td className="px-4 text-right font-mono text-xs text-slate-800">
                          {tx.debit > 0 ? fmt(tx.debit) : "—"}
                        </td>
                        <td className={cn("px-4 text-right font-mono text-xs", isPayment ? "text-green-700 font-bold" : "text-slate-400")}>
                          {tx.credit > 0 ? fmt(tx.credit) : "—"}
                        </td>
                        <td className={cn(
                          "px-4 text-right font-mono font-semibold text-xs",
                          tx.balance > 0 ? "text-slate-800" : tx.balance < 0 ? "text-green-700" : "text-slate-500"
                        )}>
                          {fmt(Math.abs(tx.balance))}
                          {tx.balance < 0 && <span className="text-[9px] ml-1 text-green-600">CR</span>}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 text-sm">
                      No transactions in this date range.
                    </td>
                  </tr>
                )}
              </tbody>
              {/* Closing balance */}
              <tfoot>
                <tr className="bg-slate-800 text-white">
                  <td colSpan={5} className="py-3 px-4 text-right font-bold text-xs uppercase tracking-wide">
                    Closing Balance
                  </td>
                  <td className="px-4 text-right font-black text-base">
                    {fmt(stmt.balance_due)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>



          {/* ══ Exclusive / Linked Stock ══ */}
          {(stmt.exclusive_stock?.length > 0) && (
            <div className="border-t border-slate-200 print-page-break">
              <div className="px-8 py-4 bg-slate-50 border-b border-slate-200">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  Exclusive Stock on Hand
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2.5 px-4 text-left">Product</th>
                    <th className="px-4 text-left">SKU</th>
                    <th className="px-4 text-left">Customer SKU</th>
                    <th className="px-4 text-left">Type</th>
                    <th className="px-4 text-right">Qty on Hand</th>
                    <th className="px-4 text-right">Qty Available</th>
                    <th className="px-4 text-left">UOM</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.exclusive_stock.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 font-medium text-slate-800">{s.product_name}</td>
                      <td className="px-4 font-mono text-xs text-slate-500">{s.sku || "—"}</td>
                      <td className="px-4 font-mono text-xs text-slate-500">{s.customer_sku || "—"}</td>
                      <td className="px-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          s.is_exclusive ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                        )}>
                          {s.is_exclusive ? "Exclusive" : "Shared"}
                        </span>
                      </td>
                      <td className="px-4 text-right font-semibold">{Number(s.quantity_on_hand).toLocaleString()}</td>
                      <td className="px-4 text-right font-semibold text-blue-700">{Number(s.available_quantity).toLocaleString()}</td>
                      <td className="px-4 text-slate-500">{s.uom || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ Open Sales Orders ══ */}
          {stmt.open_orders?.length > 0 && (
            <div className="border-t border-slate-200">
              <div className="px-8 py-4 bg-slate-50 border-b border-slate-200">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  Open Sales Orders
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2.5 px-4 text-left">Order #</th>
                    <th className="px-4 text-left">Date</th>
                    <th className="px-4 text-right">Order Total</th>
                    <th className="px-4 text-right">Invoiced</th>
                    <th className="px-4 text-right">Remaining</th>
                    <th className="px-4 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.open_orders.map((o: any, i: number) => {
                    const remaining = Number(o.total) - Number(o.invoiced_to_date || 0);
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-semibold">{o.order_number}</td>
                        <td className="px-4 text-slate-500 text-xs">{fmtDate(o.issue_date)}</td>
                        <td className="px-4 text-right">{fmt(o.total)}</td>
                        <td className="px-4 text-right text-green-700">{fmt(o.invoiced_to_date)}</td>
                        <td className="px-4 text-right font-semibold text-amber-700">{fmt(remaining)}</td>
                        <td className="px-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            o.status === "invoiced" ? "bg-green-100 text-green-700" :
                            o.status === "partially_invoiced" ? "bg-blue-100 text-blue-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {(o.status || "").replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Print footer */}
          <div className="border-t border-slate-200 px-8 py-4 text-center text-xs text-slate-400">
            This is a computer-generated statement and requires no signature · {companyName} · {printDate}
          </div>
        </div>
      )}
    </Layout>
  );
}
