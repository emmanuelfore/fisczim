import { Layout } from "@/components/layout";
import { cn } from "@/lib/utils";
import { useInvoices, useInvoice, useDeleteInvoice, useFiscalizeInvoice, useUpdateInvoice, useCreateCreditNote, useCreateDebitNote, usePayments, useConvertQuotation } from "@/hooks/use-invoices";
import { useCreateRecurringInvoice } from "@/hooks/use-recurring";
import { Button } from "@/components/ui/button";
import { Plus, Search, FileText, Loader2, ShieldCheck, Send, MoreHorizontal, Copy, Eye, Edit, Trash2, User, Download, Share2, MessageCircle, Mail, CreditCard, Undo2, MoreVertical, Printer, ClipboardList, ArrowLeft, UploadCloud, RefreshCw, SlidersHorizontal, X, ReceiptText, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, type ElementType } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarIcon, Filter, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { SmartFixDialog } from "@/components/smart-fix-dialog";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useCurrencies } from "@/hooks/use-currencies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/invoices/pdf-document";
import { useCompany } from "@/hooks/use-companies";
import QRCode from "qrcode";
import { PaymentModal } from "@/components/invoices/payment-modal";
import { EmailInvoiceDialog } from "@/components/invoices/email-invoice-dialog";
import { PaymentReceipt } from "@/components/invoices/payment-receipt";
import { ValidationErrorsDisplay } from "@/components/invoices/validation-errors-display";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useBranchContext } from "@/lib/branch-context";
import { pdf } from "@react-pdf/renderer";

