import { Layout } from "@/components/layout";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { VehicleAgreementPDF } from "@/components/vehicles/agreement-pdf";
import { VehiclePaymentReceiptPDF } from "@/components/vehicles/payment-receipt-pdf";
import { VehicleAccountStatementPDF } from "@/components/vehicles/vehicle-account-statement-pdf";
import { InvoicePDF } from "@/components/invoices/pdf-document";
import { addDays, format } from "date-fns";
import { ArrowLeft, Bell, Check, CircleDot, Download, Eye, FileText, Landmark, Lock, Mail, MessageCircle, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import {
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

  if (isLoading) return <Layout><PageSkeleton stats={4} /></Layout>;
  if (error || !v) return <Layout><div className="p-8 text-slate-600">{(error as Error)?.message || "Vehicle not found."}</div></Layout>;

  const s = v.summary;
  const showCosts = can("vehicles.costs");

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <Link href="/vehicles" className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center"><ArrowLeft className="w-4 h-4 mr-1" />Vehicles</Link>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{v.year} {v.make} {v.model}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-slate-500">
              <span className="font-mono">{v.stockNumber}</span>
              {v.vin && <span>· VIN {v.vin}</span>}
              <Badge className={`${stageTone[v.stage] ?? ""} border-0`}>{stageLabel(v.stage)}</Badge>
              <Badge className={`${statusTone[v.status] ?? ""} border-0 capitalize`}>{v.status}</Badge>
              <Badge variant="outline" className="capitalize">{(v.accountingModel || s.accountingModel || "agent")} accounting</Badge>
            </div>
          </div>
        </div>

        <div className={`grid grid-cols-2 ${showCosts ? "lg:grid-cols-5" : "lg:grid-cols-3"} gap-4`}>
          {showCosts && <Kpi label="Purchase price" value={fmtMoney(s.purchasePrice)} />}
          {showCosts && <Kpi label="Landed cost" value={fmtMoney(s.landedCost)} hint={`${fmtMoney(s.importCosts)} import costs`} />}
          <Kpi label={s.isProjected ? "Target price" : "Selling price"} value={fmtMoney(s.sellingPrice)} hint={s.isProjected ? "Not sold yet" : undefined} />
          {showCosts && (
            <Kpi
              label={(v.accountingModel || s.accountingModel) === "agent"
                ? "Processing fee revenue"
                : s.isProjected ? "Projected profit" : "Profit"}
              value={fmtMoney((v.accountingModel || s.accountingModel) === "agent" ? (s.processingFee ?? 0) : s.profit)}
              hint={`${s.marginPercent}% margin`}
              tone={(s.profit ?? 0) < 0 ? "text-rose-600" : "text-emerald-600"}
            />
          )}
          <Kpi label="Balance due" value={s.balance > 0 ? fmtMoney(s.balance) : "—"} hint={`${fmtMoney(s.paid)} paid`} tone={s.balance > 0 ? "text-amber-600" : undefined} />
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {showCosts && <TabsTrigger value="costs">Cost Sheet ({v.costs.length})</TabsTrigger>}
            <TabsTrigger value="customer-account">Customer Account</TabsTrigger>
            <TabsTrigger value="suppliers">Supplier Settlements</TabsTrigger>
            <TabsTrigger value="tracking">Import Tracking</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><div className="space-y-6"><DetailsTab v={v} companyId={companyId} editable={can("vehicles.manage")} /><AgreementTab v={v} companyId={companyId} editable={can("vehicles.manage")} /></div></TabsContent>
          {showCosts && <TabsContent value="costs"><CostsTab v={v} companyId={companyId} /></TabsContent>}
          <TabsContent value="customer-account"><CustomerAccountTab v={v} companyId={companyId} editable={can("vehicles.payments")} /></TabsContent>
          <TabsContent value="suppliers"><SupplierSettlementsTab v={v} companyId={companyId} editable={can("vehicles.payments")} /></TabsContent>
          <TabsContent value="tracking"><TrackingTab v={v} companyId={companyId} editable={can("vehicles.manage")} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab v={v} companyId={companyId} /></TabsContent>
          <TabsContent value="activity"><ActivityTab v={v} /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function AgreementTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { toast } = useToast(); const queryClient = useQueryClient(); const [saving, setSaving] = useState(false);
  const { run, pending: handoverPending } = useSubmit(companyId);
  const { data: company } = useCompany(companyId);
  const { data: accountData } = useVehicleCustomerAccount(companyId, v.id);
  const { data, isLoading } = useQuery<any>({ queryKey: ["vehicle-agreement", companyId, v.id], queryFn: async () => { const r = await apiFetch(`/api/companies/${companyId}/vehicles/${v.id}/agreement`); if (r.status === 404) return null; if (!r.ok) throw new Error("Failed to load agreement"); return r.json(); } });
  const [form, setForm] = useState({
    agreedPrice: String(v.salePrice || ""), depositAmount: "0", months: "24",
    startDate: format(new Date(), "yyyy-MM-dd"), interestType: "none", interestRate: "0",
    adminFee: "0", lateFee: "0",
    accountingModel: v.accountingModel || "agent", processingFeeAmount: "", feeRecognition: "on_handover",
  });
  useEffect(() => {
    if (data?.agreement) setForm({
      agreedPrice: String(data.agreement.agreedPrice), depositAmount: String(data.agreement.depositAmount),
      months: String(data.agreement.months), startDate: data.agreement.startDate,
      interestType: data.agreement.interestType, interestRate: String(data.agreement.interestRate),
      adminFee: String(data.agreement.adminFee), lateFee: String(data.agreement.lateFee),
      accountingModel: data.agreement.accountingModel || "agent",
      processingFeeAmount: String(data.agreement.processingFeeAmount ?? ""),
      feeRecognition: data.agreement.feeRecognition || "on_handover",
    });
  }, [data]);
  const save = async () => { if (!v.customerId) return toast({ title: "Assign a customer before creating an agreement", variant: "destructive" }); setSaving(true); try { const r = await apiFetch(`/api/companies/${companyId}/vehicles/${v.id}/agreement`, { method: "POST", body: JSON.stringify({ ...form, customerId: v.customerId, currency: v.saleCurrency || "USD", exchangeRate: Number(v.saleExchangeRate || 1) }) }); if (!r.ok) throw new Error((await r.json()).error || "Could not save agreement"); await queryClient.invalidateQueries({ queryKey: ["vehicle-agreement", companyId, v.id] }); await queryClient.invalidateQueries({ queryKey: ["vehicle", companyId, v.id] }); toast({ title: "Sales agreement saved" }); } catch (e: any) { toast({ title: "Agreement failed", description: e.message, variant: "destructive" }); } finally { setSaving(false); } };
  const handover = async () => {
    try {
      await run({ path: `/${v.id}/agreement/handover`, method: "POST", body: { notes: null } }, "Handover completed");
      await queryClient.invalidateQueries({ queryKey: ["vehicle", companyId, v.id] });
      await queryClient.invalidateQueries({ queryKey: ["vehicle-customer-account", companyId, v.id] });
    } catch { /* toast shown by useSubmit */ }
  };
  if (isLoading) return <div className="p-4 text-sm text-slate-500">Loading agreement…</div>;
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>{data?.agreement ? `${data.agreement.agreementNumber} · ${data.agreement.status}` : "Create Sales Agreement"}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-4">
      <Field label="Agreed price" value={form.agreedPrice} onChange={value => setForm({ ...form, agreedPrice: value })} /><Field label="Deposit" value={form.depositAmount} onChange={value => setForm({ ...form, depositAmount: value })} /><Field label="Months" value={form.months} onChange={value => setForm({ ...form, months: value })} /><Field label="First payment due" type="date" value={form.startDate} onChange={value => setForm({ ...form, startDate: value })} />
      {accountData && <div className="md:col-span-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">Cost sheet total <span className="font-semibold text-slate-900">{fmtMoney(accountData.totals.costSheetTotal)}</span> · cost lines are customer-funded disbursements, not Prime Imports revenue. Processing fee <span className="font-semibold text-slate-900">{fmtMoney(accountData.totals.processingFee)}</span> · recognised <span className="font-semibold text-emerald-700">{fmtMoney(accountData.totals.feeRecognised)}</span>. {data?.agreement?.handoverAt ? `Handover ${format(new Date(data.agreement.handoverAt), "dd MMM yyyy")}.` : "Handover has not been completed."}</div>}
      <div><Label>Accounting model</Label><Select value={form.accountingModel} onValueChange={value => setForm({ ...form, accountingModel: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="agent">Agent — fee is our revenue</SelectItem><SelectItem value="principal">Principal — sale less COGS</SelectItem></SelectContent></Select></div>
      <Field label="Processing fee (our revenue)" value={form.processingFeeAmount} onChange={value => setForm({ ...form, processingFeeAmount: value })} />
      <div><Label>Fee recognition</Label><Select value={form.feeRecognition} onValueChange={value => setForm({ ...form, feeRecognition: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on_handover">On handover (default)</SelectItem><SelectItem value="on_collection">On collection</SelectItem></SelectContent></Select></div>
      <div><Label>Interest method</Label><Select value={form.interestType} onValueChange={value => setForm({ ...form, interestType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No interest</SelectItem><SelectItem value="percent_pa">Reducing balance (% p.a.)</SelectItem><SelectItem value="flat_rate">Flat rate (% p.a.)</SelectItem><SelectItem value="fixed_amount">Fixed amount</SelectItem></SelectContent></Select></div>
      <Field label="Interest rate / amount" value={form.interestRate} onChange={value => setForm({ ...form, interestRate: value })} /><Field label="Admin fee (financing)" value={form.adminFee} onChange={value => setForm({ ...form, adminFee: value })} /><Field label="Late fee per instalment" value={form.lateFee} onChange={value => setForm({ ...form, lateFee: value })} />
      <div className="md:col-span-4 flex flex-wrap gap-2">{editable && <Button onClick={save} disabled={saving || (data?.agreement?.status !== undefined && data.agreement.status !== "draft")}>{saving ? "Saving…" : data?.agreement ? "Update draft terms" : "Create agreement"}</Button>}{editable && data?.agreement && data.agreement.status !== "completed" && <Button variant="outline" onClick={handover} disabled={handoverPending}>{handoverPending ? "Completing…" : "Complete handover"}</Button>}{data && company && <PDFDownloadLink document={<VehicleAgreementPDF agreement={data.agreement} vehicle={v} customer={v.customer} company={company} schedule={data.schedule} />} fileName={`Sales-Agreement-${data.agreement.agreementNumber}.pdf`}>{({ loading }) => <Button variant="outline" disabled={loading}>{loading ? "Preparing…" : "Print agreement"}</Button>}</PDFDownloadLink>}{v.invoice && company && <PDFDownloadLink document={<InvoicePDF invoice={{ ...v.invoice, vehicleCosts: v.costs }} company={company} customer={v.customer} />} fileName={`Invoice-${v.invoice.invoiceNumber}.pdf`}>{({ loading }) => <Button variant="outline" disabled={loading}>{loading ? "Preparing…" : (form.accountingModel === "agent" ? "Print fee invoice" : "Print invoice with costing")}</Button>}</PDFDownloadLink>}</div>
    </CardContent></Card>
    {data && <Card><CardHeader><CardTitle>Payment schedule</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Due date</TableHead><TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data.schedule.map((line: any) => <TableRow key={line.id}><TableCell className="capitalize">{line.type}</TableCell><TableCell>{line.dueDate}</TableCell><TableCell>{fmtMoney(Number(line.amount))}</TableCell><TableCell>{fmtMoney(Number(line.paidAmount))}</TableCell><TableCell className="capitalize">{line.status}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    {data?.payments?.length ? <Card><CardHeader><CardTitle>Receipts</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{data.payments.map((payment: any) => <VehicleReceiptLink key={payment.id} companyId={companyId} vehicleId={v.id} paymentId={payment.id} company={company} />)}</CardContent></Card> : null}
  </div>;
}
function VehicleReceiptLink({ companyId, vehicleId, paymentId, company }: any) { const { data } = useQuery<any>({ queryKey: ["vehicle-payment-receipt", companyId, vehicleId, paymentId], queryFn: async () => { const r = await apiFetch(`/api/companies/${companyId}/vehicles/${vehicleId}/payments/${paymentId}/receipt`); if (!r.ok) throw new Error("Failed to prepare receipt"); return r.json(); } }); if (!data || !company) return <Button variant="outline" size="sm" disabled>Preparing receipt…</Button>; return <PDFDownloadLink document={<VehiclePaymentReceiptPDF receipt={data} company={company} />} fileName={`${data.receiptNumber}.pdf`}>{({ loading }) => <Button variant="outline" size="sm" disabled={loading}>{loading ? "Preparing…" : `Receipt ${data.receiptNumber}`}</Button>}</PDFDownloadLink>; }
function Field({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <div><Label>{label}</Label><Input type={type} value={value} onChange={e => onChange(e.target.value)} /></div>; }

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
        <MoneyLine label="Held for suppliers" value={t.fundsHeld} tone="text-sky-700" />
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
  const [costId, setCostId] = useState("");
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("none");
  const [supplierId, setSupplierId] = useState("none");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    if (!costId && data?.costSheet?.length) {
      const first = data.costSheet.find((c: any) => c.held > 0.004) ?? data.costSheet[0];
      setCostId(String(first.id));
    }
  }, [data, costId]);
  const selected = data?.costSheet.find((c: any) => String(c.id) === costId);
  useEffect(() => { if (selected) setAmount(Math.max(selected.held, 0).toFixed(2)); }, [costId]);

  const submit = async () => {
    if (!selected) return;
    await run({
      path: `/${v.id}/third-party-payments`,
      body: {
        costId: selected.id, amount: Number(amount), currency: v.saleCurrency || "USD",
        exchangeRate: Number(v.saleExchangeRate || 1), paymentDate, reference: reference || null,
        bankAccountId: bankAccountId === "none" ? null : Number(bankAccountId),
        supplierId: supplierId === "none" ? null : Number(supplierId),
        paymentMethod: "bank_transfer",
      },
    }, "Supplier settlement recorded");
    setReference("");
  };

  if (isLoading) return <div className="p-4 text-sm text-slate-500">Loading supplier obligations…</div>;
  if (!data) return <div className="p-4 text-sm text-rose-600">Supplier settlements are only available for agency vehicles.</div>;

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Outstanding supplier obligations</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Cost</TableHead><TableHead>Supplier</TableHead><TableHead>Actual cost</TableHead><TableHead>Funded by customer</TableHead><TableHead>Settled</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader><TableBody>
        {data.costSheet.map((c) => <TableRow key={c.id}>
          <TableCell><div className="font-medium">{costLabel(c.category)}</div><div className="text-xs text-slate-400">{c.description || "—"}</div></TableCell>
          <TableCell>{suppliers.find((s: any) => s.id === c.supplierId)?.name || c.payee || "—"}</TableCell>
          <TableCell>{fmtMoney(c.actual)}</TableCell><TableCell>{fmtMoney(c.allocated)}</TableCell><TableCell>{fmtMoney(c.settled)}</TableCell>
          <TableCell className={c.supplierOutstanding > 0 ? "text-amber-600 font-semibold" : "text-emerald-600"}>{fmtMoney(c.supplierOutstanding)}</TableCell>
        </TableRow>)}
      </TableBody></Table>
    </CardContent></Card>

    {editable && <Card><CardHeader><CardTitle>Record supplier payment</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-4">
      <div><Label>Cost line</Label><Select value={costId} onValueChange={setCostId}><SelectTrigger><SelectValue placeholder="Choose cost" /></SelectTrigger><SelectContent>{data.costSheet.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{costLabel(c.category)} · {fmtMoney(c.actual)}</SelectItem>)}</SelectContent></Select></div>
      <Field label="Amount paid" value={amount} onChange={setAmount} />
      <div><Label>Paid from</Label><Select value={bankAccountId} onValueChange={setBankAccountId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose bank account</SelectItem>{bankAccounts.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name || b.code}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Supplier</Label><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Use cost supplier</SelectItem>{suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></div>
      <Field label="Payment date" type="date" value={paymentDate} onChange={setPaymentDate} />
      <Field label="Reference" type="text" value={reference} onChange={setReference} />
      <div className="md:col-span-2 flex items-end"><Button onClick={submit} disabled={pending || !selected || bankAccountId === "none"}>{pending ? "Saving…" : "Record settlement"}</Button></div>
      {selected && <p className="md:col-span-4 text-xs text-slate-500">Available to settle from customer funds: {fmtMoney(selected.held)}. Supplier settlement cannot exceed this amount.</p>}
    </CardContent></Card>}

    <Card><CardHeader><CardTitle>Settlement history</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Cost</TableHead><TableHead>Reference</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>
        {data.thirdPartyPayments.map((p: any) => <TableRow key={p.id}><TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell><TableCell>{costLabel(data.costSheet.find((c: any) => c.id === p.costId)?.category || "other")}</TableCell><TableCell>{p.reference || "—"}</TableCell><TableCell>{fmtMoney(Number(p.baseAmount))}</TableCell></TableRow>)}
        {!data.thirdPartyPayments.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">No settlements recorded yet.</TableCell></TableRow>}
      </TableBody></Table>
    </CardContent></Card>
  </div>;
}

function DocumentsTab({ v, companyId }: { v: any; companyId: number }) {
  const { data: company } = useCompany(companyId);
  return <Card><CardHeader><CardTitle>Vehicle documents</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
    {v.invoice && company && <PDFDownloadLink document={<InvoicePDF invoice={{ ...v.invoice, vehicleCosts: v.costs }} company={company} customer={v.customer} />} fileName={`Invoice-${v.invoice.invoiceNumber}.pdf`}>{({ loading }) => <Button variant="outline" disabled={loading}>{loading ? "Preparing…" : (v.accountingModel === "agent" ? "Processing fee invoice" : "Sales invoice")}</Button>}</PDFDownloadLink>}
    {v.payments.map((p: any) => <VehicleReceiptLink key={p.id} companyId={companyId} vehicleId={v.id} paymentId={p.id} company={company} />)}
    {!v.invoice && !v.payments.length && <p className="text-sm text-slate-400">No documents have been generated for this vehicle.</p>}
  </CardContent></Card>;
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

function DetailsTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
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
  const [editing, setEditing] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
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
                      <Read label={`USD per 1 ${v.saleCurrency}`} value={Number(v.saleExchangeRate || 1)} />
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
                              invoice={{ ...v.invoice, vehicleCosts: v.costs, vehicle: v }}
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
                      {!v.cogsJournalEntryId && (
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
                    </div>
                  </div>
                ) : editable ? (
                  <div className="space-y-2">
                    <Button id="vehicle-create-invoice" variant="outline" className="w-full" onClick={() => setInvoiceOpen(true)} disabled={pending || !v.customerId || v.salePrice == null}>
                      <FileText className="w-4 h-4 mr-1" />Create invoice from sale
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create sales invoice</DialogTitle>
            <DialogDescription>
              Invoice {v.stockNumber} · {v.year} {v.make} {v.model} for the agreed sale price.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Agreed sale price</span>
                <span>{Number(v.salePrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoiceCurrency}</span>
              </div>
              {saleRate !== 1 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Converted at {saleRate} USD per 1 {invoiceCurrency}</span>
                  <span>{fmtMoney(invoiceSubtotal * saleRate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice subtotal</span>
                <span>{invoiceSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoiceCurrency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">
                  Tax {selectedInvoiceTaxType ? `(${selectedInvoiceTaxType.name} ${invoiceTaxRate}%)` : "(none)"}
                </span>
                <span>{invoiceTax.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoiceCurrency}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-bold">
                <span>Invoice total</span>
                <span>{invoiceTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoiceCurrency}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vehicle-invoice-due">Due date</Label>
                <Input
                  id="vehicle-invoice-due"
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                />
              </div>
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
              The invoice is raised in {invoiceCurrency} and goes through the normal sales VAT path, so it appears on the VAT return.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button id="vehicle-invoice-create-submit" onClick={createInvoice} disabled={pending || invoiceTotal <= 0}>
              <FileText className="w-4 h-4 mr-1" />Create invoice
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
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyCost });
  const [payFor, setPayFor] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({
    bankAccountId: "none",
    paymentDate: format(new Date(), "yyyy-MM-dd"),
    reference: "",
  });
  const base = Number(form.amount || 0) * Number(form.exchangeRate || 1);
  const costsLocked = !!v.cogsJournalEntryId;

  const needsBank = (form.settlementMethod || "cash") !== "supplier_bill";

  const add = async () => {
    if (!form.amount || costsLocked) return;
    if (needsBank && form.bankAccountId === "none") return;
    await run({ path: `/${v.id}/costs`, body: costBody(form) }, "Cost added");
    setForm({ ...emptyCost, category: form.category === "purchase" ? "shipping" : form.category });
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
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200/80">
            <CardHeader>
              <CardTitle className="text-base">Add cost</CardTitle>
              {costsLocked && (
                <p className="text-xs text-slate-500">
                  COGS has been posted for this vehicle, so costs are locked.
                </p>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
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
              <Button id="cost-add" onClick={add} disabled={pending || costsLocked || !form.amount || (needsBank && form.bankAccountId === "none")}><Plus className="w-4 h-4 mr-1" />{fmtMoney(base)}</Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Details</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Estimate (USD)</TableHead><TableHead className="text-right">Actual (USD)</TableHead><TableHead className="text-right">Customer charge (USD)</TableHead><TableHead className="text-right">Foreign amount</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.costs.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500">No costs yet. Start with the purchase price.</TableCell></TableRow>
                ) : v.costs.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.costDate ?? "—"}</TableCell>
                    <TableCell>
                      <div>{costLabel(c.category)}</div>
                      {c.source && c.source !== "manual" && <div className="text-[10px] uppercase tracking-wide text-slate-400">auto · {c.source}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {[c.description, c.supplierId ? supplierName(c.supplierId) : null, c.payee, c.reference].filter(Boolean).join(" · ") || "—"}
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
                    </TableCell>
                    <TableCell>
                      <Badge className={`${costStatusTone[c.status ?? "pending"] ?? ""} border-0 text-[10px]`}>{costStatusLabel(c.status ?? "pending")}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmtMoney(c.estimatedBaseAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(c.baseAmount)}</TableCell>
                    <TableCell className="text-right text-xs text-sky-700">{fmtMoney(c.customerChargeBaseAmount)}</TableCell>
                    <TableCell className="text-right text-xs text-slate-500">{Number(c.amount).toLocaleString()} {c.currency}{c.currency !== "USD" ? ` @ ${Number(c.exchangeRate)}` : ""}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {!c.costJournalEntryId && !costsLocked && c.status !== "cancelled" && c.status !== "disputed" && (c.status === "paid" || c.settlementMethod === "supplier_bill") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title={c.settlementMethod === "supplier_bill" ? "Post supplier bill to inventory / AP" : "Post to inventory and pay from bank/cash"}
                          onClick={() => confirm(
                            c.settlementMethod === "supplier_bill"
                              ? `Post ${fmtMoney(c.baseAmount)} as a supplier bill (Dr inventory, Cr accounts payable)?`
                              : `Post ${fmtMoney(c.baseAmount)} to inventory and pay it from ${bankName(c.bankAccountId) ?? "bank/cash"}?`,
                          ) && postCost(c)}
                        >
                          <Landmark className="w-4 h-4 text-slate-400" />
                        </Button>
                      )}
                      {c.supplierInvoiceId && !c.paymentJournalEntryId && !costsLocked && (
                        <Button size="icon" variant="ghost" title="Pay supplier bill" onClick={() => openPay(c)}>
                          <CircleDot className="w-4 h-4 text-sky-500" />
                        </Button>
                      )}
                      {(c.costJournalEntryId || c.paymentJournalEntryId || c.supplierInvoiceId) && !costsLocked && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Reverse this cost"
                          onClick={() => confirm("Reverse the journal entries for this cost?") && reverseCost(c)}
                        >
                          <Undo2 className="w-4 h-4 text-amber-500" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" disabled={costsLocked} onClick={() => openEdit(c)}>
                        <Pencil className="w-4 h-4 text-slate-400" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={costsLocked} onClick={() => confirm("Delete this cost line?") && run({ path: `/${v.id}/costs/${c.id}`, method: "DELETE" })}>
                        <Trash2 className="w-4 h-4 text-slate-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card className="border-slate-200/80 h-fit">
          <CardHeader><CardTitle className="text-base">Landed cost breakdown</CardTitle></CardHeader>
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

function TrackingTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { run, pending } = useSubmit(companyId);
  const currentIdx = VEHICLE_STAGES.findIndex((s) => s.value === v.stage);
  const [stage, setStage] = useState(VEHICLE_STAGES[Math.min(currentIdx + 1, VEHICLE_STAGES.length - 1)].value as string);
  const [notes, setNotes] = useState("");
  const [eventDate, setEventDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notify, setNotify] = useState(!!v.customerId);
  useEffect(() => setStage(VEHICLE_STAGES[Math.min(currentIdx + 1, VEHICLE_STAGES.length - 1)].value), [v.stage]);

  const submit = async () => {
    // Open WhatsApp inside the click handler (before any await) or popup blockers eat it.
    const link = notify && v.customer?.phone ? waLink(v.customer.phone, customerMessage(v, stage, notes)) : null;
    if (link) window.open(link, "_blank", "noopener");
    const event = await run({ path: `/${v.id}/stage`, body: { stage, notes: notes || null, eventDate, notifyCustomer: notify } }, `Moved to ${stageLabel(stage)}`);
    if (link) await run({ path: `/${v.id}/stage/${event.id}/notified`, body: { via: "whatsapp" } });
    setNotes("");
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 border-slate-200/80">
        <CardHeader><CardTitle className="text-base">Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center mb-8 overflow-x-auto pb-2">
            {VEHICLE_STAGES.map((s, i) => (
              <div key={s.value} className="flex items-center flex-1 min-w-[90px]">
                <div className="flex flex-col items-center text-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${i < currentIdx ? "bg-emerald-500 text-white" : i === currentIdx ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-slate-100 text-slate-400"}`}>
                    {i < currentIdx ? <Check className="w-4 h-4" /> : <CircleDot className="w-4 h-4" />}
                  </div>
                  <span className={`text-[11px] mt-1.5 ${i <= currentIdx ? "text-slate-800 font-medium" : "text-slate-400"}`}>{s.label}</span>
                </div>
                {i < VEHICLE_STAGES.length - 1 && <div className={`h-0.5 flex-1 -mt-5 ${i < currentIdx ? "bg-emerald-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>

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

      {editable && (
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
            <Button id="stage-submit" className="w-full" onClick={submit} disabled={pending}>Save stage</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Payments & schedule ──────────────────────────────────────────────────────

const PLAN_MONTH_OPTIONS = [2, 4, 6, 12, 18, 24, 30, 36];

function PaymentsTab({ v, companyId, editable }: { v: any; companyId: number; editable: boolean }) {
  const { run, pending } = useSubmit(companyId);
  const { toast } = useToast();
  const { data: bankAccounts = [] } = useBankAccounts(companyId);
  const [pay, setPay] = useState({ amount: "", currency: "USD", exchangeRate: "1", paymentMethod: "Transfer", bankAccountId: "none", reference: "", paymentDate: format(new Date(), "yyyy-MM-dd") });
  const [lines, setLines] = useState<{ type: string; dueDate: string; amount: string }[]>([]);
  const [plan, setPlan] = useState({
    deposit: "",
    months: "4",
    startDate: format(new Date(), "yyyy-MM-dd"),
  });
  useEffect(() => setLines(v.schedule.map((l: any) => ({ type: l.type, dueDate: l.dueDate, amount: String(l.amount) }))), [v.schedule]);

  const record = async () => {
    if (pay.bankAccountId === "none") return;
    await run({ path: `/${v.id}/payments`, body: { ...pay, bankAccountId: Number(pay.bankAccountId), reference: pay.reference || null } }, "Payment recorded");
    setPay({ ...pay, amount: "", reference: "" });
  };
  const saveSchedule = () => run({ path: `/${v.id}/schedule`, method: "PUT", body: { lines: lines.filter((l) => l.dueDate && Number(l.amount) > 0) } }, "Schedule saved");
  const scheduled = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const [reminderOpen, setReminderOpen] = useState(false);
  const openLines = (v.openSchedule ?? []).filter((l: any) => l.open > 0.004);

  const planTotal = Number(v.summary.sellingPrice || 0);
  const planDeposit = Number(plan.deposit || 0);
  const planMonths = Number(plan.months || 0);
  const planOutstanding = Math.max(planTotal - planDeposit, 0);
  const planMonthly = planMonths > 0 ? planOutstanding / planMonths : 0;
  // Schedule generation now auto-creates the invoice, so salePrice is required
  // (targetPrice is a planning figure only and cannot anchor a binding invoice).
  const planValid =
    !!v.customerId &&
    v.salePrice != null &&
    planTotal > 0 &&
    planDeposit > 0 &&
    planDeposit < planTotal &&
    PLAN_MONTH_OPTIONS.includes(planMonths);

  const generatePlan = async () => {
    if (!planValid) return;
    try {
      const result = await run(
        {
          path: `/${v.id}/schedule/generate`,
          body: { months: planMonths, deposit: planDeposit, startDate: plan.startDate },
        },
        // Pass undefined so useSubmit doesn't auto-toast; we toast below with
        // richer info once we have the result.
        undefined,
      );
      setPlan({ ...plan, deposit: "" });
      toast({
        title: result?.invoiceCreated
          ? `Invoice ${result?.invoice?.invoiceNumber ?? ""} raised & payment plan created`
          : "Payment schedule updated",
        description: result?.invoiceCreated
          ? "The sales invoice has been created automatically. You can add tax on the invoice page."
          : undefined,
      });
    } catch {
      // useSubmit has already shown the failure toast.
    }
  };


  const planMonthsOnFile = lines.filter((l) => l.type !== "deposit").length;

  // Apply cumulative payments to schedule lines in due order to show status.
  let remaining = v.summary.paid;
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="border-slate-200/80">
        <CardHeader><CardTitle className="text-base">Payments received</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {editable && (
            v.customerId ? (
              <div className="grid grid-cols-2 gap-3 items-end">
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
                <div className="space-y-1.5"><Label>USD per 1 {pay.currency}</Label><Input id="pay-rate" type="number" step="0.000001" disabled={pay.currency === "USD"} value={pay.exchangeRate} onChange={(e) => setPay({ ...pay, exchangeRate: e.target.value })} /></div>
                <Button id="pay-submit" className="col-span-2" onClick={record} disabled={pending || !pay.amount || pay.bankAccountId === "none"}>Record payment</Button>
              </div>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">Assign a customer on the Details tab before recording payments.</p>
            )
          )}
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
          <div className="flex justify-between text-sm border-t pt-3">
            <span className="text-slate-600">Paid {fmtMoney(v.summary.paid)} of {fmtMoney(v.summary.sellingPrice)}</span>
            <span className="font-bold text-amber-600">{v.summary.balance > 0 ? `${fmtMoney(v.summary.balance)} due` : "Settled"}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Payment schedule</CardTitle>
          <Badge className="border-0 bg-slate-100 text-slate-600">
            {planMonthsOnFile > 0 ? `${planMonthsOnFile}-month plan` : "No plan"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {editable && (
            <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Automatic payment plan</p>
                <p className="text-[11px] text-slate-500">
                  A deposit is required. The balance is split into 2–36 equal monthly instalments.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="plan-deposit" className="text-xs">Deposit * (USD)</Label>
                  <Input
                    id="plan-deposit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Required"
                    value={plan.deposit}
                    onChange={(e) => setPlan({ ...plan, deposit: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Months</Label>
                  <Select value={plan.months} onValueChange={(x) => setPlan({ ...plan, months: x })}>
                    <SelectTrigger id="plan-months"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLAN_MONTH_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>{m} month{m === 1 ? "" : "s"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="plan-start" className="text-xs">Deposit date</Label>
                  <Input
                    id="plan-start"
                    type="date"
                    value={plan.startDate}
                    onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-white/70 px-3 py-2 text-center text-[11px]">
                <div>
                  <p className="text-slate-400">Sale price</p>
                  <p className="font-semibold text-slate-800">{fmtMoney(planTotal)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Monthly</p>
                  <p className="font-semibold text-slate-800">{planDeposit > 0 ? fmtMoney(planMonthly) : "—"}</p>
                </div>
                <div>
                  <p className="text-slate-400">Balance after deposit</p>
                  <p className="font-semibold text-slate-800">{planDeposit > 0 ? fmtMoney(planOutstanding) : "—"}</p>
                </div>
              </div>
              {!v.customerId && (
                <p className="text-[11px] text-amber-700">Assign a customer on the Details tab first.</p>
              )}
              {!v.customerId && null /* handled above */}
              {v.salePrice == null && (
                <p className="text-[11px] text-amber-700">Set the agreed sale price on the Details tab first — the schedule will raise the invoice automatically.</p>
              )}
              {v.salePrice != null && !v.invoiceId && (
                <p className="text-[11px] text-sky-700">
                  Generating the schedule will automatically create the sales invoice for {fmtMoney(v.salePrice, v.saleCurrency || "USD")}.
                  {v.saleCurrency && v.saleCurrency !== "USD" && ` (USD ${fmtMoney(planTotal)})`}
                </p>
              )}
              {v.invoiceId && (
                <p className="text-[11px] text-emerald-700">Invoice already raised — regenerating will update the schedule only.</p>
              )}
              {v.customerId && v.salePrice != null && planDeposit <= 0 && (
                <p className="text-[11px] text-amber-700">Enter a deposit greater than zero.</p>
              )}
              {planDeposit >= planTotal && planTotal > 0 && (
                <p className="text-[11px] text-rose-600">The deposit must be less than the sale price.</p>
              )}
              <Button id="plan-generate" size="sm" className="w-full" onClick={generatePlan} disabled={pending || !planValid}>
                {v.invoiceId ? `Regenerate ${planMonths}-month schedule` : `Generate ${planMonths}-month plan & raise invoice`}
              </Button>
            </div>
          )}

          {lines.map((l, i) => {
            const covered = Math.min(remaining, Number(l.amount || 0));
            remaining -= covered;
            const open = Number(l.amount || 0) - covered;
            const state = open <= 0.004 ? "paid" : l.dueDate && l.dueDate <= today ? "overdue" : "upcoming";
            return (
              <div key={i} className="grid grid-cols-[110px_1fr_1fr_auto_auto] gap-2 items-center">
                <Select disabled={!editable} value={l.type} onValueChange={(x) => setLines(lines.map((y, j) => (j === i ? { ...y, type: x } : y)))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["deposit", "instalment", "balance"].map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
                <Input disabled={!editable} type="date" value={l.dueDate} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, dueDate: e.target.value } : y)))} />
                <Input disabled={!editable} type="number" step="0.01" value={l.amount} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
                <Badge className={`border-0 ${state === "paid" ? "bg-emerald-100 text-emerald-700" : state === "overdue" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{state}</Badge>
                {editable && <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4 text-slate-400" /></Button>}
              </div>
            );
          })}
          {lines.length === 0 && <p className="text-sm text-slate-500">No schedule. Add a deposit and balance to track due dates and overdue amounts.</p>}
          {editable && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { type: lines.length ? "instalment" : "deposit", dueDate: today, amount: "" }])}><Plus className="w-4 h-4 mr-1" />Add line</Button>
              <Button id="schedule-save" size="sm" onClick={saveSchedule} disabled={pending}>Save schedule</Button>
              <span className={`text-xs ml-auto self-center ${Math.abs(scheduled - v.summary.sellingPrice) > 0.01 && !v.summary.isProjected ? "text-amber-600" : "text-slate-500"}`}>
                Scheduled {fmtMoney(scheduled)}{!v.summary.isProjected ? ` / ${fmtMoney(v.summary.sellingPrice)}` : ""}
              </span>
            </div>
          )}
          {editable && openLines.length > 0 && (
            <Button id="vehicle-reminder-btn" variant="outline" size="sm" className="w-full" onClick={() => setReminderOpen(true)}>
              <Bell className="w-4 h-4 mr-1" />Send payment reminder
            </Button>
          )}
        </CardContent>
      </Card>
    </div>

    <ReminderHistory reminders={v.reminders ?? []} />
    <ReminderDialog v={v} companyId={companyId} lines={openLines} open={reminderOpen} onOpenChange={setReminderOpen} />
    </div>
  );
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
