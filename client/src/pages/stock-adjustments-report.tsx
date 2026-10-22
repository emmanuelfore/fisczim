import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import {
  ArrowLeft,
  AlertTriangle,
  Download,
  History,
  Search,
  TrendingUp,
  User,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useStockAdjustmentsReport } from "@/hooks/use-reports";

const ADJUSTMENT_TYPES = ["ADJUSTMENT", "SHRINKAGE", "CORRECTION", "DAMAGE", "EXPIRY"] as const;

export default function StockAdjustmentsReportPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: adjustments = [], isLoading } = useStockAdjustmentsReport(companyId, startDate, endDate);

  const filteredAdjustments = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();

    return adjustments.filter((adjustment) => {
      const matchesSearch =
        !query ||
        adjustment.productName.toLowerCase().includes(query) ||
        (adjustment.sku || "").toLowerCase().includes(query) ||
        (adjustment.notes || "").toLowerCase().includes(query) ||
        (adjustment.userName || "").toLowerCase().includes(query) ||
        (adjustment.reference || "").toLowerCase().includes(query);
      const matchesType = typeFilter === "all" || adjustment.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [adjustments, searchTerm, typeFilter]);

  const adjustmentEvents = filteredAdjustments.length;
  const netAdjustmentQty = filteredAdjustments.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const negativeAdjustments = filteredAdjustments.filter((item) => Number(item.quantity || 0) < 0).length;
  const uniqueAdjusters = new Set(filteredAdjustments.map((item) => item.userName || "System")).size;

  const exportCsv = () => {
    if (filteredAdjustments.length === 0) return;

    const headers = ["Date", "Product", "SKU", "Type", "Qty Change", "User", "Reference", "Notes"];
    const rows = filteredAdjustments.map((item) => [
      item.date ? format(new Date(item.date), "yyyy-MM-dd HH:mm") : "",
      item.productName,
      item.sku || "-",
      item.type,
      item.quantity,
      item.userName || "System",
      item.reference || "-",
      item.notes || "-",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Stock_Adjustments_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <PageHeader
        title="Past Stock Adjustments"
        subtitle="Review committed stock changes, users, reasons, and quantities"
        actions={
          <>
            <Link href="/inventory/adjustments">
              <Button variant="outline" className="rounded-xl">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Adjustments
              </Button>
            </Link>
            <Button onClick={exportCsv} disabled={filteredAdjustments.length === 0} className="rounded-xl">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryStatCard label="Adjustment Events" value={adjustmentEvents} icon={History} tone="violet" />
        <SummaryStatCard
          label="Net Qty Change"
          value={`${netAdjustmentQty > 0 ? "+" : ""}${netAdjustmentQty.toFixed(2)}`}
          icon={TrendingUp}
          tone={netAdjustmentQty < 0 ? "rose" : "emerald"}
        />
        <SummaryStatCard label="Negative Events" value={negativeAdjustments} icon={AlertTriangle} tone="amber" />
        <SummaryStatCard label="Users Involved" value={uniqueAdjusters} icon={User} tone="slate" />
      </div>

      <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
        <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col gap-4">
            <CardTitle className="text-lg font-black text-slate-900">Committed Adjustment Log</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_170px_170px] gap-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search product, SKU, reason, user, or reference..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-10 h-11 rounded-xl border-slate-200 bg-white"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="all">All Types</option>
                {ADJUSTMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 rounded-xl border-slate-200 bg-white" />
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 rounded-xl border-slate-200 bg-white" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Date</TableHead>
                <TableHead className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Product</TableHead>
                <TableHead className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Type</TableHead>
                <TableHead className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">Qty Change</TableHead>
                <TableHead className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">User</TableHead>
                <TableHead className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Reference</TableHead>
                <TableHead className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-12 text-center text-slate-400 font-semibold">
                    Loading committed adjustments...
                  </TableCell>
                </TableRow>
              ) : filteredAdjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-12 text-center text-slate-400 font-semibold">
                    No committed adjustments found for these filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAdjustments.map((adjustment) => {
                  const quantity = Number(adjustment.quantity || 0);
                  return (
                    <TableRow key={adjustment.transactionId} className="hover:bg-slate-50/50 border-b border-slate-50">
                      <TableCell className="p-5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {adjustment.date ? format(new Date(adjustment.date), "dd MMM yyyy HH:mm") : "-"}
                      </TableCell>
                      <TableCell className="p-5">
                        <div className="font-bold text-slate-800">{adjustment.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{adjustment.sku || "NO SKU"}</div>
                      </TableCell>
                      <TableCell className="p-5">
                        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider">
                          {adjustment.type}
                        </span>
                      </TableCell>
                      <TableCell className={`p-5 text-right font-black ${quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {quantity > 0 ? "+" : ""}
                        {quantity.toFixed(2)}
                      </TableCell>
                      <TableCell className="p-5 text-xs font-semibold text-slate-700">{adjustment.userName || "System"}</TableCell>
                      <TableCell className="p-5 text-xs text-slate-500 font-mono">{adjustment.reference || "-"}</TableCell>
                      <TableCell className="p-5 text-xs text-slate-500 max-w-[360px] truncate">{adjustment.notes || "-"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
