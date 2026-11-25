import { Layout } from "@/components/layout";
import { Fragment, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { VehicleModuleNav } from "@/components/vehicles/module-nav";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useMatchingEnquiries } from "@/hooks/use-crm";
import { usePermissions } from "@/hooks/use-permissions";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Car, ChevronDown, ChevronRight, CircleDollarSign, Mail, MessageCircle, Plus, Search, Ship, AlertTriangle } from "lucide-react";
import {
  VEHICLE_STAGES,
  fmtMoney,
  stageLabel,
  useCompanyStaff,
  useVehicleAction,
  useVehicleCustomerAccount,
  useVehicleReport,
  useVehicles,
} from "@/hooks/use-vehicles";

export const stageTone: Record<string, string> = {
  purchased: "bg-slate-100 text-slate-700",
  in_transit: "bg-blue-100 text-blue-700",
  container_loaded: "bg-indigo-100 text-indigo-700",
  at_port: "bg-cyan-100 text-cyan-800",
  clearing: "bg-amber-100 text-amber-800",
  cleared: "bg-lime-100 text-lime-800",
  in_delivery: "bg-violet-100 text-violet-700",
  delivered: "bg-emerald-100 text-emerald-700",
};

export const statusTone: Record<string, string> = {
  available: "bg-slate-100 text-slate-700",
  reserved: "bg-amber-100 text-amber-800",
  sold: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function VehiclesPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const { can } = usePermissions();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState("vehicles");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedBalance, setExpandedBalance] = useState<number | null>(null);

  const { data: vehicles = [], isLoading, isError, refetch } = useVehicles(companyId, {
    stage: stage === "all" ? undefined : stage,
    status: status === "all" ? undefined : status,
    search: search.trim() || undefined,
  });
  const { data: outstanding = [], isLoading: loadingBalances, isError: balancesError, refetch: refetchBalances } = useVehicleReport<any[]>(companyId, "outstanding");
  const { toast } = useToast();
  const action = useVehicleAction(companyId);
  const canRemind = can("vehicles.payments");
  const filtered = Boolean(search.trim()) || stage !== "all" || status !== "all";
  const clearFilters = () => { setSearch(""); setStage("all"); setStatus("all"); };
  const balances = outstanding.filter(row => !overdueOnly || row.overdue > 0);

  const remind = async (r: any) => {
    const due = r.overdue > 0
      ? `overdue amount ${fmtMoney(r.overdue)}`
      : r.nextDue
        ? `${fmtMoney(r.nextDue.amount, r.nextDue.currency)} due ${r.nextDue.dueDate}`
        : `${fmtMoney(r.balance)} outstanding`;
    const text = `Hi ${r.customerName || ""}, this is a friendly payment reminder for your ${r.description} (Stock ${r.stockNumber}). ${due}. Total outstanding: ${fmtMoney(r.balance)}. Please contact us to arrange payment.`;
    try {
      if (r.customerPhone) {
        const digits = String(r.customerPhone).replace(/\D/g, "").replace(/^0/, "263");
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        await action.mutateAsync({ path: `/${r.vehicleId}/reminders`, body: { channel: "whatsapp", message: text } });
        toast({ title: "Reminder logged" });
      } else if (r.customerEmail) {
        const result = await action.mutateAsync({ path: `/${r.vehicleId}/reminders`, body: { channel: "email", message: text } });
        if (result?.reminder?.status !== "sent" && result?.mailtoUrl) window.location.href = result.mailtoUrl;
        else toast({ title: result?.reminder?.status === "sent" ? "Reminder email sent" : "Reminder recorded" });
      } else {
        toast({ title: "No phone or email for this customer", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Could not send reminder", description: e.message, variant: "destructive" });
    }
  };

  const stats = useMemo(() => {
    const inTransit = vehicles.filter(v => !["delivered", "cancelled"].includes(v.status) && !["purchased", "delivered"].includes(v.stage)).length;
    const owed = outstanding.reduce((s: number, r: any) => s + r.balance, 0);
    const overdue = outstanding.reduce((s: number, r: any) => s + r.overdue, 0);
    return { inTransit, owed, overdue };
  }, [vehicles, outstanding]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Vehicle Imports</h1>
          </div>
          <div className="flex gap-2">
            {can("vehicles.manage") && (
              <Button id="new-vehicle-btn" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4 mr-2" />New Vehicle
              </Button>
            )}
          </div>
        </div>
        <VehicleModuleNav />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryStatCard label={filtered ? "Matching vehicles" : "Vehicles"} value={isLoading || isError ? "—" : vehicles.length} icon={Car} tone="slate" />
          <SummaryStatCard label={filtered ? "In transit · filtered" : "In transit"} value={isLoading || isError ? "—" : stats.inTransit} icon={Ship} tone="blue" />
          <SummaryStatCard label="Owed by customers" value={loadingBalances || balancesError ? "—" : fmtMoney(stats.owed)} icon={CircleDollarSign} tone="amber" />
          <button type="button" className="rounded-xl text-left" onClick={() => { setOverdueOnly(true); setTab("balances"); }}>
            <SummaryStatCard label="Overdue balances" value={loadingBalances || balancesError ? "—" : fmtMoney(stats.overdue)} icon={AlertTriangle} tone="rose" />
          </button>
        </div>

        <Tabs value={tab} onValueChange={value => { setTab(value); if (value === "balances") setOverdueOnly(false); }}>
          <TabsList>
            <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
            <TabsTrigger value="balances">
              Outstanding balances
              {outstanding.some((r: any) => r.overdue > 0) && <span className="ml-2 w-2 h-2 rounded-full bg-rose-500 inline-block" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input id="vehicle-search" aria-label="Search vehicles" className="pl-9" placeholder="Vehicle, customer, stock no. or VIN" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="sm:w-44" id="vehicle-stage-filter" aria-label="Filter by import stage"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {VEHICLE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="sm:w-40" aria-label="Filter by sale status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sale statuses</SelectItem>
                  {Object.keys(statusTone).map(value => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
                </SelectContent>
              </Select>
              {filtered && <Button variant="ghost" onClick={clearFilters}>Clear filters</Button>}
            </div>

            <Card className="border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="hidden sm:table-cell">Customer</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Agreed / target price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4}><LoadingRows rows={5} /></TableCell></TableRow>
                  ) : isError ? (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center">Could not load vehicles. <Button variant="link" onClick={() => refetch()}>Retry</Button></TableCell></TableRow>
                  ) : vehicles.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-12 text-slate-600">{filtered ? "No vehicles match these filters." : "No vehicles yet."}</TableCell></TableRow>
                  ) : (
                    vehicles.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <Link href={`/vehicles/${v.id}`} className="font-semibold text-blue-700 hover:underline">{v.year} {v.make} {v.model}</Link>
                          <div className="text-xs text-slate-600">{v.stockNumber} · {v.accountingModel === "principal" ? "Vehicle sale" : "Customer import"}</div>
                          <div className="text-xs text-slate-600 sm:hidden">{v.customerName || "Unassigned"}</div>
                        </TableCell>
                        <TableCell><div className="flex flex-wrap gap-1"><Badge className={stageTone[v.stage] ?? ""}>{stageLabel(v.stage)}</Badge><Badge className={`capitalize ${statusTone[v.status] ?? ""}`}>{v.status}</Badge></div></TableCell>
                        <TableCell className="hidden sm:table-cell">{v.customerName || <span className="text-slate-500">Unassigned</span>}</TableCell>
                        <TableCell className="hidden text-right md:table-cell">
                          {v.salePrice != null ? fmtMoney(v.salePrice, v.saleCurrency || "USD") : fmtMoney(v.summary.sellingPrice)}
                          {v.summary.isProjected && <span className="block text-[10px] text-slate-400">target</span>}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="balances" className="space-y-3">
            <div className="flex items-center gap-2" aria-label="Balance filter">
              <Button size="sm" variant={overdueOnly ? "outline" : "default"} aria-pressed={!overdueOnly} onClick={() => setOverdueOnly(false)}>All balances</Button>
              <Button size="sm" variant={overdueOnly ? "default" : "outline"} aria-pressed={overdueOnly} onClick={() => setOverdueOnly(true)}>Overdue only</Button>
            </div>
            <Card className="border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Customer</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Total payable</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead className="text-right">Remind</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingBalances ? <TableRow><TableCell colSpan={9}><LoadingRows rows={4} /></TableCell></TableRow> : balancesError ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8">Could not load balances. <Button variant="link" onClick={() => refetchBalances()}>Retry</Button></TableCell></TableRow>
                  ) : balances.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-slate-600">{overdueOnly ? "No overdue balances." : "No outstanding balances."}</TableCell></TableRow>
                  ) : (
                    balances.map((r: any) => {
                      const expanded = expandedBalance === r.vehicleId;
                      return (
                        <Fragment key={r.vehicleId}>
                          <TableRow>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                aria-label="Toggle customer funding detail"
                                onClick={(e) => { e.stopPropagation(); setExpandedBalance(expanded ? null : r.vehicleId); }}
                              >
                                {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{r.customerName}</div>
                              <div className="text-xs text-slate-500">{r.customerPhone || r.customerEmail}</div>
                            </TableCell>
                            <TableCell><Link className="font-medium text-blue-700 hover:underline" href={`/vehicles/${r.vehicleId}?tab=payments`}>{r.stockNumber} · {r.description}</Link></TableCell>
                            <TableCell className="hidden text-right lg:table-cell">{fmtMoney(r.totalPayable ?? r.salePrice)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(r.paid)}</TableCell>
                            <TableCell className="text-right font-semibold">{fmtMoney(r.balance)}</TableCell>
                            <TableCell className={`text-right ${r.overdue > 0 ? "text-rose-600 font-semibold" : "text-slate-400"}`}>{r.overdue > 0 ? fmtMoney(r.overdue) : "—"}</TableCell>
                            <TableCell>
                              {r.nextDue ? `${r.nextDue.dueDate} · ${fmtMoney(r.nextDue.amount, r.nextDue.currency)}` : "—"}
                              {r.lastReminderAt && <span className="block text-[10px] text-slate-400">reminded {format(new Date(r.lastReminderAt), "d MMM")}</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                id={`remind-${r.vehicleId}`}
                                disabled={!canRemind || action.isPending || (!r.customerPhone && !r.customerEmail)}
                                onClick={(e) => { e.stopPropagation(); remind(r); }}
                              >
                                {r.customerPhone ? <MessageCircle className="w-4 h-4 mr-1" /> : <Mail className="w-4 h-4 mr-1" />}
                                Remind
                              </Button>
                            </TableCell>
                          </TableRow>
                          {expanded && <VehicleFundingDetail companyId={companyId} vehicleId={r.vehicleId} />}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <NewVehicleDialog companyId={companyId} open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/vehicles/${id}`)} />
    </Layout>
  );
}

function VehicleFundingDetail({ companyId, vehicleId }: { companyId: number; vehicleId: number }) {
  const { data, isLoading } = useVehicleCustomerAccount(companyId, vehicleId);
  const t = data?.totals;
  return (
    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
      <TableCell />
      <TableCell colSpan={8}>
        {isLoading ? (
          <p className="py-2 text-xs text-slate-400">Loading customer funding…</p>
        ) : !t ? (
          <p className="py-2 text-xs text-slate-400">Customer funding detail is unavailable for this vehicle.</p>
        ) : (
          <div className="space-y-1.5 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer funds &amp; supplier obligations</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
              <span>Collected <strong className="text-slate-900">{fmtMoney(t.collected)}</strong></span>
              <span>Allocated to costs <strong className="text-slate-900">{fmtMoney(t.allocatedToCosts)}</strong></span>
              <span>Held for suppliers <strong className="text-sky-700">{fmtMoney(t.fundsHeld)}</strong></span>
              <span>Still owing to suppliers <strong className="text-amber-700">{fmtMoney(t.supplierOutstanding)}</strong></span>
              <span>Unallocated cash <strong>{fmtMoney(t.unallocatedCollected)}</strong></span>
            </div>
            <Link href={`/vehicles/${vehicleId}`} className="inline-block text-xs text-blue-600 hover:underline">Open vehicle →</Link>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function NewVehicleDialog({ companyId, open, onOpenChange, onCreated }: { companyId: number; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const action = useVehicleAction(companyId);
  const { data: suppliers = [] } = useSuppliers(companyId);
  const { data: staff = [] } = useCompanyStaff(companyId);
  const empty = { make: "", model: "", year: "", vin: "", colour: "", mileage: "", supplierName: "", auctionRef: "", targetPrice: "" };
  const [form, setForm] = useState(empty);
  const [supplierId, setSupplierId] = useState("none");
  const [salespersonId, setSalespersonId] = useState("none");
  const [enquiryId, setEnquiryId] = useState("none");
  const [accountingModel, setAccountingModel] = useState<"agent" | "principal">("agent");
  const { data: matches = [] } = useMatchingEnquiries(
    companyId,
    { make: form.make, model: form.model, year: form.year },
    open,
  );
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const pickSupplier = (id: string) => {
    setSupplierId(id);
    if (id !== "none") {
      const supplier = (suppliers as any[]).find((s) => Number(s.id) === Number(id));
      if (supplier?.name) setForm((current) => ({ ...current, supplierName: supplier.name }));
    }
  };

  const pickEnquiry = (id: string) => {
    setEnquiryId(id);
    if (id !== "none") {
      const match = matches.find((m) => String(m.id) === id);
      if (match?.assignedTo) setSalespersonId(match.assignedTo);
    }
  };

  const submit = async () => {
    if (!form.make.trim() || !form.model.trim()) return toast({ title: "Make and model are required", variant: "destructive" });
    try {
      const created = await action.mutateAsync({
        path: "",
        body: {
          make: form.make.trim(),
          model: form.model.trim(),
          year: form.year ? Number(form.year) : null,
          vin: form.vin || null,
          colour: form.colour || null,
          mileage: form.mileage ? Number(form.mileage) : null,
          supplierName: form.supplierName || null,
          supplierId: supplierId === "none" ? null : Number(supplierId),
          salespersonId: salespersonId === "none" ? null : salespersonId,
          enquiryId: enquiryId === "none" ? null : Number(enquiryId),
          auctionRef: form.auctionRef || null,
          targetPrice: form.targetPrice || "0",
          accountingModel,
        },
      });
      setForm(empty);
      setSupplierId("none");
      setSalespersonId("none");
      setEnquiryId("none");
      setAccountingModel("agent");
      onOpenChange(false);
      onCreated(created.id);
    } catch (e: any) {
      toast({ title: "Could not create vehicle", description: e.message, variant: "destructive" });
    }
  };

  const field = (k: keyof typeof empty, label: string, props: Record<string, any> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`nv-${k}`}>{label}</Label>
      <Input id={`nv-${k}`} value={form[k]} onChange={set(k)} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New vehicle</DialogTitle>
          <DialogDescription>A stock number is assigned automatically. Add costs and the customer on the next screen.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {field("make", "Make", { placeholder: "Hyundai", required: true })}
          {field("model", "Model", { placeholder: "Tucson", required: true })}
          {field("year", "Year", { type: "number" })}
          {field("vin", "VIN / chassis no.")}
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="nv-accounting-model">Deal type</Label>
            <Select value={accountingModel} onValueChange={value => setAccountingModel(value as "agent" | "principal")}>
              <SelectTrigger id="nv-accounting-model"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="agent">Import for a customer</SelectItem><SelectItem value="principal">Buy and resell as stock</SelectItem></SelectContent>
            </Select>
            <p className="text-xs text-slate-600">{accountingModel === "agent" ? "Track supplier costs and invoice the processing fee." : "Track landed costs and invoice the agreed sale price."}</p>
          </div>
        </div>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Supplier, CRM and other details</summary>
          <div className="mt-3 grid grid-cols-2 gap-4">
          {field("colour", "Colour")}

          {field("mileage", "Mileage (km)", { type: "number" })}
          {field("supplierName", "Supplier / auction house")}
          <div className="space-y-1.5">
            <Label>Linked supplier</Label>
            <Select value={supplierId} onValueChange={pickSupplier}>
              <SelectTrigger id="nv-supplier"><SelectValue placeholder="No supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No supplier</SelectItem>
                {(suppliers as any[]).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Salesperson</Label>
            <Select value={salespersonId} onValueChange={setSalespersonId}>
              <SelectTrigger id="nv-salesperson"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(staff as any[]).map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {field("auctionRef", "Auction / lot ref")}
          {field("targetPrice", "Target retail price (USD)", { type: "number", step: "0.01" })}
          <div className="col-span-2 space-y-1.5">
            <Label>Matching lead (optional)</Label>
            <Select value={enquiryId} onValueChange={pickEnquiry}>
              <SelectTrigger id="nv-enquiry"><SelectValue placeholder="No linked lead" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked lead</SelectItem>
                {matches.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                    {m.interest ? ` · ${m.interest}` : ""}
                    {m.assignee?.name ? ` · ${m.assignee.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              {matches.length
                ? `${matches.length} open lead${matches.length === 1 ? "" : "s"} match this make/model. Linking one logs the vehicle on the CRM timeline.`
                : form.make || form.model
                  ? "No open CRM leads match this make/model."
                  : "Enter a make and model to find matching open leads."}
            </p>
          </div>
          </div>
        </details>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button id="create-vehicle-submit" onClick={submit} disabled={action.isPending || !form.make.trim() || !form.model.trim()}>Create vehicle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
