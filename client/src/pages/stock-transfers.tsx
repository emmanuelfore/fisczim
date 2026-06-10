import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useProducts } from "@/hooks/use-products";
import { useToast } from "@/hooks/use-toast";
import {
  useInventoryLocations,
  StockTransferView,
  useCancelStockTransfer,
  useCreateStockTransfer,
  useReceiveStockTransfer,
  useStockTransfers,
} from "@/hooks/use-stock-transfers";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Send,
  Warehouse,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

type TransferLine = {
  localId: string;
  productId: string;
  quantity: string;
};

export default function StockTransfersPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { data: locations = [] } = useInventoryLocations(companyId);
  const { data: products = [] } = useProducts(companyId);
  const { data: transfers = [], isLoading } = useStockTransfers(companyId);
  const createTransfer = useCreateStockTransfer(companyId);
  const cancelTransfer = useCancelStockTransfer(companyId);
  const { toast } = useToast();

  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([
    { localId: crypto.randomUUID(), productId: "", quantity: "1" },
  ]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [receiving, setReceiving] = useState<StockTransferView | null>(null);

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "all") return transfers;
    return transfers.filter((transfer) => transfer.status === statusFilter);
  }, [statusFilter, transfers]);

  useEffect(() => {
    if (fromLocation || locations.length === 0) return;
    const defaultSource =
      locations.find((location) => location.isDefaultDispatch) ||
      locations.find((location) => location.type === "WAREHOUSE") ||
      locations[0];
    if (defaultSource) setFromLocation(String(defaultSource.id));
  }, [fromLocation, locations]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), productId: "", quantity: "1" },
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

  const resetForm = () => {
    const defaultSource =
      locations.find((location) => location.isDefaultDispatch) ||
      locations.find((location) => location.type === "WAREHOUSE") ||
      locations[0];
    setFromLocation(defaultSource ? String(defaultSource.id) : "");
    setToLocation("");
    setNotes("");
    setLines([{ localId: crypto.randomUUID(), productId: "", quantity: "1" }]);
  };

  const handleDispatch = () => {
    const fromLocationId = fromLocation ? Number(fromLocation) : undefined;
    const toLocationId = toLocation ? Number(toLocation) : undefined;
    const fromLocationRecord = locations.find((location) => location.id === fromLocationId);
    const toLocationRecord = locations.find((location) => location.id === toLocationId);
    if (!fromLocationId) {
      toast({
        title: "Source required",
        description: "Select the location dispatching the stock.",
        variant: "destructive",
      });
      return;
    }
    if (toLocation === "") {
      toast({
        title: "Destination required",
        description: "Select the location receiving the stock.",
        variant: "destructive",
      });
      return;
    }
    if (fromLocationId === toLocationId) {
      toast({
        title: "Choose different locations",
        description: "A transfer needs a different source and destination.",
        variant: "destructive",
      });
      return;
    }

    const items = lines
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Number(line.quantity),
      }))
      .filter((line) => line.productId && line.quantity > 0);

    if (items.length === 0) {
      toast({
        title: "Add transfer items",
        description: "Select at least one product and quantity.",
        variant: "destructive",
      });
      return;
    }

    createTransfer.mutate(
      {
        fromLocationId,
        toLocationId,
        fromBranchId: fromLocationRecord?.branchId || null,
        toBranchId: toLocationRecord?.branchId || null,
        notes: notes.trim() || undefined,
        items,
      },
      {
        onSuccess: (result: any) => {
          toast({
            title: "Transfer dispatched",
            description: `${result.referenceId || "Transfer"} is awaiting receipt confirmation.`,
          });
          resetForm();
        },
        onError: (error: any) => {
          toast({
            title: "Could not dispatch transfer",
            description: error.message || "Please check stock and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCancel = (transfer: StockTransferView) => {
    if (!confirm(`Cancel ${transfer.transferNumber} and restore source stock?`)) return;
    cancelTransfer.mutate(transfer.id, {
      onSuccess: () =>
        toast({
          title: "Transfer cancelled",
          description: "Source stock has been restored.",
        }),
      onError: (error: any) =>
        toast({
          title: "Could not cancel transfer",
          description: error.message || "Please try again.",
          variant: "destructive",
        }),
    });
  };

  return (
    <Layout>
      <PageHeader
        title="Stock Transfers"
        subtitle="Dispatch stock from warehouse or branches, then confirm transfer-in when delivered."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_1fr]">
        <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Transfer Out
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Stock leaves the source now and waits for receipt.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={fromLocation} onValueChange={setFromLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Source location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location: any) => (
                    <SelectItem key={location.id} value={String(location.id)}>
                      {location.name} ({location.type.replace("_", " ").toLowerCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Destination</Label>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Destination location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location: any) => (
                    <SelectItem key={location.id} value={String(location.id)}>
                      {location.name} ({location.type.replace("_", " ").toLowerCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Items</Label>
              <div className="space-y-2">
                {lines.map((line) => (
                  <div
                    key={line.localId}
                    className="grid grid-cols-[1fr_86px_34px] gap-2"
                  >
                    <Select
                      value={line.productId}
                      onValueChange={(productId) =>
                        updateLine(line.localId, { productId })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product: any) => (
                          <SelectItem key={product.id} value={String(product.id)}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.localId, { quantity: event.target.value })
                      }
                      type="number"
                      min="0"
                      step="0.01"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.localId)}
                      disabled={lines.length === 1}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4" />
                Add item
              </Button>
            </div>

            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Driver, delivery reference, or receiving instructions"
              />
            </div>

            <Button onClick={handleDispatch} disabled={createTransfer.isPending}>
              {createTransfer.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Dispatch transfer
            </Button>
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Transfer Register
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Confirm transfer-ins when goods arrive.
              </p>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All transfers</SelectItem>
                <SelectItem value="IN_TRANSIT">In transit</SelectItem>
                <SelectItem value="RECEIVED">Received</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden rounded-[14px] border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="p-4">Transfer</th>
                    <th className="p-4">Route</th>
                    <th className="p-4">Items</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-500">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        Loading transfers...
                      </td>
                    </tr>
                  ) : filteredTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-500">
                        <Package className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                        No stock transfers yet.
                      </td>
                    </tr>
                  ) : (
                    filteredTransfers.map((transfer) => (
                      <tr key={transfer.id} className="border-b border-slate-50">
                        <td className="p-4">
                          <p className="font-mono text-xs font-bold text-slate-900">
                            {transfer.transferNumber}
                          </p>
                          <p className="text-[11px] font-medium text-slate-500">
                            {transfer.dispatchedAt
                              ? format(new Date(transfer.dispatchedAt), "dd MMM yyyy HH:mm")
                              : "-"}
                          </p>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <LocationIcon name={transfer.fromLocationName} />
                            <span>{transfer.fromLocationName}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                            <span>{transfer.toLocationName}</span>
                          </div>
                          {transfer.notes ? (
                            <p className="mt-1 max-w-md truncate text-[11px] text-slate-500">
                              {transfer.notes}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-4 text-xs font-semibold text-slate-600">
                          {transfer.lineCount} lines / Qty{" "}
                          {Number(transfer.totalQuantity || 0).toFixed(2)}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={transfer.status} />
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            {transfer.status === "IN_TRANSIT" ? (
                              <>
                                <Button
                                  size="sm"
                                  className="h-8 rounded-lg text-xs"
                                  onClick={() => setReceiving(transfer)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Receive
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-lg text-xs"
                                  onClick={() => handleCancel(transfer)}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">
                                {transfer.receivedAt
                                  ? format(new Date(transfer.receivedAt), "dd MMM yyyy")
                                  : "-"}
                              </span>
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
        </section>
      </div>

      <ReceiveTransferDialog
        companyId={companyId}
        transfer={receiving}
        onClose={() => setReceiving(null)}
      />
    </Layout>
  );
}

function LocationIcon({ name }: { name: string }) {
  return name === "Warehouse" ? (
    <Warehouse className="h-4 w-4 text-blue-500" />
  ) : (
    <Package className="h-4 w-4 text-emerald-500" />
  );
}

function StatusBadge({ status }: { status: StockTransferView["status"] }) {
  const classes = {
    IN_TRANSIT: "border-amber-200 bg-amber-50 text-amber-700",
    RECEIVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    CANCELLED: "border-slate-200 bg-slate-50 text-slate-500",
  }[status];
  return (
    <Badge variant="outline" className={classes}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function ReceiveTransferDialog({
  companyId,
  transfer,
  onClose,
}: {
  companyId: number;
  transfer: StockTransferView | null;
  onClose: () => void;
}) {
  const receiveTransfer = useReceiveStockTransfer(companyId);
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!transfer) return;
    const next: Record<number, string> = {};
    for (const item of transfer.items || []) {
      next[item.productId] = String(item.quantity);
    }
    setQuantities(next);
    setNotes(`Received ${transfer.transferNumber}`);
  }, [transfer]);

  const handleReceive = () => {
    if (!transfer) return;
    receiveTransfer.mutate(
      {
        transferId: transfer.id,
        notes,
        items: transfer.items.map((item) => ({
          productId: item.productId,
          quantityReceived: quantities[item.productId] || item.quantity,
        })),
      },
      {
        onSuccess: () => {
          toast({
            title: "Transfer received",
            description: "Destination stock has been updated.",
          });
          onClose();
        },
        onError: (error: any) =>
          toast({
            title: "Could not receive transfer",
            description: error.message || "Please check quantities.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog
      open={!!transfer}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receive {transfer?.transferNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100">
            <div className="grid grid-cols-[1fr_120px_120px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>Product</span>
              <span>Sent</span>
              <span>Received</span>
            </div>
            {(transfer?.items || []).map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_120px_120px] items-center gap-3 border-b border-slate-50 px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="font-bold text-slate-800">{item.productName}</p>
                  <p className="text-[11px] text-slate-500">
                    {item.sku || "No SKU"}
                  </p>
                </div>
                <p className="font-mono font-bold text-slate-700">
                  {Number(item.quantity || 0).toFixed(2)}
                </p>
                <Input
                  value={quantities[item.productId] || ""}
                  onChange={(event) =>
                    setQuantities((prev) => ({
                      ...prev,
                      [item.productId]: event.target.value,
                    }))
                  }
                  type="number"
                  min="0"
                  max={item.quantity}
                  step="0.01"
                />
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <Label>Receiving notes</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleReceive} disabled={receiveTransfer.isPending}>
            {receiveTransfer.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Confirm transfer-in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
