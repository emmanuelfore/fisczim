import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useCompany, useCompanies } from "@/hooks/use-companies";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Search,
  Download,
  CreditCard,
  Calendar as CalendarIcon,
  Eye,
  Building2,
  User as UserIcon,
  Printer,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths, isValid } from "date-fns";
import { PaymentReceiptPDF } from "@/components/invoices/payment-receipt-pdf";
import { useInvoice } from "@/hooks/use-invoices";
import { useTaxConfig } from "@/hooks/use-tax-config";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Link, useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { pdf, PDFDownloadLink } from "@react-pdf/renderer";
import { api } from "@shared/routes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  ECOCASH: "EcoCash",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

const METHOD_COLORS: Record<string, string> = {
  CASH: "bg-emerald-50 text-emerald-700",
  CARD: "bg-blue-50 text-blue-700",
  ECOCASH: "bg-orange-50 text-orange-700",
  BANK_TRANSFER: "bg-purple-50 text-purple-700",
  OTHER: "bg-slate-50 text-slate-700",
};

function ReceiptDownloader({
  p,
  company,
  label,
}: {
  p: any;
  company: any;
  label?: string;
}) {
  const { data: invoice, isLoading: isLoadingInvoice } = useInvoice(
    p.invoiceId || 0,
  );
  const { taxTypes } = useTaxConfig(company?.id || 0);

  const invoiceWithTotals = invoice
    ? {
        ...invoice,
        total: invoice.total ?? p.invoiceTotal,
        paidAmount: p.invoicePaidAmount,
      }
    : p.invoiceTotal != null
      ? { total: p.invoiceTotal, paidAmount: p.invoicePaidAmount, items: [] }
      : undefined;

  const safeDate = (dateStr: any) => {
    try {
      const d = new Date(dateStr);
      return isValid(d) ? d : new Date();
    } catch {
      return new Date();
    }
  };

  return (
    <PDFDownloadLink
      document={
        <PaymentReceiptPDF
          payment={{
            id: p.id,
            amount: p.amount,
            paymentMethod: p.paymentMethod,
            reference: p.reference,
            notes: p.notes,
            currency: p.currency,
            paymentDate: safeDate(p.paymentDate),
            invoiceNumber: p.invoiceNumber || invoice?.invoiceNumber || "N/A",
            customerName: p.customerName || invoice?.customer?.name,
            customerEmail: p.customerEmail || invoice?.customer?.email,
          }}
          allPayments={[p]}
          company={company}
          invoice={invoiceWithTotals}
          taxTypes={taxTypes.data}
        />
      }
      fileName={`Receipt-${p.invoiceNumber || p.id}-${format(safeDate(p.paymentDate), "yyyyMMdd")}.pdf`}
    >
      {({ loading, error }) => (
        <Button
          variant={label ? "default" : "ghost"}
          size={label ? "sm" : "icon"}
          className={label ? "w-full rounded-xl font-bold h-11" : "h-7 w-7"}
          disabled={loading || isLoadingInvoice}
          title={error ? `PDF error: ${error}` : "Download Receipt PDF"}
        >
          {loading || isLoadingInvoice ? (
            <Loader2
              className={`w-3 h-3 animate-spin ${label ? "mr-2" : ""}`}
            />
          ) : label ? (
            <Download className="w-4 h-4 mr-2" />
          ) : (
            <Download
              className={`w-3 h-3 ${error ? "text-red-400" : "text-slate-400 hover:text-primary"}`}
            />
          )}
          {label || null}
        </Button>
      )}
    </PDFDownloadLink>
  );
}

