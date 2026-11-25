import { Layout } from "@/components/layout";
import { useEffect, useId, useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCompany } from "@/hooks/use-companies";
import { useCustomers } from "@/hooks/use-customers";
import { useMatchingEnquiries } from "@/hooks/use-crm";
import { useConsignments } from "@/hooks/use-freight";
import { usePermissions } from "@/hooks/use-permissions";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useTaxConfig } from "@/hooks/use-tax-config";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { VehicleDocumentsTab } from "@/components/vehicles/documents-tab";
import { PaymentSchedule } from "@/components/vehicles/payment-schedule";
import { VehicleDealPreview } from "@/components/vehicles/deal-preview";
import { applyReceiptsToPreview, paymentSchedulePosition } from "@/lib/vehicle-schedule";
import { VehicleAgreementPDF } from "@/components/vehicles/agreement-pdf";
import { VehicleAccountStatementPDF } from "@/components/vehicles/vehicle-account-statement-pdf";
import { InvoicePDF } from "@/components/invoices/pdf-document";
import { addDays, format } from "date-fns";
import { calculateVehiclePaymentPlan } from "@shared/vehicle-payment-plan";
import { ArrowLeft, Bell, Download, Eye, FileText, Landmark, Lock, Mail, MessageCircle, MoreHorizontal, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import {
  type Vehicle,
  COST_CATEGORIES,
  COST_STATUSES,
  VEHICLE_STAGES,
  costLabel,
  costStatusLabel,
  fmtMoney,
  stageLabel,
  useCompanyStaff,
  useVehicle,
  useVehicleAction,
  useVehicleCustomerAccount,
} from "@/hooks/use-vehicles";
import { stageTone, statusTone } from "./index";

export default function VehicleDetailPage() {
  const [, params] = useRoute("/vehicles/:id");
  const id = Number(params?.id);
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const { can } = usePermissions();
  const { data: v, isLoading, error } = useVehicle(companyId, id);

  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get("tab") ?? "";
  const linkedTab = ["plan", "payments", "tracking", "vehicle", "documents"].includes(requestedTab) ? requestedTab : "overview";
  const [tab, setTab] = useState(linkedTab);
  useEffect(() => setTab(linkedTab), [linkedTab]);
  const [costTab, setCostTab] = useState<string>();
  const [vehicleAction, setVehicleAction] = useState<"edit" | "invoice">();
  const agency = v?.accountingModel !== "principal";
  const { data: account } = useVehicleCustomerAccount(companyId, agency && v ? id : 0);

  if (isLoading) return <Layout><PageSkeleton stats={4} /></Layout>;
  if (error || !v) return <Layout><div className="p-8 text-slate-600">{(error as Error)?.message || "Vehicle not found."}</div></Layout>;

  const showCosts = can("vehicles.costs");
  const editable = can("vehicles.manage");
  const canRecordPayments = can("vehicles.payments");
  const currency = v.saleCurrency || "USD";
  const exchangeRate = Number(v.saleExchangeRate) || 1;
  const schedule = (v.openSchedule ?? []) as NonNullable<Vehicle["openSchedule"]>;
  const nextDue = schedule.find(line => line.open > 0.004);
  const nextStatus = nextDue ? paymentSchedulePosition(nextDue, format(new Date(), "yyyy-MM-dd")).status : null;
  const paid = Number(v.summary.paid) * exchangeRate;
  const dealTotal = v.invoice && !agency
    ? Number(v.invoice.total) * exchangeRate / (Number(v.invoice.exchangeRate) || exchangeRate)
    : v.salePrice == null ? null : Number(v.salePrice);
  const scheduledTotal = schedule.reduce((sum, line) => sum + line.amount, 0);
  const scheduledBalance = schedule.reduce((sum, line) => sum + line.open, 0);
  const customerBalance = schedule.length ? scheduledBalance : dealTotal == null ? null : dealTotal - paid;
  const supplierBalance = agency ? account?.totals.supplierOutstanding : showCosts
    ? Number(v.summary.pendingCosts || 0) + Number(v.summary.disputedCosts || 0)
    : undefined;
  const processingFee = Number(account?.agreement?.processingFeeAmount ?? 0);
  const canContinue = v.status !== "cancelled";

  const goTo = (value: string, action?: "edit" | "invoice") => {
    setVehicleAction(action);
    setTab(value);
  };
  const reviewCosts = () => {
    setCostTab(agency ? "suppliers" : "costs");
    goTo("costs-and-suppliers");
  };

  let nextAction: { label: string; detail: string; run: () => void } | undefined;
  if (canContinue && !v.customerId && editable) {
    nextAction = { label: "Assign customer", detail: "Link the customer before setting the price or taking payments.", run: () => goTo("vehicle", "edit") };
  } else if (canContinue && !v.invoiceId && editable && (dealTotal == null || (agency && account && processingFee <= 0))) {
    nextAction = { label: "Set price and payment plan", detail: "Enter the agreed amount, deposit and any interest.", run: () => goTo("plan") };
  } else if (canContinue && !v.invoiceId && editable && (!agency || processingFee > 0)) {
    nextAction = { label: "Review invoice", detail: agency ? "Review the processing fee and the customer’s import cost breakdown." : "Review the agreed sale price and any tax before issuing the invoice.", run: () => goTo("vehicle", "invoice") };
  } else if (canContinue && canRecordPayments && customerBalance != null && customerBalance > 0.004) {
    nextAction = { label: "Record customer payment", detail: nextDue ? "The next unpaid instalment is shown above." : "Record a deposit or other payment received from the customer.", run: () => goTo("payments") };
  } else if (canContinue && canRecordPayments && supplierBalance != null && supplierBalance > 0.004) {
    nextAction = { label: "Review supplier costs", detail: "Check the costs still awaiting settlement.", run: reviewCosts };
  } else if (canContinue && editable && v.status !== "delivered" && v.invoiceId) {
    nextAction = { label: "Update import tracking", detail: "Record the latest milestone or mark the vehicle delivered at handover.", run: () => goTo("tracking") };
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <Link href="/vehicles" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="mr-1 h-4 w-4" />Vehicles</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{v.year} {v.make} {v.model}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-mono">{v.stockNumber}</span>
            <span>{v.customer?.name || "No customer assigned"}</span>
            <Badge className={stageTone[v.stage] ?? ""}>{stageLabel(v.stage)}</Badge>
            <Badge className={statusTone[v.status] ?? ""}>{v.status}</Badge>
            <Badge variant="outline">{agency ? "Import for customer" : "Vehicle sale"}</Badge>
          </div>
        </div>

        <Tabs value={tab} onValueChange={value => goTo(value)}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="plan">Price & payment plan</TabsTrigger>
            <TabsTrigger value="payments">Customer payments</TabsTrigger>
            {(agency || showCosts) && <TabsTrigger value="costs-and-suppliers">Costs & suppliers</TabsTrigger>}
            <TabsTrigger value="tracking">Import tracking</TabsTrigger>
            <TabsTrigger value="vehicle">Vehicle & invoice</TabsTrigger>
            <TabsTrigger value="documents">Documents & activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Kpi label={schedule.length ? "Payment plan total" : "Customer total"} value={schedule.length || dealTotal != null ? fmtMoney(schedule.length ? scheduledTotal : dealTotal, currency) : "Price needed"} hint={schedule.length ? "Includes deposit and any financing charges" : undefined} />
              <Kpi label={schedule.length ? "Payment plan balance" : "Customer balance"} value={customerBalance == null ? "—" : fmtMoney(Math.abs(customerBalance), currency)} hint={customerBalance != null && customerBalance < 0 ? "Credit on account" : fmtMoney(paid, currency) + " received"} />
              <Kpi label={nextStatus === "overdue" ? "Overdue payment" : nextStatus === "due" ? "Payment due today" : "Next payment"} value={nextDue ? fmtMoney(nextDue.open, currency) : "—"} hint={nextDue ? (nextDue.type === "deposit" ? "Deposit" : "Instalment") + " · " + nextDue.dueDate : schedule.length ? "Schedule paid" : "No payment schedule"} tone={nextStatus === "overdue" ? "text-rose-700" : nextStatus === "due" ? "text-amber-800" : undefined} />
              <Kpi label={agency ? "Still to pay suppliers" : "Costs awaiting settlement"} value={supplierBalance == null ? "—" : fmtMoney(supplierBalance)} />
            </div>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <h2 className="font-semibold text-slate-900">{v.invoice ? "Invoice " + v.invoice.invoiceNumber : "Invoice pending"}</h2>
                  <p className="mt-1 text-sm text-slate-600">{nextAction?.detail ?? (v.invoice ? "Invoice and receipts are in Documents." : "Review the price and payment plan for this vehicle.")}</p>
                  {v.invoice && <p className="mt-1 text-sm text-slate-600">{agency ? "Processing-fee invoice" : "Sale invoice"} · {fmtMoney(v.invoice.total, v.invoice.currency || currency)} · {fmtMoney(Math.max(Number(v.invoice.total) - Number(v.invoice.paidAmount || 0), 0), v.invoice.currency || currency)} outstanding</p>}
                </div>
                {nextAction && <Button onClick={nextAction.run}>{nextAction.label}</Button>}
              </CardContent>
            </Card>
            {!agency && showCosts && v.summary.negativeMargin && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">The agreed price is {fmtMoney(Math.abs(v.summary.profit))} below the recorded vehicle costs.</p>}
          </TabsContent>
          <TabsContent value="plan"><AgreementTab v={v} companyId={companyId} editable={editable} /></TabsContent>
          <TabsContent value="payments"><PaymentsTab v={v} companyId={companyId} editable={canRecordPayments} /></TabsContent>
          {(agency || showCosts) && <TabsContent value="costs-and-suppliers">
            <Tabs value={costTab ?? (showCosts ? "costs" : "suppliers")} onValueChange={setCostTab}>
              <TabsList className="h-auto flex-wrap">
                {showCosts && <TabsTrigger value="costs">Cost sheet</TabsTrigger>}
                {agency && <TabsTrigger value="suppliers">Supplier payments</TabsTrigger>}
                {agency && <TabsTrigger value="customer-account">Finance details</TabsTrigger>}
              </TabsList>
              {showCosts && <TabsContent value="costs"><CostsTab v={v} companyId={companyId} /></TabsContent>}
              {agency && <TabsContent value="suppliers"><SupplierSettlementsTab v={v} companyId={companyId} editable={canRecordPayments} /></TabsContent>}
              {agency && <TabsContent value="customer-account"><CustomerAccountTab v={v} companyId={companyId} editable={canRecordPayments} /></TabsContent>}
            </Tabs>
          </TabsContent>}
          <TabsContent value="tracking"><TrackingTab v={v} companyId={companyId} editable={editable} /></TabsContent>
          <TabsContent value="vehicle"><DetailsTab v={v} companyId={companyId} editable={editable} initialAction={vehicleAction} /></TabsContent>
          <TabsContent value="documents" className="space-y-4"><VehicleDocumentsTab v={v} companyId={companyId} editable={editable} /><ActivityTab v={v} /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function agreedInterest(agreement?: {
  agreedPrice: string; depositAmount: string; months: number; interestType: string;
  interestRate: string; adminFee: string; startDate: string;
}) {
  if (!agreement || agreement.interestType === "none") return undefined;
  try {
    const plan = calculateVehiclePaymentPlan({
      ...agreement,
      agreedPrice: Number(agreement.agreedPrice),
      depositAmount: Number(agreement.depositAmount),
      interestRate: Number(agreement.interestRate),
      adminFee: Number(agreement.adminFee),
    });
    return Number.isFinite(plan.interest) ? plan.interest : undefined;
  } catch {
    return undefined;
  }
}

function AgreementTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { run, pending } = useSubmit(companyId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const { data: company } = useCompany(companyId);
  const agency = v.accountingModel !== "principal";
  const { data: accountData } = useVehicleCustomerAccount(companyId, agency ? v.id : 0);
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["vehicle-agreement", companyId, v.id],
    queryFn: async () => {
      const response = await apiFetch("/api/companies/" + companyId + "/vehicles/" + v.id + "/agreement");
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Failed to load the payment plan");
      return response.json();
    },
  });
  const agreement = data?.agreement;
  const currency = agreement?.currency || v.saleCurrency || "USD";
  const rate = Number(agreement?.exchangeRate ?? v.saleExchangeRate) || 1;
  const readTerms = () => agreement ? {
    agreedPrice: String(agreement.agreedPrice), depositAmount: String(agreement.depositAmount),
    months: String(agreement.months), startDate: agreement.startDate,
    interestType: String(agreement.interestType), interestRate: String(agreement.interestRate),
    adminFee: String(agreement.adminFee), lateFee: String(agreement.lateFee),
    processingFeeAmount: String(agreement.processingFeeAmount ?? ""),
    feeRecognition: String(agreement.feeRecognition || "on_handover"),
    termsText: String(agreement.termsText ?? ""),
  } : {
    agreedPrice: String(v.salePrice ?? ""), depositAmount: "0", months: "1",
    startDate: format(new Date(), "yyyy-MM-dd"), interestType: "none", interestRate: "0",
    adminFee: "0", lateFee: "0", processingFeeAmount: "", feeRecognition: "on_handover", termsText: "",
  };
  const [form, setForm] = useState(readTerms);
  const openEditor = () => {
    setForm(readTerms());
    setEditorOpen(true);
  };
  const update = (field: keyof typeof form, value: string) => setForm(current => ({ ...current, [field]: value }));
  const price = Number(form.agreedPrice);
  const deposit = Number(form.depositAmount);
  const months = Number(form.months);
  const fee = Number(form.processingFeeAmount);
  const interestRate = Number(form.interestRate);
  const adminFee = Number(form.adminFee);
  const valid = price > 0 && deposit >= 0 && deposit <= price && Number.isInteger(months) && months >= 1 && months <= 120
    && [price, deposit, fee, interestRate, adminFee, Number(form.lateFee)].every(amount => Number.isFinite(amount) && amount >= 0)
    && /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) && Number.isFinite(Date.parse(form.startDate));
  const preview = valid ? calculateVehiclePaymentPlan({
    agreedPrice: price, depositAmount: deposit, months, interestType: form.interestType, interestRate, adminFee, startDate: form.startDate,
  }) : null;
  const termsLocked = Boolean(v.invoiceId || v.cogsJournalEntryId || ["sold", "delivered", "cancelled"].includes(v.status)
    || (agreement && agreement.status !== "draft"));
  const canEdit = editable && !termsLocked;
  const canHandover = editable && agreement && !["completed", "cancelled"].includes(agreement.status)
    && v.status !== "cancelled" && (agency || v.invoiceId || v.status === "delivered");
  const costs = accountData?.costSheet ?? [];
  const listedCosts = costs.reduce((sum, cost) => sum + Math.round(cost.customerCharge * rate * 100), 0) / 100;
  const priceFromCosts = Math.round((listedCosts + fee) * 100) / 100;
  const savedSchedule = (data?.schedule ?? v.schedule ?? []) as Array<{ id: number; type: string; dueDate: string; amount: string; paidAmount: string; status: string }>;
  const openById = new Map<number, number>((v.openSchedule ?? []).map((line: { id: number; open: number }) => [line.id, line.open]));
  const scheduleLines = savedSchedule.map(line => ({
    ...line, amount: Number(line.amount), open: openById.get(line.id) ?? Math.max(Number(line.amount) - Number(line.paidAmount || 0), 0),
  }));
  const paid = Number(v.summary.paid || 0) * rate;
  const savedPrice = Number(agreement?.agreedPrice ?? v.salePrice ?? 0);
  const money = (value: number | string) => fmtMoney(value, currency);

  const save = () => run({
    path: "/" + v.id + "/agreement",
    body: {
      ...form, customerId: v.customerId, currency, exchangeRate: rate,
      priceType: agreement?.priceType, estimatedDelivery: agreement?.estimatedDelivery,
      notes: agreement?.notes, termsText: form.termsText.trim() || null,
    },
  }, "Payment plan saved").then(() => setEditorOpen(false)).catch(() => undefined);

  const handover = (earlyHandoverReason?: string) => run({ path: "/" + v.id + "/agreement/handover", body: { earlyHandoverReason } }, "Handover completed");
  if (isLoading) return <p className="p-4 text-sm text-slate-500">Loading payment plan…</p>;
  if (isError) return <p className="p-4 text-sm text-rose-700">Could not load the payment plan.</p>;

  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div><CardTitle>Price & payment plan</CardTitle>{agreement && <p className="mt-1 text-sm text-slate-600">{agreement.agreementNumber} · {agreement.status}</p>}</div>
        <div className="flex flex-wrap gap-2">
          {savedPrice > 0 && <Button variant="outline" onClick={() => setDealOpen(true)}><Eye className="mr-1 h-4 w-4" />Preview customer deal</Button>}
          {canEdit && <Button onClick={openEditor} disabled={!v.customerId}>{agreement ? "Edit payment plan" : "Set up payment plan"}</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {agreement ? <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><dt className="text-slate-600">Agreed price</dt><dd className="font-semibold">{money(agreement.agreedPrice)}</dd></div>
          <div><dt className="text-slate-600">Deposit</dt><dd className="font-semibold">{money(agreement.depositAmount)}</dd></div>
          <div><dt className="text-slate-600">Monthly instalments</dt><dd className="font-semibold">{agreement.months}</dd></div>
          <div><dt className="text-slate-600">Scheduled total</dt><dd className="font-semibold">{savedSchedule.length ? money(savedSchedule.reduce((sum, line) => sum + Number(line.amount), 0)) : "—"}</dd></div>
        </dl> : <p className="text-sm text-slate-600">{!v.customerId ? "Assign a customer under Vehicle & invoice to set up a plan." : "No payment plan on file."}</p>}
        {agreement?.termsText && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Terms and conditions</summary><p className="mt-2 whitespace-pre-wrap text-slate-600">{agreement.termsText}</p></details>}
        {(canHandover || (agreement && company)) && <div className="flex flex-wrap gap-2">
          {canHandover && <Button variant="outline" onClick={() => setHandoverOpen(true)} disabled={pending}>Review handover</Button>}
          {agreement && company && <PDFDownloadLink document={<VehicleAgreementPDF agreement={agreement} vehicle={v} customer={v.customer} company={company} schedule={savedSchedule} costs={costs} />} fileName={agreement.agreementNumber + ".pdf"}>{({ loading }) => <Button variant="outline" disabled={loading}>{loading ? "Preparing…" : "Download agreement"}</Button>}</PDFDownloadLink>}
        </div>}
      </CardContent>
    </Card>
    <Dialog open={dealOpen} onOpenChange={setDealOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Customer deal preview</DialogTitle><DialogDescription>{v.stockNumber} · {v.make} {v.model}{v.customer?.name ? ` · ${v.customer.name}` : ""}</DialogDescription></DialogHeader>
        <VehicleDealPreview currency={currency} agreedPrice={savedPrice} paid={paid} schedule={scheduleLines}
          exchangeRate={rate} costs={agency ? costs : undefined} processingFee={agency ? Number(agreement?.processingFeeAmount ?? 0) : undefined}
          interest={agreedInterest(agreement)} adminFee={Number(agreement?.adminFee ?? 0)}
          invoice={v.invoice
            ? { subtotal: Number(v.invoice.subtotal ?? v.invoice.total), tax: Number(v.invoice.taxAmount || 0), total: Number(v.invoice.total), kind: agency ? "Processing-fee invoice" : "Sales invoice", currency: v.invoice.currency || currency }
            : undefined}
        />
      </DialogContent>
    </Dialog>
    {canEdit && <Dialog open={editorOpen} onOpenChange={open => { if (!pending) setEditorOpen(open); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{agreement ? "Edit payment plan" : "Set up payment plan"}</DialogTitle><DialogDescription>Set the price, deposit and instalments, then review the total.</DialogDescription></DialogHeader>
        {agency && costs.length > 0 && <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-semibold">Customer import costs · {money(listedCosts)}</summary>
          <dl className="mt-2 space-y-2 text-sm">
            {costs.map(cost => <div className="flex justify-between gap-3" key={cost.id}><dt>{costLabel(cost.category)}{cost.description && " · " + cost.description}</dt><dd>{money(cost.customerCharge * rate)}</dd></div>)}
          </dl>
          {canEdit && <Button className="mt-3" type="button" size="sm" variant="outline" onClick={() => update("agreedPrice", priceFromCosts.toFixed(2))}>Use costs + processing fee</Button>}
          {price > 0 && Math.abs(price - priceFromCosts) > 0.005 && <p className="mt-2 text-sm text-amber-700">The agreed price differs from the listed costs plus the processing fee ({money(priceFromCosts)}).</p>}
        </details>}
        <fieldset disabled={!canEdit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label={"Agreed total (" + currency + ")"} value={form.agreedPrice} onChange={value => update("agreedPrice", value)} />
          {agency && <Field label={"Processing fee included in the total (" + currency + ")"} value={form.processingFeeAmount} onChange={value => update("processingFeeAmount", value)} />}
          <Field label={"Deposit (" + currency + ")"} value={form.depositAmount} onChange={value => update("depositAmount", value)} />
          <Field label="Monthly instalments" value={form.months} onChange={value => update("months", value)} />
          <Field label="Plan start date" type="date" value={form.startDate} onChange={value => update("startDate", value)} />
          <div><Label htmlFor="vehicle-interest-type">Interest</Label><Select disabled={!canEdit} value={form.interestType} onValueChange={value => update("interestType", value)}><SelectTrigger id="vehicle-interest-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No interest</SelectItem><SelectItem value="percent_pa">Reducing balance (% per year)</SelectItem><SelectItem value="flat_rate">Flat rate (% per year)</SelectItem><SelectItem value="fixed_amount">Fixed interest amount</SelectItem></SelectContent></Select></div>
          {form.interestType !== "none" && <Field label={form.interestType === "fixed_amount" ? "Interest amount (" + currency + ")" : "Annual interest rate (%)"} value={form.interestRate} onChange={value => update("interestRate", value)} />}
          <details className="md:col-span-2 xl:col-span-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Other terms</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <Field label="Financing admin fee" value={form.adminFee} onChange={value => update("adminFee", value)} />
              <Field label="Late fee per instalment" value={form.lateFee} onChange={value => update("lateFee", value)} />
              {agency && <div><Label htmlFor="vehicle-fee-recognition">Recognise the fee</Label><Select disabled={!canEdit} value={form.feeRecognition} onValueChange={value => update("feeRecognition", value)}><SelectTrigger id="vehicle-fee-recognition"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on_handover">On handover</SelectItem><SelectItem value="on_collection">On collection</SelectItem></SelectContent></Select></div>}
            </div>
          </details>
          <div className="md:col-span-2 xl:col-span-4">
            <Label htmlFor="vehicle-agreement-terms">Terms and conditions</Label>
            <Textarea id="vehicle-agreement-terms" rows={4} maxLength={12000} value={form.termsText} onChange={event => update("termsText", event.target.value)} placeholder="Leave blank to use the standard agreement terms." />
          </div>
        </fieldset>
        {preview && Number.isFinite(preview.total) && <details open className="space-y-3 rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">Preview draft deal</summary>
          <VehicleDealPreview currency={currency} agreedPrice={price} paid={paid}
            schedule={applyReceiptsToPreview(preview.lines, paid)} exchangeRate={rate}
            costs={agency ? costs : undefined} processingFee={agency ? fee : undefined} interest={preview.interest} adminFee={adminFee} />
        </details>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending || !v.customerId || !preview || !Number.isFinite(preview.total)}>{pending ? "Saving…" : "Save payment plan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
    {canHandover && <HandoverDialog v={v} open={handoverOpen} onOpenChange={setHandoverOpen} pending={pending} submit={handover} />}
    {savedSchedule.length > 0 && <Card><CardHeader><CardTitle>Payment schedule</CardTitle></CardHeader><CardContent>
      <PaymentSchedule currency={currency} lines={scheduleLines} />
    </CardContent></Card>}
  </div>;
}

function Field({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { const id = useId(); return <div><Label htmlFor={id}>{label}</Label><Input id={id} type={type} step={type === "number" ? "any" : undefined} value={value} onChange={e => onChange(e.target.value)} /></div>; }

function MoneyLine({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-slate-500">{label}</span><span className={`font-semibold ${tone ?? "text-slate-900"}`}>{fmtMoney(value)}</span></div>;
}

/** Customer money: receipts, allocations, funding status and fee revenue. */
function CustomerAccountTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { toast } = useToast();
  const { data: company } = useCompany(companyId);
  const { data, isLoading } = useVehicleCustomerAccount(companyId, v.id);
  const { run, pending } = useSubmit(companyId);
  const [paymentId, setPaymentId] = useState("");
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [feeAllocation, setFeeAllocation] = useState("0");

  const payments = data?.payments ?? [];
  const unallocatedPayments = payments.filter((p: any) => !(p.allocations ?? []).some((a: any) => !a.reversesAllocationId));
  const selected = payments.find((p: any) => String(p.id) === paymentId);

  useEffect(() => {
    if (!paymentId && unallocatedPayments.length) setPaymentId(String(unallocatedPayments[0].id));
  }, [data, paymentId]);
  useEffect(() => { setAllocations({}); setFeeAllocation("0"); }, [paymentId]);

  const suggest = () => {
    if (!data || !selected) return;
    let remaining = Number(selected.baseAmount || 0);
    const fee = Math.min(Math.max(data.totals.feeOutstanding, 0), remaining);
    setFeeAllocation(fee.toFixed(2));
    remaining = Math.round((remaining - fee) * 100) / 100;
    const next: Record<number, string> = {};
    for (const cost of data.costSheet) {
      if (remaining <= 0.005) break;
      const part = Math.min(Math.max(cost.outstanding, 0), remaining);
      if (part > 0) next[cost.id] = part.toFixed(2);
      remaining = Math.round((remaining - part) * 100) / 100;
    }
    setAllocations(next);
  };

  const submitAllocation = async () => {
    if (!selected) return toast({ title: "Choose a customer receipt", variant: "destructive" });
    const lines = Object.entries(allocations)
      .map(([costId, amount]) => ({ costId: Number(costId), allocationType: "cost", amount: Number(amount) }))
      .filter((a) => a.amount > 0);
    const fee = Number(feeAllocation || 0);
    if (fee > 0) lines.push({ costId: null, allocationType: "fee", amount: fee } as any);
    if (!lines.length) return toast({ title: "Enter at least one allocation", variant: "destructive" });
    await run({ path: `/${v.id}/customer-account/payments/${selected.id}/allocate`, body: { allocations: lines } }, "Receipt allocated");
  };

  const reverse = async (allocation: any) => {
    if (allocation.reversesAllocationId || allocation.reversedAt || Number(allocation.amount) <= 0) return;
    await run({ path: `/${v.id}/customer-account/allocations/${allocation.id}/reverse`, body: { reason: "Reversed from vehicle customer account" } }, "Allocation reversed");
  };

  if (isLoading) return <div className="p-4 text-sm text-slate-500">Loading customer account…</div>;
  if (!data) return <div className="p-4 text-sm text-rose-600">Customer account is unavailable for this vehicle.</div>;
  const t = data.totals;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-slate-500">Customer funds, third-party settlements and Prime Imports earnings are tracked separately.</p>
      {data && company && <PDFDownloadLink document={<VehicleAccountStatementPDF data={data} vehicle={v} company={company} />} fileName={`Vehicle-Account-Statement-${v.stockNumber}.pdf`}>{({ loading }) => <Button variant="outline" size="sm" disabled={loading}><FileText className="h-4 w-4 mr-1" />{loading ? "Preparing…" : "Print account statement"}</Button>}</PDFDownloadLink>}
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card><CardHeader><CardTitle className="text-sm">Customer position</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <MoneyLine label="Deal value" value={t.totalPrice} />
        <MoneyLine label="Collected" value={t.collected} tone="text-emerald-600" />
        <MoneyLine label="Balance due" value={t.balanceDue} tone={t.balanceDue > 0 ? "text-amber-600" : undefined} />
        <MoneyLine label="Unallocated cash" value={t.unallocatedCollected} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Funds & obligations</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <MoneyLine label="Cost sheet" value={t.costSheetTotal} />
        <MoneyLine label="Allocated to costs" value={t.allocatedToCosts} />
        <MoneyLine label={t.fundsHeld < 0 ? "Advanced by Prime Imports" : "Held for suppliers"} value={Math.abs(t.fundsHeld)} tone={t.fundsHeld < 0 ? "text-amber-600" : "text-sky-700"} />
        <MoneyLine label="Still owing to suppliers" value={t.supplierOutstanding} tone="text-amber-600" />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Prime Imports earnings</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <MoneyLine label="Processing fee" value={t.processingFee} />
        <MoneyLine label="Fee allocated" value={t.allocatedToFee} />
        <MoneyLine label="Fee outstanding" value={t.feeOutstanding} />
        <MoneyLine label="Fee recognised" value={t.feeRecognised} tone="text-emerald-600" />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Agreement</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Number</span><span className="font-semibold">{data.agreement?.agreementNumber ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Model</span><span className="font-semibold capitalize">{data.agreement?.accountingModel ?? v.accountingModel ?? "agent"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="font-semibold capitalize">{data.agreement?.status ?? "draft"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Invoice</span><span className="font-semibold">{v.invoice?.invoiceNumber ?? "—"}</span></div>
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Cost sheet — funding vs supplier settlement</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Cost</TableHead><TableHead>Estimated</TableHead><TableHead>Actual</TableHead><TableHead>Customer charge</TableHead><TableHead>Funded</TableHead><TableHead>With supplier</TableHead><TableHead>Held</TableHead><TableHead>Still owing</TableHead></TableRow></TableHeader>
        <TableBody>{data.costSheet.map((c) => <TableRow key={c.id}>
          <TableCell><div className="font-medium">{costLabel(c.category)}</div><div className="text-xs text-slate-400">{c.description || c.payee || "—"}</div></TableCell>
          <TableCell>{fmtMoney(c.estimated)}</TableCell><TableCell>{fmtMoney(c.actual)}</TableCell><TableCell>{fmtMoney(c.customerCharge)}</TableCell>
          <TableCell>{fmtMoney(c.allocated)}</TableCell><TableCell>{fmtMoney(c.settled)}</TableCell>
          <TableCell className="text-sky-700">{fmtMoney(c.held)}</TableCell><TableCell className="text-amber-600">{fmtMoney(c.outstanding)}</TableCell>
        </TableRow>)}{!data.costSheet.length && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-6">No customer-funded cost lines yet.</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent></Card>

    {editable && <Card><CardHeader><CardTitle>Allocate a customer receipt</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div><Label>Customer receipt</Label><Select value={paymentId} onValueChange={setPaymentId}><SelectTrigger><SelectValue placeholder="Choose receipt" /></SelectTrigger><SelectContent>{unallocatedPayments.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.reference || `Receipt ${p.id}`} · {fmtMoney(p.baseAmount)}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-end"><Button variant="outline" onClick={suggest} disabled={!selected}>Suggest fee-first allocation</Button></div>
        <div className="flex items-end"><Button onClick={submitAllocation} disabled={pending || !selected}>{pending ? "Saving…" : "Save allocation"}</Button></div>
      </div>
      {selected && <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">Receipt {selected.reference || `#${selected.id}`} · {fmtMoney(selected.baseAmount)} received · {fmtMoney(Number(selected.baseAmount) - Number(selected.allocations?.reduce((s: number, a: any) => s + (a.reversesAllocationId ? -Number(a.amount) : Number(a.amount)), 0) || 0))} still unallocated.</div>}
      <Table><TableHeader><TableRow><TableHead>Allocate to</TableHead><TableHead>Outstanding</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>
        <TableRow><TableCell>Processing fee (our revenue)</TableCell><TableCell>{fmtMoney(t.feeOutstanding)}</TableCell><TableCell><Input className="w-40" type="number" step="0.01" value={feeAllocation} onChange={(e) => setFeeAllocation(e.target.value)} /></TableCell></TableRow>
        {data.costSheet.map((c) => <TableRow key={c.id}><TableCell>{costLabel(c.category)}{c.description ? ` · ${c.description}` : ""}</TableCell><TableCell>{fmtMoney(c.outstanding)}</TableCell><TableCell><Input className="w-40" type="number" step="0.01" value={allocations[c.id] ?? "0"} onChange={(e) => setAllocations({ ...allocations, [c.id]: e.target.value })} /></TableCell></TableRow>)}
      </TableBody></Table>
    </CardContent></Card>}

    <Card><CardHeader><CardTitle>Allocation history</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Allocated to</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
        {payments.flatMap((p: any) => (p.allocations ?? []).map((a: any) => <TableRow key={a.id}>
          <TableCell>{p.reference || `Receipt ${p.id}`}</TableCell>
          <TableCell>{a.allocationType === "fee" ? "Processing fee" : costLabel(data.costSheet.find((c: any) => c.id === a.costId)?.category || "other")}</TableCell>
          <TableCell>{fmtMoney(Number(a.amount))}</TableCell>
          <TableCell className="capitalize">{a.reversesAllocationId ? "adjustment" : a.reversedAt ? "reversed" : "active"}</TableCell>
          <TableCell>{editable && !a.reversesAllocationId && !a.reversedAt && Number(a.amount) > 0 && <Button variant="ghost" size="sm" onClick={() => reverse(a)} disabled={pending}><Undo2 className="h-3 w-3 mr-1" />Reverse</Button>}</TableCell>
        </TableRow>))}
      </TableBody></Table>
    </CardContent></Card>
  </div>;
}

/** Third-party obligations: separate from customer funding. */
function SupplierSettlementsTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { data, isLoading } = useVehicleCustomerAccount(companyId, v.id);
  const { data: bankAccounts = [] } = useBankAccounts(companyId);
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { run, pending } = useSubmit(companyId);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [costId, setCostId] = useState("");
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("none");
  const [supplierId, setSupplierId] = useState("none");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const selected = data?.costSheet.find(cost => String(cost.id) === costId);
  const currency = v.saleCurrency || "USD";
  const rate = Number(v.saleExchangeRate) || 1;
  const openPayment = (cost: NonNullable<typeof selected>) => {
    setCostId(String(cost.id));
    setAmount((Math.max(cost.supplierOutstanding, 0) * rate).toFixed(2));
    setSupplierId("none");
    setReference("");
    setPaymentOpen(true);
  };
  const submit = async () => {
    if (!selected) return;
    try {
      await run({
        path: `/${v.id}/third-party-payments`,
        body: {
          costId: selected.id, amount: Number(amount), currency,
          exchangeRate: rate, paymentDate, reference: reference || null,
          bankAccountId: bankAccountId === "none" ? null : Number(bankAccountId),
          supplierId: supplierId === "none" ? null : Number(supplierId),
          paymentMethod: "bank_transfer",
        },
      }, "Supplier settlement recorded");
      setPaymentOpen(false);
    } catch { /* useSubmit displays the error */ }
  };

  if (isLoading) return <div className="p-4 text-sm text-slate-500">Loading supplier obligations…</div>;
  if (!data) return <div className="p-4 text-sm text-rose-600">Supplier settlements are only available for agency vehicles.</div>;

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Supplier balances</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Supplier cost</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Still to pay</TableHead>{editable && <TableHead />}</TableRow></TableHeader><TableBody>
        {!data.costSheet.length && <TableRow><TableCell colSpan={editable ? 4 : 3} className="py-6 text-center text-slate-600">No supplier costs recorded.</TableCell></TableRow>}
        {data.costSheet.map((c) => <TableRow key={c.id}>
          <TableCell>
            <div className="font-medium">{costLabel(c.category)}</div>
            <div className="text-xs text-slate-600">{[suppliers.find((s: any) => s.id === c.supplierId)?.name || c.payee, c.description].filter(Boolean).join(" · ")}</div>
          </TableCell>
          <TableCell className="text-right">{fmtMoney(c.settled)}</TableCell>
          <TableCell className={`text-right ${c.supplierOutstanding > 0 ? "font-semibold text-amber-700" : "text-emerald-700"}`}>{fmtMoney(c.supplierOutstanding)}</TableCell>
          {editable && <TableCell className="text-right">{c.supplierOutstanding > 0.004 && <Button size="sm" variant="outline" onClick={() => openPayment(c)}>Record payment</Button>}</TableCell>}
        </TableRow>)}
      </TableBody></Table>
    </CardContent></Card>

    {editable && <Dialog open={paymentOpen} onOpenChange={open => { if (!pending) setPaymentOpen(open); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Record supplier payment</DialogTitle><DialogDescription>{selected ? costLabel(selected.category) : "Select a supplier cost"}{selected?.description ? " · " + selected.description : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
      <Field label={"Amount paid (" + currency + ")"} value={amount} onChange={setAmount} />
      <div><Label>Paid from</Label><Select value={bankAccountId} onValueChange={setBankAccountId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose bank account</SelectItem>{bankAccounts.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name || b.code}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Supplier</Label><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Use cost supplier</SelectItem>{suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></div>
      <Field label="Payment date" type="date" value={paymentDate} onChange={setPaymentDate} />
      <Field label="Reference" type="text" value={reference} onChange={setReference} />
        </div>
      {selected && <p className="text-xs text-slate-500">
        Outstanding supplier obligation: <strong className="text-slate-700">{fmtMoney(selected.supplierOutstanding)}</strong>
        {Number(selected.held) < Number(selected.supplierOutstanding) && (
          <> · Only {fmtMoney(selected.held)} is funded by the customer so far. Settling the balance means Prime Imports advances {fmtMoney(Number(selected.supplierOutstanding) - Number(selected.held))}, carried as a receivable from the customer.</>
        )}
      </p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !selected || !(Number(amount) > 0) || bankAccountId === "none"}>{pending ? "Saving…" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}

    <Card><CardHeader><CardTitle>Settlement history</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Cost</TableHead><TableHead>Reference</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>
        {data.thirdPartyPayments.map((p: any) => <TableRow key={p.id}><TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell><TableCell>{costLabel(data.costSheet.find((c: any) => c.id === p.costId)?.category || "other")}</TableCell><TableCell>{p.reference || "—"}</TableCell><TableCell>{fmtMoney(Number(p.baseAmount))}</TableCell></TableRow>)}
        {!data.thirdPartyPayments.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">No settlements recorded yet.</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
  </div>;
}

function ActivityTab({ v }: { v: any }) {
  const events = [...(v.stages ?? []).map((s: any) => ({ id: s.id, at: s.createdAt || s.date, title: `Stage: ${stageLabel(s.stage || s.name)}`, detail: s.notes || "" })),
    ...(v.reminders ?? []).map((r: any) => ({ id: `r-${r.id}`, at: r.sentAt, title: `Reminder · ${r.channel}`, detail: r.message || "" }))]
    .sort((a: any, b: any) => String(b.at || "").localeCompare(String(a.at || "")));
  return <Card><CardHeader><CardTitle>Activity & audit trail</CardTitle></CardHeader><CardContent>
    <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader><TableBody>
      {events.map((e: any) => <TableRow key={e.id}><TableCell>{e.at ? new Date(e.at).toLocaleString() : "—"}</TableCell><TableCell className="font-medium">{e.title}</TableCell><TableCell className="text-slate-500">{e.detail || "—"}</TableCell></TableRow>)}
      {!events.length && <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-6">No activity recorded.</TableCell></TableRow>}
    </TableBody></Table>
  </CardContent></Card>;
}

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <Card className="border-slate-200/80">
      <CardContent className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`text-xl font-bold mt-1 ${tone ?? "text-slate-900"}`}>{value}</div>
        {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** Cash and bank asset accounts that money can actually land in or leave. */
function useBankAccounts(companyId: number) {
  return useQuery<any[]>({
    queryKey: ["vehicle-bank-accounts", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/accounting/accounts`);
      if (!res.ok) throw new Error("Failed to load cash and bank accounts");
      const rows = await res.json();
      return (Array.isArray(rows) ? rows : []).filter((a: any) => {
        if (a.type !== "ASSET" || a.isActive === false) return false;
        const haystack = `${a.name ?? ""} ${a.category ?? ""} ${a.subType ?? ""}`.toLowerCase();
        return haystack.includes("cash") || haystack.includes("bank");
      });
    },
  });
}

function useSubmit(companyId: number) {
  const { toast } = useToast();
  const action = useVehicleAction(companyId);
  const run = async (args: { path: string; method?: string; body?: unknown }, success?: string) => {
    try {
      const r = await action.mutateAsync(args);
      if (success) toast({ title: success });
      return r;
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
      throw e;
    }
  };
  return { run, pending: action.isPending };
}

// ── Details & sale ───────────────────────────────────────────────────────────

function DetailsTab({ v, companyId, editable, initialAction }: { v: any; companyId: number; editable: boolean; initialAction?: "edit" | "invoice" }) {
  const { data: company } = useCompany(companyId);
  const { data: customers = [] } = useCustomers(companyId);
  const { data: consignments = [] } = useConsignments(companyId);
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: staff = [] } = useCompanyStaff(companyId);
  const { run, pending } = useSubmit(companyId);
  const { toast } = useToast();
  const keys = ["make", "model", "year", "vin", "colour", "mileage", "engine", "transmission", "supplierName", "auctionRef",
    "containerNumber", "vesselName", "portOfDischarge", "eta", "targetPrice", "salePrice", "saleCurrency", "saleExchangeRate", "status", "notes"] as const;
  const init = () => Object.fromEntries(keys.map((k) => [k, v[k] ?? ""])) as Record<(typeof keys)[number], any>;
  const [form, setForm] = useState(init);
  const [customerId, setCustomerId] = useState<string>(v.customerId ? String(v.customerId) : "none");
  const [consignmentId, setConsignmentId] = useState<string>(v.consignmentId ? String(v.consignmentId) : "none");
  const [supplierId, setSupplierId] = useState<string>(v.supplierId ? String(v.supplierId) : "none");
  const [salespersonId, setSalespersonId] = useState<string>(v.salespersonId ? String(v.salespersonId) : "none");
  const [enquiryId, setEnquiryId] = useState<string>(v.enquiryId ? String(v.enquiryId) : "none");
  const [editing, setEditing] = useState(initialAction === "edit");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(initialAction === "invoice");
  const [invoiceForm, setInvoiceForm] = useState({
    dueDate: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    taxTypeId: "none",
    notes: "",
  });
  const { taxTypes } = useTaxConfig(companyId);
  const { data: accountData } = useVehicleCustomerAccount(companyId, v.id);
  const invoiceTaxTypes = ((taxTypes.data ?? []) as any[]).filter((t) => t.isActive !== false);

  const hasInvoice = !!v.invoice;
  const hasPayments = Array.isArray(v.payments) && v.payments.length > 0;
  const lockCustomer = hasInvoice || hasPayments;
  const lockCommercial = hasInvoice;
  const consignment = (consignments as any[]).find((c) => Number(c.id) === Number(v.consignmentId));
  const { data: matchingEnquiries = [] } = useMatchingEnquiries(
    companyId,
    { make: form.make, model: form.model, year: form.year },
    editing,
  );
  const enquiryOptions: any[] = [...matchingEnquiries];
  if (v.enquiry && !enquiryOptions.some((e) => e.id === v.enquiry.id)) {
    enquiryOptions.unshift(v.enquiry);
  }

  const reset = () => {
    setForm(init());
    setCustomerId(v.customerId ? String(v.customerId) : "none");
    setConsignmentId(v.consignmentId ? String(v.consignmentId) : "none");
    setSupplierId(v.supplierId ? String(v.supplierId) : "none");
    setSalespersonId(v.salespersonId ? String(v.salespersonId) : "none");
    setEnquiryId(v.enquiryId ? String(v.enquiryId) : "none");
  };
  useEffect(() => {
    reset();
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const startEdit = () => {
    reset();
    setEditing(true);
  };
  const cancelEdit = () => {
    reset();
    setEditing(false);
  };

  const pickSupplier = (id: string) => {
    setSupplierId(id);
    if (id !== "none") {
      const supplier = (suppliers as any[]).find((s) => Number(s.id) === Number(id));
      if (supplier?.name) setForm((current) => ({ ...current, supplierName: supplier.name }));
    }
  };

  const isAgencyDeal = (v.accountingModel || accountData?.agreement?.accountingModel || "agent") !== "principal";
  const invoiceCosts = isAgencyDeal ? accountData?.costSheet ?? [] : [];
  const saleRate = Number(v.saleExchangeRate || 1) || 1;
  const selectedInvoiceTaxType = invoiceTaxTypes.find((t) => String(t.id) === invoiceForm.taxTypeId);
  // Agency deals invoice only Prime Imports' processing fee. The full vehicle
  // price stays a customer obligation and is never company revenue or VATable.
  const invoiceTaxRate = isAgencyDeal ? 0 : Number(selectedInvoiceTaxType?.rate ?? 0);
  const invoiceCurrency = v.saleCurrency || "USD";
  const processingFee = Math.round(
    Number(accountData?.agreement?.processingFeeAmount ?? accountData?.totals?.processingFee ?? 0) * 100,
  ) / 100;
  const invoiceSubtotal = Math.round(Number(isAgencyDeal ? processingFee : v.salePrice || 0) * 100) / 100;
  const invoiceTax = Math.round(invoiceSubtotal * (invoiceTaxRate / 100) * 100) / 100;
  const invoiceTotal = Math.round((invoiceSubtotal + invoiceTax) * 100) / 100;

  const createInvoice = async () => {
    try {
      await run({
        path: `/${v.id}/invoice`,
        body: {
          dueDate: invoiceForm.dueDate || undefined,
          taxTypeId: invoiceForm.taxTypeId === "none" ? null : Number(invoiceForm.taxTypeId),
          notes: invoiceForm.notes.trim() || null,
        },
      }, "Invoice created");
      setInvoiceOpen(false);
    } catch {
      // useSubmit has already shown the failure toast.
    }
  };

  const attachInvoice = () =>
    invoiceNumber.trim() &&
    run({ path: `/${v.id}/invoice`, method: "PUT", body: { invoiceNumber: invoiceNumber.trim() } }, "Invoice attached")
      .then(() => setInvoiceNumber(""))
      .catch(() => undefined);

  const save = async () => {
    const num = (x: any) => (x === "" || x == null ? null : Number(x));
    const str = (x: any) => (x === "" ? null : x);
    // Sale terms and the customer drive the invoice, so they are not part of
    // the generic PATCH. They are applied through the reserve route below.
    const commercialKeys = ["salePrice", "saleCurrency", "saleExchangeRate", "status"] as const;
    const patchKeys = keys.filter((k) => !(commercialKeys as readonly string[]).includes(k));
    try {
      await run(
        {
          path: `/${v.id}`,
          method: "PATCH",
          body: {
            ...Object.fromEntries(patchKeys.map((k) => [k, str(form[k])])),
            year: num(form.year),
            mileage: num(form.mileage),
            targetPrice: form.targetPrice === "" ? "0" : String(form.targetPrice),
            consignmentId: consignmentId === "none" ? null : Number(consignmentId),
            supplierId: supplierId === "none" ? null : Number(supplierId),
            salespersonId: salespersonId === "none" ? null : salespersonId,
            enquiryId: enquiryId === "none" ? null : Number(enquiryId),
            supplierName: supplierId === "none"
              ? str(form.supplierName)
              : (suppliers as any[]).find((s) => Number(s.id) === Number(supplierId))?.name ?? str(form.supplierName),
          },
        },
        undefined,
      );

      const canReserve = !v.invoiceId && !["sold", "delivered", "cancelled"].includes(v.status);
      const nextCustomer = customerId === "none" ? null : Number(customerId);
      const nextSalePrice = form.salePrice === "" ? null : Number(form.salePrice);
      const nextSaleCurrency = form.saleCurrency || "USD";
      const nextRate = form.saleExchangeRate === "" ? 1 : Number(form.saleExchangeRate);
      const termsChanged =
        nextCustomer !== (v.customerId ?? null) ||
        (nextSalePrice ?? null) !== (v.salePrice == null ? null : Number(v.salePrice)) ||
        nextSaleCurrency !== (v.saleCurrency || "USD") ||
        nextRate !== Number(v.saleExchangeRate || 1) ||
        (salespersonId === "none" ? null : salespersonId) !== (v.salespersonId ?? null) ||
        (enquiryId === "none" ? null : Number(enquiryId)) !== (v.enquiryId ?? null);

      if (canReserve && termsChanged) {
        if (!nextCustomer && !v.customerId && enquiryId === "none") {
          toast({
            title: "Customer required",
            description: "Assign a customer (or a CRM enquiry) to save the agreed sale terms.",
            variant: "destructive",
          });
        } else {
          await run({
            path: `/${v.id}/reserve`,
            body: {
              amendReservation: v.status === "reserved",
              customerId: nextCustomer ?? undefined,
              salePrice: nextSalePrice ?? undefined,
              saleCurrency: nextSaleCurrency,
              saleExchangeRate: nextRate,
              salespersonId: salespersonId === "none" ? null : salespersonId,
              enquiryId: enquiryId === "none" ? undefined : Number(enquiryId),
            },
          });
        }
      }

      toast({ title: "Vehicle saved" });
      setEditing(false);
    } catch {
      // useSubmit has already shown the failure toast.
    }
  };

  const f = (
    k: (typeof keys)[number],
    label: string,
    props: Record<string, any> = {},
    disabled = false,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`vd-${k}`}>{label}</Label>
      <Input
        id={`vd-${k}`}
        value={form[k] ?? ""}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        disabled={!editing || disabled}
        {...props}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Vehicle & sale details</p>
          <p className="text-xs text-slate-500">
            {editing
              ? "Update the vehicle, shipment or sale information, then save your changes."
              : "Read-only summary. Choose Edit details to make changes."}
          </p>
        </div>
        <div className="flex gap-2">
          {editable && !editing && (
            <Button id="vd-edit" variant="outline" onClick={startEdit}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit details
            </Button>
          )}
          {editing && (
            <>
              <Button variant="outline" onClick={cancelEdit} disabled={pending}>
                Cancel
              </Button>
              <Button id="vd-save" onClick={save} disabled={pending}>
                Save changes
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="border-slate-200/80 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Vehicle & shipment</CardTitle>
            <Badge className={`${stageTone[v.stage] ?? ""} border-0`}>{stageLabel(v.stage)}</Badge>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {f("make", "Make")}{f("model", "Model")}{f("year", "Year", { type: "number" })}
                {f("vin", "VIN / chassis")}{f("colour", "Colour")}{f("mileage", "Mileage (km)", { type: "number" })}
                {f("engine", "Engine")}{f("transmission", "Transmission")}{f("supplierName", "Supplier name")}
                {f("auctionRef", "Auction / lot ref")}{f("containerNumber", "Container no.")}{f("vesselName", "Vessel")}
                <div className="space-y-1.5">
                  <Label>Consignment</Label>
                  <Select disabled={!editing} value={consignmentId} onValueChange={setConsignmentId}>
                    <SelectTrigger id="vd-consignment"><SelectValue placeholder="Not linked" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {(consignments as any[]).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.referenceNumber} · {c.shippingMethod}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Linked supplier</Label>
                  <Select value={supplierId} onValueChange={pickSupplier}>
                    <SelectTrigger id="vd-supplier"><SelectValue placeholder="No supplier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No supplier</SelectItem>
                      {(suppliers as any[]).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Salesperson</Label>
                  <Select value={salespersonId} onValueChange={setSalespersonId}>
                    <SelectTrigger id="vd-salesperson"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(staff as any[]).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {f("portOfDischarge", "Port of discharge")}{f("eta", "ETA", { type: "date" })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
                <Read label="Make" value={v.make} />
                <Read label="Model" value={v.model} />
                <Read label="Year" value={v.year} />
                <Read label="VIN / chassis" value={v.vin} mono />
                <Read label="Colour" value={v.colour} />
                <Read label="Mileage" value={v.mileage != null ? `${Number(v.mileage).toLocaleString()} km` : null} />
                <Read label="Engine" value={v.engine} />
                <Read label="Transmission" value={v.transmission} />
                <Read label="Supplier" value={v.supplier?.name || v.supplierName} />
                <Read
                  label="Supplier contact"
                  value={v.supplier ? [v.supplier.phone, v.supplier.email].filter(Boolean).join(" · ") : null}
                />
                <Read label="Salesperson" value={v.salesperson?.name || v.salesperson?.email} />
                <Read label="Auction / lot ref" value={v.auctionRef} />
                <Read label="Container no." value={v.containerNumber} mono />
                <Read label="Vessel" value={v.vesselName} />
                <Read
                  label="Consignment"
                  value={consignment ? `${consignment.referenceNumber} · ${consignment.shippingMethod}` : null}
                />
                <Read label="Port of discharge" value={v.portOfDischarge} />
                <Read label="ETA" value={v.eta ? format(new Date(v.eta), "d MMM yyyy") : null} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-slate-200/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Customer & sale</CardTitle>
              <Badge className={`${statusTone[v.status] ?? "bg-slate-100 text-slate-600"} border-0 capitalize`}>{v.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-5">
              {editing ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Customer</Label>
                    <Select
                      disabled={!editing || lockCustomer}
                      value={customerId}
                      onValueChange={setCustomerId}
                    >
                      <SelectTrigger id="vd-customer"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned (stock)</SelectItem>
                        {(customers as any[]).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}{c.phone ? ` · ${c.phone}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {lockCustomer && (
                      <p className="flex items-center gap-1 text-[11px] text-amber-600">
                        <Lock className="h-3 w-3" /> Customer is locked because an invoice or payment exists.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Linked CRM lead</Label>
                    <Select
                      disabled={!editing || lockCustomer}
                      value={enquiryId}
                      onValueChange={setEnquiryId}
                    >
                      <SelectTrigger id="vd-enquiry"><SelectValue placeholder="Not linked" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not linked</SelectItem>
                        {enquiryOptions.map((e: any) => (
                          <SelectItem key={e.id} value={String(e.id)}>
                            {e.name}{e.interest ? ` · ${e.interest}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-400">
                      Matching open leads are listed from the CRM pipeline.
                    </p>
                  </div>
                  {f("targetPrice", "Target retail price (USD)", { type: "number", step: "0.01" })}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">{f("salePrice", "Agreed sale price", { type: "number", step: "0.01" }, lockCommercial)}</div>
                    {f("saleCurrency", "Currency", {}, lockCommercial)}
                  </div>
                  {form.saleCurrency && form.saleCurrency !== "USD" &&
                    f("saleExchangeRate", `USD per 1 ${form.saleCurrency}`, { type: "number", step: "0.000001" }, lockCommercial)}
                  {lockCommercial && (
                    <p className="flex items-center gap-1 text-[11px] text-amber-600">
                      <Lock className="h-3 w-3" /> Sale price, currency and FX rate are locked because an invoice exists.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select disabled={!editing} value={form.status} onValueChange={(x) => setForm({ ...form, status: x })}>
                      <SelectTrigger id="vd-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["available", "reserved", "sold", "delivered", "cancelled"].map((x) => (
                          <SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Customer</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {v.customer?.name || v.customerName || "Unassigned (stock)"}
                    </p>
                    {(v.customer?.phone || v.customer?.email) && (
                      <p className="text-xs text-slate-500">
                        {[v.customer?.phone, v.customer?.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {v.customerId ? (
                      <Link
                        href={`/vehicles/statements?customerId=${v.customerId}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" /> View customer statement
                      </Link>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Assign a customer to raise an invoice.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">CRM lead</p>
                    {v.enquiry ? (
                      <>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <Link
                            href={`/crm?enquiryId=${v.enquiry.id}`}
                            className="truncate text-sm font-semibold text-blue-600 hover:underline"
                          >
                            {v.enquiry.name}
                          </Link>
                          <Badge variant="secondary" className="shrink-0 capitalize">
                            {v.enquiry.status}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {[v.enquiry.stageName, v.enquiry.interest, v.enquiry.assigneeName]
                            .filter(Boolean)
                            .join(" · ") || "Open in the CRM for the full lead trail"}
                        </p>
                        <Link
                          href={`/crm?enquiryId=${v.enquiry.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" /> View enquiry
                        </Link>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">
                        Not linked to a CRM enquiry. Edit details to attach the lead that asked for this vehicle.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <Read label="Target price" value={v.targetPrice ? fmtMoney(v.targetPrice) : null} />
                    <Read
                      label="Agreed sale price"
                      value={v.salePrice != null ? fmtMoney(v.salePrice, v.saleCurrency || "USD") : null}
                      strong
                    />
                    <Read label="Sale currency" value={v.saleCurrency || "USD"} />
                    {v.saleCurrency && v.saleCurrency !== "USD" && (
                      <Read label={`${v.saleCurrency} per 1 USD`} value={Number(v.saleExchangeRate || 1)} />
                    )}
                  </div>
                </>
              )}

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-slate-400" />Sales invoice</Label>
                  {v.invoice && <Badge className="border-0 bg-blue-100 text-blue-700 capitalize">{v.invoice.status}</Badge>}
                </div>
                {v.invoice ? (
                  <div className="rounded-lg border border-slate-200 p-3 text-sm space-y-1.5">
                    <Link href={`/invoices/${v.invoice.id}`} className="font-medium text-blue-600 hover:underline">{v.invoice.invoiceNumber}</Link>
                    <div className="flex justify-between text-xs text-slate-500"><span>Total</span><span>{fmtMoney(v.invoice.total, v.invoice.currency || "USD")}</span></div>
                    <div className="flex justify-between text-xs text-slate-500"><span>Paid</span><span>{fmtMoney(v.invoice.paidAmount, v.invoice.currency || "USD")}</span></div>
                    {v.invoice.dueDate && <div className="flex justify-between text-xs text-slate-500"><span>Due</span><span>{format(new Date(v.invoice.dueDate), "d MMM yyyy")}</span></div>}
                    <div className="flex gap-2 pt-1">
                      <Link href={`/invoices/${v.invoice.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full"><Eye className="w-3.5 h-3.5 mr-1" />View</Button>
                      </Link>
                      {company ? (
                        <PDFDownloadLink
                          document={
                            <InvoicePDF
                              invoice={{ ...v.invoice, vehicleCosts: v.invoice.vehicleCosts ?? v.costs, vehicle: v }}
                              company={company}
                              customer={v.customer}
                            />
                          }
                          fileName={`Invoice-${v.invoice.invoiceNumber}.pdf`}
                          className="flex-1"
                        >
                          {({ loading }) => (
                            <Button size="sm" className="w-full" disabled={loading}>
                              <Download className="w-3.5 h-3.5 mr-1" />
                              {loading ? "Preparing…" : "Download"}
                            </Button>
                          )}
                        </PDFDownloadLink>
                      ) : (
                        <Link href={`/invoices/${v.invoice.id}?download=1`} className="flex-1">
                          <Button size="sm" className="w-full"><Download className="w-3.5 h-3.5 mr-1" />Download</Button>
                        </Link>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">Posted to Accounts Receivable. Open the invoice to email or WhatsApp it to the customer.</p>
                    <div className="border-t pt-2 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">COGS</span>
                        {v.cogsJournalEntryId ? (
                          <span className="font-medium text-emerald-600">
                            {v.cogsAmount != null ? `${fmtMoney(v.cogsAmount)} posted` : "Posted"}
                          </span>
                        ) : (
                          <span className="text-amber-600">Not posted</span>
                        )}
                      </div>
                      {!v.cogsJournalEntryId && !isAgencyDeal && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={pending || Number(v.summary?.landedCost || 0) <= 0}
                          onClick={() => run({ path: `/${v.id}/cogs`, method: "POST" }, "COGS posted to the ledger")}
                        >
                          <Landmark className="w-3.5 h-3.5 mr-1" />Post COGS
                        </Button>
                      )}
                      {isAgencyDeal && (
                        <p className="text-[11px] leading-snug text-slate-400">
                          Agency deal — customer-funded costs are disbursements, not Prime Imports COGS.
                        </p>
                      )}
                    </div>
                  </div>
                ) : editable ? (
                  <div className="space-y-2">
                    <Button id="vehicle-create-invoice" variant="outline" className="w-full" onClick={() => setInvoiceOpen(true)} disabled={pending || !v.customerId || v.salePrice == null}>
                      <FileText className="w-4 h-4 mr-1" />{isAgencyDeal ? "Review processing-fee invoice" : "Review sale invoice"}
                    </Button>
                    <div className="flex gap-2">
                      <Input id="vehicle-attach-invoice" placeholder="Existing invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                      <Button variant="outline" onClick={attachInvoice} disabled={pending || !invoiceNumber.trim()}>Attach</Button>
                    </div>
                    {(!v.customerId || v.salePrice == null) && <p className="text-xs text-slate-400">Assign a customer and agreed sale price to create an invoice.</p>}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No invoice linked.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent>
            {editing ? (
              <Textarea
                id="vd-notes"
                rows={3}
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Condition, shipping updates, agreed extras…"
              />
            ) : v.notes ? (
              <p className="whitespace-pre-wrap text-sm text-slate-600">{v.notes}</p>
            ) : (
              <p className="text-sm text-slate-400">No notes recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{isAgencyDeal ? "Review processing-fee invoice" : "Review sale invoice"}</DialogTitle>
            <DialogDescription>
              {v.stockNumber} · {v.make} {v.model}{v.customer?.name ? " · " + v.customer.name : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <VehicleDealPreview currency={invoiceCurrency} agreedPrice={Number(v.salePrice || 0)}
              paid={Number(v.summary.paid || 0) * saleRate} schedule={v.openSchedule ?? []}
              exchangeRate={saleRate} costs={isAgencyDeal ? invoiceCosts : undefined}
              processingFee={isAgencyDeal ? processingFee : undefined}
              interest={agreedInterest(accountData?.agreement)} adminFee={Number(accountData?.agreement?.adminFee ?? 0)}
              invoice={{ subtotal: invoiceSubtotal, tax: invoiceTax, total: invoiceTotal, kind: isAgencyDeal ? "Processing-fee invoice" : "Sales invoice" }}
            />
            <div className={isAgencyDeal ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
              <div className="space-y-1.5">
                <Label htmlFor="vehicle-invoice-due">Due date</Label>
                <Input
                  id="vehicle-invoice-due"
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                />
              </div>
              {!isAgencyDeal && (
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-invoice-tax">Tax type</Label>
                  <Select
                    value={invoiceForm.taxTypeId}
                    onValueChange={(x) => setInvoiceForm({ ...invoiceForm, taxTypeId: x })}
                  >
                    <SelectTrigger id="vehicle-invoice-tax"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No tax</SelectItem>
                      {invoiceTaxTypes.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name} · {Number(t.rate)}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-invoice-notes">Invoice notes</Label>
              <Textarea
                id="vehicle-invoice-notes"
                rows={3}
                placeholder="Optional. Defaults to the stock number, description and VIN."
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
              />
            </div>
            <p className="text-xs text-slate-400">
              {isAgencyDeal
                ? "Set the processing fee on the Sales Agreement before invoicing. The fee is booked to deferred income and recognised on collection or handover; customer-funded costs are never added to invoice VAT."
                : `The invoice is raised in ${invoiceCurrency} and goes through the normal sales VAT path, so it appears on the VAT return.`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button id="vehicle-invoice-create-submit" onClick={createInvoice} disabled={pending || invoiceTotal <= 0}>
              <FileText className="w-4 h-4 mr-1" />{isAgencyDeal && processingFee <= 0 ? "Set processing fee first" : "Create invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Read({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm ${mono ? "font-mono" : ""} ${
          strong ? "font-semibold text-slate-900" : "font-medium text-slate-700"
        }`}
      >
        {value !== null && value !== undefined && value !== "" ? value : "—"}
      </p>
    </div>
  );
}

// ── Costs ────────────────────────────────────────────────────────────────────

const costStatusTone: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-700",
  disputed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const emptyCost = {
  category: "purchase",
  description: "",
  amount: "",
  currency: "USD",
  exchangeRate: "1",
  estimatedAmount: "",
  customerChargeAmount: "",
  includeInCustomerStatement: true,
  payee: "",
  reference: "",
  costDate: format(new Date(), "yyyy-MM-dd"),
  dueDate: "",
  paidAt: format(new Date(), "yyyy-MM-dd"),
  status: "paid",
  supplierId: "none",
  settlementMethod: "cash",
  bankAccountId: "none",
  inputVatAmount: "0",
  inputVatTypeId: "none",
};

function costBody(form: typeof emptyCost) {
  return {
    category: form.category,
    description: form.description || null,
    amount: String(form.amount),
    currency: form.currency || "USD",
    exchangeRate: String(form.exchangeRate || 1),
    // All three cost-sheet values are stated in the company's base currency.
    estimatedBaseAmount: String(form.estimatedAmount || 0),
    customerChargeBaseAmount: String(form.customerChargeAmount || 0),
    includeInCustomerStatement: form.includeInCustomerStatement,
    payee: form.payee || null,
    reference: form.reference || null,
    costDate: form.costDate || null,
    dueDate: form.dueDate || null,
    paidAt: form.paidAt || null,
    status: form.status,
    supplierId: form.supplierId === "none" ? null : Number(form.supplierId),
    settlementMethod: form.settlementMethod,
    bankAccountId:
      form.settlementMethod === "supplier_bill" || form.bankAccountId === "none"
        ? null
        : Number(form.bankAccountId),
    inputVatAmount: Number(form.inputVatAmount || 0),
    inputVatTypeId: form.inputVatTypeId === "none" ? null : Number(form.inputVatTypeId),
  };
}

function CostsTab({ v, companyId }: { v: any; companyId: number }) {
  const { run, pending } = useSubmit(companyId);
  const { data: accountData } = useVehicleCustomerAccount(companyId, v.id);
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: bankAccounts = [] } = useBankAccounts(companyId);
  const { taxTypes } = useTaxConfig(companyId);
  const costTaxTypes = ((taxTypes.data ?? []) as any[]).filter((t) => t.isActive !== false);
  const [form, setForm] = useState({ ...emptyCost });
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 6;
  const currentPage = Math.min(page, Math.max(Math.ceil(v.costs.length / pageSize) - 1, 0));
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyCost });
  const [payFor, setPayFor] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({
    bankAccountId: "none",
    paymentDate: format(new Date(), "yyyy-MM-dd"),
    reference: "",
  });
  const costsLocked = !!v.cogsJournalEntryId;

  const needsBank = (form.settlementMethod || "cash") !== "supplier_bill";

  const add = async () => {
    if (!form.amount || costsLocked) return;
    if (needsBank && form.bankAccountId === "none") return;
    try {
      await run({ path: `/${v.id}/costs`, body: costBody(form) }, "Cost added");
      setForm({ ...emptyCost, category: form.category === "purchase" ? "shipping" : form.category });
      setAddOpen(false);
    } catch { /* useSubmit displays the error */ }
  };

  const openEdit = (c: any) => {
    setEditing(c);
    setEditForm({
      category: c.category,
      description: c.description ?? "",
      amount: String(c.amount ?? ""),
      currency: c.currency ?? "USD",
      exchangeRate: String(c.exchangeRate ?? "1"),
      estimatedAmount: String(c.estimatedBaseAmount ?? c.baseAmount ?? ""),
      customerChargeAmount: String(c.customerChargeBaseAmount ?? c.baseAmount ?? ""),
      includeInCustomerStatement: c.includeInCustomerStatement !== false,
      payee: c.payee ?? "",
      reference: c.reference ?? "",
      costDate: c.costDate ?? "",
      dueDate: c.dueDate ?? "",
      paidAt: c.paidAt ?? "",
      status: c.status ?? "pending",
      supplierId: c.supplierId ? String(c.supplierId) : "none",
      settlementMethod: c.settlementMethod ?? "cash",
      bankAccountId: c.bankAccountId ? String(c.bankAccountId) : "none",
      inputVatAmount: String(c.inputVatAmount ?? "0"),
      inputVatTypeId: c.inputVatTypeId ? String(c.inputVatTypeId) : "none",
    });
  };

  const saveEdit = async () => {
    if (!editing || !editForm.amount) return;
    await run({ path: `/${v.id}/costs/${editing.id}`, method: "PATCH", body: costBody(editForm) }, "Cost updated");
    setEditing(null);
  };

  const postCost = (c: any) => run(
    { path: `/${v.id}/costs/${c.id}/post`, method: "POST" },
    c.settlementMethod === "supplier_bill" ? "Supplier bill posted" : "Cost posted to inventory",
  );

  const openPay = (c: any) => {
    setPayFor(c);
    setPayForm({
      bankAccountId: c.bankAccountId ? String(c.bankAccountId) : (bankAccounts[0] ? String(bankAccounts[0].id) : "none"),
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      reference: c.reference ?? "",
    });
  };

  const payBill = async () => {
    if (!payFor || payForm.bankAccountId === "none") return;
    await run(
      {
        path: `/${v.id}/costs/${payFor.id}/pay`,
        method: "POST",
        body: {
          bankAccountId: Number(payForm.bankAccountId),
          paymentDate: payForm.paymentDate || undefined,
          reference: payForm.reference || null,
        },
      },
      "Supplier bill paid",
    );
    setPayFor(null);
  };

  const reverseCost = (c: any) => {
    const reason = window.prompt("Reason for reversing this cost (optional):") ?? "";
    return run(
      { path: `/${v.id}/costs/${c.id}/reverse`, method: "POST", body: { reason: reason || null } },
      "Cost reversed",
    );
  };

  const byCat: Record<string, number> = v.summary.costsByCategory || {};
  const supplierName = (id: any) => suppliers.find((s: any) => Number(s.id) === Number(id))?.name;
  const bankName = (id: any) => bankAccounts.find((a: any) => Number(a.id) === Number(id))?.name;

  return (
    <>
      <div className="space-y-4">
        <div>
          <Dialog open={addOpen} onOpenChange={open => { if (!pending) setAddOpen(open); }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader><DialogTitle>Add cost</DialogTitle><DialogDescription>Record a vehicle purchase or import expense.</DialogDescription></DialogHeader>
              <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(x) => setForm({ ...form, category: x })} disabled={costsLocked}>
                  <SelectTrigger id="cost-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{COST_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2"><Label>Description</Label><Input id="cost-description" disabled={costsLocked} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Amount</Label><Input id="cost-amount" type="number" step="0.01" disabled={costsLocked} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input id="cost-currency" disabled={costsLocked} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase(), exchangeRate: e.target.value.toUpperCase() === "USD" ? "1" : form.exchangeRate })} /></div>
              <div className="space-y-1.5"><Label>USD per 1 {form.currency || "unit"}</Label><Input id="cost-rate" type="number" step="0.000001" disabled={costsLocked || form.currency === "USD"} value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Estimated cost (USD)</Label><Input id="cost-estimate" type="number" step="0.01" min="0" disabled={costsLocked} value={form.estimatedAmount} onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Customer charge (USD)</Label><Input id="cost-charge" type="number" step="0.01" min="0" disabled={costsLocked} value={form.customerChargeAmount} onChange={(e) => setForm({ ...form, customerChargeAmount: e.target.value })} /></div>
              <div className="flex items-center gap-2 pb-1"><Switch id="cost-statement" checked={form.includeInCustomerStatement} onCheckedChange={(v) => setForm({ ...form, includeInCustomerStatement: v })} disabled={costsLocked} /><Label htmlFor="cost-statement" className="text-xs">On customer statement</Label></div>
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={form.status} onValueChange={(x) => setForm({ ...form, status: x })} disabled={costsLocked}>
                  <SelectTrigger id="cost-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{COST_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Cost date</Label><Input id="cost-date" type="date" disabled={costsLocked} value={form.costDate} onChange={(e) => setForm({ ...form, costDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Due date</Label><Input id="cost-due" type="date" disabled={costsLocked} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Settlement</Label>
                <Select value={form.settlementMethod} onValueChange={(x) => setForm({ ...form, settlementMethod: x })} disabled={costsLocked}>
                  <SelectTrigger id="cost-settlement"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="supplier_bill">Supplier bill (accounts payable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {needsBank && (
                <div className="space-y-1.5 col-span-2"><Label>Paid from bank / cash account</Label>
                  <Select value={form.bankAccountId} onValueChange={(x) => setForm({ ...form, bankAccountId: x })} disabled={costsLocked}>
                    <SelectTrigger id="cost-bank"><SelectValue placeholder="Choose account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose account</SelectItem>
                      {bankAccounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label>Recoverable input VAT (USD)</Label><Input id="cost-vat" type="number" step="0.01" min="0" disabled={costsLocked} value={form.inputVatAmount} onChange={(e) => setForm({ ...form, inputVatAmount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>VAT tax type</Label>
                <Select value={form.inputVatTypeId} onValueChange={(x) => setForm({ ...form, inputVatTypeId: x })} disabled={costsLocked}>
                  <SelectTrigger id="cost-vat-type"><SelectValue placeholder="No VAT" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No VAT</SelectItem>
                    {costTaxTypes.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name} · {Number(t.rate)}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2"><Label>Supplier</Label>
                <Select value={form.supplierId} onValueChange={(x) => setForm({ ...form, supplierId: x })} disabled={costsLocked}>
                  <SelectTrigger id="cost-supplier"><SelectValue placeholder="No supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No supplier</SelectItem>
                    {suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2"><Label>Paid to</Label><Input id="cost-payee" disabled={costsLocked} value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Reference</Label><Input id="cost-reference" disabled={costsLocked} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} disabled={pending}>Cancel</Button>
                <Button id="cost-add" onClick={add} disabled={pending || costsLocked || !(Number(form.amount) > 0) || (needsBank && form.bankAccountId === "none")}>{pending ? "Saving…" : "Add cost"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Card className="border-slate-200/80">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div><CardTitle>Cost sheet</CardTitle>{costsLocked && <p className="mt-1 text-sm text-slate-500">Cost of sales has been posted. Costs are locked.</p>}</div>
              {!costsLocked && <Button onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" />Add cost</Button>}
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cost</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-right">Actual cost</TableHead><TableHead className="hidden text-right md:table-cell">Customer charge</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.costs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No costs yet. Start with the purchase price.</TableCell></TableRow>
                ) : v.costs.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{costLabel(c.category)}</div>
                      <p className="text-xs text-slate-600">{[c.description, c.supplierId ? supplierName(c.supplierId) : c.payee].filter(Boolean).join(" · ")}</p>
                      <details className="mt-1 space-y-1 text-xs text-slate-500">
                        <summary className="cursor-pointer">Cost details</summary>
                        <div className="sm:hidden">{costStatusLabel(c.status ?? "pending")}</div>
                        <div className="md:hidden">Customer charge {fmtMoney(c.customerChargeBaseAmount)}</div>
                        <div>{[c.costDate, c.reference].filter(Boolean).join(" · ")}</div>
                        <div>Estimate {fmtMoney(c.estimatedBaseAmount)} · Original amount {fmtMoney(c.amount, c.currency)}</div>
                      {c.source && c.source !== "manual" && <div className="text-[10px] uppercase tracking-wide text-slate-400">auto · {c.source}</div>}
                      {c.dueDate && <div className="text-[10px] text-slate-400">Due {c.dueDate}</div>}
                      <div className="text-[10px] text-slate-400">
                        {c.settlementMethod === "supplier_bill" ? "Supplier bill" : c.settlementMethod === "bank_transfer" ? "Bank transfer" : "Cash"}
                        {c.bankAccountId ? ` · ${bankName(c.bankAccountId) ?? "bank"}` : ""}
                        {Number(c.inputVatAmount || 0) > 0 ? ` · input VAT ${fmtMoney(c.inputVatAmount)}` : ""}
                      </div>
                      {c.costJournalEntryId && (
                        <div className="mt-0.5 text-[10px] font-medium text-emerald-600">
                          Posted to inventory · journal #{c.costJournalEntryId}
                        </div>
                      )}
                      {c.supplierInvoiceId && (
                        <div className="text-[10px] font-medium text-sky-600">
                          Supplier bill #{c.supplierInvoiceId}{c.paymentJournalEntryId ? " · paid" : " · awaiting payment"}
                        </div>
                      )}
                      {c.includeInCustomerStatement === false && <div className="text-[10px] text-slate-400">Excluded from customer statement</div>}
                      </details>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge className={`${costStatusTone[c.status ?? "pending"] ?? ""} border-0 text-[10px]`}>{costStatusLabel(c.status ?? "pending")}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(c.baseAmount)}</TableCell>
                    <TableCell className="hidden text-right text-xs text-sky-700 md:table-cell">{fmtMoney(c.customerChargeBaseAmount)}</TableCell>
                    <TableCell className="text-right">
                      {!costsLocked && <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={"Actions for " + costLabel(c.category)}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEdit(c)}>Edit cost</DropdownMenuItem>
                          {!c.costJournalEntryId && c.status !== "cancelled" && c.status !== "disputed" && (c.status === "paid" || c.settlementMethod === "supplier_bill") &&
                            <DropdownMenuItem onSelect={() => { if (confirm("Post this cost to the ledger?")) void postCost(c); }}>{c.settlementMethod === "supplier_bill" ? "Post supplier bill" : "Post and pay cost"}</DropdownMenuItem>}
                          {c.supplierInvoiceId && !c.paymentJournalEntryId && <DropdownMenuItem onSelect={() => openPay(c)}>Pay supplier bill</DropdownMenuItem>}
                          {(c.costJournalEntryId || c.paymentJournalEntryId || c.supplierInvoiceId) &&
                            <DropdownMenuItem onSelect={() => { if (confirm("Reverse the journal entries for this cost?")) void reverseCost(c); }}>Reverse cost posting</DropdownMenuItem>}
                          <DropdownMenuItem className="text-rose-700" onSelect={() => { if (confirm("Delete this cost line?")) void run({ path: "/" + v.id + "/costs/" + c.id, method: "DELETE" }); }}>Delete cost</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {v.costs.length > pageSize && <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
              <span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, v.costs.length)} of {v.costs.length} costs</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(currentPage + 1)} disabled={(currentPage + 1) * pageSize >= v.costs.length}>Next</Button>
              </div>
            </div>}
          </Card>
        </div>

        <Card className="border-slate-200/80 h-fit">
          <details>
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Landed cost breakdown · {fmtMoney(v.summary.landedCost)}</summary>
          <CardContent className="space-y-2 text-sm">
            {COST_CATEGORIES.map((c) => (
              <div key={c.value} className="flex justify-between">
                <span className="text-slate-600">{c.label}</span>
                <span className={byCat[c.value] ? "font-medium" : "text-slate-300"}>{fmtMoney(byCat[c.value] || 0)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 font-bold"><span>Actual landed cost</span><span>{fmtMoney(v.summary.landedCost)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500">Customer charge total</span><span className="text-sky-700">{fmtMoney(accountData?.totals.costSheetTotal ?? 0)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500">Pending costs</span><span className="text-amber-700">{fmtMoney(v.summary.pendingCosts || 0)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500">Paid costs</span><span className="text-emerald-700">{fmtMoney(v.summary.paidCosts || 0)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">{v.summary.isProjected ? "Target price" : "Selling price"}</span><span>{fmtMoney(v.summary.sellingPrice)}</span></div>
            <div className={`flex justify-between font-bold ${(v.summary.profit ?? 0) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              <span>Profit ({v.summary.marginPercent}%)</span><span>{fmtMoney(v.summary.profit)}</span>
            </div>
          </CardContent>
          </details>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit cost line</DialogTitle>
            <DialogDescription>Correct the amount, supplier, status or dates. USD value is recalculated automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Category</Label>
              <Select value={editForm.category} onValueChange={(x) => setEditForm({ ...editForm, category: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COST_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Description</Label><Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Currency</Label><Input value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value.toUpperCase(), exchangeRate: e.target.value.toUpperCase() === "USD" ? "1" : editForm.exchangeRate })} /></div>
            <div className="space-y-1.5"><Label>USD per 1 {editForm.currency || "unit"}</Label><Input type="number" step="0.000001" disabled={editForm.currency === "USD"} value={editForm.exchangeRate} onChange={(e) => setEditForm({ ...editForm, exchangeRate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Estimated cost (USD)</Label><Input type="number" step="0.01" min="0" value={editForm.estimatedAmount} onChange={(e) => setEditForm({ ...editForm, estimatedAmount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Customer charge (USD)</Label><Input type="number" step="0.01" min="0" value={editForm.customerChargeAmount} onChange={(e) => setEditForm({ ...editForm, customerChargeAmount: e.target.value })} /></div>
            <div className="flex items-center gap-2 pb-1"><Switch checked={editForm.includeInCustomerStatement} onCheckedChange={(v) => setEditForm({ ...editForm, includeInCustomerStatement: v })} /><Label className="text-xs">On customer statement</Label></div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select value={editForm.status} onValueChange={(x) => setEditForm({ ...editForm, status: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COST_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Cost date</Label><Input type="date" value={editForm.costDate} onChange={(e) => setEditForm({ ...editForm, costDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Paid date</Label><Input type="date" disabled={editForm.status !== "paid"} value={editForm.paidAt} onChange={(e) => setEditForm({ ...editForm, paidAt: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Supplier</Label>
              <Select value={editForm.supplierId} onValueChange={(x) => setEditForm({ ...editForm, supplierId: x })}>
                <SelectTrigger><SelectValue placeholder="No supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Paid to</Label><Input value={editForm.payee} onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Reference</Label><Input value={editForm.reference} onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Settlement</Label>
              <Select value={editForm.settlementMethod} onValueChange={(x) => setEditForm({ ...editForm, settlementMethod: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="supplier_bill">Supplier bill (accounts payable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.settlementMethod !== "supplier_bill" && (
              <div className="space-y-1.5 col-span-2"><Label>Paid from bank / cash account</Label>
                <Select value={editForm.bankAccountId} onValueChange={(x) => setEditForm({ ...editForm, bankAccountId: x })}>
                  <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose account</SelectItem>
                    {bankAccounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5"><Label>Recoverable input VAT (USD)</Label><Input type="number" step="0.01" min="0" value={editForm.inputVatAmount} onChange={(e) => setEditForm({ ...editForm, inputVatAmount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>VAT tax type</Label>
              <Select value={editForm.inputVatTypeId} onValueChange={(x) => setEditForm({ ...editForm, inputVatTypeId: x })}>
                <SelectTrigger><SelectValue placeholder="No VAT" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No VAT</SelectItem>
                  {costTaxTypes.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name} · {Number(t.rate)}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={pending || !editForm.amount}>Save cost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payFor} onOpenChange={(open) => !open && setPayFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay supplier bill</DialogTitle>
            <DialogDescription>
              Clears accounts payable for {payFor ? fmtMoney(payFor.baseAmount) : ""} from the chosen account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Paid from bank / cash account</Label>
              <Select value={payForm.bankAccountId} onValueChange={(x) => setPayForm({ ...payForm, bankAccountId: x })}>
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose account</SelectItem>
                  {bankAccounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment date</Label>
                <Input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button onClick={payBill} disabled={pending || payForm.bankAccountId === "none"}>Pay bill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Import tracking ──────────────────────────────────────────────────────────

function customerMessage(v: any, stage: string, notes: string) {
  return `Hello ${v.customer?.name ?? ""}, an update on your ${v.year ?? ""} ${v.make} ${v.model} (${v.stockNumber}): it is now *${stageLabel(stage)}*.${notes ? ` ${notes}` : ""}${v.eta ? ` ETA: ${v.eta}.` : ""}`.replace(/\s+/g, " ").trim();
}

function waLink(phone: string | null | undefined, text: string) {
  const digits = (phone || "").replace(/\D/g, "").replace(/^0/, "263");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

function HandoverDialog({ v, open, onOpenChange, pending, submit }: {
  v: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  submit: (earlyHandoverReason?: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const schedule = (v.openSchedule ?? []) as NonNullable<Vehicle["openSchedule"]>;
  const rate = Number(v.saleExchangeRate) || 1;
  const stockInvoice = v.accountingModel === "principal" ? v.invoice : null;
  const invoiceRate = Number(stockInvoice?.exchangeRate) || rate;
  const total = Math.max(Number(v.salePrice || 0), schedule.reduce((sum, line) => sum + line.amount, 0),
    Number(stockInvoice?.total || 0) * rate / invoiceRate);
  const paid = Math.max(Number(v.summary.paid || 0) * rate, Number(stockInvoice?.paidAmount || 0) * rate / invoiceRate);
  const balance = Math.round((total - paid) * 100) / 100;
  const early = balance > 0;
  useEffect(() => { if (!open) setReason(""); }, [open]);

  const confirm = async () => {
    try {
      await submit(early ? reason.trim() : undefined);
      onOpenChange(false);
    } catch { /* useSubmit displays the error */ }
  };
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Confirm vehicle handover</DialogTitle>
        <DialogDescription>{early
          ? `The customer still owes ${fmtMoney(balance, v.saleCurrency || "USD")}. Record payment first, or give a reason for releasing the vehicle before full payment.`
          : "This marks the vehicle as delivered."}</DialogDescription>
      </DialogHeader>
      {early && <div><Label htmlFor="early-handover-reason">Reason for early handover</Label>
        <Textarea id="early-handover-reason" rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
      </div>}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
        <Button onClick={confirm} disabled={pending || (early && !reason.trim())}>{pending ? "Saving…" : early ? "Confirm early handover" : "Complete handover"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function TrackingTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { run, pending } = useSubmit(companyId);
  const currentIdx = VEHICLE_STAGES.findIndex((s) => s.value === v.stage);
  const [stage, setStage] = useState(VEHICLE_STAGES[Math.min(currentIdx + 1, VEHICLE_STAGES.length - 1)].value as string);
  const [notes, setNotes] = useState("");
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [eventDate, setEventDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notify, setNotify] = useState(!!v.customerId);
  useEffect(() => setStage(VEHICLE_STAGES[Math.min(currentIdx + 1, VEHICLE_STAGES.length - 1)].value), [v.stage]);

  const submit = async (earlyHandoverReason?: string) => {
    // Open WhatsApp inside the click handler (before any await) or popup blockers eat it.
    const link = notify && v.customer?.phone ? waLink(v.customer.phone, customerMessage(v, stage, notes)) : null;
    if (link && stage !== "delivered") window.open(link, "_blank", "noopener");
    const event = await run({ path: `/${v.id}/stage`, body: { stage, notes: notes || null, eventDate, notifyCustomer: notify, earlyHandoverReason } }, `Moved to ${stageLabel(stage)}`);
    if (link && stage === "delivered") {
      window.open(link, "_blank", "noopener");
    }
    if (link) await run({ path: `/${v.id}/stage/${event.id}/notified`, body: { via: "whatsapp" } });
    setNotes("");
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 border-slate-200/80">
        <CardHeader><CardTitle className="text-base">Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
            <div><p className="text-sm text-slate-600">Current stage</p><p className="font-semibold">{stageLabel(v.stage)}</p></div>
            {currentIdx >= 0 && currentIdx + 1 < VEHICLE_STAGES.length && <div><p className="text-sm text-slate-600">Next milestone</p><p className="font-medium">{VEHICLE_STAGES[currentIdx + 1].label}</p></div>}
            {v.eta && v.status !== "delivered" && <div><p className="text-sm text-slate-600">Estimated arrival</p><p className="font-medium">{v.eta}</p></div>}
          </div>
          <h3 className="mb-3 font-medium">Tracking history</h3>
          {v.stages.length === 0 && <p className="text-sm text-slate-600">No tracking updates recorded.</p>}
          <ol className="relative border-l border-slate-200 ml-3 space-y-5">
            {[...v.stages].reverse().map((e: any) => (
              <li key={e.id} className="ml-5">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`${stageTone[e.stage] ?? ""} border-0`}>{stageLabel(e.stage)}</Badge>
                  <span className="text-xs text-slate-500">{format(new Date(e.eventDate), "d MMM yyyy")}</span>
                  {e.notifiedAt ? (
                    <span className="text-xs text-emerald-600">Customer notified via {e.notifiedVia}</span>
                  ) : e.notifyCustomer ? (
                    <span className="text-xs text-amber-600">Customer update pending</span>
                  ) : null}
                </div>
                {e.notes && <p className="text-sm text-slate-600 mt-1">{e.notes}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {editable && !["delivered", "cancelled"].includes(v.status) && (
        <Card className="border-slate-200/80 h-fit">
          <CardHeader><CardTitle className="text-base">Update stage</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger id="stage-select"><SelectValue /></SelectTrigger>
              <SelectContent>{VEHICLE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input id="stage-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            <Textarea id="stage-notes" placeholder="e.g. Vessel MSC Aurora departed Yokohama" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex items-center justify-between">
              <Label htmlFor="stage-notify" className="text-sm">Update customer on WhatsApp</Label>
              <Switch id="stage-notify" checked={notify} disabled={!v.customer?.phone} onCheckedChange={setNotify} />
            </div>
            {!v.customer?.phone && <p className="text-xs text-slate-400">Assign a customer with a phone number to send updates.</p>}
            {notify && v.customer?.phone && (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 flex gap-2">
                <MessageCircle className="w-4 h-4 shrink-0" />{customerMessage(v, stage, notes)}
              </div>
            )}
            <Button id="stage-submit" className="w-full" onClick={() => stage === "delivered" ? setHandoverOpen(true) : void submit().catch(() => undefined)} disabled={pending}>{stage === "delivered" ? "Review handover" : "Save stage"}</Button>
          </CardContent>
        </Card>
      )}
      {editable && <HandoverDialog v={v} open={handoverOpen} onOpenChange={setHandoverOpen} pending={pending} submit={submit} />}
    </div>
  );
}

// ── Payments & schedule ──────────────────────────────────────────────────────

function PaymentsTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { run, pending } = useSubmit(companyId);
  const { data: bankAccounts = [] } = useBankAccounts(companyId);
  const currency = v.saleCurrency || "USD";
  const [pay, setPay] = useState({ amount: "", currency, exchangeRate: String(v.saleExchangeRate || 1), paymentMethod: "Transfer", bankAccountId: "none", reference: "", paymentDate: format(new Date(), "yyyy-MM-dd") });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const openLines = ((v.openSchedule ?? []) as NonNullable<Vehicle["openSchedule"]>).filter(line => line.open > 0.004);
  const record = async () => {
    try {
      await run({ path: "/" + v.id + "/payments", body: { ...pay, bankAccountId: Number(pay.bankAccountId), reference: pay.reference || null } }, "Payment recorded");
      setPay(current => ({ ...current, amount: "", reference: "" }));
      setPaymentOpen(false);
    } catch { /* useSubmit displays the error */ }
  };
  return <div className="space-y-4">
    <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
      <CardTitle>Customer payments</CardTitle>
      {editable && <Button onClick={() => setPaymentOpen(true)} disabled={!v.customerId}>Record payment</Button>}
    </CardHeader><CardContent>
      {editable && !v.customerId && <p className="mb-3 text-sm text-slate-600">Assign a customer under Vehicle & invoice before recording payments.</p>}
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Ref</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {v.payments.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-500">No payments yet.</TableCell></TableRow>
              ) : v.payments.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{format(new Date(p.paymentDate), "d MMM yyyy")}</TableCell>
                  <TableCell>{p.paymentMethod}</TableCell>
                  <TableCell className="text-xs text-slate-500">{p.reference || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {p.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
    </CardContent></Card>
    {editable && v.customerId && <Dialog open={paymentOpen} onOpenChange={open => { if (!pending) setPaymentOpen(open); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Record customer payment</DialogTitle><DialogDescription>Enter the deposit or instalment received.</DialogDescription></DialogHeader>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 items-end">
      <div className="space-y-1.5"><Label>Amount</Label><Input id="pay-amount" type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Date</Label><Input id="pay-date" type="date" value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} /></div>
      <div className="space-y-1.5">
        <Label>Method</Label>
        <Select value={pay.paymentMethod} onValueChange={(x) => setPay({ ...pay, paymentMethod: x })}>
          <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
          <SelectContent>{["Transfer", "Cash", "Card", "Ecocash", "Cheque"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Bank / cash account</Label>
        <Select value={pay.bankAccountId} onValueChange={(x) => setPay({ ...pay, bankAccountId: x })}>
          <SelectTrigger id="pay-bank"><SelectValue placeholder="Choose account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Choose account</SelectItem>
            {bankAccounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Reference</Label><Input id="pay-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Currency</Label><Input id="pay-currency" value={pay.currency} onChange={(e) => setPay({ ...pay, currency: e.target.value.toUpperCase(), exchangeRate: e.target.value.toUpperCase() === "USD" ? "1" : pay.exchangeRate })} /></div>
      <div className="space-y-1.5"><Label>{pay.currency} per 1 USD</Label><Input id="pay-rate" type="number" step="0.000001" disabled={pay.currency === "USD"} value={pay.exchangeRate} onChange={(e) => setPay({ ...pay, exchangeRate: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={pending}>Cancel</Button>
<Button id="pay-submit" onClick={record} disabled={pending || !(Number(pay.amount) > 0) || !(Number(pay.exchangeRate) > 0) || pay.bankAccountId === "none"}>Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
    {openLines.length > 0 && <Card><CardHeader><CardTitle>Unpaid instalments</CardTitle></CardHeader><CardContent className="space-y-3">
      <PaymentSchedule lines={openLines} currency={currency} />
      {editable && <Button variant="outline" onClick={() => setReminderOpen(true)}><Bell className="mr-1 h-4 w-4" />Send payment reminder</Button>}
    </CardContent></Card>}
    <ReminderHistory reminders={v.reminders ?? []} />
    {editable && <ReminderDialog v={v} companyId={companyId} lines={openLines} open={reminderOpen} onOpenChange={setReminderOpen} />}
  </div>;
}

function defaultReminder(v: any, lines: any[]) {
  const description = `${v.year ?? ""} ${v.make} ${v.model}`.replace(/\s+/g, " ").trim();
  const greeting = v.customer?.name ? `Hi ${v.customer.name},` : "Hello,";
  const detail = lines.map((l) => `${l.type} of ${fmtMoney(l.open)} due ${l.dueDate}`).join("; ");
  const amount = lines.reduce((s, l) => s + Number(l.open || 0), 0);
  return `${greeting} this is a friendly payment reminder for your ${description} (Stock ${v.stockNumber}). ${detail}. Total outstanding: ${fmtMoney(amount)}. Please contact us to arrange payment.`;
}

function ReminderDialog({
  v,
  companyId,
  lines,
  open,
  onOpenChange,
}: {
  v: any;
  companyId: number;
  lines: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run, pending } = useSubmit(companyId);
  const { toast } = useToast();
  const [channel, setChannel] = useState("whatsapp");
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(lines.map((l) => l.id));
    setChannel(v.customer?.phone ? "whatsapp" : "email");
    setMessage(defaultReminder(v, lines));
    // Only reset when the dialog opens; line/vehicle objects are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = lines.filter((l) => selected.includes(l.id));

  const toggle = (id: number) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    setMessage(defaultReminder(v, lines.filter((l) => next.includes(l.id))));
  };

  const send = async () => {
    if (!chosen.length) return toast({ title: "Select at least one due line", variant: "destructive" });
    try {
      if (channel === "whatsapp") {
        const link = waLink(v.customer?.phone, message);
        if (!link) return toast({ title: "Customer has no WhatsApp phone number", variant: "destructive" });
        window.open(link, "_blank", "noopener");
        await run({ path: `/${v.id}/reminders`, body: { channel, scheduleIds: selected, message } }, "Reminder logged");
      } else {
        const result = await run({ path: `/${v.id}/reminders`, body: { channel, scheduleIds: selected, message } }, "Reminder recorded");
        if (result?.reminder?.status !== "sent" && result?.mailtoUrl) window.location.href = result.mailtoUrl;
        else if (result?.reminder?.status === "sent") toast({ title: "Reminder email sent" });
      }
      onOpenChange(false);
    } catch {
      // useSubmit has already shown the failure toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send payment reminder</DialogTitle>
          <DialogDescription>Choose the unpaid schedule lines and how to reach {v.customer?.name || "the customer"}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {lines.map((l) => (
              <label key={l.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />
                <span className="flex-1 capitalize">{l.type} · due {l.dueDate}</span>
                <Badge className={`border-0 ${l.state === "overdue" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{l.state}</Badge>
                <span className="font-medium">{fmtMoney(l.open)}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp" disabled={!v.customer?.phone}>WhatsApp</SelectItem>
                  <SelectItem value="email" disabled={!v.customer?.email}>Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Total selected</Label>
              <div className="h-10 flex items-center font-semibold">{fmtMoney(chosen.reduce((s, l) => s + Number(l.open || 0), 0))}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={pending || !chosen.length}>
            {channel === "whatsapp" ? <><MessageCircle className="w-4 h-4 mr-1" />Open WhatsApp</> : <><Mail className="w-4 h-4 mr-1" />Send email</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderHistory({ reminders }: { reminders: any[] }) {
  return (
    <Card className="border-slate-200/80">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4 text-slate-400" />Reminder history</CardTitle></CardHeader>
      <CardContent>
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-500">No reminders sent yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {reminders.map((r) => (
              <div key={r.id} className="py-2.5 flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-0 bg-slate-100 text-slate-700 capitalize">{r.channel}</Badge>
                <span className="text-slate-600">{format(new Date(r.sentAt), "d MMM yyyy HH:mm")}</span>
                <span className="text-slate-500">{r.amount ? fmtMoney(r.amount) : ""}</span>
                <Badge className={`border-0 ml-auto ${r.status === "sent" ? "bg-emerald-100 text-emerald-700" : r.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</Badge>
                {r.error && <span className="w-full text-xs text-rose-600">{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
