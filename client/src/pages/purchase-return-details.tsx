import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  usePurchaseReturn,
  useUpdatePurchaseReturnStatus,
} from "@/hooks/use-purchase-returns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ClipboardList,
  Edit2,
  FileText,
  Loader2,
  MoreHorizontal,
  Package,
} from "lucide-react";
import { useLocation, useRoute } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PurchaseReturnFormPage from "./purchase-return-form";

const STATUS_META = {
  DRAFT: {
    label: "Draft",
    icon: FileText,
    badge: "border-slate-200 bg-slate-50 text-slate-600",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    badge: "border-blue-200 bg-blue-50 text-blue-700",
  },
  SHIPPED: {
    label: "Shipped",
    icon: Package,
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: Ban,
    badge: "border-red-200 bg-red-50 text-red-600",
  },
} as const;

export default function PurchaseReturnDetailsPage() {
  const [, params] = useRoute("/inventory/purchase-returns/:id");
  const id = params?.id;
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isEditing = searchParams.get("edit") === "true";

  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;

  const { data: order, isLoading } = usePurchaseReturn(companyId, Number(id));
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdatePurchaseReturnStatus(companyId);
  const { toast } = useToast();

  if (isEditing) {
    return <PurchaseReturnFormPage id={id} />;
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading Purchase Return...
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <Card className="rounded-2xl border-slate-200 mt-6">
          <CardContent className="p-8 text-center">
            <p className="font-bold text-slate-700">Purchase Return not found</p>
            <Button onClick={() => setLocation("/inventory/purchase-returns")} variant="outline" className="rounded-xl mt-4">
              Return to Purchase Returns
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const handleStatusChange = (status: "DRAFT" | "APPROVED" | "SHIPPED" | "COMPLETED" | "CANCELLED") => {
    updateStatus(
      { id: order.id, status },
      {
        onSuccess: () => toast({ title: "Status updated", description: `${order.returnNumber} marked as ${status}` }),
        onError: (error: any) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
      },
    );
  };

  const total = order.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0);
  const meta = STATUS_META[order.status as keyof typeof STATUS_META];
  const StatusIcon = meta?.icon || FileText;

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setLocation("/inventory/purchase-returns")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Purchase Return Details
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {["DRAFT", "APPROVED", "SHIPPED"].includes(order.status) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-xl gap-2 text-slate-600">
                  <MoreHorizontal className="h-4 w-4" />
                  More Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                {order.status === "DRAFT" && (
                  <DropdownMenuItem onClick={() => handleStatusChange("APPROVED")} disabled={updatingStatus}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve Return
                  </DropdownMenuItem>
                )}
                {order.status === "APPROVED" && (
                  <DropdownMenuItem onClick={() => handleStatusChange("DRAFT")} disabled={updatingStatus}>
                    <FileText className="w-4 h-4 mr-2" /> Revert to Draft
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => handleStatusChange("CANCELLED")} disabled={updatingStatus} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                  <Ban className="w-4 h-4 mr-2" /> Cancel Return
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-white px-6 py-5 flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-lg">{order.returnNumber}</h3>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-6 mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Return Date</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {order.createdAt ? format(new Date(order.createdAt), "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Supplier</p>
                  <p className="text-sm font-semibold text-blue-600">{order.supplierName || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Branch</p>
                  <p className="text-sm font-semibold text-slate-800">{order.branchName || "Main"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Original GRV / GDN</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {order.goodsDeliveryNoteId && order.gdnNumber ? (
                      <span
                        className="text-blue-600 hover:underline cursor-pointer"
                        onClick={() => setLocation(`/inventory/grvs/${order.goodsDeliveryNoteId}`)}
                      >
                        {order.gdnNumber}
                      </span>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Credit Note</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {order.creditNoteId && order.creditNoteNumber ? (
                      <span
                        className="text-blue-600 hover:underline cursor-pointer"
                        onClick={() => setLocation(`/supplier-invoices/${order.creditNoteId}`)}
                      >
                        {order.creditNoteNumber}
                      </span>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Return Reason</p>
                  <p className="text-sm font-semibold text-slate-800">{order.reason || "—"}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="bg-slate-100 text-slate-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">
                    {order.items.length}
                  </span>
                  Return Items
                </h4>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="p-3 text-left">Product</th>
                        <th className="p-3 text-left">SKU</th>
                        <th className="p-3 text-left">Reason</th>
                        <th className="p-3 text-right">Qty</th>
                        <th className="p-3 text-right">Unit Cost</th>
                        <th className="p-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, idx) => (
                        <tr key={item.id || idx} className="border-t border-slate-50">
                          <td className="p-3 font-semibold text-slate-800">
                            {item.productName || "—"}
                          </td>
                          <td className="p-3 font-mono text-xs text-slate-500">{item.productSku || "—"}</td>
                          <td className="p-3 text-xs text-slate-600">{item.reason || "—"}</td>
                          <td className="p-3 text-right font-bold">{Number(item.quantity).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono text-sm">${Number(item.unitCost).toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-slate-900">
                            ${(Number(item.quantity) * Number(item.unitCost)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {order.notes && (
                <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Notes / Tracking Info</p>
                  <p className="text-sm text-amber-900 leading-relaxed">{order.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Workflow Status</h3>
            </div>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", meta.badge.split(" ")[0], meta.badge.split(" ")[1], meta.badge.split(" ")[2])}>
                  <StatusIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-lg">{meta?.label || order.status}</p>
                  <p className="text-xs text-slate-500">Current document state</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Financial Summary</h3>
            </div>
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Total Items:</span>
                <span className="font-semibold text-slate-800">{order.items.length}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Total Qty:</span>
                <span className="font-semibold text-slate-800">
                  {order.items.reduce((s, i) => s + Number(i.quantity), 0).toFixed(2)}
                </span>
              </div>
              <div className="h-px bg-slate-100 my-2" />
              <div className="flex justify-between items-end">
                <span className="text-base font-bold text-slate-800">Total Value:</span>
                <span className="text-2xl font-black text-blue-600">${total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Quick Actions</h3>
            </div>
            <CardContent className="p-4 space-y-2 flex flex-col">
              {order.status === "DRAFT" && (
                <Button
                  onClick={() => handleStatusChange("APPROVED")}
                  disabled={updatingStatus}
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold h-11"
                >
                  Approve Return
                </Button>
              )}
              {order.status === "APPROVED" && (
                <Button
                  onClick={() => handleStatusChange("SHIPPED")}
                  disabled={updatingStatus}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11"
                >
                  Mark Shipped
                </Button>
              )}
              {order.status === "SHIPPED" && (
                <Button
                  onClick={() => handleStatusChange("COMPLETED")}
                  disabled={updatingStatus}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11"
                >
                  Complete (Refund/Replace)
                </Button>
              )}
              {["DRAFT", "APPROVED"].includes(order.status) && (
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/inventory/purchase-returns/${order.id}?edit=true`)}
                  className="w-full rounded-xl font-bold h-11"
                >
                  <Edit2 className="w-4 h-4 mr-2" /> Edit Return
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
