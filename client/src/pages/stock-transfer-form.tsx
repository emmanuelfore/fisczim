import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useProducts } from "@/hooks/use-products";
import { useToast } from "@/hooks/use-toast";
import {
  useInventoryLocations,
  useCreateStockTransfer,
} from "@/hooks/use-stock-transfers";
import { AlertCircle, ArrowLeft, Loader2, Package, Plus, Send, XCircle, FileText, Truck, DollarSign } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { QuantityInput } from "@/components/ui/quantity-input";


type TransferLine = {
  localId: string;
  productId: string;
  quantity: string;
  batchNumber?: string;
  expiryDate?: string;
};

function useLocationStockMap(companyId: number, locationId: number | null) {
  return useQuery<Record<number, number>>({
    queryKey: ["location-stock-map", companyId, locationId],
    queryFn: async () => {
      if (!locationId) return {};
      const res = await apiFetch(`/api/companies/${companyId}/inventory/location-stocks?locationId=${locationId}`);
      if (!res.ok) return {};
      const rows: { productId: number; stockLevel: string }[] = await res.json();
      const map: Record<number, number> = {};
      for (const r of rows) map[r.productId] = Number(r.stockLevel || 0);
      return map;
    },
    enabled: !!companyId && !!locationId,
  });
}

export default function StockTransferFormPage() {
  const [, setLocation] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  
  const { data: locations = [] } = useInventoryLocations(companyId, { all: true });

  const { data: products = [] } = useProducts(companyId);
  const createTransfer = useCreateStockTransfer(companyId);
  const { toast } = useToast();

  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [notes, setNotes] = useState("");
  
  // Transit information
  const [freightCarrier, setFreightCarrier] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [transitCost, setTransitCost] = useState("0.00");
  
  const [lines, setLines] = useState<TransferLine[]>([
    { localId: crypto.randomUUID(), productId: "", quantity: "1", batchNumber: "", expiryDate: "" },
  ]);

  const fromLocationId = fromLocation ? Number(fromLocation) : null;
  const fromLocationRecord = locations.find((l) => l.id === fromLocationId) || null;
  const { data: sourceStockMap = {} } = useLocationStockMap(companyId, fromLocationId);

  useEffect(() => {
    if (fromLocation || locations.length === 0) return;
    const defaultSource =
      locations.find((l) => l.isDefaultDispatch) ||
      locations.find((l) => l.type === "WAREHOUSE") ||
      locations[0];
    if (defaultSource) setFromLocation(String(defaultSource.id));
  }, [fromLocation, locations]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), productId: "", quantity: "1", batchNumber: "", expiryDate: "" },
    ]);
  };

  const updateLine = (localId: string, patch: Partial<TransferLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.localId === localId ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (localId: string) => {
    setLines((prev) => prev.filter((line) => line.localId !== localId));
  };

  const handleSubmit = (actionType: "DRAFT" | "IN_TRANSIT") => {
    const fromLocationId = fromLocation ? Number(fromLocation) : undefined;
    const toLocationId = toLocation ? Number(toLocation) : undefined;
    const fromLocationRecord = locations.find((l) => l.id === fromLocationId);
    const toLocationRecord = locations.find((l) => l.id === toLocationId);

    if (!fromLocationId) {
      toast({ title: "Source required", description: "Select the location dispatching the stock.", variant: "destructive" });
      return;
    }
    if (!toLocation) {
      toast({ title: "Destination required", description: "Select the location receiving the stock.", variant: "destructive" });
      return;
    }
    if (fromLocationId === toLocationId) {
      toast({ title: "Choose different locations", description: "A transfer needs a different source and destination.", variant: "destructive" });
      return;
    }

    const items = lines
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Number(line.quantity),
        batchNumber: line.batchNumber || undefined,
        expiryDate: line.expiryDate || undefined,
      }))
      .filter((line) => line.productId && line.quantity > 0);

    if (items.length === 0) {
      toast({ title: "Add transfer items", description: "Select at least one product and quantity.", variant: "destructive" });
      return;
    }

    // Client-side stock check (only if dispatching immediately)
    if (actionType === "IN_TRANSIT") {
      for (const item of items) {
        const available = sourceStockMap[item.productId] ?? null;
        if (available !== null && item.quantity > available) {
          const product = (products as any[]).find((p) => p.id === item.productId);
          toast({
            title: "Insufficient stock",
            description: `"${product?.name || `Product ${item.productId}`}" has only ${available} units available at source.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    createTransfer.mutate(
      {
        fromLocationId,
        toLocationId,
        fromBranchId: fromLocationRecord?.branchId || null,
        toBranchId: toLocationRecord?.branchId || null,
        notes: notes.trim() || undefined,
        status: actionType,
        freightCarrier: freightCarrier.trim() || undefined,
        vehicleReg: vehicleReg.trim() || undefined,
        transitCost: transitCost ? Number(transitCost) : 0,
        items,
      },
      {
        onSuccess: (result: any) => {
          toast({
            title: actionType === "IN_TRANSIT" ? "Transfer dispatched" : "Draft created",
            description: `${result.referenceId || "Transfer"} is logged.`,
          });
          setLocation(`/inventory/transfers/${result.id || result.transferId || ''}`);
        },
        onError: (error: any) => {
          toast({
            title: "Could not create transfer",
            description: error.message || "Please check stock and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 rounded-xl border-slate-200"
              onClick={() => setLocation("/inventory/transfers")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">New Stock Transfer</h1>
              <p className="text-sm text-slate-500 font-medium">Create transfer order draft or dispatch immediately</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleSubmit("DRAFT")}
              disabled={createTransfer.isPending}
              className="rounded-xl font-bold border-slate-200 gap-2 h-11 px-5"
            >
              <FileText className="h-4 w-4 text-slate-400" />
              Save Draft
            </Button>
            <Button
              onClick={() => handleSubmit("IN_TRANSIT")}
              disabled={createTransfer.isPending}
              className="rounded-xl font-bold bg-primary hover:bg-primary/90 text-white gap-2 h-11 px-6"
            >
              {createTransfer.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Dispatch Now
            </Button>
          </div>
        </div>

        <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-6 grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="grid gap-2">
                <Label className="font-bold text-slate-700">Source Location</Label>
                <Select value={fromLocation} onValueChange={setFromLocation}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Source location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        <span className="flex items-center gap-2">
                          {loc.name}
                          {loc.isDefaultDispatch && (
                            <span className="text-[10px] font-bold text-blue-500 ml-1">[Default]</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fromLocationRecord && (
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 font-medium pl-1">
                    <Package className="h-3 w-3" />
                    Total stock value at source:{" "}
                    <span className="font-bold text-slate-600">
                      ${(fromLocationRecord.stockValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label className="font-bold text-slate-700">Destination Location</Label>
                <Select value={toLocation} onValueChange={setToLocation}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Destination location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((l) => String(l.id) !== fromLocation)
                      .map((loc) => (
                        <SelectItem key={loc.id} value={String(loc.id)}>
                          <span className="flex items-center gap-2">
                            {loc.name}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Logistics & Carrier details */}
            <div className="border-t border-slate-100 pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="grid gap-2">
                <Label className="font-bold text-slate-700 flex items-center gap-1">
                  <Truck className="h-4 w-4 text-slate-400" /> Carrier / Driver Name
                </Label>
                <Input
                  value={freightCarrier}
                  onChange={(e) => setFreightCarrier(e.target.value)}
                  placeholder="e.g. FedEx, Swift Cargo"
                  className="rounded-xl h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label className="font-bold text-slate-700 flex items-center gap-1">
                  <Truck className="h-4 w-4 text-slate-400" /> Vehicle Registration
                </Label>
                <Input
                  value={vehicleReg}
                  onChange={(e) => setVehicleReg(e.target.value)}
                  placeholder="e.g. AB-1234"
                  className="rounded-xl h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label className="font-bold text-slate-700 flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-slate-400" /> Transit Cost (USD)
                </Label>
                <Input
                  value={transitCost}
                  onChange={(e) => setTransitCost(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  className="rounded-xl h-11"
                />
              </div>
            </div>

            <div className="grid gap-2 border-t border-slate-100 pt-6">
              <Label className="font-bold text-slate-700">Items to Transfer</Label>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 text-left border-b border-slate-100">
                      <th className="p-3">Product</th>
                      <th className="p-3 min-w-[140px] text-right">Quantity</th>
                      <th className="p-3 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const pid = Number(line.productId);
                      const available = pid ? (sourceStockMap[pid] ?? null) : null;
                      const qty = Number(line.quantity || 0);
                      const isShortage = available !== null && qty > available;
                      
                      return (
                        <tr key={line.localId} className="border-b border-slate-50 last:border-b-0">
                          <td className="p-3 align-middle">
                            <Select
                              value={line.productId}
                              onValueChange={(productId) => updateLine(line.localId, { productId })}
                            >
                              <SelectTrigger className={cn("rounded-xl bg-white", isShortage && "border-red-400")}>
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {(products as any[]).map((product) => (
                                  <SelectItem key={product.id} value={String(product.id)}>
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {pid > 0 && available !== null && (
                              <p className={cn("text-[11px] mt-1 pl-1 flex items-center gap-1 font-medium", isShortage ? "text-red-500" : "text-slate-400")}>
                                {isShortage && <AlertCircle className="h-3 w-3" />}
                                Available: {available} units
                              </p>
                            )}
                          </td>
                          <td className="p-3 align-middle text-right">
                            <QuantityInput
                              value={line.quantity}
                              onChange={(e) => updateLine(line.localId, { quantity: e.target.value })}
                              type="number"
                              min="0"
                              step="0.01"
                              className={cn("rounded-xl bg-white text-right h-10", isShortage && "border-red-400 text-red-600")}
                            />
                          </td>
                          <td className="p-3 align-middle text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLine(line.localId)}
                              disabled={lines.length === 1}
                              className="text-slate-400 hover:text-red-600 rounded-xl h-10 w-10"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button type="button" variant="outline" onClick={addLine} className="rounded-xl w-full sm:w-auto self-start mt-2 border-dashed border-slate-300">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>

            <div className="grid gap-2 border-t border-slate-100 pt-6">
              <Label className="font-bold text-slate-700">Notes / Instruction Reference</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional instructions, gate pass info, delivery details…"
                className="rounded-xl resize-none h-24 bg-slate-50"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