function PaymentDetailsDialog({ p, company }: { p: any; company: any }) {
  const safeDate = (dateStr: any) => {
    try {
      const d = new Date(dateStr);
      return isValid(d) ? format(d, "dd MMM yyyy, HH:mm") : "Invalid Date";
    } catch {
      return "Invalid Date";
    }
  };

  return (
    <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
      <DialogHeader className="bg-slate-900 text-white p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">
              Payment Details
            </DialogTitle>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">
              Reference: {p.reference || "N/A"}
            </p>
          </div>
        </div>
      </DialogHeader>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              Amount Paid
            </p>
            <p className="text-2xl font-black text-slate-900 font-display">
              <span className=" text-slate-400 mr-1">{p.currency}</span>
              {Number(p.amount).toFixed(2)}
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              Status
            </p>
            <Badge
              className={cn(
                "w-fit text-[9px] font-black uppercase border-none px-2",
                METHOD_COLORS[p.paymentMethod] || METHOD_COLORS.OTHER,
              )}
            >
              {METHOD_LABELS[p.paymentMethod] || p.paymentMethod}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <UserIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                Customer
              </p>
              <p className=" font-bold text-slate-800">
                {p.customerName || p.invoice?.customer?.name || "Walk-in Customer"}
              </p>
              {p.customerEmail && (
                <p className="text-xs text-slate-500">{p.customerEmail}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1">
              <Building2 className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                Related Invoice
              </p>
              {p.invoiceId ? (
                <Link
                  href={`/invoices/${p.invoiceId}`}
                  className=" font-bold text-primary hover:underline font-mono"
                >
                  {p.invoiceNumber || `#${p.invoiceId}`}
                </Link>
              ) : (
                <p className=" text-slate-400 italic">No invoice linked</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1">
              <CalendarIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                Payment Date
              </p>
              <p className=" font-bold text-slate-800">
                {safeDate(p.paymentDate)}
              </p>
            </div>
          </div>
        </div>

        {p.notes && (
          <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-1">
              Notes
            </p>
            <p className=" text-orange-900 italic font-medium">"{p.notes}"</p>
          </div>
        )}
      </div>

      <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
        {p.invoiceId && (
          <div className="flex-1">
            <ReceiptDownloader
              p={p}
              company={company}
              label="Download Receipt PDF"
            />
          </div>
        )}
      </div>
    </DialogContent>
  );
}

function PaymentStatCard({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "amber" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  }[tone];

  return (
    <Card className="rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <CardContent className="flex items-center justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#64748B]">{label}</p>
          <p className="mt-1 truncate text-[22px] font-bold leading-none tracking-tight text-[#0F172A]">
            {value}
          </p>
          <p className="mt-1.5 truncate text-[11px] font-semibold text-[#64748B]">
            {detail}
          </p>
        </div>
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border",
            toneClass,
          )}
        >
          <CreditCard className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentMethodPill({ method }: { method?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        METHOD_COLORS[method || "OTHER"] || METHOD_COLORS.OTHER,
      )}
    >
      {METHOD_LABELS[method || "OTHER"] || method || "Other"}
    </span>
  );
}

export default function PaymentsReceivedPage() {
  const [match, params] = useRoute("/payments-received/:id?");
  const [, setLocation] = useLocation();
  const selectedId = params?.id ? parseInt(params.id) : null;

  const { user } = useAuth();
  const { activeCompanyId, isLoading: companyLoading } =
    useActiveCompany(!!user);
  const companyId = activeCompanyId ?? 0;
  const { data: companies } = useCompanies();
  const company = companies?.find((c) => c.id === companyId);

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subMonths(startOfMonth(new Date()), 2),
    to: endOfMonth(new Date()),
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: [
      "/api/companies/payments",
      companyId,
      dateRange.from,
      dateRange.to,
    ],
    queryFn: async () => {
      const url = `/api/companies/${companyId}/reports/payments?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`Failed to fetch payments (${res.status})`);
      return (await res.json()) as any[];
    },
    enabled: !companyLoading && !!companyId,
  });

  const filtered =
    payments?.filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.invoiceNumber?.toLowerCase().includes(q) ||
        p.customerName?.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q) ||
        p.paymentMethod?.toLowerCase().includes(q)
      );
    }) ?? [];

  const totalReceived = filtered.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );
  const linkedPayments = filtered.filter((payment) => payment.invoiceId).length;
  const averagePayment = filtered.length ? totalReceived / filtered.length : 0;
  const selectedRangeLabel = `${format(dateRange.from, "dd MMM")} - ${format(dateRange.to, "dd MMM yyyy")}`;
  const currency = company?.currency || filtered[0]?.currency || "USD";
  const clearFilters = () => {
    setSearch("");
    setDateRange({
      from: subMonths(startOfMonth(new Date()), 2),
      to: endOfMonth(new Date()),
    });
  };

  if (selectedId) {
    return (
      <Layout>
        <div className="space-y-4">
          <Button
            variant="outline"
            className="h-9 rounded-[10px] border-[#E5E7EB] bg-white  font-semibold text-[#0F172A] shadow-none hover:bg-[#F8FAFC]"
            onClick={() => setLocation("/payments-received")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to payments
          </Button>
          <PaymentDetailView
            paymentId={selectedId}
            company={company}
            setLocation={setLocation}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      hideHeaderTitle
      headerTitle="Payments Received"
      headerSubtitle="Track customer payments and receipt activity."
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            variant="outline"
            className="h-10 rounded-[10px] border-[#E5E7EB] bg-white px-4  font-semibold text-[#0F172A] shadow-none hover:bg-[#F8FAFC]"
          >
            <Download className="mr-2 h-4 w-4 text-[#64748B]" /> Export
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PaymentStatCard
            label="Total Received"
            value={`${currency} ${totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            detail={`${filtered.length} payment${filtered.length === 1 ? "" : "s"} in view`}
            tone="green"
          />
          <PaymentStatCard
            label="Linked Invoices"
            value={linkedPayments.toLocaleString()}
            detail="Payments tied to invoices"
            tone="blue"
          />
          <PaymentStatCard
            label="Average Payment"
            value={`${currency} ${averagePayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            detail="Across current results"
            tone="amber"
          />
          <PaymentStatCard
            label="Date Range"
            value={selectedRangeLabel}
            detail="Current reporting window"
            tone="slate"
          />
        </div>

        <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                <Input
                  placeholder="Search invoice, customer, reference, method..."
                  className="h-10 rounded-[10px] border-[#E5E7EB] bg-white pl-9  font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:ring-[#2563EB]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 justify-start rounded-[10px] border-[#E5E7EB] bg-white px-3  font-semibold text-[#0F172A] shadow-none lg:w-[235px]"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-[#2563EB]" />
                    {selectedRangeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto rounded-[14px] border-[#E5E7EB] p-0 shadow-lg"
                  align="end"
                >
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={dateRange}
                    onSelect={(range: any) =>
                      range?.from &&
                      range?.to &&
                      setDateRange({ from: range.from, to: range.to })
                    }
                    numberOfMonths={2}
                    className="p-3"
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                className="h-10 rounded-[10px] px-3  font-semibold text-[#64748B] hover:bg-red-50 hover:text-[#EF4444]"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardContent className="p-0">
            {paymentsLoading ? (
              <div className="flex h-56 items-center justify-center text-[#64748B]">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 text-[#64748B]">
                <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC]">
                  <CreditCard className="h-6 w-6 text-[#94A3B8]" />
                </div>
                <p className=" font-semibold text-[#0F172A]">
                  No payments found
                </p>
              </div>
            ) : (
              <>
              {/* Mobile Card View */}
              <div className="grid grid-cols-1 gap-4 p-4 md:hidden bg-slate-50/50">
                {filtered.map((payment) => {
                  const date = new Date(payment.paymentDate);
                  return (
                    <div key={payment.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm cursor-pointer" onClick={() => setLocation(`/payments-received/${payment.id}`)}>
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-900">{payment.customerName || "Walk-in"}</span>
                          {payment.customerEmail && <span className="text-[10px] text-slate-500">{payment.customerEmail}</span>}
                          <span className="text-xs text-slate-400 mt-0.5">{isValid(date) ? format(date, "dd MMM yy") : "-"}</span>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          <span className="font-bold text-slate-900 text-base">{payment.currency} {Number(payment.amount || 0).toFixed(2)}</span>
                          <PaymentMethodPill method={payment.paymentMethod} />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm mt-1 pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Invoice</span>
                          {payment.invoiceId ? (
                            <span className="block truncate font-mono text-xs font-bold text-blue-600">
                              {payment.invoiceNumber || `#${payment.invoiceId}`}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">Unlinked</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Reference</span>
                          <span className="text-xs font-medium text-slate-600">{payment.reference || "N/A"}</span>
                        </div>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-slate-100 mt-1 gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-[9px] text-slate-500 hover:bg-blue-50 hover:text-blue-600 border border-slate-100"
                          onClick={(e) => { e.stopPropagation(); setLocation(`/payments-received/${payment.id}`); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {payment.invoiceId && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <ReceiptDownloader p={payment} company={company} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto min-w-0">
              <Table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[16%]" />
                  <col className="w-[22%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F8FAFC]">
                    <TableHead className="h-10 pl-4 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Date
                    </TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Invoice
                    </TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Customer
                    </TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Method
                    </TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Reference
                    </TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Amount
                    </TableHead>
                    <TableHead className="h-10 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((payment) => {
                    const date = new Date(payment.paymentDate);
                    return (
                      <TableRow
                        key={payment.id}
                        className="h-12 cursor-pointer border-b border-[#F1F5F9] bg-white transition-colors hover:bg-[#F8FAFC]"
                        onClick={() =>
                          setLocation(`/payments-received/${payment.id}`)
                        }
                      >
                        <TableCell className="whitespace-nowrap py-2 pl-4 text-xs font-medium text-[#64748B]">
                          {isValid(date) ? format(date, "dd MMM yy") : "-"}
                        </TableCell>
                        <TableCell className="py-2 pr-2">
                          {payment.invoiceId ? (
                            <Link
                              href={`/invoices/${payment.invoiceId}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <span className="block truncate font-mono text-xs font-bold text-[#2563EB] hover:underline">
                                {payment.invoiceNumber ||
                                  `#${payment.invoiceId}`}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-xs font-medium text-[#94A3B8]">
                              Unlinked
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 pr-2">
                          <span className="block truncate text-xs font-semibold text-[#0F172A]">
                            {payment.customerName || "Walk-in"}
                          </span>
                          {payment.customerEmail && (
                            <span className="block truncate text-[11px] font-medium text-[#94A3B8]">
                              {payment.customerEmail}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <PaymentMethodPill method={payment.paymentMethod} />
                        </TableCell>
                        <TableCell className="py-2 pr-2">
                          <span className="block truncate text-xs font-medium text-[#64748B]">
                            {payment.reference || "N/A"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-2 text-right text-xs font-bold text-[#0F172A]">
                          {payment.currency}{" "}
                          {Number(payment.amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="py-2 pr-4 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-[9px] text-[#64748B] hover:bg-blue-50 hover:text-[#2563EB]"
                              onClick={() =>
                                setLocation(`/payments-received/${payment.id}`)
                              }
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {payment.invoiceId && (
                              <ReceiptDownloader
                                p={payment}
                                company={company}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function PaymentDetailView({
  paymentId,
  company,
  setLocation,
}: {
  paymentId: number;
  company: any;
  setLocation: any;
}) {
  const { data: payment, isLoading: isLoadingPayment } = useQuery<any>({
    queryKey: ["/api/payments", paymentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/payments/${paymentId}`);
      if (!res.ok) throw new Error("Failed to fetch payment");
      return res.json();
    },
    enabled: !!paymentId,
  });

  const { data: invoice, isLoading: isLoadingInvoice } = useInvoice(
    payment?.invoiceId || 0,
  );
  const { data: allInvoicePayments, isLoading: isLoadingAllPayments } =
    useQuery<any[]>({
      queryKey: ["/api/invoices", payment?.invoiceId, "payments"],
      queryFn: async () => {
        const res = await apiFetch(
          `/api/invoices/${payment.invoiceId}/payments`,
        );
        if (!res.ok) throw new Error("Failed to fetch invoice payments");
        return res.json();
      },
      enabled: !!payment?.invoiceId,
    });

  const { data: statement, isLoading: isLoadingStatement } = useQuery<any>({
    queryKey: ["/api/customers", invoice?.customerId, "statement"],
    queryFn: async () => {
      const start = "2000-01-01";
      const end = format(new Date(), "yyyy-MM-dd");
      if (!invoice?.customerId)
        throw new Error("Invoice customer is not available");
      const res = await apiFetch(
        `/api/customers/${invoice.customerId}/statement?startDate=${start}&endDate=${end}&currency=${payment.currency || "USD"}`,
      );
      if (!res.ok) throw new Error("Failed to fetch customer statement");
      return res.json();
    },
    enabled: !!invoice?.id && !!invoice?.customerId,
  });

  const taxConfig = useTaxConfig(company?.id || 0);
  const taxTypesData = taxConfig.taxTypes.data;

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const pdfDocument = useMemo(() => {
    if (!payment || !company || !taxTypesData || !allInvoicePayments)
      return null;
    return (
      <PaymentReceiptPDF
        payment={{
          ...payment,
          paymentDate: payment.paymentDate
            ? new Date(payment.paymentDate)
            : new Date(),
          invoiceNumber:
            payment.invoiceNumber || invoice?.invoiceNumber || "N/A",
          reference: payment.reference,
          customerName: payment?.customerName || payment?.customer?.name || invoice?.customer?.name,
          customerEmail: payment?.customerEmail || payment?.customer?.email || invoice?.customer?.email,
        }}
        allPayments={allInvoicePayments}
        company={company}
        invoice={invoice}
        taxTypes={taxTypesData}
      />
    );
  }, [payment, company, invoice, taxTypesData, allInvoicePayments, statement]);

  useEffect(() => {
    const hasCustomer = !!invoice?.customerId;
    const isStatementReady =
      !hasCustomer || (!!statement && !isLoadingStatement);

    if (
      !payment ||
      !company ||
      !taxTypesData ||
      !allInvoicePayments ||
      !isStatementReady ||
      isLoadingInvoice
    )
      return;
    if (!pdfDocument) return;

    let revoked = false;
    setPdfGenerating(true);

    const generatePdf = async () => {
      try {
        const blob = await pdf(pdfDocument).toBlob();
        if (!revoked) {
          const url = URL.createObjectURL(blob);
          setPdfBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      } catch (error) {
        console.error("Failed to generate PDF:", error);
      } finally {
        if (!revoked) setPdfGenerating(false);
      }
    };

    generatePdf();
    return () => {
      revoked = true;
    };
  }, [
    pdfDocument,
    isLoadingInvoice,
    payment,
    company,
    taxTypesData,
    allInvoicePayments,
    statement,
    isLoadingStatement,
  ]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  if (
    isLoadingPayment ||
    isLoadingInvoice ||
    isLoadingAllPayments ||
    (!!invoice?.customerId && isLoadingStatement) ||
    pdfGenerating
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3 py-20 bg-white/50 m-6 rounded-2xl border border-dashed border-slate-200">
        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        <p className="font-bold uppercase tracking-widest text-[10px]">
          {pdfGenerating
            ? "Generating A4 Receipt..."
            : "Loading Payment Data..."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-100/30">
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 lg:hidden"
            onClick={() => setLocation("/payments-received")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-black text-slate-900 uppercase tracking-tight ">
            Receipt Preview
          </h2>
        </div>
        <div className="flex gap-2">
          {invoice?.customerId && (
            <Link
              href={`/reports/customer-statements?customerId=${invoice.customerId}`}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 rounded-xl font-bold border-violet-200 text-violet-700 hover:bg-violet-50 text-xs shadow-sm shadow-violet-100"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" /> View Statement
              </Button>
            </Link>
          )}
          {pdfBlobUrl && (
            <Button
              asChild
              size="sm"
              className="btn-gradient h-8 px-3 rounded-xl font-bold text-xs shadow-lg shadow-primary/20"
            >
              <a
                href={pdfBlobUrl}
                download={`Receipt-${invoice?.invoiceNumber || paymentId}.pdf`}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 px-3 rounded-xl font-bold border-slate-200 text-xs text-slate-600 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
          </Button>
        </div>
      </div>
      <div className="flex-1 flex justify-center py-12 px-4 shadow-inner min-h-screen">
        <div className="w-full max-w-[850px] bg-white shadow-2xl border border-slate-200 rounded-sm overflow-hidden h-fit">
          {pdfBlobUrl && (
            <iframe
              src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
              title="Receipt"
              width="100%"
              style={{ height: "1400px", border: "none", display: "block" }}
              scrolling="no"
            />
          )}
        </div>
      </div>
    </div>
  );
}
