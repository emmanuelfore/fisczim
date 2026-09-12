import { Layout } from "@/components/layout";
import { useRoute, useLocation } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  useStockTransfers,
  useCancelStockTransfer,
  useReceiveStockTransfer,
  useSubmitStockTransfer,
  useApproveStockTransfer,
  useDispatchStockTransfer,
} from "@/hooks/use-stock-transfers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Ban,
  Package,
  ArrowRight,
  FileText,
  Loader2,
  RefreshCw,
  Truck,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useBranchContext } from "@/lib/branch-context";

const STATUS_META = {
  DRAFT: {
    label: "Draft",
    icon: FileText,
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    desc: "Awaiting submission",
  },
  PENDING_APPROVAL: {
    label: "Pending Approval",
    icon: Clock,
    badge: "border-purple-200 bg-purple-50 text-purple-700",
    desc: "Awaiting manager approval",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    desc: "Ready to dispatch",
  },
  IN_TRANSIT: {
    label: "In Transit",
    icon: Truck,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    desc: "Shipped & in transit",
  },
  RECEIVED: {
    label: "Received",
    icon: CheckCircle2,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    desc: "Stock received at destination",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: Ban,
    badge: "border-slate-200 bg-slate-50 text-slate-500",
    desc: "Transfer order cancelled",
  },
} as const;