// ── Preview panel (used by invoice-details split view) ──────────────────────
export function InvoicePreviewPanel({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const { data: company } = useCompany(invoice?.companyId || 0);
  const { taxTypes } = useTaxConfig(invoice?.companyId || 0);
  const fiscalize = useFiscalizeInvoice();
  const { data: payments } = usePayments(invoiceId);
  const updateInvoice = useUpdateInvoice();
  const createCreditNote = useCreateCreditNote();
  const createDebitNote = useCreateDebitNote();
  const { toast } = useToast();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<any | null>(null);
  const [isFiscalizing, setIsFiscalizing] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isCreatingCN, setIsCreatingCN] = useState(false);
  const [isCreatingDN, setIsCreatingDN] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  const totalPaid = payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
  const balanceDue = Math.max(0, Number(invoice?.total || 0) - totalPaid);
  const isPaid = balanceDue <= 0.01;

  useEffect(() => {
    if (invoice?.fiscalCode) {
      const dataToEncode = invoice?.qrCodeData || company?.qrUrl;
      if (dataToEncode) QRCode.toDataURL(dataToEncode).then(setQrCodeDataUrl).catch(console.error);
    } else {
      setQrCodeDataUrl("");
    }
  }, [invoice?.fiscalCode, invoice?.qrCodeData, company?.qrUrl]);

  const handleIssue = async () => {
    if (isIssuing || !invoice) return;
    setIsIssuing(true);
    try {
      const invoiceNumber = invoice.invoiceNumber.startsWith("DRAFT") ? `INV-${Date.now().toString().slice(-6)}` : invoice.invoiceNumber;
      await updateInvoice.mutateAsync({ id: invoiceId, data: { status: "issued", invoiceNumber } });
      toast({ title: "Invoice Issued" });
    } finally { setIsIssuing(false); }
  };

  const handleShareWhatsapp = async () => {
    if (!invoice || !company) return;
    const phoneParam = (invoice.customer?.phone || "").replace(/\D/g, "");
    const text = `Hello ${invoice.customer?.name || "Customer"},\n\nHere is your *Invoice ${invoice.invoiceNumber}* from *${company.tradingName || company.name}*.\n\nTotal: *${invoice.currency} ${Number(invoice.total).toFixed(2)}*`;
    try {
      const blob = await pdf(<InvoicePDF invoice={invoice} company={company} customer={invoice.customer} qrCodeUrl={qrCodeDataUrl} />).toBlob();
      const file = new File([blob], `${invoice.invoiceNumber}.pdf`, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `Invoice ${invoice.invoiceNumber}`, text }); return; }
    } catch (e) { /* fallback */ }
    window.open(`https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleSendEmail = async (email: string) => {
    if (!invoice || !company) return;
    setIsSendingEmail(true);
    try {
      const blob = await pdf(<InvoicePDF invoice={invoice} company={company} customer={invoice.customer} qrCodeUrl={qrCodeDataUrl} />).toBlob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const res = await apiFetch(`/api/invoices/${invoiceId}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, pdfBase64: reader.result }) });
        if (!res.ok) throw new Error((await res.json()).message || "Failed");
        toast({ title: "Email Sent", description: `Sent to ${email}`, className: "bg-emerald-600 text-white" });
        setShowEmailDialog(false);
        setIsSendingEmail(false);
      };
    } catch (e: any) {
      toast({ title: "Email Failed", description: e.message, variant: "destructive" });
      setIsSendingEmail(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-full text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!invoice) return null;

  const isCreditNote = invoice.transactionType === "CreditNote";
  const canPreview = !invoice.fiscalCode || !!qrCodeDataUrl;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onClose}><ArrowLeft className="w-3.5 h-3.5" /></Button>
          <span className="text-xs font-bold text-slate-800 truncate">{isCreditNote ? "Credit Note" : "Invoice"} {invoice.invoiceNumber}</span>
          <StatusBadge status={(invoice.fdmsStatus === "failed" || invoice.validationStatus === "red") ? "failed" : invoice.status!} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1" onClick={() => setLocation(`/invoices/${invoiceId}`)}>
            <Eye className="w-3 h-3" /> Full View
          </Button>
          {["issued", "paid"].includes(invoice.status || "") && !invoice.fiscalCode && (
            <Button size="sm" className={cn("h-7 px-2 text-[11px] gap-1 text-white", invoice.fdmsStatus === "failed" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700")}
              onClick={() => { if (isFiscalizing) return; setIsFiscalizing(true); fiscalize.mutate(invoiceId, { onSettled: () => setIsFiscalizing(false) }); }}
              disabled={fiscalize.isPending || isFiscalizing}>
              {isFiscalizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />} Fiscalize
            </Button>
          )}
          {!isPaid && ["issued", "fiscalized"].includes(invoice.status || "") && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1 bg-blue-50 text-blue-700 border-blue-200" onClick={() => setShowPaymentModal(true)}>
              <CreditCard className="w-3 h-3" /> Pay
            </Button>
          )}
          {invoice.status === "draft" && (
            <Button size="sm" className="h-7 px-2 text-[11px] gap-1 bg-primary hover:bg-primary/90" onClick={handleIssue} disabled={isIssuing}>
              {isIssuing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Issue
            </Button>
          )}
          {["issued", "paid", "fiscalized"].includes(invoice.status || "") && canPreview && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1"><Share2 className="w-3 h-3" /> Share</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleShareWhatsapp}><MessageCircle className="w-4 h-4 mr-2" /> WhatsApp</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowEmailDialog(true)}><Mail className="w-4 h-4 mr-2" /> Email</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <PDFDownloadLink document={<InvoicePDF invoice={invoice} company={company} customer={invoice.customer} qrCodeUrl={qrCodeDataUrl} taxTypes={taxTypes.data} />} fileName={`${isCreditNote ? "CreditNote" : "Invoice"}-${invoice.invoiceNumber}.pdf`}>
                {({ loading }) => (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1" disabled={loading}>
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Download
                  </Button>
                )}
              </PDFDownloadLink>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical className="w-3.5 h-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {invoice.status === "draft" && <DropdownMenuItem onClick={() => setLocation(`/invoices/new?edit=${invoiceId}`)}>Edit Draft</DropdownMenuItem>}
              {["issued", "paid", "fiscalized"].includes(invoice.status || "") && (
                <>
                  <DropdownMenuItem onClick={() => { setIsCreatingCN(true); createCreditNote.mutateAsync(invoiceId).then(n => setLocation(`/invoices/new?edit=${n.id}`)).finally(() => setIsCreatingCN(false)); }} disabled={isCreatingCN}>
                    <Undo2 className="w-4 h-4 mr-2" /> Issue Credit Note
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setIsCreatingDN(true); createDebitNote.mutateAsync(invoiceId).then(n => setLocation(`/invoices/new?edit=${n.id}`)).finally(() => setIsCreatingDN(false)); }} disabled={isCreatingDN}>
                    <Send className="w-4 h-4 mr-2" /> Issue Debit Note
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(invoice as any)?.validationErrors?.length > 0 && (
        <div className="px-4 pt-2 shrink-0"><ValidationErrorsDisplay errors={(invoice as any).validationErrors} /></div>
      )}

      <div className="flex-1 bg-slate-100 overflow-hidden">
        {canPreview ? (
          <PDFViewer width="100%" height="100%" style={{ border: "none" }}>
            <InvoicePDF invoice={invoice} company={company} customer={invoice.customer} qrCodeUrl={qrCodeDataUrl} taxTypes={taxTypes.data} />
          </PDFViewer>
        ) : (
          <div className="flex items-center justify-center h-full gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Generating preview...
          </div>
        )}
      </div>

      <PaymentModal invoice={invoice} remainingBalance={balanceDue} open={showPaymentModal} onOpenChange={setShowPaymentModal} />
      <EmailInvoiceDialog open={showEmailDialog} onOpenChange={setShowEmailDialog} defaultEmail={invoice.customer?.email ?? undefined} onSend={handleSendEmail} isSending={isSendingEmail} />
      {receiptPayment && (
        <PaymentReceipt open={!!receiptPayment} onClose={() => setReceiptPayment(null)}
          payment={{ amount: receiptPayment.amount, paymentMethod: receiptPayment.paymentMethod, reference: receiptPayment.reference, notes: receiptPayment.notes, currency: receiptPayment.currency || invoice.currency, createdAt: receiptPayment.paymentDate }}
          invoice={invoice} company={company} customer={invoice.customer} />
      )}
    </div>
  );
}

