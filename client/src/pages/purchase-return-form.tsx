import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  useCreatePurchaseReturn,
  useUpdatePurchaseReturn,
  usePurchaseReturns,
  type PurchaseReturn,
} from "@/hooks/use-purchase-returns";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QuantityInput } from "@/components/ui/quantity-input";


type DraftLine = {
  productId: string;
  quantity: string;
  unitCost: string;
  reason: string;
  notes: string;
};

export default function PurchaseReturnFormPage({
  id,
}: {
  id?: string;
}) {
  const [, setLocation] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;

  const mode = id ? "edit" : "create";

  const { data: returns = [], isLoading: loadingData } = usePurchaseReturns(companyId);
  const initialData = id ? returns.find((r) => String(r.id) === id) : null;
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: products = [] } = useProducts(companyId);
  const { data: branches = [] } = useBranches(companyId);

  const { mutate: createReturn, isPending: creating } = useCreatePurchaseReturn(companyId);
  const { mutate: updateReturn, isPending: updating } = useUpdatePurchaseReturn(companyId);
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [goodsDeliveryNoteId, setGoodsDeliveryNoteId] = useState("");
  const [returnNumber, setReturnNumber] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { productId: "", quantity: "1", unitCost: "0", reason: "", notes: "" },
  ]);

  const { data: gdns = [] } = useQuery<any[]>({
    queryKey: ["/api/companies", companyId, "gdns"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/gdns`);
      return res.json();
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (mode === "edit" && initialData) {
      setSupplierId(String(initialData.supplierId));
      setBranchId(initialData.branchId ? String(initialData.branchId) : "");
      setGoodsDeliveryNoteId(initialData.goodsDeliveryNoteId ? String(initialData.goodsDeliveryNoteId) : "");
      setReturnNumber(initialData.returnNumber);
      setReason(initialData.reason || "");
      setNotes(initialData.notes || "");
      setLines(
        initialData.items.length > 0
          ? initialData.items.map((item) => ({
              productId: item.productId ? String(item.productId) : "",
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
              reason: item.reason || "",
              notes: item.notes || "",
            }))
          : [{ productId: "", quantity: "1", unitCost: "0", reason: "", notes: "" }],
      );
    }
  }, [mode, initialData]);

  const selectedGdn = gdns.find((g) => String(g.id) === goodsDeliveryNoteId);

  const supplierGdns = gdns.filter(
    (g) => (!supplierId || String(g.supplierId) === supplierId) && g.status === "CONFIRMED"
  );

  const alreadyReturnedQty = (prodId: number) => {
    if (!goodsDeliveryNoteId) return 0;
    return returns
      .filter(
        (r) =>
          String(r.goodsDeliveryNoteId) === goodsDeliveryNoteId &&
          r.status !== "CANCELLED" &&
          (mode === "create" || String(r.id) !== id)
      )
      .reduce((sum, r) => {
        const item = r.items.find((i: any) => i.productId === prodId);
        return sum + (item ? Number(item.quantity) : 0);
      }, 0);
  };

  const gdnReceivedQty = (prodId: number) => {
    if (!goodsDeliveryNoteId || !selectedGdn) return 0;
    const item = selectedGdn.items.find((i: any) => i.productId === prodId);
    return item ? Number(item.quantityReceived || 0) : 0;
  };

  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );

  const addLine = () =>
    setLines((prev) => [...prev, { productId: "", quantity: "1", unitCost: "0", reason: "", notes: "" }]);
  const removeLine = (index: number) =>
    setLines((prev) => prev.filter((_, i) => i !== index));
  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const submit = () => {
    const items = lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost || 0),
        reason: line.reason || null,
        notes: line.notes || null,
      }));

    if (!supplierId || items.length === 0) {
      toast({ title: "Missing details", description: "Select a supplier and ensure lines are filled with a product.", variant: "destructive" });
      return;
    }

    // Client-side GRV validation
    if (goodsDeliveryNoteId && selectedGdn) {
      for (const line of items) {
        const received = gdnReceivedQty(line.productId);
        const alreadyReturned = alreadyReturnedQty(line.productId);
        const maxQty = received - alreadyReturned;
        if (line.quantity > maxQty) {
          toast({
            title: "Validation Error",
            description: `Product quantity (${line.quantity}) exceeds remaining returnable quantity (${maxQty}). Received: ${received}, Already Returned: ${alreadyReturned}.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (mode === "create") {
      createReturn(
        {
          supplierId: Number(supplierId),
          branchId: branchId ? Number(branchId) : null,
          goodsDeliveryNoteId: goodsDeliveryNoteId ? Number(goodsDeliveryNoteId) : null,
          returnNumber: returnNumber || undefined,
          reason: reason || null,
          notes: notes || null,
          items,
        },
        {
          onSuccess: (data: any) => {
            toast({ title: "Purchase return created", description: "The PR has been saved." });
            setLocation(`/inventory/purchase-returns/${data.id || ""}`);
          },
          onError: (error: any) => toast({ title: "Could not create PR", description: error.message, variant: "destructive" }),
        },
      );
    } else if (mode === "edit" && initialData) {
      updateReturn(
        {
          id: initialData.id,
          data: {
            supplierId: Number(supplierId),
            branchId: branchId ? Number(branchId) : null,
            goodsDeliveryNoteId: goodsDeliveryNoteId ? Number(goodsDeliveryNoteId) : null,
            reason: reason || null,
            notes: notes || null,
            items,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Purchase return updated", description: `${initialData.returnNumber} has been saved.` });
            setLocation(`/inventory/purchase-returns/${initialData.id}`);
          },
          onError: (error: any) => toast({ title: "Could not update PR", description: error.message, variant: "destructive" }),
        },
      );
    }
  };

  const isPending = creating || updating;

  if (mode === "edit" && loadingData) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading Return Details...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              if (mode === "edit" && id) setLocation(`/inventory/purchase-returns/${id}`);
              else setLocation("/inventory/purchase-returns");
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {mode === "create" ? "New Purchase Return" : `Edit PR: ${initialData?.returnNumber}`}
            </h1>
            <p className="text-sm text-slate-500">
              {mode === "create" ? "Create a new supplier purchase return" : "Modify existing purchase return details"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              if (mode === "edit" && id) setLocation(`/inventory/purchase-returns/${id}`);
              else setLocation("/inventory/purchase-returns");
            }}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending} className="font-bold gap-2 rounded-xl">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "create" ? <Send className="h-4 w-4" /> : <Save className="h-4 w-4" />)}
            {mode === "create" ? "Create Return" : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">Return Lines</h3>
            </div>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="grid grid-cols-12 gap-0 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="col-span-5">Product</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit Cost</div>
                    <div className="col-span-2 text-right">Total</div>
                    <div className="col-span-1" />
                  </div>

                  <div className="space-y-0">
                    {lines.map((line, index) => {
                      const filteredProducts = goodsDeliveryNoteId && selectedGdn
                        ? (products as any[]).filter((p) => selectedGdn.items.some((item: any) => item.productId === p.id))
                        : (products as any[]);
                      const received = line.productId ? gdnReceivedQty(Number(line.productId)) : 0;
                      const returned = line.productId ? alreadyReturnedQty(Number(line.productId)) : 0;
                      const remaining = received - returned;

                      return (
                        <div key={index} className="grid grid-cols-12 gap-2 items-start border-t border-slate-50 px-3 py-3">
                          <div className="col-span-5 space-y-2">
                            <Select
                              value={line.productId}
                              onValueChange={(value) => {
                                const product = (products as any[]).find((p) => String(p.id) === value);
                                let unitCost = String(product?.costPrice || line.unitCost || "0");
                                if (goodsDeliveryNoteId && selectedGdn) {
                                  const gdnItem = selectedGdn.items.find((gi: any) => String(gi.productId) === value);
                                  if (gdnItem) {
                                    unitCost = String(gdnItem.costPrice || "0");
                                  }
                                }
                                updateLine(index, { productId: value, unitCost });
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {filteredProducts.map((product) => (
                                  <SelectItem key={product.id} value={String(product.id)}>
                                    {product.name}{product.sku ? ` (${product.sku})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {goodsDeliveryNoteId && line.productId && (
                              <p className="text-[10px] text-slate-500 font-medium leading-none">
                                Max returnable: <span className="font-bold text-slate-700">{remaining}</span> (Received {received}, Returned {returned})
                              </p>
                            )}
                            <Input
                              placeholder="Specific reason (optional)"
                              value={line.reason}
                              onChange={(e) => updateLine(index, { reason: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="col-span-2">
                            <QuantityInput
                              type="number"
                              min="0"
                              value={line.quantity}
                              onChange={(e) => updateLine(index, { quantity: e.target.value })}
                              className="h-9 text-right"
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitCost}
                              onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                              className="h-9 text-right"
                            />
                          </div>
                          <div className="col-span-2 text-right text-base font-bold text-slate-800 flex flex-col justify-center h-9">
                            ${(Number(line.quantity || 0) * Number(line.unitCost || 0)).toFixed(2)}
                          </div>
                          <div className="col-span-1 flex justify-end h-9 items-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-50"
                              disabled={lines.length === 1}
                              onClick={() => removeLine(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addLine} className="rounded-xl font-bold gap-1 mt-2">
                  <Plus className="h-4 w-4" />Add Line
                </Button>

                <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                  <div className="text-right min-w-[250px]">
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                      <p className="text-sm font-semibold text-slate-800">Total Return Value</p>
                      <p className="text-3xl font-black text-blue-600">${total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">Notes & Instructions</h3>
            </div>
            <CardContent className="p-6">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tracking details, extra context..."
                className="min-h-[120px]"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">Document Info</h3>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Supplier <span className="text-red-500">*</span></Label>
                <Select
                  value={supplierId}
                  onValueChange={(val) => {
                    setSupplierId(val);
                    setGoodsDeliveryNoteId("");
                    setLines([{ productId: "", quantity: "1", unitCost: "0", reason: "", notes: "" }]);
                  }}
                >
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers as any[]).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Original GRV / GDN (Optional)</Label>
                <Select
                  value={goodsDeliveryNoteId || "__none__"}
                  onValueChange={(val) => {
                    setGoodsDeliveryNoteId(val === "__none__" ? "" : val);
                    const gdn = gdns.find((g) => String(g.id) === val);
                    if (gdn) {
                      // Set supplier automatically if not set
                      if (gdn.supplierId) {
                        setSupplierId(String(gdn.supplierId));
                      }
                      // Pre-populate return lines with items from the GRV
                      setLines(gdn.items.map((item: any) => ({
                        productId: String(item.productId),
                        quantity: String(item.quantityReceived || "0"),
                        unitCost: String(item.costPrice || "0"),
                        reason: "",
                        notes: ""
                      })));
                    } else {
                      setLines([{ productId: "", quantity: "1", unitCost: "0", reason: "", notes: "" }]);
                    }
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select original GRV" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None (Manual Return) —</SelectItem>
                    {supplierGdns.map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.gdnNumber} ({g.confirmedGrvNumber || "No GRV #"}) - {new Date(g.createdAt).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Branch (Optional)</Label>
                <Select
                  value={branchId || "__none__"}
                  onValueChange={(v) => setBranchId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(branches as any[]).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {mode === "create" && (
                <div className="space-y-2">
                  <Label>PR Number</Label>
                  <Input className="h-10" value={returnNumber} onChange={(e) => setReturnNumber(e.target.value)} placeholder="Auto if blank" />
                </div>
              )}

              <div className="space-y-2">
                <Label>Return Reason</Label>
                <Input className="h-10" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged goods" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
