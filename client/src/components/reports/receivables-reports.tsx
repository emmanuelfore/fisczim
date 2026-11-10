import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { filterRecords, computeTotal } from "@/lib/report-utils";
import { format, isValid } from "date-fns";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReportExport } from "./report-export";

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

// ── ArAgingSummaryReport ──────────────────────────────────────────────────────

export function ArAgingSummaryReport({
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
      "reports/ar-aging-summary",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(companyId, "ar-aging-summary", dateRange),
      );
      if (!res.ok)
        throw new Error(`Failed to load AR aging summary (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, ["customerName"]);
  const total = computeTotal(filtered, "total");

  useReportExport(() => ({
    label: "ar-aging-summary",
    columns: [
      { key: "customerName", header: "Customer" },
      { key: "current", header: "Current" },
      { key: "days1_30", header: "1-30" },
      { key: "days31_60", header: "31-60" },
      { key: "days61_90", header: "61-90" },
      { key: "days90plus", header: "90+" },
      { key: "total", header: "Total" },
    ],
    rows: filtered,
  }));

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
            AR Aging Summary
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No aging data in this period" />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Customer
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Current
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  1-30
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  31-60
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  61-90
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  90+
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
                    {row.customerName}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.current}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.days1_30}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.days31_60}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.days61_90}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.days90plus}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
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
              {selectedRow.customerName}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DetailCard label="Current" value={selectedRow.current} />
              <DetailCard label="1-30 Days" value={selectedRow.days1_30} />
              <DetailCard label="31-60 Days" value={selectedRow.days31_60} />
              <DetailCard label="61-90 Days" value={selectedRow.days61_90} />
              <DetailCard label="90+ Days" value={selectedRow.days90plus} />
              <DetailCard label="Total" value={selectedRow.total} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── InvoiceDetailsReport ──────────────────────────────────────────────────────

export function InvoiceDetailsReport({
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
      "reports/invoice-details",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(companyId, "invoice-details", dateRange),
      );
      if (!res.ok)
        throw new Error(`Failed to load invoice details (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, [
    "invoiceNumber",
    "customerName",
    "status",
  ]);
  const total = computeTotal(filtered, "total");

  useReportExport(() => ({
    label: "invoice-details",
    columns: [
      { key: "invoiceNumber", header: "Invoice#" },
      { key: "customerName", header: "Customer" },
      { key: "issueDate", header: "Issue Date" },
      { key: "dueDate", header: "Due Date" },
      { key: "status", header: "Status" },
      { key: "total", header: "Total" },
      { key: "paidAmount", header: "Paid" },
      { key: "balanceDue", header: "Balance" },
    ],
    rows: filtered,
  }));

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
            Invoice Details
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No invoices in this period" />
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
                  Due Date
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Status
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Total
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Paid
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Balance
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
                    {fmtDate(row.dueDate)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.status}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
                    {row.total}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.paidAmount}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.balanceDue}
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
                label="Due Date"
                value={fmtDate(selectedRow.dueDate)}
              />
              <DetailCard label="Status" value={selectedRow.status} />
              <DetailCard label="Total" value={selectedRow.total} />
              <DetailCard label="Paid Amount" value={selectedRow.paidAmount} />
              <DetailCard label="Balance Due" value={selectedRow.balanceDue} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CustomerBalanceSummaryReport ──────────────────────────────────────────────

export function CustomerBalanceSummaryReport({
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
      "reports/customer-balance-summary",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(companyId, "customer-balance-summary", dateRange),
      );
      if (!res.ok)
        throw new Error(
          `Failed to load customer balance summary (${res.status})`,
        );
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, ["customerName"]);
  const total = computeTotal(filtered, "balance");

  useReportExport(() => ({
    label: "customer-balance-summary",
    columns: [
      { key: "customerName", header: "Customer" },
      { key: "totalInvoiced", header: "Invoiced" },
      { key: "totalPaid", header: "Paid" },
      { key: "balance", header: "Balance" },
    ],
    rows: filtered,
  }));

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
            Customer Balances
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No customer balances in this period" />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2 font-bold text-slate-500">
                  Customer
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Invoiced
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Paid
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Balance
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
                    {row.customerName}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.totalInvoiced}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.totalPaid}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
                    {row.balance}
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
              {selectedRow.customerName}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DetailCard
                label="Total Invoiced"
                value={selectedRow.totalInvoiced}
              />
              <DetailCard label="Total Paid" value={selectedRow.totalPaid} />
              <DetailCard label="Balance" value={selectedRow.balance} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ReceivableDetailsReport ───────────────────────────────────────────────────

export function ReceivableDetailsReport({
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
      "reports/receivable-details",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const res = await apiFetch(
        buildUrl(companyId, "receivable-details", dateRange),
      );
      if (!res.ok)
        throw new Error(`Failed to load receivable details (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, [
    "invoiceNumber",
    "customerName",
    "status",
  ]);
  const total = computeTotal(filtered, "balanceDue");

  useReportExport(() => ({
    label: "receivable-details",
    columns: [
      { key: "invoiceNumber", header: "Invoice#" },
      { key: "customerName", header: "Customer" },
      { key: "issueDate", header: "Issue Date" },
      { key: "total", header: "Total" },
      { key: "paidAmount", header: "Paid" },
      { key: "balanceDue", header: "Balance" },
      { key: "status", header: "Status" },
    ],
    rows: filtered,
  }));

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
            Receivable Details
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No receivables in this period" />
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
                  Total
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Paid
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Balance
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Status
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
                    {row.total}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.paidAmount}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
                    {row.balanceDue}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.status}
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
              <DetailCard label="Total" value={selectedRow.total} />
              <DetailCard label="Paid Amount" value={selectedRow.paidAmount} />
              <DetailCard label="Balance Due" value={selectedRow.balanceDue} />
              <DetailCard label="Status" value={selectedRow.status} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BadDebtsReport ────────────────────────────────────────────────────────────

export function BadDebtsReport({ companyId, dateRange, search }: ReportProps) {
  const [selectedRow, setSelectedRow] = useState<any>(null);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery<any[]>({
    queryKey: ["reports/bad-debts", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(buildUrl(companyId, "bad-debts", dateRange));
      if (!res.ok) throw new Error(`Failed to load bad debts (${res.status})`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const filtered = filterRecords(data, search, [
    "invoiceNumber",
    "customerName",
  ]);
  const total = computeTotal(filtered, "balanceDue");

  useReportExport(() => ({
    label: "bad-debts",
    columns: [
      { key: "invoiceNumber", header: "Invoice#" },
      { key: "customerName", header: "Customer" },
      { key: "dueDate", header: "Due Date" },
      { key: "daysOverdue", header: "Days Overdue" },
      { key: "balanceDue", header: "Balance Due" },
    ],
    rows: filtered,
  }));

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
            Bad Debts
          </span>
          <span className="text-xs font-black text-slate-700">
            {filtered.length} rows · {total.toFixed(2)}
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No bad debts in this period" />
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
                  Due Date
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Days Overdue
                </th>
                <th className="text-right px-4 py-2 font-bold text-slate-500">
                  Balance Due
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
                    {fmtDate(row.dueDate)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {row.daysOverdue}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-slate-800">
                    {row.balanceDue}
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
                label="Due Date"
                value={fmtDate(selectedRow.dueDate)}
              />
              <DetailCard
                label="Days Overdue"
                value={selectedRow.daysOverdue}
              />
              <DetailCard label="Balance Due" value={selectedRow.balanceDue} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
