import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { filterRecords, computeTotal } from "@/lib/report-utils";
import { format, isValid } from "date-fns";
import { Loader2, Banknote, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getPendingSales } from "@/lib/offline-db";

interface ReportProps {
  companyId: number;
  dateRange: { from: Date; to: Date };
  search: string;
  hideZeroActivity?: boolean;
}

function buildUrl(
  companyId: number,
  endpoint: string,
  dateRange: { from: Date; to: Date },
) {
  return `/api/companies/${companyId}/reports/${endpoint}?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
      <p className="">{message}</p>
    </div>
  );
}

function DetailEmpty() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px] text-slate-300">
      <p className="">Select a row to view details</p>
    </div>
  );
}

function fmtDate(val: string | null | undefined) {
  if (!val) return "—";
  const d = new Date(val);
  return isValid(d) ? format(d, "dd MMM yyyy") : val;
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
        {label}
      </p>
      <p className=" font-black text-slate-800">{value}</p>
    </div>
  );
}

// ── TimeToGetPaidReport ───────────────────────────────────────────────────────

export function TimeToGetPaidReport({
  companyId,
  dateRange,
  search,
}: ReportProps) {
  const [selectedRow, setSelectedRow] = useState<any>(null);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery<any[]>({
    queryKey: [
      "reports/time-to-get-paid",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(companyId, "time-to-get-paid", dateRange),
      );
      if (!res.ok)
        throw new Error(`Failed to load time to get paid (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, [
    "invoiceNumber",
    "customerName",
  ]);
  const total = computeTotal(filtered, "amount");

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
      </div>
    );
  if (error) return <EmptyState message="Failed to load report" />;

  return (
    <div className="flex h-full">
      <div className="w-1/2 border-r border-slate-100 overflow-auto">
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Time to Get Paid
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No payment data in this period" />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Invoice#
                </th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Customer
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Issue Date
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Payment Date
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Days
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors",
                    selectedRow === row && "bg-violet-50",
                  )}
                  onClick={() =>
                    setSelectedRow(row === selectedRow ? null : row)
                  }
                >
                  <td className="px-4 py-2 font-medium text-slate-700">
                    {row.invoiceNumber}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.customerName}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {fmtDate(row.issueDate)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {fmtDate(row.paymentDate)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.daysToPayment}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
                    {row.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {!selectedRow ? (
          <DetailEmpty />
        ) : (
          <div className="space-y-3">
            <h3 className=" font-black text-slate-800 uppercase tracking-tight">
              {selectedRow.invoiceNumber}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DetailCard label="Customer" value={selectedRow.customerName} />
              <DetailCard
                label="Issue Date"
                value={fmtDate(selectedRow.issueDate)}
              />
              <DetailCard
                label="Payment Date"
                value={fmtDate(selectedRow.paymentDate)}
              />
              <DetailCard
                label="Days to Payment"
                value={selectedRow.daysToPayment}
              />
              <DetailCard label="Amount" value={selectedRow.amount} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── RefundHistoryReport ───────────────────────────────────────────────────────

export function RefundHistoryReport({
  companyId,
  dateRange,
  search,
}: ReportProps) {
  const [selectedRow, setSelectedRow] = useState<any>(null);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery<any[]>({
    queryKey: [
      "reports/refund-history",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(companyId, "refund-history", dateRange),
      );
      if (!res.ok)
        throw new Error(`Failed to load refund history (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, [
    "invoiceNumber",
    "customerName",
    "relatedInvoiceNumber",
  ]);
  const total = computeTotal(filtered, "amount");

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
      </div>
    );
  if (error) return <EmptyState message="Failed to load report" />;

  return (
    <div className="flex h-full">
      <div className="w-1/2 border-r border-slate-100 overflow-auto">
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Refund History
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No refunds in this period" />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Invoice#
                </th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Customer
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Issue Date
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Amount
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Related Invoice
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors",
                    selectedRow === row && "bg-violet-50",
                  )}
                  onClick={() =>
                    setSelectedRow(row === selectedRow ? null : row)
                  }
                >
                  <td className="px-4 py-2 font-medium text-slate-700">
                    {row.invoiceNumber}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.customerName}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {fmtDate(row.issueDate)}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
                    {row.amount}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.relatedInvoiceNumber ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {!selectedRow ? (
          <DetailEmpty />
        ) : (
          <div className="space-y-3">
            <h3 className=" font-black text-slate-800 uppercase tracking-tight">
              {selectedRow.invoiceNumber}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DetailCard label="Customer" value={selectedRow.customerName} />
              <DetailCard
                label="Issue Date"
                value={fmtDate(selectedRow.issueDate)}
              />
              <DetailCard label="Amount" value={selectedRow.amount} />
              <DetailCard
                label="Related Invoice"
                value={selectedRow.relatedInvoiceNumber ?? "—"}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WithholdingTaxReport ──────────────────────────────────────────────────────

export function WithholdingTaxReport({
  companyId,
  dateRange,
  search,
}: ReportProps) {
  const [selectedRow, setSelectedRow] = useState<any>(null);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery<any[]>({
    queryKey: [
      "reports/withholding-tax",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(companyId, "withholding-tax", dateRange),
      );
      if (!res.ok)
        throw new Error(`Failed to load withholding tax (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, [
    "invoiceNumber",
    "customerName",
  ]);
  const total = computeTotal(filtered, "withheldAmount");

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
      </div>
    );
  if (error) return <EmptyState message="Failed to load report" />;

  return (
    <div className="flex h-full">
      <div className="w-1/2 border-r border-slate-100 overflow-auto">
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Withholding Tax
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No withholding tax data in this period" />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Invoice#
                </th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Customer
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Issue Date
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Withheld Amount
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors",
                    selectedRow === row && "bg-violet-50",
                  )}
                  onClick={() =>
                    setSelectedRow(row === selectedRow ? null : row)
                  }
                >
                  <td className="px-4 py-2 font-medium text-slate-700">
                    {row.invoiceNumber}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.customerName}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {fmtDate(row.issueDate)}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
                    {row.withheldAmount}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {!selectedRow ? (
          <DetailEmpty />
        ) : (
          <div className="space-y-3">
            <h3 className=" font-black text-slate-800 uppercase tracking-tight">
              {selectedRow.invoiceNumber}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DetailCard label="Customer" value={selectedRow.customerName} />
              <DetailCard
                label="Issue Date"
                value={fmtDate(selectedRow.issueDate)}
              />
              <DetailCard
                label="Withheld Amount"
                value={selectedRow.withheldAmount}
              />
              <DetailCard label="Total" value={selectedRow.total} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CashCollectionReport ──────────────────────────────────────────────────────

export function PaymentsReceivedReport({
  companyId,
  dateRange,
  search,
}: ReportProps) {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery<any[]>({
    queryKey: [
      "reports/cash-collection",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const start = dateRange.from.toISOString();
      const end = dateRange.to.toISOString();
      const res = await apiFetch(
        `/api/companies/${companyId}/reports/payments?startDate=${start}&endDate=${end}`,
      );
      if (!res.ok)
        throw new Error(`Failed to load collections (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, [
    "invoiceNumber",
    "customerName",
    "reference",
    "paymentMethod",
  ]);

  // Aggregations
  const stats = useMemo(() => {
    const methods: Record<string, { total: number; count: number }> = {};
    let total = 0;

    filtered.forEach((p) => {
      const m = p.paymentMethod || "OTHER";
      if (!methods[m]) methods[m] = { total: 0, count: 0 };
      const amt = Number(p.amount);
      methods[m].total += amt;
      methods[m].count += 1;
      total += amt;
    });

    return {
      total,
      methods: Object.entries(methods).sort((a, b) => b[1].total - a[1].total),
    };
  }, [filtered]);

  const dailyStats = useMemo(() => {
    const daily: Record<
      string,
      { date: string; total: number; count: number }
    > = {};

    filtered.forEach((p) => {
      const date = p.paymentDate
        ? format(new Date(p.paymentDate), "yyyy-MM-dd")
        : "Unknown";
      if (!daily[date]) daily[date] = { date, total: 0, count: 0 };
      daily[date].total += Number(p.amount);
      daily[date].count += 1;
    });

    return Object.values(daily).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    );
  if (error) return <EmptyState message="Failed to load collection report" />;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-xl shadow-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
            Total Collected
          </p>
          <p className="text-2xl font-black font-display">
            $
            {stats.total.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase">
            {filtered.length} TRANSACTIONS
          </p>
        </div>
        {stats.methods.slice(0, 3).map(([method, data]) => (
          <div
            key={method}
            className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm transition-all hover:bg-slate-50"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              {method}
            </p>
            <p className="text-2xl font-black text-slate-900 font-display">
              $
              {data.total.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase">
              {data.count} PAYMENTS
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Method Summary */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className=" font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-4 bg-violet-600 rounded-full" />
            Collection by Method
          </h3>
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-widest">
                    Method
                  </th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-widest text-center">
                    Count
                  </th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-widest text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.methods.map(([method, data]) => (
                  <tr
                    key={method}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3 font-bold text-slate-700">
                      {method}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 font-semibold">
                      {data.count}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900">
                      $
                      {data.total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily Summary */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className=" font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
            Daily Collections
          </h3>
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-widest">
                    Date
                  </th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-widest text-center">
                    Transactions
                  </th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-widest text-right">
                    Total Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((day) => (
                  <tr
                    key={day.date}
                    className="border-b border-slate-50 last:border-0 hover:bg-emerald-50/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-bold text-slate-700">
                      {format(new Date(day.date), "EEEE, dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg font-black text-[10px] text-slate-600">
                        {day.count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900">
                      $
                      {day.total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
                {dailyStats.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center py-20 text-slate-300 font-bold italic tracking-wider"
                    >
                      No collections recorded in this date range
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detailed Transaction List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className=" font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-4 bg-slate-400 rounded-full" />
            Detailed Transaction Log
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {filtered.length} entries matching filters
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-2xl shadow-slate-100">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Date/Time
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Reference
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Invoice
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Customer
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Method
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-500">
                    {format(new Date(p.paymentDate), "dd MMM, HH:mm")}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-700">
                    {p.reference || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-violet-600 font-bold">
                    {p.invoiceNumber || "—"}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-800">
                    {p.customerName || "Walk-in Guest"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md font-black text-[9px] uppercase tracking-tighter text-slate-500 border border-slate-200">
                      {p.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-black text-slate-900">
                    ${Number(p.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-20 text-slate-300 font-black uppercase tracking-widest opacity-50 italic"
                  >
                    No matching transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CashCollectionReport({
  companyId,
  dateRange,
  search,
}: ReportProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [collectionTarget, setCollectionTarget] = useState<any>(null);
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionReason, setCollectionReason] = useState("");
  const {
    data = [],
    isLoading,
    error,
  } = useQuery<any[]>({
    queryKey: [
      "reports/cash-collections",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const start = dateRange.from.toISOString();
      const end = dateRange.to.toISOString();
      const res = await apiFetch(
        `/api/companies/${companyId}/reports/cash-collections?from=${start}&to=${end}`,
      );
      if (!res.ok)
        throw new Error(`Failed to load cashier collections (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });
  const { data: balances = [], isLoading: balancesLoading } = useQuery<any[]>({
    queryKey: ["reports/cash-collection-balances", companyId],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/companies/${companyId}/reports/cash-collection-balances`,
      );
      if (!res.ok)
        throw new Error(`Failed to load collection balances (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });
  const { data: pendingOfflineSales = [] } = useQuery<any[]>({
    queryKey: ["reports/local-pending-offline-sales", companyId],
    queryFn: async () => {
      const pending = await getPendingSales(companyId);
      return pending.filter(
        (sale) => sale.status === "pending" || sale.status === "failed",
      );
    },
    enabled: !!companyId,
    refetchInterval: 10_000,
  });

  const filtered = filterRecords(data, search, [
    "cashierName",
    "reason",
    "shiftId",
  ]);

  const balancesWithPendingOffline = useMemo(() => {
    const rows = new Map<string, any>();
    for (const balance of balances) {
      const key = balance.userId || balance.cashierName || "unknown";
      rows.set(key, { ...balance, pendingOfflineCash: 0 });
    }

    for (const sale of pendingOfflineSales) {
      const invoice = sale.invoiceData || {};
      const userId = invoice.createdBy || "local-pending";
      const key = userId;
      const method = String(invoice.paymentMethod || "CASH").toUpperCase();
      let cashAmount = 0;
      if (method === "CASH") {
        cashAmount = Number(invoice.total || 0);
      } else if (method === "SPLIT" && Array.isArray(invoice.splitPayments)) {
        cashAmount = invoice.splitPayments
          .filter(
            (payment: any) =>
              String(payment.method || "").toUpperCase() === "CASH",
          )
          .reduce(
            (sum: number, payment: any) => sum + Number(payment.amount || 0),
            0,
          );
      }
      if (cashAmount <= 0) continue;

      const row = rows.get(key) || {
        userId: userId === "local-pending" ? null : userId,
        cashierName: "Local Pending Offline",
        cashSales: "0.00",
        collections: "0.00",
        expectedCash: "0.00",
        lastCollectionAt: null,
        pendingOfflineCash: 0,
      };
      row.pendingOfflineCash = Number(row.pendingOfflineCash || 0) + cashAmount;
      row.cashSales = (Number(row.cashSales || 0) + cashAmount).toFixed(2);
      row.expectedCash = (Number(row.expectedCash || 0) + cashAmount).toFixed(
        2,
      );
      rows.set(key, row);
    }

    return Array.from(rows.values()).sort(
      (a, b) => Number(b.expectedCash || 0) - Number(a.expectedCash || 0),
    );
  }, [balances, pendingOfflineSales]);

  const stats = useMemo(() => {
    const total = filtered.reduce((sum, r) => sum + Number(r.amount), 0);
    const expected = balancesWithPendingOffline.reduce(
      (sum, r) => sum + Number(r.expectedCash || 0),
      0,
    );
    return { total, expected };
  }, [filtered, balancesWithPendingOffline]);

  const collectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        `/api/companies/${companyId}/cash-collections`,
        {
          method: "POST",
          body: JSON.stringify({
            cashierId: collectionTarget?.userId,
            amount: Number(collectionAmount),
            reason:
              collectionReason ||
              `Cash collection from ${collectionTarget?.cashierName || "cashier"}`,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to record cash collection");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Cash collected",
        description: "The cashier balance was updated.",
      });
      setCollectionTarget(null);
      setCollectionAmount("");
      setCollectionReason("");
      queryClient.invalidateQueries({
        queryKey: ["reports/cash-collections", companyId],
      });
      queryClient.invalidateQueries({
        queryKey: ["reports/cash-collection-balances", companyId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard-cash-collection-balances", companyId],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Collection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    );
  if (error)
    return <EmptyState message="Failed to load cashier collection report" />;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between">
            <p className=" font-semibold text-[#64748B]">
              Total Collected (Drops)
            </p>
            <div className="h-9 w-9 rounded-[10px] bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#1D4ED8]  font-extrabold">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-[26px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">
            $
            {stats.total.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="mt-3 text-[10px] font-bold text-[#64748B] uppercase tracking-widest">
            {filtered.length} COLLECTIONS
          </p>
        </div>

        <div className="rounded-[14px] border border-[#FEF3C7] bg-[#FFFBEB] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between">
            <p className=" font-semibold text-[#B45309]">
              Expected Uncollected Cash
            </p>
            <div className="h-9 w-9 rounded-[10px] bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center text-[#B45309]  font-extrabold">
              <TriangleAlert className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-[26px] leading-none font-bold tracking-[-0.015em] text-[#0F172A]">
            $
            {stats.expected.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="mt-3 text-[10px] font-bold text-[#B45309]/80 uppercase tracking-widest">
            {balancesWithPendingOffline.length} CASHIER BALANCES
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className=" font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
            Expected Cash By Cashier
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Cash sales less recorded collections
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-2xl shadow-slate-100">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Cashier
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">
                  Cash Sales
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">
                  Collected
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">
                  Pending Offline
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">
                  Expected
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Last Collection
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {balancesLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-12 text-slate-300 font-bold"
                  >
                    Loading cashier balances...
                  </td>
                </tr>
              ) : (
                balancesWithPendingOffline.map((r) => (
                  <tr
                    key={r.userId || r.cashierName}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {r.cashierName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                      ${Number(r.cashSales).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                      ${Number(r.collections).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-black text-orange-600">
                      ${Number(r.pendingOfflineCash || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-amber-700">
                      ${Number(r.expectedCash).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.lastCollectionAt
                        ? format(
                            new Date(r.lastCollectionAt),
                            "dd MMM yyyy, HH:mm",
                          )
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        className="h-8 rounded-xl bg-slate-900 text-[10px] font-black text-white hover:bg-slate-800"
                        disabled={!r.userId || Number(r.expectedCash) <= 0}
                        onClick={() => {
                          setCollectionTarget(r);
                          setCollectionAmount(
                            Number(r.expectedCash).toFixed(2),
                          );
                          setCollectionReason("");
                        }}
                      >
                        Collect
                      </Button>
                    </td>
                  </tr>
                ))
              )}
              {!balancesLoading && balancesWithPendingOffline.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-16 text-slate-300 font-black uppercase tracking-widest opacity-50 italic"
                  >
                    No cashier cash balances found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className=" font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
            Cashier Collections (Drops)
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {filtered.length} entries
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-2xl shadow-slate-100">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Date/Time
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Cashier
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Shift ID
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">
                  Reason / Reference
                </th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-500">
                    {format(new Date(r.createdAt), "dd MMM yyyy, HH:mm")}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-800">
                    {r.cashierName}
                  </td>
                  <td className="px-4 py-3 font-mono text-violet-600 font-bold">
                    #{r.shiftId}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.reason || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-slate-900">
                    ${Number(r.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-20 text-slate-300 font-black uppercase tracking-widest opacity-50 italic"
                  >
                    No collections found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={!!collectionTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCollectionTarget(null);
            setCollectionAmount("");
            setCollectionReason("");
          }
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Collect Cash</DialogTitle>
            <DialogDescription>
              Record cash collected from {collectionTarget?.cashierName}.
              Expected balance is $
              {Number(collectionTarget?.expectedCash || 0).toFixed(2)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Amount Collected
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={collectionAmount}
                onChange={(event) => setCollectionAmount(event.target.value)}
                className="mt-2 rounded-xl font-mono font-black"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Reference / Notes
              </label>
              <Textarea
                value={collectionReason}
                onChange={(event) => setCollectionReason(event.target.value)}
                placeholder="e.g. Cash picked up by owner"
                className="mt-2 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setCollectionTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
              disabled={
                collectMutation.isPending ||
                !collectionAmount ||
                Number(collectionAmount) <= 0
              }
              onClick={() => collectMutation.mutate()}
            >
              {collectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Record Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
