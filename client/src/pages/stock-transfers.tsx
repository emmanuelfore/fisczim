import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  StockTransferView,
  useStockTransfers,
} from "@/hooks/use-stock-transfers";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useBranchContext } from "@/lib/branch-context";


const STATUS_META = {
  DRAFT: {
    label: "Draft",
    icon: FileText,
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    tab: "border-blue-300 bg-blue-50 text-blue-700",
    tabActive: "bg-blue-500 text-white border-blue-500",
  },
  PENDING_APPROVAL: {
    label: "Pending Approval",
    icon: Clock,
    badge: "border-purple-200 bg-purple-50 text-purple-700",
    tab: "border-purple-300 bg-purple-50 text-purple-700",
    tabActive: "bg-purple-500 text-white border-purple-500",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    tab: "border-indigo-300 bg-indigo-50 text-indigo-700",
    tabActive: "bg-indigo-500 text-white border-indigo-500",
  },
  IN_TRANSIT: {
    label: "In Transit",
    icon: Clock,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    tab: "border-amber-400 bg-amber-50 text-amber-700",
    tabActive: "bg-amber-500 text-white border-amber-500",
  },
  RECEIVED: {
    label: "Received",
    icon: CheckCircle2,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    tab: "border-emerald-400 bg-emerald-50 text-emerald-700",
    tabActive: "bg-emerald-500 text-white border-emerald-500",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: Ban,
    badge: "border-slate-200 bg-slate-50 text-slate-500",
    tab: "border-slate-300 bg-slate-50 text-slate-500",
    tabActive: "bg-slate-500 text-white border-slate-500",
  },
} as const;

function StatusBadge({ status }: { status: StockTransferView["status"] }) {
  const meta = STATUS_META[status] || STATUS_META.DRAFT;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold", meta.badge)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

export default function StockTransfersPage() {
  const [, setLocation] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { selectedBranchId } = useBranchContext();
  
  const { data: transfers = [], isLoading } = useStockTransfers(companyId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTransfers = useMemo(() => {
    let result = transfers;
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((t) => 
        t.transferNumber.toLowerCase().includes(lower) ||
        t.fromLocationName.toLowerCase().includes(lower) ||
        t.toLocationName.toLowerCase().includes(lower)
      );
    }
    return result;
  }, [statusFilter, transfers, searchTerm]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Search className="h-5 w-5" />
            </div>
            <div className="relative group min-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search by transfer number or location..."
                className="pl-9 h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={() => setLocation("/inventory/transfers/new")}
            disabled={!companyId}
            className="h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Transfer</span>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-all shadow-sm",
              statusFilter === "all"
                ? "border-primary bg-primary text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            <Package className="h-4 w-4" />
            All Transfers
            <span className={cn(
              "ml-1 rounded-full px-2 py-0.5 text-[10px] font-black",
              statusFilter === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
            )}>
              {transfers.length}
            </span>
          </button>

          {(["DRAFT", "PENDING_APPROVAL", "APPROVED", "IN_TRANSIT", "RECEIVED", "CANCELLED"] as const).map((status) => {
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            const count = transfers.filter((t) => t.status === status).length;
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(isActive ? "all" : status)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-all shadow-sm",
                  isActive ? meta.tabActive : cn("bg-white hover:bg-slate-50 border-slate-200 text-slate-600")
                )}
              >
                <Icon className="h-4 w-4" />
                {meta.label}
                <span className={cn(
                  "ml-1 rounded-full px-2 py-0.5 text-[10px] font-black",
                  isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <Card className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="bg-white border-b border-slate-100 px-6 py-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-slate-800 font-display">
                Stock Transfers Register
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="p-4 pl-6">Transfer #</th>
                  <th className="p-4">Direction</th>
                  <th className="p-4">Route</th>
                  <th className="p-4">Items</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Loading transfers...
                    </td>
                  </tr>
                ) : filteredTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-500">
                      <Package className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      No stock transfers found.
                    </td>
                  </tr>
                ) : (
                  filteredTransfers.map((transfer) => (
                    <tr key={transfer.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6">
                        <p className="font-mono text-sm font-bold text-slate-900">{transfer.transferNumber}</p>
                        <p className="text-xs font-medium text-slate-500">
                          {transfer.dispatchedAt
                            ? format(new Date(transfer.dispatchedAt), "dd MMM yyyy HH:mm")
                            : "—"}
                        </p>
                      </td>
                      <td className="p-4">
                        {transfer.toBranchId === selectedBranchId ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Incoming
                          </Badge>
                        ) : transfer.fromBranchId === selectedBranchId ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            Outgoing
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-semibold gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                            Internal
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <Warehouse className="h-4 w-4 text-blue-500" />
                          <span className="truncate max-w-[120px]">{transfer.fromLocationName}</span>
                          <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px] text-blue-700">{transfer.toLocationName}</span>
                        </div>
                        {transfer.notes && (
                          <p className="mt-1 max-w-md truncate text-[11px] text-slate-400">{transfer.notes}</p>
                        )}
                      </td>
                      <td className="p-4 text-sm font-semibold text-slate-600">
                        {transfer.lineCount} lines / Qty{" "}
                        <span className="font-bold text-slate-800">{Number(transfer.totalQuantity || 0).toFixed(2)}</span>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={transfer.status} />
                      </td>
                      <td className="p-4 text-right pr-6">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-xl text-xs font-bold gap-2"
                          onClick={() => setLocation(`/inventory/transfers/${transfer.id}`)}
                        >
                          <FileText className="h-4 w-4" />
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
