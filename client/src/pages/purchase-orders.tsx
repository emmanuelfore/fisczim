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
  useCreatePurchaseOrder,
  usePurchaseOrders,
  useUpdatePurchaseOrderStatus,
  type PurchaseOrder,
} from "@/hooks/use-purchase-orders";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ClipboardList, Plus, Search, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type DraftLine = {
  productId: string;
  quantity: string;
  unitCost: string;
  notes: string;
};

const STATUSES: PurchaseOrder["status"][] = [
  "DRAFT",
  "SENT",
  "RECEIVED",
  "CANCELLED",
];

export default function PurchaseOrdersPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { data: orders = [], isLoading } = usePurchaseOrders(companyId);
  const { mutate: updateStatus, isPending: updatingStatus } =
    useUpdatePurchaseOrderStatus(companyId);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (order) =>
        order.poNumber.toLowerCase().includes(q) ||
        (order.supplierName || "").toLowerCase().includes(q) ||
        (order.notes || "").toLowerCase().includes(q),
    );
  }, [orders, search]);

  const setStatus = (order: PurchaseOrder, status: PurchaseOrder["status"]) => {
    updateStatus(
      { id: order.id, status },
      {
        onSuccess: () =>
          toast({
            title: "Purchase order updated",
            description: `${order.poNumber} is now ${status.toLowerCase()}.`,
          }),
        onError: (error: any) =>
          toast({
            title: "Update failed",
            description: error.message,
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Layout>
      <PageHeader
        title="Purchase Orders"
        subtitle="Create supplier purchase orders before goods are received into inventory"
        actions={
          <Button
            onClick={() => setOpen(true)}
            className="rounded-xl font-bold"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Purchase Order
          </Button>
        }
      />

      <div className="relative w-full sm:max-w-sm mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search PO number or supplier..."
          className="pl-12 h-12 rounded-xl border-slate-200 bg-white shadow-sm font-medium"
        />
      </div>

      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white/90 rounded-[2rem] overflow-hidden ring-1 ring-slate-100">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  PO No
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Supplier
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Expected
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Lines
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Total
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                  Status
                </th>
                <th className="p-5 font-black text-slate-400 uppercase tracking-widest text-[10px] text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    Loading purchase orders...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <p className="font-bold text-lg">
                      No purchase orders found
                    </p>
                    <p className="">
                      Create a PO to start tracking supplier orders.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="p-4">
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] border-slate-200 bg-white"
                      >
                        {order.poNumber}
                      </Badge>
                    </td>
                    <td className="p-4  font-semibold text-slate-700">
                      {order.supplierName || "N/A"}
                    </td>
                    <td className="p-4  font-medium text-slate-600">
                      {order.expectedDate
                        ? format(new Date(order.expectedDate), "dd MMM yyyy")
                        : "-"}
                    </td>
                    <td className="p-4  font-semibold text-slate-700">
                      {order.lineCount}
                    </td>
                    <td className="p-4  font-black text-slate-900">
                      ${Number(order.totalCost || 0).toFixed(2)}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end">
                        <Select
                          value={order.status}
                          disabled={updatingStatus}
                          onValueChange={(value) =>
                            setStatus(order, value as PurchaseOrder["status"])
                          }
                        >
                          <SelectTrigger className="h-9 w-[130px] rounded-xl text-xs font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreatePurchaseOrderDialog
        companyId={companyId}
        open={open}
        onOpenChange={setOpen}
      />
    </Layout>
  );
}

function StatusBadge({ status }: { status: PurchaseOrder["status"] }) {
  const classes: Record<PurchaseOrder["status"], string> = {
    DRAFT: "bg-slate-100 text-slate-700 hover:bg-slate-100",
    SENT: "bg-blue-50 text-blue-700 hover:bg-blue-50",
    RECEIVED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    CANCELLED: "bg-red-50 text-red-700 hover:bg-red-50",
  };
  return <Badge className={`rounded-xl ${classes[status]}`}>{status}</Badge>;
}

function CreatePurchaseOrderDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: products = [] } = useProducts(companyId);
  const { data: branches = [] } = useBranches(companyId);
  const { mutate: createOrder, isPending } = useCreatePurchaseOrder(companyId);
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { productId: "", quantity: "1", unitCost: "0", notes: "" },
  ]);

  const total = lines.reduce(
    (sum, line) =>
      sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { productId: "", quantity: "1", unitCost: "0", notes: "" },
    ]);
  const removeLine = (index: number) =>
    setLines((prev) => prev.filter((_, i) => i !== index));
  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  const reset = () => {
    setSupplierId("");
    setBranchId("");
    setPoNumber("");
    setExpectedDate("");
    setNotes("");
    setLines([{ productId: "", quantity: "1", unitCost: "0", notes: "" }]);
  };

  const submit = () => {
    const items = lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost || 0),
        notes: line.notes || null,
      }));

    if (!supplierId || items.length === 0) {
      toast({
        title: "Missing details",
        description: "Select a supplier and at least one product line.",
        variant: "destructive",
      });
      return;
    }

    createOrder(
      {
        supplierId: Number(supplierId),
        branchId: branchId ? Number(branchId) : null,
        poNumber: poNumber || undefined,
        expectedDate: expectedDate || null,
        notes: notes || null,
        items,
      },
      {
        onSuccess: () => {
          toast({
            title: "Purchase order created",
            description: "The PO is ready for supplier processing.",
          });
          reset();
          onOpenChange(false);
        },
        onError: (error: any) =>
          toast({
            title: "Could not create PO",
            description: error.message,
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            New Purchase Order
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier: any) => (
                  <SelectItem key={supplier.id} value={String(supplier.id)}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch: any) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>PO Number</Label>
            <Input
              value={poNumber}
              onChange={(event) => setPoNumber(event.target.value)}
              placeholder="Auto if blank"
            />
          </div>
          <div className="space-y-2">
            <Label>Expected Date</Label>
            <Input
              type="date"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Order Lines</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="rounded-xl font-bold"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {lines.map((line, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-2 items-end rounded-xl border border-slate-100 bg-slate-50/70 p-3"
              >
                <div className="col-span-12 md:col-span-5 space-y-1">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-400">
                    Product
                  </Label>
                  <Select
                    value={line.productId}
                    onValueChange={(value) => {
                      const product = (products as any[]).find(
                        (p) => String(p.id) === value,
                      );
                      updateLine(index, {
                        productId: value,
                        unitCost: String(
                          product?.costPrice || line.unitCost || "0",
                        ),
                      });
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products as any[]).map((product) => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name}
                          {product.sku ? ` (${product.sku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 md:col-span-2 space-y-1">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-400">
                    Qty
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                    className="bg-white"
                  />
                </div>
                <div className="col-span-4 md:col-span-2 space-y-1">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-400">
                    Unit Cost
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={line.unitCost}
                    onChange={(event) =>
                      updateLine(index, { unitCost: event.target.value })
                    }
                    className="bg-white"
                  />
                </div>
                <div className="col-span-3 md:col-span-2  font-black text-slate-800 pb-2">
                  $
                  {(
                    Number(line.quantity || 0) * Number(line.unitCost || 0)
                  ).toFixed(2)}
                </div>
                <div className="col-span-1 flex justify-end pb-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={lines.length === 1}
                    onClick={() => removeLine(index)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Supplier instructions or delivery notes..."
          />
        </div>

        <DialogFooter className="items-center gap-3">
          <div className="mr-auto  font-black text-slate-800">
            Total: ${total.toFixed(2)}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="rounded-xl font-bold"
          >
            <Send className="h-4 w-4 mr-2" />
            {isPending ? "Creating..." : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