export default function StockTransferDetailsPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/inventory/transfers/:id");
  const transferId = Number(params?.id || 0);
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const companyId = activeCompanyId || 0;
  const { selectedBranchId } = useBranchContext();

  const { data: transfers = [], isLoading } = useStockTransfers(companyId);
  const transfer = transfers.find((t) => t.id === transferId);

  const submitTransfer = useSubmitStockTransfer(companyId);
  const approveTransfer = useApproveStockTransfer(companyId);
  const dispatchTransfer = useDispatchStockTransfer(companyId);
  const receiveTransfer = useReceiveStockTransfer(companyId);
  const cancelTransfer = useCancelStockTransfer(companyId);
  
  const { toast } = useToast();

  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [damagedQuantities, setDamagedQuantities] = useState<Record<number, string>>({});
  const [lostQuantities, setLostQuantities] = useState<Record<number, string>>({});
  const [varianceReason, setVarianceReason] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");

  useEffect(() => {
    if (!transfer) return;
    const nextReceived: Record<number, string> = {};
    const nextDamaged: Record<number, string> = {};
    const nextLost: Record<number, string> = {};
    for (const item of transfer.items || []) {
      nextReceived[item.productId] = String(item.quantity);
      nextDamaged[item.productId] = "0";
      nextLost[item.productId] = "0";
    }
    setQuantities(nextReceived);
    setDamagedQuantities(nextDamaged);
    setLostQuantities(nextLost);
    setReceiveNotes(`Received ${transfer.transferNumber}`);
  }, [transfer]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[calc(100vh-200px)] items-center justify-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin mr-2 text-primary" /> Loading Transfer...
        </div>
      </Layout>
    );
  }

  if (!transfer) {
    return (
      <Layout>
        <Card className="rounded-2xl border-slate-200 mt-6">
          <CardContent className="p-8 text-center flex flex-col items-center justify-center">
            <Package className="h-12 w-12 text-slate-300 mb-4" />
            <p className="font-bold text-slate-700">Stock Transfer not found</p>
            <Button variant="outline" onClick={() => setLocation("/inventory/transfers")} className="rounded-xl mt-4">
              Return to Transfers
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const meta = STATUS_META[transfer.status] || STATUS_META.DRAFT;
  const StatusIcon = meta.icon;

  const handleSubmit = () => {
    submitTransfer.mutate(transfer.id, {
      onSuccess: () => toast({ title: "Submitted", description: "Transfer order sent for approval." }),
      onError: (err: any) => toast({ title: "Error submitting", description: err.message, variant: "destructive" }),
    });
  };

  const handleApprove = () => {
    approveTransfer.mutate(transfer.id, {
      onSuccess: () => toast({ title: "Approved", description: "Transfer order approved." }),
      onError: (err: any) => toast({ title: "Error approving", description: err.message, variant: "destructive" }),
    });
  };

  const handleDispatch = () => {
    dispatchTransfer.mutate(transfer.id, {
      onSuccess: () => toast({ title: "Dispatched", description: "Stock has been dispatched and is now in transit." }),
      onError: (err: any) => toast({ title: "Error dispatching", description: err.message, variant: "destructive" }),
    });
  };

  const handleCancel = () => {
    const promptMsg = transfer.status === "IN_TRANSIT"
      ? `Cancel ${transfer.transferNumber} and reverse dispatched stock?`
      : `Cancel transfer order ${transfer.transferNumber}?`;
    if (!confirm(promptMsg)) return;

    cancelTransfer.mutate(transfer.id, {
      onSuccess: () => toast({ title: "Transfer cancelled", description: "Status updated to CANCELLED." }),
      onError: (error: any) => toast({ title: "Could not cancel transfer", description: error.message, variant: "destructive" }),
    });
  };

  const handleReceive = () => {
    // Check if there are variances
    let hasVariance = false;
    const itemsPayload = transfer.items.map((item) => {
      const qReceived = Number(quantities[item.productId] ?? item.quantity);
      const qDamaged = Number(damagedQuantities[item.productId] ?? 0);
      const qLost = Number(lostQuantities[item.productId] ?? 0);
      if (qReceived + qDamaged + qLost !== item.quantity) {
        hasVariance = true;
      }
      return {
        productId: item.productId,
        quantityReceived: qReceived,
        quantityDamaged: qDamaged,
        quantityLost: qLost,
        batchNumber: item.batchNumber || undefined,
        expiryDate: item.expiryDate || undefined,
      };
    });

    if (hasVariance && !varianceReason.trim()) {
      toast({ title: "Variance Reason Required", description: "You have discrepancies in received quantities. Please enter a variance reason.", variant: "destructive" });
      return;
    }

    receiveTransfer.mutate(
      {
        transferId: transfer.id,
        notes: receiveNotes,
        varianceReason: hasVariance ? varianceReason : undefined,
        items: itemsPayload,
      },
      {
        onSuccess: () => {
          toast({ title: "Transfer received", description: "Destination stock has been updated." });
          setIsReceiveDialogOpen(false);
        },
        onError: (error: any) =>
          toast({ title: "Could not receive transfer", description: error.message, variant: "destructive" }),
      },
    );
  };

  // Print voucher function
  const handlePrint = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Transfer Voucher — ${transfer.transferNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 12px; padding: 30px; }
    .tv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1e40af; }
    .tv-logo { font-size: 22px; font-weight: 800; color: #1e40af; }
    .tv-title { text-align: right; }
    .tv-title h1 { font-size: 20px; font-weight: 800; color: #1e293b; }
    .tv-title p { color: #64748b; font-size: 11px; }
    .tv-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .tv-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .tv-section h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 8px; }
    .tv-section p { font-size: 13px; font-weight: 600; color: #1e293b; }
    .tv-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .tv-table th { background: #1e40af; color: white; padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    .tv-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
    .tv-table tr:nth-child(even) td { background: #f8fafc; }
    .tv-signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 24px; }
    .tv-sig-block { border-top: 2px solid #334155; padding-top: 8px; }
  </style>
</head>
<body onload="window.print(); window.close();">
  <div class="tv-header">
    <div class="tv-logo">${activeCompany?.name || "Company"}</div>
    <div class="tv-title">
      <h1>STOCK TRANSFER VOUCHER</h1>
      <p># ${transfer.transferNumber}</p>
      <p>Status: ${transfer.status}</p>
    </div>
  </div>
  <div class="tv-meta">
    <div class="tv-section">
      <h3>From Location</h3>
      <p>${transfer.fromLocationName}</p>
    </div>
    <div class="tv-section">
      <h3>To Location</h3>
      <p>${transfer.toLocationName}</p>
    </div>
  </div>
  <table class="tv-table">
    <thead>
      <tr>
        <th>Product Code</th>
        <th>Description</th>
        <th style="text-align:right">Dispatched Qty</th>
        <th style="text-align:right">Received Qty</th>
        <th style="text-align:right">Damaged Qty</th>
        <th style="text-align:right">Lost Qty</th>
      </tr>
    </thead>
    <tbody>
      ${transfer.items.map(item => `
        <tr>
          <td>${item.sku || "N/A"}</td>
          <td>${item.productName}</td>
          <td style="text-align:right">${Number(item.quantity).toFixed(2)}</td>
          <td style="text-align:right">${item.quantityReceived != null ? Number(item.quantityReceived).toFixed(2) : ""}</td>
          <td style="text-align:right">${item.quantityDamaged != null ? Number(item.quantityDamaged).toFixed(2) : "0.00"}</td>
          <td style="text-align:right">${item.quantityLost != null ? Number(item.quantityLost).toFixed(2) : "0.00"}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="tv-signatures">
    <div class="tv-sig-block">Dispatched By / Date</div>
    <div class="tv-sig-block">Transported By / Date</div>
    <div class="tv-sig-block">Received By / Date</div>
  </div>
</body>
</html>`);
    w.document.close();
  };

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-xl border-slate-200"
            onClick={() => setLocation("/inventory/transfers")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Transfer Details</span>
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
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {transfer.status === "DRAFT" && (
            <>
              <Button
                variant="outline"
                className="rounded-xl text-red-500 hover:bg-red-50 hover:border-red-200"
                onClick={handleCancel}
                disabled={cancelTransfer.isPending}
              >
                Cancel
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90 text-white rounded-xl font-bold gap-2"
                onClick={handleSubmit}
                disabled={submitTransfer.isPending}
              >
                {submitTransfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit for Approval
              </Button>
            </>
          )}

          {transfer.status === "PENDING_APPROVAL" && (
            <>
              <Button
                variant="outline"
                className="rounded-xl text-red-500 hover:bg-red-50 hover:border-red-200"
                onClick={handleCancel}
                disabled={cancelTransfer.isPending}
              >
                Reject / Cancel
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold gap-2"
                onClick={handleApprove}
                disabled={approveTransfer.isPending}
              >
                {approveTransfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Approve Transfer
              </Button>
            </>
          )}

          {transfer.status === "APPROVED" && (
            <>
              <Button
                variant="outline"
                className="rounded-xl text-red-500 hover:bg-red-50 hover:border-red-200"
                onClick={handleCancel}
                disabled={cancelTransfer.isPending}
              >
                Cancel
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold gap-2"
                onClick={handleDispatch}
                disabled={dispatchTransfer.isPending}
              >
                {dispatchTransfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Truck className="h-4 w-4" />
                Dispatch & Ship
              </Button>
            </>
          )}

          {transfer.status === "IN_TRANSIT" && (
            <>
              <Button
                variant="outline"
                className="rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200 border-slate-200"
                onClick={handleCancel}
                disabled={cancelTransfer.isPending}
              >
                Cancel & Reverse
              </Button>
              <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Receive Stock
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Receive Transfer: {transfer?.transferNumber}</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <div className="grid grid-cols-[1fr_100px_100px_100px_100px] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span>Product</span>
                        <span className="text-right">Sent (Expected)</span>
                        <span className="text-right">Received</span>
                        <span className="text-right">Damaged</span>
                        <span className="text-right">Lost</span>
                      </div>
                      {(transfer?.items || []).map((item) => {
                        const recVal = quantities[item.productId] ?? String(item.quantity);
                        const dmgVal = damagedQuantities[item.productId] ?? "0";
                        const lstVal = lostQuantities[item.productId] ?? "0";
                        const sum = Number(recVal) + Number(dmgVal) + Number(lstVal);
                        const isMismatch = sum !== item.quantity;
                        
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "grid grid-cols-[1fr_100px_100px_100px_100px] items-center gap-2 border-b border-slate-50 px-4 py-3 last:border-b-0",
                              isMismatch ? "bg-red-50/40" : ""
                            )}
                          >
                            <div>
                              <p className="font-bold text-slate-800">{item.productName}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{item.sku || "No SKU"}</p>
                            </div>
                            <p className="font-mono font-bold text-slate-700 text-right">{Number(item.quantity || 0).toFixed(2)}</p>
                            
                            <div>
                              <Input
                                value={recVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setQuantities((prev) => ({ ...prev, [item.productId]: val }));
                                  // Auto allocate missing to lost
                                  const numVal = Number(val);
                                  if (numVal < item.quantity) {
                                    setLostQuantities((prev) => ({ ...prev, [item.productId]: String(item.quantity - numVal) }));
                                    setDamagedQuantities((prev) => ({ ...prev, [item.productId]: "0" }));
                                  } else {
                                    setLostQuantities((prev) => ({ ...prev, [item.productId]: "0" }));
                                    setDamagedQuantities((prev) => ({ ...prev, [item.productId]: "0" }));
                                  }
                                }}
                                type="number"
                                min="0"
                                max={item.quantity}
                                step="0.01"
                                className="text-right h-9 rounded-lg"
                              />
                            </div>
                            
                            <div>
                              <Input
                                value={dmgVal}
                                onChange={(e) => setDamagedQuantities((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                                type="number"
                                min="0"
                                max={item.quantity}
                                step="0.01"
                                className="text-right h-9 rounded-lg"
                              />
                            </div>

                            <div>
                              <Input
                                value={lstVal}
                                onChange={(e) => setLostQuantities((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                                type="number"
                                min="0"
                                max={item.quantity}
                                step="0.01"
                                className="text-right h-9 rounded-lg"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Variance Warning & Reason input */}
                    {(() => {
                      let hasVariance = false;
                      for (const item of transfer.items) {
                        const rec = Number(quantities[item.productId] ?? item.quantity);
                        const dmg = Number(damagedQuantities[item.productId] ?? 0);
                        const lst = Number(lostQuantities[item.productId] ?? 0);
                        if (rec + dmg + lst !== item.quantity || dmg > 0 || lst > 0) {
                          hasVariance = true;
                        }
                      }
                      return hasVariance ? (
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3">
                          <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                            Discrepancies / Shrinkage Detected in Receiving Count
                          </div>
                          <p className="text-xs text-amber-700">
                            The received count does not match the dispatched quantities, or you flagged items as damaged/lost. You must provide a variance resolution reason for the double-entry accounting ledger.
                          </p>
                          <div className="grid gap-1.5">
                            <Label className="text-amber-900 font-bold">Variance Reason / Claim Details</Label>
                            <Input
                              value={varianceReason}
                              onChange={(e) => setVarianceReason(e.target.value)}
                              placeholder="e.g., Transit vehicle damage, box waterlogged, clerk counting discrepancy..."
                              className="bg-white border-amber-300 focus:ring-amber-500 rounded-lg h-9"
                            />
                          </div>
                        </div>
                      ) : null;
                    })()}

                    <div className="grid gap-2">
                      <Label className="font-bold text-slate-700">Receiving Notes / Memo</Label>
                      <Textarea
                        value={receiveNotes}
                        onChange={(e) => setReceiveNotes(e.target.value)}
                        className="bg-slate-50 rounded-xl"
                        rows={2}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => setIsReceiveDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleReceive} disabled={receiveTransfer.isPending} className="bg-emerald-600 hover:bg-emerald-700 font-bold rounded-xl px-5">
                      {receiveTransfer.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Confirm Receipt & Ledger Posting
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-white px-6 py-5 flex items-center gap-3">
              <Package className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-lg">Transfer Route</h3>
              <Badge variant="outline" className="ml-2 font-mono text-slate-600">{transfer.transferNumber}</Badge>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">From Source Location</p>
                  <p className="font-bold text-slate-800 text-base">{transfer.fromLocationName}</p>
                </div>
                <div className="flex justify-center text-slate-300">
                  <ArrowRight className="h-8 w-8" />
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">To Destination Location</p>
                  <p className="font-bold text-blue-700 text-base">{transfer.toLocationName}</p>
                </div>
              </div>

              {/* Transit & Carrier Info Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carrier</p>
                    <p className="font-bold text-slate-700 text-sm">{transfer.freightCarrier || "Not Specified"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vehicle Reg Number</p>
                    <p className="font-bold text-slate-700 text-sm">{transfer.vehicleReg || "Not Specified"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transit / Freight Cost</p>
                    <p className="font-bold text-slate-700 text-sm">
                      {transfer.transitCost ? `${Number(transfer.transitCost).toFixed(2)} ${transfer.transitCostCurrency || 'USD'}` : "0.00 USD"}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="bg-slate-100 text-slate-500 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                    {transfer.items?.length || 0}
                  </span>
                  Items Transferring
                </h4>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="p-3">Description</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 text-right">Dispatched</th>
                        <th className="p-3 text-right">Received</th>
                        <th className="p-3 text-right">Damaged</th>
                        <th className="p-3 text-right">Lost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfer.items?.map((item) => {
                        const loss = Number(item.quantityLost || 0);
                        const dmg = Number(item.quantityDamaged || 0);
                        return (
                          <tr key={item.id} className="border-t border-slate-50 text-sm font-semibold text-slate-700">
                            <td className="p-3">
                              <p className="font-semibold text-slate-900">{item.productName}</p>
                              {item.batchNumber && (
                                <span className="inline-block mt-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                  Batch: {item.batchNumber} {item.expiryDate ? `| Exp: ${format(new Date(item.expiryDate), "dd MMM yyyy")}` : ""}
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-xs text-slate-500">{item.sku || "-"}</td>
                            <td className="p-3 font-bold text-right font-mono">{Number(item.quantity).toFixed(2)}</td>
                            <td className={cn("p-3 font-bold text-right font-mono", item.quantityReceived != null ? "text-emerald-600" : "text-slate-300")}>
                              {item.quantityReceived != null ? Number(item.quantityReceived).toFixed(2) : "—"}
                            </td>
                            <td className={cn("p-3 font-bold text-right font-mono", dmg > 0 ? "text-amber-600" : "text-slate-300")}>
                              {dmg > 0 ? dmg.toFixed(2) : "—"}
                            </td>
                            <td className={cn("p-3 font-bold text-right font-mono", loss > 0 ? "text-red-600" : "text-slate-300")}>
                              {loss > 0 ? loss.toFixed(2) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {transfer.varianceReason && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Variance Reason</p>
                  <p className="text-sm text-slate-700 font-medium">{transfer.varianceReason}</p>
                </div>
              )}

              {transfer.notes && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Notes / Instructions</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{transfer.notes}</p>
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
                  <p className="font-bold text-slate-800 text-lg">{meta.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{meta.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Audit Trail</h3>
            </div>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Created On</span>
                <span className="font-semibold text-slate-800">
                  {transfer.createdAt ? format(new Date(transfer.createdAt), "dd MMM yyyy HH:mm") : "—"}
                </span>
              </div>
              <div className="h-px bg-slate-100" />
              <div className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approved On</span>
                <span className="font-semibold text-slate-800">
                  {transfer.approvedAt ? format(new Date(transfer.approvedAt), "dd MMM yyyy HH:mm") : "—"}
                </span>
              </div>
              <div className="h-px bg-slate-100" />
              <div className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dispatched On</span>
                <span className="font-semibold text-slate-800">
                  {transfer.dispatchedAt ? format(new Date(transfer.dispatchedAt), "dd MMM yyyy HH:mm") : "—"}
                </span>
              </div>
              <div className="h-px bg-slate-100" />
              <div className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Received On</span>
                <span className="font-semibold text-slate-800">
                  {transfer.receivedAt ? format(new Date(transfer.receivedAt), "dd MMM yyyy HH:mm") : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Quick Actions</h3>
            </div>
            <CardContent className="p-4 space-y-2 flex flex-col">
              <Button 
                variant="outline"
                className="w-full rounded-xl font-bold h-11 border-slate-200 text-slate-700"
                onClick={handlePrint}
              >
                <FileText className="w-4 h-4 mr-2 text-slate-400" /> Print Voucher
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