// ── Main invoices page ───────────────────────────────────────────────────────
type StatCardProps = {
  label: string;
  value: string;
  icon: ElementType;
  tone: "blue" | "green" | "amber" | "red";
  trend: string;
  trendTone?: "green" | "red";
};

const toneStyles: Record<StatCardProps["tone"], string> = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  green: "bg-emerald-50 text-emerald-600 border-emerald-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  red: "bg-red-50 text-red-600 border-red-100",
};

function MiniSparkline({ tone }: { tone: StatCardProps["tone"] }) {
  const stroke: Record<StatCardProps["tone"], string> = {
    blue: "#2563EB",
    green: "#16A34A",
    amber: "#F59E0B",
    red: "#EF4444",
  };

  return (
    <svg width="82" height="34" viewBox="0 0 82 34" fill="none" aria-hidden="true">
      <path d="M2 26C10 18 16 21 23 15C30 9 37 14 44 10C52 5 58 8 65 6C72 4 77 7 80 3" stroke={stroke[tone]} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 26C10 18 16 21 23 15C30 9 37 14 44 10C52 5 58 8 65 6C72 4 77 7 80 3V34H2V26Z" fill={stroke[tone]} opacity="0.08" />
    </svg>
  );
}

function StatCard({ label, value, icon: Icon, tone, trend, trendTone = "green" }: StatCardProps) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={cn("mb-4 flex h-10 w-10 items-center justify-center rounded-[10px] border", toneStyles[tone])}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-[13px] font-medium text-[#64748B]">{label}</p>
          <p className="mt-2 text-[28px] font-bold leading-none tracking-tight text-[#0F172A]">{value}</p>
          <p className={cn("mt-3 text-xs font-semibold", trendTone === "red" ? "text-[#DC2626]" : "text-[#16A34A]")}>{trend}</p>
        </div>
        <div className="mt-10 shrink-0">
          <MiniSparkline tone={tone} />
        </div>
      </div>
    </div>
  );
}

function BillingPageActions({ onExport, onSync }: { onExport: () => void; onSync: () => void }) {
  return (
    <div className="flex w-full flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
      <Link href="/quotations">
        <Button variant="outline" className="h-10 w-full rounded-[10px] border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-none hover:bg-[#F8FAFC] sm:w-auto">
          <ClipboardList className="h-4 w-4 text-[#64748B]" /> Quotations
        </Button>
      </Link>
      <Button variant="outline" className="h-10 w-full rounded-[10px] border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-none hover:bg-[#F8FAFC] sm:w-auto" onClick={onExport}>
        <Download className="h-4 w-4 text-[#64748B]" /> Export
      </Button>
      <Button variant="outline" className="h-10 w-full rounded-[10px] border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-none hover:bg-[#F8FAFC] sm:w-auto" onClick={onSync}>
        <RefreshCw className="h-4 w-4 text-[#64748B]" /> Sync FDMS
      </Button>
      <Link href="/invoices/new">
        <Button className="h-10 w-full rounded-[10px] border border-[#2563EB] bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(37,99,235,0.25)] hover:from-[#1D4ED8] hover:to-[#1D4ED8] sm:w-auto">
          <Plus className="h-4 w-4" /> Create Invoice
        </Button>
      </Link>
    </div>
  );
}

function StatusPill({ status, label }: { status: "fiscalized" | "pending" | "failed" | "draft" | "paid" | "unpaid" | "partial"; label?: string }) {
  const styles: Record<typeof status, string> = {
    fiscalized: "border-transparent bg-[#DCFCE7] text-[#166534]",
    pending: "border-transparent bg-[#FEF3C7] text-[#92400E]",
    failed: "border-transparent bg-[#FEE2E2] text-[#991B1B]",
    draft: "border-transparent bg-slate-100 text-slate-600",
    paid: "border-transparent bg-[#DCFCE7] text-[#166534]",
    unpaid: "border-transparent bg-[#FEE2E2] text-[#991B1B]",
    partial: "border-transparent bg-[#DBEAFE] text-[#1D4ED8]",
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", styles[status])}>
      {label || status}
    </span>
  );
}

function getFiscalStatus(invoice: any): "fiscalized" | "pending" | "failed" | "draft" {
  const hasError = invoice.fdmsStatus?.toLowerCase() === "failed" || invoice.validationStatus === "red";
  if (hasError) return "failed";
  if (invoice.fiscalCode || invoice.status === "fiscalized") return "fiscalized";
  if (invoice.status === "draft") return "draft";
  return "pending";
}

function getPaymentStatus(invoice: any): "paid" | "unpaid" {
  if (invoice.status === "paid") return "paid";
  return "unpaid";
}

