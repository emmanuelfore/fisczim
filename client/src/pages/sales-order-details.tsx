import { Layout } from "@/components/layout";
import { useSalesOrder, useApproveSalesOrder, useRecordLayByPayment, useReceiveGoods } from "@/hooks/use-sales-orders";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-companies";
import {
  ArrowLeft, Printer, Package, FileText, User, FileEdit,
  Plane, Ship, Clock, AlertTriangle, CheckCircle2, DollarSign,
  ChevronRight, Truck, Box, Calendar
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


export default function SalesOrderDetailsPage() {
  const params = useParams();
  const id = params.id;
  const { data: order, isLoading, error } = useSalesOrder(id);
  const { data: company } = useCompany(order?.companyId || 0);
  const approveMutation = useApproveSalesOrder();
  const recordPaymentMutation = useRecordLayByPayment();
  const receiveGoodsMutation = useReceiveGoods();
  const [isAllocating, setIsAllocating] = useState(false);
  const [stockId, setStockId] = useState("");
  const [allocQty, setAllocQty] = useState("");
  const [isInvoicing, setIsInvoicing] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalNotes, setApprovalNotes] = useState("");
  const [isPaymentDialog, setIsPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | undefined>();
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentReference, setPaymentReference] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  if (isLoading) return <Layout><div className="p-8 flex justify-center items-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div></Layout>;
  if (error) return <Layout><div className="p-8 text-center text-slate-500">Error loading sales order: {error.message}</div></Layout>;
  if (!order) return <Layout><div className="p-8 text-center text-slate-500">Sales Order not found (ID: {id}). Please check if the sales order exists.</div></Layout>;

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync({ id: id!, action: approvalAction, notes: approvalNotes });
      toast({ title: approvalAction === 'approve' ? "Order Approved" : "Order Rejected" });
      setIsApproving(false);
      setApprovalNotes("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRecordPayment = async () => {
    try {
      const amount = parseFloat(paymentAmount);
      if (!amount || amount <= 0) throw new Error("Enter a valid amount");
      await recordPaymentMutation.mutateAsync({ id: id!, amount, scheduleId: selectedScheduleId, paymentMethod, paymentReference });
      toast({ title: "Payment Recorded", description: `$${amount.toFixed(2)} recorded successfully.` });
      setIsPaymentDialog(false);
      setPaymentAmount("");
      setPaymentReference("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleReceiveGoods = async () => {
    try {
      await receiveGoodsMutation.mutateAsync(id!);
      toast({ title: "Goods Received", description: "Order status updated to Arrived." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAllocate = async () => {
    try {
      const res = await apiFetch(`/api/sales-orders/${id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId: parseInt(stockId), quantity: parseFloat(allocQty) })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to allocate");
      }
      toast({ title: "Stock Allocated Successfully" });
      setIsAllocating(false);
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", id] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleInvoice = async () => {
    try {
      const itemsToInvoice = order.items
        .filter((item: any) => {
           const qty = parseFloat(invoiceItems.find(i => i.id === item.id)?.qty || "0");
           return qty > 0;
        })
        .map((item: any) => ({
          salesOrderItemId: item.id,
          quantityToInvoice: invoiceItems.find(i => i.id === item.id)?.qty
        }));

      if (itemsToInvoice.length === 0) throw new Error("Select at least one item to invoice.");

      const res = await apiFetch(`/api/invoices/from-sales-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesOrderId: order.id, itemsToInvoice })
      });
      
      if (!res.ok) throw new Error("Failed to invoice");
      const invoice = await res.json();
      
      toast({ title: "Invoice Generated" });
      setIsInvoicing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", id] });
      setLocation(`/invoices/${invoice.id}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex h-full w-full flex-col bg-[#F8FAFC]">
        {/* Action Bar (Hidden when printing) */}
        <div className="sticky top-0 z-30 flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between print:hidden shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/sales-orders")} className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Sales Order {order.orderNumber}
                </h1>
                <StatusBadge status={order.status} />
              </div>
              <p className="text-sm text-slate-500 font-medium">For {order.customer?.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {order.customerId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation(`/customers/${order.customerId}`)}
                className="h-9 gap-1.5 font-medium text-slate-600 hover:text-slate-900"
              >
                <User className="h-4 w-4" />
                View Customer
              </Button>
            )}
            
            {order.status !== "invoiced" && order.status !== "closed" && order.status !== "cancelled" && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLocation(`/invoices/new?salesOrderId=${id}`)} 
                className="h-9 gap-1.5 font-medium border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                <FileEdit className="h-4 w-4" />
                Convert to Invoice
              </Button>
            )}
            
            {order.status !== "closed" && order.status !== "invoiced" && (
              <Button variant="outline" size="sm" onClick={() => setLocation(`/sales-orders/${id}/edit`)} className="h-9 gap-1.5 font-medium border-slate-300 text-slate-700 hover:bg-slate-50">
                Edit Order
              </Button>
            )}

            <Dialog open={isAllocating} onOpenChange={setIsAllocating}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 font-medium border-slate-300 text-slate-700 hover:bg-slate-50">
                  <Package className="h-4 w-4 text-amber-500" />
                  Allocate Stock
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Allocate Stock to Order</DialogTitle>
                  <p className="text-sm text-slate-500 mt-2">
                    Allocating stock permanently deducts physical inventory from your warehouse and assigns it to this order. This ensures the items cannot be sold to anyone else.
                  </p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Stock ID (Lot Number)</Label>
                    <Input value={stockId} onChange={(e) => setStockId(e.target.value)} placeholder="e.g. 1" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Quantity to Allocate</Label>
                    <QuantityInput type="number" value={allocQty} onChange={(e) => setAllocQty(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAllocate}>Confirm Allocation</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isInvoicing} onOpenChange={setIsInvoicing}>
              <DialogTrigger asChild>
                <Button variant="default" size="sm" className="h-9 gap-1.5 font-medium bg-primary hover:bg-primary/90">
                  <FileText className="h-4 w-4" />
                  Generate Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Generate Invoice</DialogTitle>
                  <p className="text-sm text-slate-500 mt-1">Convert ordered lines into a formal invoice for the customer.</p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-2 text-slate-500 font-semibold">Item</th>
                        <th className="py-2 text-slate-500 font-semibold text-center">Ordered</th>
                        <th className="py-2 text-slate-500 font-semibold text-center">Invoiced</th>
                        <th className="py-2 text-slate-500 font-semibold text-right">Qty to Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item: any) => (
                        <tr key={item.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 font-medium text-slate-900">{item.description}</td>
                          <td className="py-3 text-center">{item.quantity}</td>
                          <td className="py-3 text-center text-slate-500">{item.invoicedQuantity}</td>
                          <td className="py-3 text-right">
                            <QuantityInput 
                              type="number" 
                              className=" ml-auto text-right h-8"
                              defaultValue="0"
                              max={item.quantity - item.invoicedQuantity}
                              min="0"
                              onChange={(e) => {
                                setInvoiceItems(prev => {
                                  const existing = prev.filter(i => i.id !== item.id);
                                  return [...existing, { id: item.id, qty: e.target.value }];
                                });
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInvoicing(false)}>Cancel</Button>
                  <Button onClick={handleInvoice}>Generate Invoice</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 gap-1.5 font-medium border-slate-300 text-slate-700 hover:bg-slate-50 ml-2">
              <Printer className="h-4 w-4" />
              Print / PDF
            </Button>
          </div>
        </div>

        {/* Type-Specific Panels */}
        {order.orderType === 'preorder' && (
          <div className="px-6 py-4 border-b border-slate-100 bg-white print:hidden">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Preorder Type & Status */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    {order.preorderType === 'air' ? <Plane className="w-4 h-4 text-sky-600" /> : <Ship className="w-4 h-4 text-blue-600" />}
                    {order.preorderType === 'air' ? 'Air Preorder' : 'Sea Preorder'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {order.expectedArrival && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-500">Expected:</span>
                      <span className="font-medium">{format(new Date(order.expectedArrival), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                  {order.expectedArrival && new Date(order.expectedArrival) < new Date() && !['completed', 'cancelled'].includes(order.status) && (
                    <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Delayed by {differenceInDays(new Date(), new Date(order.expectedArrival))} days — Refund recommended
                    </div>
                  )}
                  {order.status === 'in_transit' || order.status === 'awaiting_shipment' ? (
                    <Button size="sm" className="w-full mt-2" onClick={handleReceiveGoods} disabled={receiveGoodsMutation.isPending}>
                      <Truck className="w-4 h-4 mr-2" /> Mark Goods Received
                    </Button>
                  ) : null}
                </CardContent>
              </Card>

              {/* Deposit Summary */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Deposit Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order Total</span>
                    <span className="font-semibold">${Number(order.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Required ({order.depositPct || (order.preorderType === 'air' ? 50 : 30)}%)</span>
                    <span className="font-medium text-amber-700">${(Number(order.total) * (parseFloat(order.depositPct || (order.preorderType === 'air' ? '50' : '30')) / 100)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Deposit Paid</span>
                    <span className="font-medium text-emerald-700">${Number(order.depositPaid || 0).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2 flex justify-between font-semibold">
                    <span>Balance Due</span>
                    <span className="text-red-700">${Number(order.remainingBalance || 0).toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Status Stepper */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Order Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  {['awaiting_deposit', 'approved', 'awaiting_shipment', 'in_transit', 'arrived', 'ready_for_collection', 'completed'].map((step, idx, arr) => {
                    const statuses = ['awaiting_deposit', 'approved', 'awaiting_shipment', 'in_transit', 'arrived', 'ready_for_collection', 'completed'];
                    const currentIdx = statuses.indexOf(order.status);
                    const isDone = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    return (
                      <div key={step} className="flex items-center gap-2 mb-1">
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                          isDone ? "bg-emerald-500 text-white" : isCurrent ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-400"
                        )}>
                          {isDone ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
                        </div>
                        <span className={cn(
                          "text-xs",
                          isDone ? "text-emerald-700 font-medium" : isCurrent ? "text-blue-700 font-bold" : "text-slate-400"
                        )}>
                          {step.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {order.orderType === 'lay_by' && (
          <div className="px-6 py-4 border-b border-slate-100 bg-white print:hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Lay-by Progress */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    Lay-by {order.layByDuration}-Month Plan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Total Amount</span>
                      <span className="font-semibold">${Number(order.total).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Amount Paid</span>
                      <span className="font-medium text-emerald-700">${Number(order.depositPaid || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Balance</span>
                      <span className="font-medium text-red-700">${Number(order.remainingBalance || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div
                      className="bg-emerald-500 h-2.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (Number(order.depositPaid || 0) / Number(order.total)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 text-right">
                    {((Number(order.depositPaid || 0) / Number(order.total)) * 100).toFixed(0)}% paid
                  </p>
                  {!['completed', 'cancelled', 'defaulted'].includes(order.status) && (
                    <Button size="sm" className="w-full" onClick={() => setIsPaymentDialog(true)}>
                      <DollarSign className="w-4 h-4 mr-2" /> Record Payment
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Payment Schedule */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Payment Schedule</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {order.layBySchedules && order.layBySchedules.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 font-semibold">
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">Due Date</th>
                            <th className="py-2 px-3 text-right">Amount Due</th>
                            <th className="py-2 px-3 text-right">Paid</th>
                            <th className="py-2 px-3 text-center">Status</th>
                            <th className="py-2 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.layBySchedules.map((sch: any) => (
                            <tr key={sch.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                              <td className="py-2 px-3 font-bold text-slate-700">{sch.instalmentNumber}</td>
                              <td className="py-2 px-3">{sch.dueDate ? format(new Date(sch.dueDate), 'dd/MM/yyyy') : '—'}</td>
                              <td className="py-2 px-3 text-right font-medium">${Number(sch.amountDue).toFixed(2)}</td>
                              <td className="py-2 px-3 text-right text-emerald-700 font-medium">${Number(sch.amountPaid || 0).toFixed(2)}</td>
                              <td className="py-2 px-3 text-center">
                                <Badge className={cn(
                                  "text-[10px] px-1.5 py-0.5",
                                  sch.status === 'paid' ? "bg-emerald-100 text-emerald-700 border-0" : "bg-amber-100 text-amber-700 border-0"
                                )}>
                                  {sch.status}
                                </Badge>
                              </td>
                              <td className="py-2 px-3 text-right">
                                {sch.status !== 'paid' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[10px] text-blue-600 hover:bg-blue-50"
                                    onClick={() => {
                                      setSelectedScheduleId(sch.id);
                                      setPaymentAmount((Number(sch.amountDue) - Number(sch.amountPaid || 0)).toFixed(2));
                                      setIsPaymentDialog(true);
                                    }}
                                  >
                                    Pay
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 px-4 py-3">
                      No payment schedule loaded.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Payment Record Dialog */}
            <Dialog open={isPaymentDialog} onOpenChange={setIsPaymentDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Lay-by Payment</DialogTitle>
                  <p className="text-sm text-slate-500 mt-1">Record a payment received for this lay-by order.</p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Payment Amount</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        className="pl-7"
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger><SelectValue placeholder="Select Method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="EcoCash">EcoCash / Mobile Money</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Reference / Notes (Optional)</Label>
                    <Input
                      value={paymentReference}
                      onChange={e => setPaymentReference(e.target.value)}
                      placeholder="Transaction Ref, Receipt #..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsPaymentDialog(false)}>Cancel</Button>
                  <Button onClick={handleRecordPayment} disabled={recordPaymentMutation.isPending}>Record Payment</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Approval Panel */}
        {order.approvalStatus === 'pending' && (
          <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 print:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-800">This order requires admin approval</p>
                  <p className="text-sm text-amber-700">Deposit amount is below the minimum required threshold.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => { setApprovalAction('reject'); setIsApproving(true); }}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => { setApprovalAction('approve'); setIsApproving(true); }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Approval Dialog */}
        <Dialog open={isApproving} onOpenChange={setIsApproving}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{approvalAction === 'approve' ? 'Approve Order' : 'Reject Order'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={approvalNotes}
                  onChange={e => setApprovalNotes(e.target.value)}
                  placeholder="Add notes for this decision..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsApproving(false)}>Cancel</Button>
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className={approvalAction === 'reject' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                {approvalAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Main Document Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-100/50 print:p-0 print:bg-white">
          
          {/* A4 Document Container — min-height ensures A4 proportions, content can extend naturally */}
          <div className="mx-auto w-full max-w-[860px] rounded-md bg-white shadow-xl ring-1 ring-slate-200 print:shadow-none print:ring-0 print:m-0 print:max-w-full" style={{ minHeight: "297mm" }}>
            
            <div className="p-10 md:p-14 flex flex-col relative">
              
              {/* Header Section */}
              <div className="flex justify-between items-start mb-12">
                <div className="max-w-[50%]">
                  {company?.logo ? (
                    <img src={company.logo} alt="Logo" className="max-h-16 mb-4 object-contain" />
                  ) : (
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-4">
                      {company?.tradingName || company?.name || "Our Company"}
                    </h2>
                  )}
                  <div className="text-sm text-slate-500 leading-relaxed">
                    <p>{company?.address}</p>
                    <p>{company?.city}</p>
                    {company?.phone && <p>Tel: {company.phone}</p>}
                    {company?.tin && <p>TIN: {company.tin}</p>}
                    {company?.vatNumber && <p>VAT: {company.vatNumber}</p>}
                  </div>
                </div>
                
                <div className="text-right">
                  <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-4">
                    SALES ORDER
                  </h1>
                  <div className="inline-block bg-slate-50 border border-slate-200 rounded-lg p-4 text-left min-w-[200px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <span className="text-slate-500 font-medium">Order #:</span>
                      <span className="font-semibold text-slate-900 text-right">{order.orderNumber}</span>
                      
                      <span className="text-slate-500 font-medium">Date:</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {order.issueDate ? format(new Date(order.issueDate), "dd MMM yyyy") : "-"}
                      </span>
                      
                      <span className="text-slate-500 font-medium">Currency:</span>
                      <span className="font-semibold text-slate-900 text-right uppercase">{order.currency || "USD"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Section */}
              <div className="mb-10">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 pb-2 border-b border-slate-100">
                  Customer Details
                </h3>
                <div className="text-sm text-slate-800 leading-relaxed">
                  <p className="font-bold text-base text-slate-900 mb-1">{order.customer?.name}</p>
                  {order.customer?.address && <p>{order.customer.address}</p>}
                  {order.customer?.phone && <p>Tel: {order.customer.phone}</p>}
                  {order.customer?.email && <p>Email: {order.customer.email}</p>}
                  
                  <div className="mt-2 flex gap-4 text-xs text-slate-500">
                    {order.customer?.tin && <span><strong className="text-slate-700">TIN:</strong> {order.customer.tin}</span>}
                    {order.customer?.vatNumber && <span><strong className="text-slate-700">VAT:</strong> {order.customer.vatNumber}</span>}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="flex-1">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-200">
                      <th className="py-3 px-4 font-semibold text-slate-700 w-3/5">Description</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-center">Qty</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-right">Price</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item: any, index: number) => (
                      <tr key={item.id} className={`border-b border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="py-4 px-4 font-medium text-slate-900">{item.description}</td>
                        <td className="py-4 px-4 text-center text-slate-700">{item.quantity}</td>
                        <td className="py-4 px-4 text-right text-slate-700">
                          {Number(item.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-4 text-right font-semibold text-slate-900">
                          {Number(item.lineTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Section */}
              <div className="mt-8 flex justify-end">
                <div className="w-1/2 min-w-[300px] border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Subtotal</span>
                      <span className="text-slate-900 font-semibold">
                        {order.currency || "USD"} {Number(order.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {Number(order.taxAmount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Tax</span>
                        <span className="text-slate-900 font-semibold">
                          {order.currency || "USD"} {Number(order.taxAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
                    <span className="font-semibold uppercase tracking-wider text-xs text-slate-300">Total Due</span>
                    <span className="text-xl font-bold">
                      {order.currency || "USD"} {Number(order.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer / Disclaimer */}
              <div className="mt-16 pt-6 border-t border-slate-200 text-center">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
                  Sales Order Document
                </p>
                <p className="text-[10px] text-slate-400">
                  This document is a formal confirmation of a sales order. It is NOT a tax invoice.
                  A final tax invoice will be generated upon fulfillment.
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
