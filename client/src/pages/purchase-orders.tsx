import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranches } from "@/hooks/use-branches";
import { useProducts } from "@/hooks/use-products";
import {
  useCreateGdn,
  useCreatePurchaseOrder,
  usePurchaseOrders,
  useUpdatePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from "@/hooks/use-purchase-orders";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit2,
  Eye,
  FileText,
  Loader2,
  Package,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type DraftLine = {
  isFreetext?: boolean;
  productId: string;
  description?: string;
  accountCode?: string;
  quantity: string;
  unitCost: string;
  notes: string;
};

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
  SENT: {
    label: "Sent",
    icon: Send,
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    tabActive: "bg-blue-600 text-white border-blue-600",
    tab: "border-blue-300 bg-white text-blue-700 hover:bg-blue-50",
  },
  RECEIVED: {
    label: "Received",
    icon: CheckCircle2,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    tabActive: "bg-emerald-600 text-white border-emerald-600",
    tab: "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: Ban,
    badge: "border-red-200 bg-red-50 text-red-600",
    tabActive: "bg-red-500 text-white border-red-500",
    tab: "border-red-300 bg-white text-red-600 hover:bg-red-50",
  },
} as const;

function StatusBadge({ status }: { status: PurchaseOrder["status"] }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold text-xs", meta.badge)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const { activeCompany, activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { data: orders = [], isLoading } = usePurchaseOrders(companyId);
  const { mutate: updateStatus } = useUpdatePurchaseOrderStatus(companyId);
  const createGdn = useCreateGdn(companyId);
  const { toast } = useToast();

  const { can } = usePermissions();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [printing, setPrinting] = useState<PurchaseOrder | null>(null);

  if (!can("stock.view") && !can("grn.view")) {
    return (
      <Layout>
        <Card className="max-w-2xl mx-auto mt-8 border-rose-100 bg-rose-50/20">
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto mb-4 h-12 w-12 text-rose-300" />
            <h3 className="text-lg font-bold text-rose-900">Access Denied</h3>
            <p className="mt-2 text-sm text-rose-700">
              You do not have the required permissions to view Purchase Orders.
            </p>
            <p className="mt-1 text-xs text-rose-500 font-semibold">
              Required permission: stock.view or grn.view
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(
      (o) =>
        o.poNumber.toLowerCase().includes(q) ||
        (o.supplierName || "").toLowerCase().includes(q) ||
        (o.notes || "").toLowerCase().includes(q),
    );
    return result;
  }, [orders, search, statusFilter]);

  const [processingId, setProcessingId] = useState<number | null>(null);

  const handleCreateGdn = (order: PurchaseOrder) => {
    setProcessingId(order.id);
    createGdn.mutate(order.id, {
      onSuccess: (res: any) => {
        toast({
          title: "Draft GRV Created",
          description: `Document ${res.gdn?.gdnNumber || ""} is ready for review.`,
        });
        setLocation(`/inventory/grvs/${res.gdn?.id}`);
      },
      onError: (error: any) => {
        toast({ title: "Failed", description: error.message, variant: "destructive" });
        setProcessingId(null);
      },
    });
  };

  const handleStatusChange = (order: PurchaseOrder, status: PurchaseOrder["status"]) => {
    updateStatus(
      { id: order.id, status },
      {
        onSuccess: () => toast({ title: "Status updated", description: `${order.poNumber} → ${status}` }),
        onError: (error: any) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Layout>
      <PageHeader
        title="Purchase Orders"
        subtitle="Create and manage supplier orders. Generate receiving documents (GDN) when goods arrive."
        actions={
          <Button onClick={() => setLocation("/inventory/purchase-orders/new")} className="rounded-xl font-bold gap-2">
            <Plus className="h-4 w-4" />
            New Purchase Order
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
            placeholder="Search PO number or supplier..."
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
              {orders.length}
            </span>
          </button>

          {(["DRAFT", "SENT", "RECEIVED", "CANCELLED"] as const).map((status) => {
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            const count = orders.filter((o) => o.status === status).length;
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
                <Icon className="h-3.5 w-3.5" />
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
          {/* Mobile Card View */}
          <div className="grid grid-cols-1 gap-4 p-4 md:hidden bg-slate-50/50">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                Loading purchase orders...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                <p className="font-bold text-slate-500">No purchase orders found</p>
                <p className="text-sm">Create a PO to start tracking supplier orders.</p>
              </div>
            ) : (
              filtered.map((order) => {
                const totalOrdered = order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
                const totalReceived = order.items?.reduce((sum, item) => sum + Number(item.quantityReceived || 0), 0) || 0;
                const fulfillmentRatio = totalOrdered > 0 ? totalReceived / totalOrdered : 0;

                const getOverdueDays = (expectedDateStr?: string | null) => {
                  if (!expectedDateStr) return 0;
                  const expected = new Date(expectedDateStr);
                  expected.setHours(0, 0, 0, 0);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (expected < today) {
                    const diffTime = today.getTime() - expected.getTime();
                    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  }
                  return 0;
                };
                const overdueDays = getOverdueDays(order.expectedDate);

                return (
                  <div key={order.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm font-bold text-slate-900">{order.poNumber}</span>
                        <p className="text-xs text-slate-400">
                          {order.createdAt ? format(new Date(order.createdAt), "dd MMM yyyy") : "—"}
                        </p>
                        {order.approval ? (
                          order.approval.status === "pending" ? (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="inline-flex items-center font-bold text-[9px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Awaiting Approval
                              </span>
                            </div>
                          ) : order.approval.status === "approved" ? (
                            <p className="text-[10px] text-slate-500 flex items-center gap-1 font-semibold mt-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Auth: {order.approval.reviewerName || "Manager"}
                            </p>
                          ) : (
                            <p className="text-[10px] text-red-500 flex items-center gap-1 font-bold mt-1">
                              <Ban className="h-3 w-3" /> Rejected
                            </p>
                          )
                        ) : null}
                      </div>
                      <div className="text-right">
                        <span className="block font-bold text-slate-900 text-base mb-1.5">
                          {order.currency || "USD"} {Number(order.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-2 pt-3 border-t border-slate-100 text-sm">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Supplier</p>
                        <p className="font-semibold text-slate-700">{order.supplierName || "—"}</p>
                        <p className="text-[10px] text-slate-400">{order.branchName ? `📍 ${order.branchName}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Expected</p>
                        <p className="font-medium text-slate-600">
                          {order.expectedDate ? format(new Date(order.expectedDate), "dd MMM yyyy") : "—"}
                        </p>
                        {order.status === "SENT" && overdueDays > 0 && (
                          <Badge variant="destructive" className="mt-1 bg-red-50 text-red-700 border-red-200 font-bold text-[9px] gap-1 px-1.5 py-0 leading-none">
                            <Clock className="h-2.5 w-2.5" />
                            OVERDUE ({overdueDays}d)
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                        <span>Fulfillment: {totalReceived}/{totalOrdered} items</span>
                        <span>{Math.round(fulfillmentRatio * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            fulfillmentRatio === 1 ? "bg-emerald-500" : fulfillmentRatio > 0 ? "bg-blue-500" : "bg-slate-200"
                          )} 
                          style={{ width: `${Math.min(fulfillmentRatio * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2 pt-3 border-t border-slate-100 justify-end">
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setLocation(`/inventory/purchase-orders/${order.id}`)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setPrinting(order)}>
                        <Printer className="h-3.5 w-3.5 mr-1" /> Print
                      </Button>
                      {["DRAFT", "SENT"].includes(order.status) && (
                        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setLocation(`/inventory/purchase-orders/${order.id}?edit=true`)}>
                          <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      )}
                      {order.status === "DRAFT" && (
                        <Button size="sm" className="h-8 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleStatusChange(order, "SENT")}>
                          <Send className="h-3.5 w-3.5 mr-1" /> Send
                        </Button>
                      )}
                      {order.status !== "CANCELLED" && order.status !== "RECEIVED" && (!order.items || !order.items.every((i: any) => Number(i.quantityReceived || 0) >= Number(i.quantity))) && (
                        <Button size="sm" className="h-8 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleCreateGdn(order)} disabled={createGdn.isPending && processingId === order.id}>
                          {createGdn.isPending && processingId === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Truck className="h-3.5 w-3.5 mr-1" />}
                          Receive
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block w-full overflow-x-auto min-w-0">
            <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="p-4">PO Number & Status</th>
                <th className="p-4">Supplier & Branch</th>
                <th className="p-4">Expected</th>
                <th className="p-4">Fulfillment</th>
                <th className="p-4">Total</th>
                <th className="p-4">References</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading purchase orders...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                    <p className="font-bold text-slate-500">No purchase orders found</p>
                    <p className="text-sm">Create a PO to start tracking supplier orders.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const totalOrdered = order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
                  const totalReceived = order.items?.reduce((sum, item) => sum + Number(item.quantityReceived || 0), 0) || 0;
                  const fulfillmentRatio = totalOrdered > 0 ? totalReceived / totalOrdered : 0;

                  const getOverdueDays = (expectedDateStr?: string | null) => {
                    if (!expectedDateStr) return 0;
                    const expected = new Date(expectedDateStr);
                    expected.setHours(0, 0, 0, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (expected < today) {
                      const diffTime = today.getTime() - expected.getTime();
                      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }
                    return 0;
                  };
                  const overdueDays = getOverdueDays(order.expectedDate);

                  return (
                    <tr
                      key={order.id}
                      className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900">{order.poNumber}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {order.createdAt ? format(new Date(order.createdAt), "dd MMM yyyy") : "—"}
                        </p>
                        {order.approval ? (
                          order.approval.status === "pending" ? (
                            <div className="mt-1 flex items-center gap-1">
                              <span className="inline-flex items-center gap-0.5 font-bold text-[9px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                                Awaiting Approval
                              </span>
                              <a href="/approvals" className="text-[9px] font-black text-blue-600 hover:text-blue-700 hover:underline">
                                Review
                              </a>
                            </div>
                          ) : order.approval.status === "approved" ? (
                            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Auth: {order.approval.reviewerName || "Manager"}
                            </p>
                          ) : (
                            <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1 font-bold">
                              <Ban className="h-3 w-3" />
                              Rejected
                            </p>
                          )
                        ) : null}
                      </td>
                      <td className="p-4 font-semibold text-slate-700">
                        <div>{order.supplierName || "—"}</div>
                        <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                          {order.branchName ? `📍 ${order.branchName}` : <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-medium text-slate-600">
                        <div>
                          {order.expectedDate
                            ? format(new Date(order.expectedDate), "dd MMM yyyy")
                            : <span className="text-slate-300">—</span>}
                        </div>
                        {order.status === "SENT" && overdueDays > 0 && (
                          <Badge variant="destructive" className="mt-1 bg-red-50 text-red-700 border-red-200 font-bold text-[9px] gap-1 px-1.5 py-0 leading-none">
                            <Clock className="h-2.5 w-2.5" />
                            OVERDUE BY {overdueDays} DAYS
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="text-xs font-semibold text-slate-700">
                          {order.lineCount} {order.lineCount === 1 ? "line" : "lines"}
                        </div>
                        <div className="mt-1.5 w-28">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                            <span>{totalReceived}/{totalOrdered} items</span>
                            <span>{Math.round(fulfillmentRatio * 100)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-300",
                                fulfillmentRatio === 1 ? "bg-emerald-500" : fulfillmentRatio > 0 ? "bg-blue-500" : "bg-slate-200"
                              )} 
                              style={{ width: `${Math.min(fulfillmentRatio * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {order.currency || "USD"} {Number(order.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          {order.grvs && order.grvs.length > 0 ? (
                            order.grvs.map((g) => (
                              <a
                                key={g.id}
                                href={`/inventory/grvs/${g.id}`}
                                className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded transition-colors w-max"
                              >
                                <Truck className="h-2.5 w-2.5" />
                                {g.grvNumber || g.gdnNumber}
                              </a>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-300">No GRVs</span>
                          )}
                          {order.bills && order.bills.length > 0 ? (
                            order.bills.map((b) => (
                              <a
                                key={b.id}
                                href={`/supplier-invoices/${b.id}`}
                                className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded transition-colors w-max"
                              >
                                <FileText className="h-2.5 w-2.5" />
                                {b.invoiceNumber}
                              </a>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-300">No Bills</span>
                          )}
                        </div>
                      </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg text-xs gap-1"
                          onClick={() => setLocation(`/inventory/purchase-orders/${order.id}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg text-xs gap-1"
                          onClick={() => setPrinting(order)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Print
                        </Button>
                        {["DRAFT", "SENT"].includes(order.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-xs gap-1"
                            onClick={() => setLocation(`/inventory/purchase-orders/${order.id}?edit=true`)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        )}
                        {order.status === "DRAFT" && (
                          <Button
                            size="sm"
                            className="h-8 rounded-lg text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => handleStatusChange(order, "SENT")}
                          >
                            <Send className="h-3.5 w-3.5" />
                            Send
                          </Button>
                        )}
                        {order.status !== "CANCELLED" && order.status !== "RECEIVED" && (!order.items || !order.items.every((i: any) => Number(i.quantityReceived || 0) >= Number(i.quantity))) && (
                          <Button
                            size="sm"
                            className="h-8 rounded-lg text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleCreateGdn(order)}
                            disabled={createGdn.isPending && processingId === order.id}
                          >
                            {createGdn.isPending && processingId === order.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Truck className="h-3.5 w-3.5" />
                            )}
                            Receive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {printing && (
        <PrintPODialog
          order={printing}
          company={activeCompany}
          onClose={() => setPrinting(null)}
        />
      )}
    </Layout>
  );
}

// ─────────────────────────────────────────────
// Print / PDF Dialog
// ─────────────────────────────────────────────
function PrintPODialog({
  order,
  company,
  onClose,
}: {
  order: PurchaseOrder;
  company: any;
  onClose: () => void;
}) {
  const handlePrint = () => {
    const statusColors: Record<string, { bg: string; color: string }> = {
      RECEIVED:  { bg: "#dcfce7", color: "#16a34a" },
      CANCELLED: { bg: "#fee2e2", color: "#dc2626" },
      SENT:      { bg: "#dbeafe", color: "#1d4ed8" },
      DRAFT:     { bg: "#f1f5f9", color: "#475569" },
    };
    const sc = statusColors[order.status] || statusColors.DRAFT;

    const itemRows = order.items.map((item, idx) => `
      <tr style="background:${idx % 2 === 1 ? "#f8fafc" : "white"}">
        <td style="padding:9px 12px;font-size:11px;color:#94a3b8">${idx + 1}</td>
        <td style="padding:9px 12px;font-weight:600">${item.productName || ""}</td>
        <td style="padding:9px 12px;font-family:monospace;font-size:11px;color:#64748b">${item.productSku || "—"}</td>
        <td style="padding:9px 12px;text-align:right;font-family:monospace;font-weight:700">${Number(item.quantity).toFixed(2)}</td>
        <td style="padding:9px 12px;text-align:right;font-family:monospace">${order.currency || "USD"} ${Number(item.unitCost).toFixed(2)}</td>
        <td style="padding:9px 12px;text-align:right;font-family:monospace;font-weight:700">${order.currency || "USD"} ${(Number(item.quantity) * Number(item.unitCost)).toFixed(2)}</td>
      </tr>`).join("");

    const notesHtml = order.notes ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:20px">
        <p style="font-size:9px;font-weight:800;text-transform:uppercase;color:#92400e;margin-bottom:4px">Notes / Special Instructions</p>
        <p style="font-size:12px;color:#78350f">${order.notes}</p>
      </div>` : "";

    const generatedAt = new Date().toLocaleString();

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Order — ${order.poNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 12px; padding: 32px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    @media print {
      body { padding: 20px; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px">
    <div>
      <p style="font-size:20px;font-weight:900;color:#2563eb">${company?.name || "Company"}</p>
      ${company?.address ? `<p style="font-size:11px;color:#64748b;margin-top:3px">${company.address}</p>` : ""}
      ${company?.phone ? `<p style="font-size:11px;color:#64748b">${company.phone}</p>` : ""}
      ${company?.tin ? `<p style="font-size:11px;color:#64748b">TIN: ${company.tin}</p>` : ""}
    </div>
    <div style="text-align:right">
      <h1 style="font-size:26px;font-weight:900;color:#1e293b">PURCHASE ORDER</h1>
      <p style="font-family:monospace;font-size:15px;font-weight:700;color:#2563eb;margin-top:4px">${order.poNumber}</p>
      <span style="display:inline-block;margin-top:6px;padding:3px 12px;border-radius:99px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.color}">${order.status}</span>
    </div>
  </div>

  <!-- Supplier + Meta -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px">
      <p style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#3b82f6;margin-bottom:6px">Supplier / Vendor</p>
      <p style="font-size:15px;font-weight:800;color:#1e40af">${order.supplierName || "—"}</p>
      ${order.branchName ? `<p style="font-size:11px;color:#3b82f6;margin-top:4px">Requesting Branch: ${order.branchName}</p>` : ""}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px">
        <p style="font-size:9px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">PO Number</p>
        <p style="font-size:12px;font-weight:700;font-family:monospace">${order.poNumber}</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px">
        <p style="font-size:9px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">Date Issued</p>
        <p style="font-size:12px;font-weight:700">${order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px">
        <p style="font-size:9px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">Expected Delivery</p>
        <p style="font-size:12px;font-weight:700">${order.expectedDate ? new Date(order.expectedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px">
        <p style="font-size:9px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">Lines</p>
        <p style="font-size:12px;font-weight:700">${order.lineCount}</p>
      </div>
    </div>
  </div>

  <!-- Items -->
  <table>
    <thead>
      <tr>
        <th style="background:#2563eb;color:white;padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">#</th>
        <th style="background:#2563eb;color:white;padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Product / Description</th>
        <th style="background:#2563eb;color:white;padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">SKU</th>
        <th style="background:#2563eb;color:white;padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Qty Ordered</th>
        <th style="background:#2563eb;color:white;padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Unit Cost</th>
        <th style="background:#2563eb;color:white;padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Line Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="padding:10px 12px;font-weight:800;background:#eff6ff;border-top:2px solid #bfdbfe;text-align:right;font-size:13px">ORDER TOTAL</td>
        <td style="padding:10px 12px;font-family:monospace;font-weight:900;background:#eff6ff;border-top:2px solid #bfdbfe;text-align:right;font-size:14px;color:#1d4ed8">${order.currency || "USD"} ${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  ${notesHtml}

  <!-- Signatures -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:48px">
    <div>
      <div style="height:52px;border-bottom:2px solid #334155;margin-bottom:8px"></div>
      <p style="font-size:11px;font-weight:700;color:#334155">Authorized by (Buyer)</p>
      <p style="font-size:10px;color:#94a3b8;margin-top:2px">Signature / Name / Date</p>
    </div>
    <div>
      <div style="height:52px;border-bottom:2px solid #334155;margin-bottom:8px"></div>
      <p style="font-size:11px;font-weight:700;color:#334155">Accepted by (Supplier)</p>
      <p style="font-size:10px;color:#94a3b8;margin-top:2px">Signature / Name / Date</p>
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8">
    <p>Document generated by ${company?.name || "FiscZim ERP"} &middot; ${generatedAt}</p>
    <p style="margin-top:2px">This is an official Purchase Order. Please retain for records. Any discrepancies must be communicated in writing within 5 business days.</p>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const total = order.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-600" />
            Print — {order.poNumber}
          </DialogTitle>
        </DialogHeader>

        {/* On-screen preview */}
        <div className="rounded-xl border border-slate-100 bg-white p-6 text-sm space-y-5">
          {/* Header */}
          <div className="flex justify-between items-start pb-4 border-b-2 border-blue-600">
            <div>
              <p className="text-xl font-black text-blue-600">{company?.name || "Company"}</p>
              {company?.address && <p className="text-xs text-slate-500 mt-0.5">{company.address}</p>}
              {company?.tin && <p className="text-xs text-slate-500">TIN: {company.tin}</p>}
              {order.shipTo && (
                <div className="mt-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ship To</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{order.shipTo}</p>
                </div>
              )}
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-black text-slate-900">PURCHASE ORDER</h2>
              <p className="font-mono font-bold text-blue-600 mt-1">{order.poNumber}</p>
              <StatusBadge status={order.status} />
            </div>
          </div>

          {/* Supplier + meta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-1">Supplier / Vendor</p>
              <p className="font-bold text-blue-900">{order.supplierName || "—"}</p>
              {order.branchName && <p className="text-xs text-blue-600 mt-1">Branch: {order.branchName}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { label: "PO Number", value: order.poNumber },
                { label: "Date Issued", value: order.createdAt ? format(new Date(order.createdAt), "dd MMM yyyy") : "—" },
                { label: "Expected", value: order.expectedDate ? format(new Date(order.expectedDate), "dd MMM yyyy") : "—" },
                { label: "Lines", value: String(order.lineCount) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                  <p className="text-xs font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="rounded-lg border border-slate-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-blue-600 text-white">
                  {["#", "Product", "SKU", "Qty", "Unit Cost", "Total"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 font-black uppercase tracking-wide text-left ${i >= 3 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => (
                  <tr key={item.id || idx} className={idx % 2 === 1 ? "bg-slate-50" : "bg-white"}>
                    <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{item.productId ? item.productName : item.description || "—"}</span>
                      {!item.productId && item.accountCode && <span className="block text-[10px] text-slate-400">GL: {item.accountCode}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">{item.productSku || "—"}</td>
                    <td className="px-3 py-2 text-right font-bold">{Number(item.quantity).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(item.unitCost).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-bold">${(Number(item.quantity) * Number(item.unitCost)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-100">
                  <td colSpan={5} className="px-3 py-2 text-right font-black text-slate-700 text-xs uppercase tracking-wide">Order Total</td>
                  <td className="px-3 py-2 text-right font-black text-blue-700">{order.currency || "USD"} {total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {order.notes && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">Notes</p>
              <p className="text-xs text-amber-800">{order.notes}</p>
            </div>
          )}

          {/* Signature lines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-6">
            {["Authorized by (Buyer)", "Accepted by (Supplier)"].map((role) => (
              <div key={role}>
                <div className="h-12 border-b-2 border-slate-400 mb-2" />
                <p className="text-xs font-bold text-slate-600">{role}</p>
                <p className="text-[10px] text-slate-400">Signature / Name / Date</p>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