function formatMoney(currency: string, value: number | string | null | undefined) {
  return `${currency || "USD"} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percentOf(count: number, total: number) {
  if (!total) return "0.0%";
  return `${((count / total) * 100).toFixed(1)}%`;
}

function getSyncTime(invoice: any) {
  const value = invoice.fiscalizedAt || invoice.updatedAt || invoice.createdAt;
  if (!value) return "-";
  try {
    return format(new Date(value), "dd MMM, HH:mm");
  } catch {
    return "-";
  }
}

function QuickChip({ label, active, tone = "default", onClick }: { label: string; active?: boolean; tone?: "default" | "green" | "amber" | "red"; onClick: () => void }) {
  const toneClass = active
    ? "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]"
    : tone === "green"
      ? "bg-[#DCFCE7] text-[#166534] border-transparent"
      : tone === "amber"
        ? "bg-[#FEF3C7] text-[#92400E] border-transparent"
        : tone === "red"
          ? "bg-[#FEE2E2] text-[#DC2626] border-transparent"
          : "bg-white text-[#64748B] border-[#E5E7EB]";

  return (
    <button type="button" onClick={onClick} className={cn("rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors hover:border-[#BFDBFE] hover:text-[#2563EB]", toneClass)}>
      {label}
    </button>
  );
}

function PreviewInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[#0F172A]">{value}</p>
    </div>
  );
}

function InvoicePreviewCard({ invoice, onClose, onView, onFiscalize }: { invoice?: any; onClose?: () => void; onView: (id: number) => void; onFiscalize: (id: number) => void }) {
  const [tab, setTab] = useState<"overview" | "timeline" | "fdms">("overview");

  if (!invoice) {
    return (
      <div className="rounded-[14px] border border-dashed border-[#CBD5E1] bg-white p-5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#EFF6FF] text-[#2563EB]">
          <ReceiptText className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-[#0F172A]">Select an invoice to preview details.</p>
        <p className="mt-1 text-xs font-medium text-[#64748B]">Fiscal details, customer records, and FDMS response information will appear here.</p>
      </div>
    );
  }

  const fiscalStatus = getFiscalStatus(invoice);
  const paymentStatus = getPaymentStatus(invoice);

  return (
    <aside className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold text-[#0F172A]">{invoice.invoiceNumber || `INV-${invoice.id}`}</p>
          <div className="mt-2"><StatusPill status={fiscalStatus} label={fiscalStatus === "fiscalized" ? "Fiscalised" : fiscalStatus === "pending" ? "Pending Sync" : fiscalStatus} /></div>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-3 rounded-[10px] bg-[#F8FAFC] p-1">
        {(["overview", "timeline", "fdms"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={cn("rounded-[8px] px-2 py-2 text-xs font-bold capitalize text-[#64748B]", tab === value && "bg-white text-[#2563EB] shadow-[0_1px_2px_rgba(15,23,42,0.04)]")}>
            {value === "fdms" ? "FDMS Response" : value}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <PreviewInfo label="Total Amount" value={formatMoney(invoice.currency, invoice.total)} />
            <PreviewInfo label="Invoice Date" value={invoice.issueDate ? format(new Date(invoice.issueDate), "dd MMM yyyy") : "-"} />
          </div>
          <div className="rounded-[14px] border border-[#E5E7EB] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Customer</p>
            <p className="mt-2 text-sm font-bold text-[#0F172A]">{invoice.customer?.name || "Walk-in"}</p>
            <p className="mt-1 text-xs font-medium text-[#64748B]">VAT: {invoice.customer?.vatNumber || invoice.customer?.tin || "-"}</p>
            <p className="mt-1 text-xs font-medium text-[#64748B]">{invoice.customer?.billingAddress || invoice.customer?.address || "No address on record"}</p>
          </div>
          <div className="rounded-[14px] border border-[#E5E7EB] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Fiscal Details</p>
            <div className="mt-3 space-y-2 text-xs font-medium text-[#64748B]">
              <div className="flex justify-between gap-3"><span>Certificate ID</span><span className="truncate text-[#0F172A]">{invoice.fiscalCode || "-"}</span></div>
              <div className="flex justify-between gap-3"><span>QR Code</span><span className="text-[#0F172A]">{invoice.qrCodeData ? "Available" : "-"}</span></div>
              <div className="flex justify-between gap-3"><span>Signature</span><span className="truncate text-[#0F172A]">{invoice.fiscalSignature || invoice.receiptSignature || "-"}</span></div>
              <div className="flex justify-between gap-3"><span>Device ID</span><span className="text-[#0F172A]">{invoice.deviceId || "-"}</span></div>
              <div className="flex justify-between gap-3"><span>Branch</span><span className="text-[#0F172A]">{invoice.branch?.name || invoice.branchId || "-"}</span></div>
            </div>
          </div>
        </div>
      ) : tab === "timeline" ? (
        <div className="mt-5 space-y-3 text-sm">
          <PreviewInfo label="Created" value={invoice.createdAt ? format(new Date(invoice.createdAt), "dd MMM yyyy, HH:mm") : "-"} />
          <PreviewInfo label="Last Sync" value={getSyncTime(invoice)} />
          <PreviewInfo label="Payment Status" value={paymentStatus === "paid" ? "Paid" : "Unpaid"} />
        </div>
      ) : (
        <div className="mt-5 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">FDMS Response</p>
          <p className="mt-3 break-words font-mono text-xs leading-5 text-[#0F172A]">{invoice.fdmsStatus || invoice.validationStatus || "No FDMS response available for this invoice."}</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-9 rounded-[10px] border-[#E5E7EB] text-xs font-semibold" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</Button>
        <Button variant="outline" className="h-9 rounded-[10px] border-[#E5E7EB] text-xs font-semibold" onClick={() => onView(invoice.id)}><Download className="h-3.5 w-3.5" /> PDF</Button>
        <Button variant="outline" className="h-9 rounded-[10px] border-[#E5E7EB] text-xs font-semibold" onClick={() => onView(invoice.id)}><Mail className="h-3.5 w-3.5" /> Email</Button>
        <Button variant="outline" className="h-9 rounded-[10px] border-[#E5E7EB] text-xs font-semibold" onClick={() => onFiscalize(invoice.id)}><RefreshCw className="h-3.5 w-3.5" /> Resync</Button>
        <Button variant="ghost" className="col-span-2 h-9 rounded-[10px] text-xs font-semibold text-[#64748B]" onClick={() => onView(invoice.id)}><MoreHorizontal className="h-3.5 w-3.5" /> More actions</Button>
      </div>
    </aside>
  );
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const { selectedBranchId } = useBranchContext();
  const selectedCompanyId = activeCompanyId || 0;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { data: result, isLoading } = useInvoices(selectedCompanyId, {
    page, limit: pageSize,
    search: searchTerm || undefined,
    status: statusFilter, type: typeFilter,
    dateFrom: dateRange?.from, dateTo: dateRange?.to,
    branchId: selectedBranchId || undefined,
  });

  const { data: currencies } = useCurrencies(selectedCompanyId);
  const currentSymbol = currencies?.find((c: any) => c.code === "USD")?.symbol || "$";

  const { data: summary } = useQuery({
    queryKey: ["stats", "summary", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const res = await apiFetch(`/api/companies/${selectedCompanyId}/stats/summary`);
      return res.ok ? res.json() : null;
    },
    enabled: !!selectedCompanyId,
  });

  const invoices = result?.data || [];
  const customerFilteredInvoices = customerFilter === "all" ? invoices : invoices.filter((invoice: any) => String(invoice.customerId || invoice.customer?.name || "walk-in") === customerFilter);
  const displayedInvoices = customerFilteredInvoices.filter((invoice: any) => {
    if (quickFilter === "failed") return getFiscalStatus(invoice) === "failed";
    if (quickFilter === "unpaid") return getPaymentStatus(invoice) === "unpaid";
    return true;
  });
  const selectedInvoice = displayedInvoices.find((invoice: any) => invoice.id === selectedInvoiceId) || null;
  const uniqueCustomers = Array.from(new Map(invoices.map((invoice: any) => [String(invoice.customerId || invoice.customer?.name || "walk-in"), invoice.customer?.name || "Walk-in"])).entries());
  const fiscalisedCount = displayedInvoices.filter((invoice: any) => getFiscalStatus(invoice) === "fiscalized").length;
  const pendingSyncCount = displayedInvoices.filter((invoice: any) => getFiscalStatus(invoice) === "pending").length;
  const failedFiscalisation = displayedInvoices.filter((invoice: any) => getFiscalStatus(invoice) === "failed").length;
  const totalPages = result?.pages || 0;
  const totalInvoices = result?.total || 0;

  const deleteInvoice = useDeleteInvoice();
  const fiscalize = useFiscalizeInvoice();
  const updateInvoice = useUpdateInvoice();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [smartError, setSmartError] = useState<any>(null);

  const handleFilterChange = (setter: any, value: any) => { setter(value); setPage(1); };
  const selectInvoice = (invoice: any) => {
    setSelectedInvoiceId(invoice.id);
    setIsPreviewOpen(true);
  };
  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setTypeFilter("all");
    setCustomerFilter("all");
    setDateRange(undefined);
    setQuickFilter("all");
    setPage(1);
  };
  const applyQuickFilter = (filter: string) => {
    setQuickFilter(filter);
    setPage(1);
    if (filter === "all") {
      setStatusFilter("all");
      setDateRange(undefined);
    } else if (filter === "fiscalized") setStatusFilter("fiscalized");
    else if (filter === "pending") setStatusFilter("issued");
    else if (filter === "failed") setStatusFilter("all");
    else if (filter === "draft") setStatusFilter("draft");
    else if (filter === "paid") setStatusFilter("paid");
    else if (filter === "unpaid") setStatusFilter("all");
    else if (filter === "today") {
      const today = new Date();
      setDateRange({ from: today, to: today });
    } else if (filter === "week") {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 7);
      setDateRange({ from, to: today });
    } else if (filter === "month") {
      const today = new Date();
      setDateRange({ from: new Date(today.getFullYear(), today.getMonth(), 1), to: today });
    }
  };
  const handleExport = () => {
    toast({ title: "Export started", description: "Preparing invoice export for the current company." });
  };
  const handleSyncFdms = () => {
    toast({ title: "FDMS sync queued", description: "Use row actions to resync a specific invoice." });
  };

  const handleIssue = async (invoice: any) => {
    setLoadingId(invoice.id);
    try {
      const invoiceNumber = invoice.invoiceNumber.startsWith("DRAFT") ? `INV-${Date.now().toString().slice(-6)}` : invoice.invoiceNumber;
      await updateInvoice.mutateAsync({ id: invoice.id, data: { status: "issued", invoiceNumber } });
      toast({ title: "Invoice Issued" });
    } finally { setLoadingId(null); }
  };

  const handleFiscalize = (id: number) => {
    setLoadingId(id);
    fiscalize.mutate(id, {
      onSettled: () => setLoadingId(null),
      onError: (err) => {
        const msg = err.message.toLowerCase();
        if (msg.includes("day closed") || msg.includes("offline") || msg.includes("certificate")) setSmartError(err);
        else toast({ title: "Fiscalization Failed", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <Layout hideHeaderTitle headerTitle="Invoices" headerSubtitle="Manage fiscalised, pending, and failed invoices.">
      <SmartFixDialog isOpen={!!smartError} onClose={() => setSmartError(null)} error={smartError} onRetry={() => setSmartError(null)} />

      <div className="space-y-4">
        <BillingPageActions onExport={handleExport} onSync={handleSyncFdms} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Invoices" value={totalInvoices.toLocaleString()} icon={ReceiptText} tone="blue" trend={`↑ ${percentOf(displayedInvoices.length, Math.max(totalInvoices, displayedInvoices.length))} visible`} />
          <StatCard label="Fiscalised" value={fiscalisedCount.toLocaleString()} icon={CheckCircle2} tone="green" trend={`↑ ${percentOf(fiscalisedCount, displayedInvoices.length)} of current view`} />
          <StatCard label="Pending Sync" value={pendingSyncCount.toLocaleString()} icon={Clock} tone="amber" trend={`↑ ${percentOf(pendingSyncCount, displayedInvoices.length)} awaiting FDMS`} />
          <StatCard label="Failed" value={failedFiscalisation.toLocaleString()} icon={AlertCircle} tone="red" trend={`↓ ${percentOf(failedFiscalisation, displayedInvoices.length)} require review`} trendTone="red" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <Input placeholder="Search invoice, customer, VAT number..." className="h-10 rounded-[10px] border-[#E5E7EB] bg-white pl-9 text-sm font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:ring-[#2563EB]" value={searchTerm} onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex">
                    <Select value={statusFilter} onValueChange={(v) => handleFilterChange(setStatusFilter, v)}>
                      <SelectTrigger className="h-10 rounded-[10px] border-[#E5E7EB] bg-white text-sm font-semibold text-[#0F172A] lg:w-[145px]"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="issued">Pending Sync</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="fiscalized">Fiscalised</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={(v) => handleFilterChange(setTypeFilter, v)}>
                      <SelectTrigger className="h-10 rounded-[10px] border-[#E5E7EB] bg-white text-sm font-semibold text-[#0F172A] lg:w-[135px]"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="FiscalInvoice">Invoices</SelectItem>
                        <SelectItem value="CreditNote">Credit Notes</SelectItem>
                        <SelectItem value="DebitNote">Debit Notes</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={customerFilter} onValueChange={(v) => handleFilterChange(setCustomerFilter, v)}>
                      <SelectTrigger className="h-10 rounded-[10px] border-[#E5E7EB] bg-white text-sm font-semibold text-[#0F172A] lg:w-[155px]"><SelectValue placeholder="Customer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {uniqueCustomers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("h-10 justify-start rounded-[10px] border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#0F172A] shadow-none lg:w-[175px]", !dateRange && "text-[#64748B]")}>
                          <CalendarIcon className="h-4 w-4 text-[#2563EB]" />
                          {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "dd MMM")} - ${format(dateRange.to, "dd MMM")}` : format(dateRange.from, "dd MMM yyyy")) : "Date range"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto rounded-[14px] border-[#E5E7EB] p-0 shadow-lg" align="start">
                        <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={(r) => handleFilterChange(setDateRange, r)} numberOfMonths={2} className="p-3" />
                      </PopoverContent>
                    </Popover>
                    <Button variant="outline" className="h-10 rounded-[10px] border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#0F172A] shadow-none">
                      <SlidersHorizontal className="h-4 w-4 text-[#64748B]" /> More Filters
                    </Button>
                    <Button variant="ghost" size="sm" className="h-10 rounded-[10px] px-3 text-sm font-semibold text-[#64748B] hover:bg-red-50 hover:text-[#EF4444]" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <QuickChip label="All" active={quickFilter === "all"} onClick={() => applyQuickFilter("all")} />
                  <QuickChip label="Fiscalised" active={quickFilter === "fiscalized"} tone="green" onClick={() => applyQuickFilter("fiscalized")} />
                  <QuickChip label="Pending Sync" active={quickFilter === "pending"} tone="amber" onClick={() => applyQuickFilter("pending")} />
                  <QuickChip label="Failed" active={quickFilter === "failed"} tone="red" onClick={() => applyQuickFilter("failed")} />
                  <QuickChip label="Draft" active={quickFilter === "draft"} onClick={() => applyQuickFilter("draft")} />
                  <QuickChip label="Paid" active={quickFilter === "paid"} tone="green" onClick={() => applyQuickFilter("paid")} />
                  <QuickChip label="Unpaid" active={quickFilter === "unpaid"} tone="red" onClick={() => applyQuickFilter("unpaid")} />
                  <QuickChip label="Today" active={quickFilter === "today"} onClick={() => applyQuickFilter("today")} />
                  <QuickChip label="This Week" active={quickFilter === "week"} onClick={() => applyQuickFilter("week")} />
                  <QuickChip label="This Month" active={quickFilter === "month"} onClick={() => applyQuickFilter("month")} />
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <CardContent className="p-0">

          {/* Table */}
          {isLoading ? (
            <div className="flex h-56 items-center justify-center text-[#64748B]">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : displayedInvoices.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-[#64748B]">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC]">
                <FileText className="h-6 w-6 text-[#94A3B8]" />
              </div>
              <p className="text-sm font-semibold text-[#0F172A]">No invoices found</p>
              <Link href="/invoices/new"><Button variant="link" className="h-auto p-0 text-sm font-semibold text-[#2563EB]">Create your first invoice</Button></Link>
            </div>
          ) : (
            <TooltipProvider>
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F8FAFC]">
                    <TableHead className="h-11 w-12 pl-5"><Checkbox aria-label="Select all invoices" className="border-[#CBD5E1]" /></TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Invoice #</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Customer</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Date</TableHead>
                    <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-[#64748B]">Amount</TableHead>
                    <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-[#64748B]">VAT</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-[#64748B]">FDMS Status</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Payment Status</TableHead>
                    <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Sync Time</TableHead>
                    <TableHead className="h-11 pr-5 text-right text-xs font-semibold uppercase tracking-wide text-[#64748B]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedInvoices.map((invoice: any) => {
                    const hasError = invoice.fdmsStatus?.toLowerCase() === "failed" || invoice.validationStatus === "red";
                    const fiscalStatus = getFiscalStatus(invoice);
                    const paymentStatus = getPaymentStatus(invoice);
                    return (
                      <TableRow
                        key={invoice.id}
                        className={cn(
                          "group h-14 cursor-pointer border-b border-[#F1F5F9] bg-white transition-colors hover:bg-[#F8FAFC]",
                          selectedInvoiceId === invoice.id && "bg-[#EFF6FF]",
                          hasError && "bg-red-50/40 hover:bg-red-50/70"
                        )}
                        onClick={() => selectInvoice(invoice)}
                      >
                        <TableCell className={cn("py-3 pl-5", hasError && "border-l-2 border-l-[#EF4444]")} onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`Select invoice ${invoice.invoiceNumber}`} className="border-[#CBD5E1]" />
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex min-w-[150px] items-center gap-2">
                            {hasError && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertCircle className="h-4 w-4 shrink-0 text-[#EF4444]" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs text-xs">
                                  {invoice.validationStatus === "red" ? "ZIMRA validation error. Resolve before closing fiscal day." : "Fiscalisation failed."}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <span className="font-mono text-sm font-bold text-[#2563EB]">{invoice.invoiceNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {invoice.customerId ? (
                            <Link href={`/customers/${invoice.customerId}`} onClick={(e) => e.stopPropagation()}>
                              <span className="text-sm font-semibold text-[#0F172A] hover:text-[#2563EB]">{invoice.customer?.name || "Unknown"}</span>
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-[#64748B]">{invoice.customer?.name || "Walk-in"}</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-sm font-medium text-[#64748B]">
                          {invoice.issueDate ? format(new Date(invoice.issueDate), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-right text-sm font-bold text-[#0F172A]">
                          {formatMoney(invoice.currency, invoice.total)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-right text-sm font-semibold text-[#64748B]">
                          {formatMoney(invoice.currency, invoice.taxAmount)}
                        </TableCell>
                        <TableCell className="py-3">
                          <StatusPill status={fiscalStatus} label={fiscalStatus === "fiscalized" ? "Fiscalised" : fiscalStatus === "pending" ? "Pending Sync" : fiscalStatus} />
                        </TableCell>
                        <TableCell className="py-3">
                          <StatusPill status={paymentStatus} label={paymentStatus === "paid" ? "Paid" : "Unpaid"} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-3 text-sm font-medium text-[#64748B]">
                          {getSyncTime(invoice)}
                        </TableCell>
                        <TableCell className="py-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[10px] text-[#64748B] hover:bg-blue-50 hover:text-[#2563EB]" onClick={(e) => { e.stopPropagation(); setLocation(`/invoices/${invoice.id}`); }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[10px] text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]" onClick={(e) => { e.stopPropagation(); setLocation(`/invoices/${invoice.id}`); }}>
                                  <Printer className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Print</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[10px] text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]" onClick={(e) => { e.stopPropagation(); setLocation(`/invoices/${invoice.id}`); }}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download PDF</TooltipContent>
                            </Tooltip>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" className="h-8 w-8 rounded-[10px] p-0 text-[#64748B] hover:bg-slate-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-[14px] border-[#E5E7EB] p-2 shadow-lg">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/invoices/${invoice.id}`); }} className="rounded-[10px] text-xs">
                                <Eye className="h-3.5 w-3.5 mr-2" /> View
                              </DropdownMenuItem>
                              {invoice.status === "draft" && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/invoices/new?edit=${invoice.id}`); }} className="rounded-[10px] text-xs">
                                  <Edit className="h-3.5 w-3.5 mr-2" /> Edit Draft
                                </DropdownMenuItem>
                              )}
                              {invoice.status === "draft" && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleIssue(invoice); }} className="rounded-[10px] text-xs text-[#2563EB]" disabled={loadingId === invoice.id}>
                                  {loadingId === invoice.id ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-2" />} Issue
                                </DropdownMenuItem>
                              )}
                              {invoice.status === "issued" && !invoice.fiscalCode && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleFiscalize(invoice.id); }} className="rounded-[10px] text-xs text-emerald-700" disabled={loadingId === invoice.id}>
                                  {loadingId === invoice.id ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-2" />} Fiscalise
                                </DropdownMenuItem>
                              )}
                              {invoice.customerId && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/customers/${invoice.customerId}`); }} className="rounded-[10px] text-xs">
                                  <User className="h-3.5 w-3.5 mr-2" /> Customer
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/invoices/new?duplicate=${invoice.id}`); }} className="rounded-[10px] text-xs">
                                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                              </DropdownMenuItem>
                              {["draft", "issued"].includes(invoice.status || "") && (
                                <DropdownMenuItem className="rounded-[10px] text-xs text-red-600 focus:bg-red-50 focus:text-red-700"
                                  onClick={async (e) => { e.stopPropagation(); if (confirm("Delete this invoice?")) { await deleteInvoice.mutateAsync(invoice.id); toast({ title: "Invoice deleted" }); } }}>
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}

          {/* Pagination */}
          {!isLoading && displayedInvoices.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-4 border-t border-[#E5E7EB] bg-white px-5 py-4 sm:flex-row">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="text-xs font-semibold text-[#64748B]">Rows per page</span>
                <Select 
                  value={pageSize.toString()} 
                  onValueChange={(v) => {
                    setPageSize(parseInt(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[76px] rounded-[10px] border-[#E5E7EB] bg-white text-xs font-bold text-[#0F172A]">
                    <SelectValue placeholder="20" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs font-medium text-[#64748B]">
                  Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalInvoices)} of {totalInvoices}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 rounded-[10px] border-[#E5E7EB] bg-white px-3 text-xs font-semibold shadow-none" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading}>Prev</Button>
                <span className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1.5 text-xs font-bold text-[#0F172A]">{page} / {totalPages || 1}</span>
                <Button variant="outline" size="sm" className="h-8 rounded-[10px] border-[#E5E7EB] bg-white px-3 text-xs font-semibold shadow-none" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isLoading}>Next</Button>
              </div>
            </div>
          )}
              </CardContent>
            </Card>
          </div>

          <div className="hidden xl:block">
            <div className="sticky top-24">
              <InvoicePreviewCard invoice={selectedInvoice} onView={(id) => setLocation(`/invoices/${id}`)} onFiscalize={handleFiscalize} />
            </div>
          </div>
        </div>

        <Sheet open={isPreviewOpen && !!selectedInvoice} onOpenChange={setIsPreviewOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto bg-[#F8FAFC] p-4 sm:max-w-[380px] xl:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Invoice preview</SheetTitle>
              <SheetDescription>Selected invoice details</SheetDescription>
            </SheetHeader>
            <InvoicePreviewCard invoice={selectedInvoice} onClose={() => setIsPreviewOpen(false)} onView={(id) => setLocation(`/invoices/${id}`)} onFiscalize={handleFiscalize} />
          </SheetContent>
        </Sheet>
      </div>
    </Layout>
  );
}
