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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSuppliers } from "@/hooks/use-suppliers";
import { cn } from "@/lib/utils";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { SupplierStatementPDF } from "@/components/reports/supplier-statement-pdf";
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
export default function SupplierStatements() {
  const { activeCompanyId } = useActiveCompany();
  const { data: company } = useCompany(activeCompanyId);

  const qp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [selectedSupplierId, setSelectedSupplierId] = useState(qp.get("supplierId") || "");
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(defaultTo());

  const { data: suppliers } = useSuppliers(activeCompanyId);

  const { data: stmt, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/statements/suppliers", selectedSupplierId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: dateFrom, endDate: dateTo });
      const res = await apiFetch(`/api/accounting/statements/suppliers/${selectedSupplierId}?${params}`);
      if (!res.ok) throw new Error("Failed to fetch supplier statement");
      return res.json();
    },
    enabled: !!selectedSupplierId,
  });

  /* ── derived ── */
  const currency = (company as any)?.currency || "USD";
  const companyName = stmt?.company?.tradingName || stmt?.company?.name || (company as any)?.name || "";
  const companyAddress = stmt?.company?.address || (company as any)?.address || "";
  const companyCity = stmt?.company?.city || (company as any)?.city || "";
  const companyPhone = stmt?.company?.phone || (company as any)?.phone || "";
  const companyTin = stmt?.company?.tin || (company as any)?.tin || "";
  const supplierName = stmt?.supplier?.name || "";
  const supplierAddress = stmt?.supplier?.address || "";
  const supplierEmail = stmt?.supplier?.email || "";
  const supplierPhone = stmt?.supplier?.phone || "";
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
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Supplier</Label>
          <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a supplier…" />
            </SelectTrigger>
            <SelectContent>
              {suppliers?.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
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
                <SupplierStatementPDF
                  data={{
                    supplier: stmt.supplier,
                    openingBalance: Number(stmt.openingBalance || 0),
                    closingBalance: Number(stmt.closingBalance ?? stmt.balance_due ?? 0),
                    transactions: stmt.transactions || [],
                  }}
                  company={stmt.company || company}
                  startDate={new Date(dateFrom)}
                  endDate={new Date(dateTo)}
                  currency={currency}
                />
              }
              fileName={`Supplier-Statement-${supplierName}-${format(new Date(), "yyyyMMdd")}.pdf`}
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
      {!selectedSupplierId && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <span className="text-5xl">📋</span>
          <p className="text-base font-medium">Select a supplier to generate their statement</p>
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
                  Supplier Statement
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {fmtDate(stmt.date_from || stmt.startDate)} – {fmtDate(stmt.date_to || stmt.endDate)}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Printed: {printDate}</p>
              </div>
            </div>

            {/* FROM / TO addresses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">FROM (BUYER)</p>
                <p className="font-bold text-slate-900 text-sm">{companyName}</p>
                {companyAddress && <p className="text-sm text-slate-600">{companyAddress}</p>}
                {companyCity && <p className="text-sm text-slate-600">{companyCity}</p>}
                {companyPhone && <p className="text-sm text-slate-600">{companyPhone}</p>}
                {companyTin && <p className="text-sm text-slate-600">TIN: {companyTin}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">SUPPLIER</p>
                <p className="font-bold text-slate-900 text-sm">{supplierName}</p>
                {supplierAddress && <p className="text-sm text-slate-600">{supplierAddress}</p>}
                {supplierEmail && <p className="text-sm text-slate-600">{supplierEmail}</p>}
                {supplierPhone && <p className="text-sm text-slate-600">Phone: {supplierPhone}</p>}
              </div>
            </div>
          </div>

          {/* ══ Summary Boxes ══ */}
          <div className="grid grid-cols-1 md:grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
            {[
              { label: "Opening Balance", value: stmt.openingBalance, color: "text-slate-700" },
              { label: "Total Billed", value: stmt.period_total_billed, color: "text-slate-700" },
              { label: "Total Paid", value: stmt.period_total_paid, color: "text-green-700" },
              { label: "Amount Owed", value: stmt.balance_due ?? stmt.closingBalance, color: "text-red-600 font-black" },
            ].map((box) => (
              <div key={box.label} className="px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{box.label}</p>
                <p className={cn("text-xl font-bold", box.color)}>
                  {currency} {fmt(box.value)}
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
                  <th className="px-4 text-right text-xs font-bold uppercase tracking-wide w-28">Paid</th>
                  <th className="px-4 text-right text-xs font-bold uppercase tracking-wide w-28">Billed</th>
                  <th className="px-4 text-right text-xs font-bold uppercase tracking-wide w-32">Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td className="py-2.5 px-4 text-slate-500 text-xs">
                    {fmtDate(stmt.date_from || stmt.startDate)}
                  </td>
                  <td className="px-4 text-slate-400 text-xs">—</td>
                  <td className="px-4 text-slate-500 text-xs italic">Opening Balance</td>
                  <td className="px-4 text-right text-slate-400 text-xs">—</td>
                  <td className="px-4 text-right text-slate-400 text-xs">—</td>
                  <td className="px-4 text-right font-semibold text-slate-700 text-xs">
                    {fmt(stmt.openingBalance)}
                  </td>
                </tr>

                {/* Transaction rows */}
                {stmt.transactions?.length > 0 ? (
                  stmt.transactions.map((tx: any, i: number) => {
                    const isPayment = tx.entry_type === "payment";
                    const isCreditNote = tx.entry_type === "credit-note";
                    return (
                      <tr
                        key={i}
                        className={cn(
                          "border-b border-slate-100",
                          isPayment ? "bg-green-50/40" : isCreditNote ? "bg-amber-50/40" : "hover:bg-slate-50/50"
                        )}
                      >
                        <td className="py-2.5 px-4 text-slate-600 text-xs whitespace-nowrap">
                          {fmtDate(tx.date)}
                        </td>
                        <td className="px-4 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {tx.reference}
                        </td>
                        <td className="px-4 text-slate-600 text-xs">{tx.description}</td>
                        <td className={cn("px-4 text-right font-mono text-xs", isPayment || isCreditNote ? "text-green-700 font-bold" : "text-slate-800")}>
                          {Number(tx.debit) > 0 ? fmt(tx.debit) : "—"}
                        </td>
                        <td className="px-4 text-right font-mono text-xs text-slate-800">
                          {Number(tx.credit) > 0 ? fmt(tx.credit) : "—"}
                        </td>
                        <td className="px-4 text-right font-mono font-semibold text-xs text-slate-800">
                          {fmt(tx.balance)}
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
                    Amount Owed
                  </td>
                  <td className="px-4 text-right font-black text-base">
                    {fmt(stmt.balance_due ?? stmt.closingBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Print footer */}
          <div className="border-t border-slate-200 px-8 py-4 text-center text-xs text-slate-400">
            This is a computer-generated statement and requires no signature · {companyName} · {printDate}
          </div>
        </div>
      )}
    </Layout>
  );
}
