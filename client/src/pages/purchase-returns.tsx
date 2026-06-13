import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  usePurchaseReturns,
  type PurchaseReturn,
} from "@/hooks/use-purchase-returns";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Ban,
  CheckCircle2,
  ArrowRightLeft,
  Edit2,
  Eye,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

// ─────────────────────────────────────────────
// Status meta
// ─────────────────────────────────────────────
const STATUS_META = {
  DRAFT: {
    label: "Draft",
    icon: FileText,
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    tabActive: "bg-slate-600 text-white border-slate-600",
    tab: "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    tabActive: "bg-blue-600 text-white border-blue-600",
    tab: "border-blue-300 bg-white text-blue-700 hover:bg-slate-50",
  },
  SHIPPED: {
    label: "Shipped",
    icon: Package,
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    tabActive: "bg-indigo-600 text-white border-indigo-600",
    tab: "border-indigo-300 bg-white text-indigo-700 hover:bg-slate-50",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    tabActive: "bg-emerald-600 text-white border-emerald-600",
    tab: "border-emerald-300 bg-white text-emerald-700 hover:bg-slate-50",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: Ban,
    badge: "border-red-200 bg-red-50 text-red-600",
    tabActive: "bg-red-500 text-white border-red-500",
    tab: "border-red-300 bg-white text-red-600 hover:bg-slate-50",
  },
} as const;

function StatusBadge({ status }: { status: PurchaseReturn["status"] }) {
  const meta = STATUS_META[status];
  const Icon = meta?.icon || FileText;
  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold text-xs", meta?.badge)}>
      <Icon className="h-3 w-3" />
      {meta?.label || status}
    </Badge>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function PurchaseReturnsPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { data: returns = [], isLoading } = usePurchaseReturns(companyId);
  const [, setLocation] = useLocation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let result = returns;
    if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(
      (o) =>
        o.returnNumber.toLowerCase().includes(q) ||
        (o.supplierName || "").toLowerCase().includes(q) ||
        (o.reason || "").toLowerCase().includes(q),
    );
    return result;
  }, [returns, search, statusFilter]);

  return (
    <Layout>
      <PageHeader
        title="Purchase Returns"
        subtitle="Manage supplier returns, refunds, and replacements."
        actions={
          <Button onClick={() => setLocation("/inventory/purchase-returns/new")} className="rounded-xl font-bold gap-2">
            <Plus className="h-4 w-4" />
            New Purchase Return
          </Button>
        }
      />

      {/* Search + Status Tabs */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PR number or supplier..."
            className="pl-9 rounded-xl border-slate-200 bg-white shadow-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
              statusFilter === "all"
                ? "border-blue-500 bg-blue-500 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            <Package className="h-3.5 w-3.5" />
            All
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-black",
              statusFilter === "all" ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500",
            )}>
              {returns.length}
            </span>
          </button>

          {(["DRAFT", "APPROVED", "SHIPPED", "COMPLETED", "CANCELLED"] as const).map((status) => {
            const meta = STATUS_META[status];
            const count = returns.filter((o) => o.status === status).length;
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(isActive ? "all" : status)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                  isActive ? meta.tabActive : meta.tab,
                )}
              >
                <meta.icon className="h-3.5 w-3.5" />
                {meta.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                  isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500",
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden rounded-[18px] border-slate-200 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="p-4">PR Number</th>
                <th className="p-4">Supplier</th>
                <th className="p-4">Branch</th>
                <th className="p-4">Lines</th>
                <th className="p-4">Total Value</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading purchase returns...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <ArrowRightLeft className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                    <p className="font-bold text-slate-500">No purchase returns found</p>
                    <p className="text-sm">Create a PR to start tracking returns to suppliers.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((ret) => (
                  <tr
                    key={ret.id}
                    className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/inventory/purchase-returns/${ret.id}`)}
                  >
                    <td className="p-4">
                      <p className="font-mono text-xs font-bold text-slate-900">{ret.returnNumber}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {ret.createdAt ? format(new Date(ret.createdAt), "dd MMM yyyy") : "—"}
                      </p>
                    </td>
                    <td className="p-4 font-semibold text-slate-700">
                      {ret.supplierName || "—"}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {ret.branchName || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-4 text-sm font-semibold text-slate-700">
                      {ret.lineCount} {ret.lineCount === 1 ? "line" : "lines"}
                    </td>
                    <td className="p-4 font-bold text-slate-900">
                      ${Number(ret.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <StatusBadge status={ret.status} />
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg text-xs gap-1"
                          onClick={() => setLocation(`/inventory/purchase-returns/${ret.id}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                        {["DRAFT", "APPROVED"].includes(ret.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-xs gap-1"
                            onClick={() => setLocation(`/inventory/purchase-returns/${ret.id}?edit=true`)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Layout>
  );
}
