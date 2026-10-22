import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiFetch } from "@/lib/api";
import { downloadCsv, generateCsv } from "@/lib/report-utils";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import {
  ArrowDownToLine,
  BarChart3,
  Building2,
  CreditCard,
  DollarSign,
  Loader2,
  Package,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";

type BranchPerformanceRow = {
  branchId: number | null;
  branchName: string;
  salesTotal: number;
  invoiceCount: number;
  paymentsTotal: number;
  paymentCount: number;
  expensesTotal: number;
  stockValue: number;
  stockQuantity: number;
  transferOutCount: number;
  transferInCount: number;
  pendingTransferOutCount: number;
  pendingTransferInCount: number;
  adjustmentCount: number;
  adjustmentQuantity: number;
  grossActivity: number;
};

type BranchPerformanceResponse = {
  startDate: string;
  endDate: string;
  pendingGdnCount: number;
  totals: {
    salesTotal: number;
    invoiceCount: number;
    paymentsTotal: number;
    expensesTotal: number;
    stockValue: number;
    stockQuantity: number;
    pendingTransferOutCount: number;
    pendingTransferInCount: number;
    adjustmentCount: number;
  };
  branches: BranchPerformanceRow[];
};

const money = (value: number) =>
  `USD ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function BranchReportsPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const [startDate, setStartDate] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } =
    useQuery<BranchPerformanceResponse>({
      queryKey: ["branch-performance-report", companyId, startDate, endDate],
      enabled: !!companyId,
      queryFn: async () => {
        const res = await apiFetch(
          `/api/companies/${companyId}/reports/branch-performance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Failed to load branch report");
        }
        return res.json();
      },
    });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.branches || [];
    return (data?.branches || []).filter((row) =>
      row.branchName.toLowerCase().includes(q),
    );
  }, [data?.branches, search]);

  const handleExport = () => {
    const exportRows = rows.map((row) => ({
      Branch: row.branchName,
      Sales: row.salesTotal,
      Invoices: row.invoiceCount,
      Payments: row.paymentsTotal,
      Expenses: row.expensesTotal,
      "Stock Value": row.stockValue,
      "Stock Qty": row.stockQuantity,
      "Pending Transfers In": row.pendingTransferInCount,
      "Pending Transfers Out": row.pendingTransferOutCount,
      Adjustments: row.adjustmentCount,
    }));
    const csv = generateCsv(
      exportRows,
      [
        "Branch",
        "Sales",
        "Invoices",
        "Payments",
        "Expenses",
        "Stock Value",
        "Stock Qty",
        "Pending Transfers In",
        "Pending Transfers Out",
        "Adjustments",
      ],
    );
    downloadCsv(
      `Branch_Performance_${startDate}_to_${endDate}.csv`,
      csv,
    );
  };

  return (
    <Layout>
      <PageHeader
        title="Branch Performance"
        subtitle="Consolidated branch sales, collections, stock, transfers, and operating activity."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button onClick={handleExport} disabled={!rows.length}>
              <ArrowDownToLine className="h-4 w-4" />
              Export
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[160px_160px_1fr]">
        <Input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <Input
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search branch or warehouse..."
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard
          label="Sales"
          value={money(data?.totals.salesTotal || 0)}
          icon={DollarSign}
          tone="emerald"
        />
        <SummaryStatCard
          label="Collections"
          value={money(data?.totals.paymentsTotal || 0)}
          icon={CreditCard}
          tone="blue"
        />
        <SummaryStatCard
          label="Stock Value"
          value={money(data?.totals.stockValue || 0)}
          icon={Package}
          tone="violet"
        />
        <SummaryStatCard
          label="Pending Ops"
          value={
            (data?.totals.pendingTransferInCount || 0) +
            (data?.totals.pendingTransferOutCount || 0) +
            (data?.pendingGdnCount || 0)
          }
          icon={Truck}
          tone="amber"
        />
      </div>

      <Card className="overflow-hidden rounded-[14px] border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="p-4">Branch</th>
                <th className="p-4 text-right">Sales</th>
                <th className="p-4 text-right">Collections</th>
                <th className="p-4 text-right">Expenses</th>
                <th className="p-4 text-right">Stock</th>
                <th className="p-4 text-right">Transfers</th>
                <th className="p-4 text-right">Adjustments</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading branch report...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-500">
                    <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    No branch activity for this range.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.branchId ?? "warehouse"} className="border-b border-slate-50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          {row.branchId == null ? (
                            <Package className="h-4 w-4" />
                          ) : (
                            <Building2 className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{row.branchName}</p>
                          <p className="text-[11px] font-medium text-slate-500">
                            {row.invoiceCount} invoices - {row.paymentCount} payments
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right font-semibold text-slate-800">
                      {money(row.salesTotal)}
                    </td>
                    <td className="p-4 text-right font-semibold text-slate-800">
                      {money(row.paymentsTotal)}
                    </td>
                    <td className="p-4 text-right font-semibold text-slate-800">
                      {money(row.expensesTotal)}
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-semibold text-slate-800">{money(row.stockValue)}</p>
                      <p className="text-[11px] font-medium text-slate-500">
                        Qty {Number(row.stockQuantity || 0).toFixed(2)}
                      </p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-semibold text-slate-800">
                        In {row.transferInCount} / Out {row.transferOutCount}
                      </p>
                      <p className="text-[11px] font-medium text-amber-600">
                        Pending {row.pendingTransferInCount + row.pendingTransferOutCount}
                      </p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-semibold text-slate-800">
                        {row.adjustmentCount}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500">
                        Qty {Number(row.adjustmentQuantity || 0).toFixed(2)}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {data?.pendingGdnCount ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {data.pendingGdnCount} GDN{data.pendingGdnCount === 1 ? "" : "s"} pending
          admin confirmation. GDNs are company-level until delivery notes carry
          a receiving branch/location.
        </div>
      ) : null}
    </Layout>
  );
}
