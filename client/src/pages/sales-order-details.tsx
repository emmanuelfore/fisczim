import { Layout } from "@/components/layout";
import { useSalesOrder } from "@/hooks/use-sales-orders";
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
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-companies";
import { ArrowLeft, Printer, Send, Package, FileText, Download, User, ShoppingCart, FileEdit } from "lucide-react";
import { format } from "date-fns";
import { QuantityInput } from "@/components/ui/quantity-input";


export default function SalesOrderDetailsPage() {
  const params = useParams();
  const id = params.id;
  const { data: order, isLoading, error } = useSalesOrder(id);
  const { data: company } = useCompany(order?.companyId || 0);
  const [isAllocating, setIsAllocating] = useState(false);
  const [stockId, setStockId] = useState("");
  const [allocQty, setAllocQty] = useState("");
  const [isInvoicing, setIsInvoicing] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  if (isLoading) return <Layout><div className="p-8 flex justify-center items-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div></Layout>;
  if (error) return <Layout><div className="p-8 text-center text-slate-500">Error loading sales order: {error.message}</div></Layout>;
  if (!order) return <Layout><div className="p-8 text-center text-slate-500">Sales Order not found (ID: {id}). Please check if the sales order exists.</div></Layout>;

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
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
