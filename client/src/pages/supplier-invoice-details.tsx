import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Receipt, Loader2, Building2, CheckCircle2, Clock, Ban, MoreHorizontal, FileText, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PaymentModal } from "@/components/invoices/payment-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_META = {
  unpaid: { label: "Unpaid", icon: Clock, badge: "border-amber-200 bg-amber-50 text-amber-700" },
  partial: { label: "Partially Paid", icon: Clock, badge: "border-blue-200 bg-blue-50 text-blue-700" },
  paid: { label: "Paid", icon: CheckCircle2, badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  void: { label: "Void", icon: Ban, badge: "border-slate-200 bg-slate-50 text-slate-600" },
} as const;

export default function SupplierInvoiceDetailsPage() {
  const [, params] = useRoute("/supplier-invoices/:id");
  const [, setLocation] = useLocation();
  const invoiceId = Number(params?.id);
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const companyId = activeCompanyId || 0;

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/supplier-invoices/${invoiceId}`],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/supplier-invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to load invoice");
      return res.json();
    },
    enabled: !!companyId && !!invoiceId,
  });

  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const isNote = invoice?.transactionType === "CreditNote" || invoice?.transactionType === "DebitNote";
  const isBill = invoice?.transactionType === "Invoice";

  const { data: allBills = [] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/supplier-invoices`],
    enabled: !!companyId && !!invoice && (isBill || isNote),
  });

  const linkedNotes = isBill
    ? (allBills as any[]).filter((b: any) => String(b.referenceInvoiceId || "") === String(invoice.id))
    : [];
  const totalCredited = linkedNotes
    .filter((b: any) => b.transactionType === "CreditNote")
    .reduce((s: number, b: any) => s + Number(b.totalAmount || 0), 0);
  const totalDebited = linkedNotes
    .filter((b: any) => b.transactionType === "DebitNote")
    .reduce((s: number, b: any) => s + Number(b.totalAmount || 0), 0);
  const remainingAdjustable = isBill
    ? Number(invoice.totalAmount || 0) + totalDebited - totalCredited
    : 0;

  const referenceId = invoice?.referenceInvoiceId ? Number(invoice.referenceInvoiceId) : 0;
  const { data: referenceBill } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/supplier-invoices/${referenceId}`],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/supplier-invoices/${referenceId}`);
      if (!res.ok) throw new Error("Failed to load linked bill");
      return res.json();
    },
    enabled: !!companyId && !!referenceId && isNote,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[calc(100vh-200px)] items-center justify-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin mr-2 text-primary" /> Loading Bill...
        </div>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout>
        <Card className="rounded-2xl border-slate-200 mt-6">
          <CardContent className="p-8 text-center flex flex-col items-center justify-center">
            <Receipt className="h-12 w-12 text-slate-300 mb-4" />
            <p className="font-bold text-slate-700">Supplier Bill not found</p>
            <Button variant="outline" onClick={() => setLocation("/supplier-invoices")} className="rounded-xl mt-4">
              Return to Supplier Invoices
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const isPaid = invoice.status === "paid";
  const balanceDue = Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0);
  const typeLabel = invoice.transactionType === "DebitNote" ? "Debit Note" : invoice.transactionType === "CreditNote" ? "Credit Note" : "Supplier Bill";

  const meta = STATUS_META[invoice.status as keyof typeof STATUS_META] || STATUS_META.unpaid;
  const StatusIcon = meta.icon;

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setLocation("/supplier-invoices")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            {typeLabel} Details
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {invoice.transactionType === "Invoice" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-xl gap-2 text-slate-600">
                  <MoreHorizontal className="h-4 w-4" />
                  More Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={() => setLocation(`/supplier-invoices/new?type=DebitNote&referenceId=${invoice.id}`)}>
                  Create Debit Note
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation(`/supplier-invoices/new?type=CreditNote&referenceId=${invoice.id}`)}>
                  Create Credit Note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!isPaid && invoice.transactionType === "Invoice" && invoice.status !== "void" && (
            <Button
              onClick={() => setShowPaymentModal(true)}
              className="bg-primary hover:bg-primary/90 text-white rounded-xl font-bold gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Record Payment
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-white px-6 py-5 flex items-center gap-3">
              <Receipt className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-lg">{invoice.invoiceNumber}</h3>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Created Date</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {invoice.date ? format(new Date(invoice.date), "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Supplier</p>
                  <p className="text-sm font-semibold text-blue-600">{invoice.supplier?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Due Date</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {invoice.dueDate ? format(new Date(invoice.dueDate), "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">VAT Number</p>
                  <p className="text-sm font-semibold text-slate-800">{invoice.supplier?.vatNumber || "N/A"}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span className="bg-slate-100 text-slate-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">
                    {invoice.items?.length || 0}
                  </span>
                  Line Items
                </h4>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="p-3 text-left">Description</th>
                        <th className="p-3 text-right">Qty</th>
                        <th className="p-3 text-right">Unit Price</th>
                        <th className="p-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items?.map((item: any) => (
                        <tr key={item.id} className="border-t border-slate-50">
                          <td className="p-3 font-semibold text-slate-800">{item.description}</td>
                          <td className="p-3 text-right font-bold">{Number(item.quantity).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono text-sm">{formatCurrency(Number(item.unitPrice), invoice.currency)}</td>
                          <td className="p-3 text-right font-bold text-slate-900">
                            {formatCurrency(Number(item.totalPrice), invoice.currency)}
                          </td>
                        </tr>
                      ))}
                      {(!invoice.items || invoice.items.length === 0) && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-slate-500">
                            No line items found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {invoice.notes && (
                <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Notes / Description</p>
                  <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}

              {isNote && (
                <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">
                    Linked to original bill
                  </p>
                  {referenceBill ? (
                    <button
                      className="font-bold text-blue-700 hover:underline"
                      onClick={() => setLocation(`/supplier-invoices/${referenceBill.id}`)}
                    >
                      {referenceBill.invoiceNumber} — {formatCurrency(Number(referenceBill.totalAmount), referenceBill.currency)}
                    </button>
                  ) : invoice.referenceInvoiceId ? (
                    <button
                      className="font-bold text-blue-700 hover:underline"
                      onClick={() => setLocation(`/supplier-invoices/${invoice.referenceInvoiceId}`)}
                    >
                      View original bill #{invoice.referenceInvoiceId}
                    </button>
                  ) : (
                    <span className="text-slate-600">No linked bill.</span>
                  )}
                  <p className="text-xs text-blue-900/70 mt-1">
                    {invoice.transactionType === "CreditNote"
                      ? "This credit note reduced Accounts Payable and reversed inventory/expense + VAT."
                      : "This debit note increased Accounts Payable with inventory/expense + VAT."}
                  </p>
                </div>
              )}

              {isBill && linkedNotes.length > 0 && (
                <div className="mt-6 rounded-xl border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Linked Debit / Credit Notes ({linkedNotes.length})
                  </div>
                  {linkedNotes.map((n: any) => (
                    <button
                      key={n.id}
                      onClick={() => setLocation(`/supplier-invoices/${n.id}`)}
                      className="w-full flex items-center justify-between px-4 py-2.5 border-t border-slate-50 hover:bg-slate-50 text-left"
                    >
                      <span className="text-sm font-bold text-slate-700">
                        {n.invoiceNumber}{" "}
                        <span className={cn(
                          "ml-1 text-[10px] px-1.5 py-0.5 rounded border",
                          n.transactionType === "CreditNote"
                            ? "bg-cyan-50 text-cyan-700 border-cyan-100"
                            : "bg-purple-50 text-purple-700 border-purple-100"
                        )}>
                          {n.transactionType === "CreditNote" ? "CREDIT" : "DEBIT"}
                        </span>
                      </span>
                      <span className="text-sm font-mono text-slate-800">
                        {formatCurrency(Number(n.totalAmount), n.currency)}
                      </span>
                    </button>
                  ))}
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
                <span className="text-slate-500">Subtotal:</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(Number(invoice.subtotalAmount), invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Input VAT Claimed:</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(Number(invoice.taxAmount), invoice.currency)}
                </span>
              </div>
              <div className="h-px bg-slate-100 my-2" />
              <div className="flex justify-between items-end">
                <span className="text-sm font-bold text-slate-800">Bill Total:</span>
                <span className="text-xl font-black text-slate-900">
                  {formatCurrency(Number(invoice.totalAmount), invoice.currency)}
                </span>
              </div>
              
              <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-sm text-emerald-600">
                  <span className="font-medium">Amount Paid:</span>
                  <span className="font-bold">
                    {formatCurrency(Number(invoice.paidAmount), invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-rose-50 p-2 rounded-lg border border-rose-100">
                  <span className="text-sm font-bold text-rose-700">Balance Due:</span>
                  <span className="text-lg font-black text-rose-700">
                    {formatCurrency(balanceDue, invoice.currency)}
                  </span>
                </div>
                {isBill && (
                  <div className="flex justify-between items-center text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="font-medium">Remaining adjustable (net of notes):</span>
                    <span className="font-bold">
                      {formatCurrency(remainingAdjustable, invoice.currency)}
                    </span>
                  </div>
                )}
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
                className="w-full rounded-xl font-bold h-11"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4 mr-2" /> Print PDF
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal
          invoice={{
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            total: invoice.totalAmount,
            paidAmount: invoice.paidAmount,
            status: invoice.status,
            supplierId: invoice.supplierId || invoice.supplier?.id,
            currency: invoice.currency,
          }}
          remainingBalance={balanceDue}
          type="supplier"
          open={showPaymentModal}
          onOpenChange={setShowPaymentModal}
        />
      )}
    </Layout>
  );
}
