import { Layout } from "@/components/layout";
import { useMemo, useState } from "react";
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
import { useActiveCompany } from "@/hooks/use-active-company";
import { useMatchingEnquiries } from "@/hooks/use-crm";
import { usePermissions } from "@/hooks/use-permissions";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Car, CircleDollarSign, Mail, MessageCircle, Plus, Search, Ship, TrendingUp, AlertTriangle } from "lucide-react";
import {
  VEHICLE_STAGES,
  fmtMoney,
  stageLabel,
  useCompanyStaff,
  useVehicleAction,
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
  const [creating, setCreating] = useState(false);

  const { data: vehicles = [], isLoading } = useVehicles(companyId, { stage: stage === "all" ? undefined : stage, search: search || undefined });
  const { data: outstanding = [] } = useVehicleReport<any[]>(companyId, "outstanding");
  const { toast } = useToast();
  const action = useVehicleAction(companyId);
  const showCosts = can("vehicles.costs");
  const canRemind = can("vehicles.payments");

  const remind = async (r: any) => {
    const due = r.overdue > 0
      ? `overdue amount ${fmtMoney(r.overdue)}`
      : r.nextDue
        ? `${fmtMoney(r.nextDue.amount)} due ${r.nextDue.dueDate}`
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
    const inTransit = vehicles.filter((v) => !["purchased", "delivered"].includes(v.stage)).length;
    const owed = outstanding.reduce((s: number, r: any) => s + r.balance, 0);
    const overdue = outstanding.reduce((s: number, r: any) => s + r.overdue, 0);
    const profit = vehicles.reduce((s, v) => s + (v.summary.profit ?? 0), 0);
    return { inTransit, owed, overdue, profit };
  }, [vehicles, outstanding]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Vehicle Imports</h1>
            <p className="text-sm text-slate-500">Landed cost, import tracking and customer balances per vehicle</p>
          </div>
          <div className="flex gap-2">
            {showCosts && (
              <Button variant="outline" asChild>
                <Link href="/vehicles/profitability"><TrendingUp className="w-4 h-4 mr-2" />Profitability</Link>
              </Button>
            )}
            {can("vehicles.manage") && (
              <Button id="new-vehicle-btn" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4 mr-2" />New Vehicle
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryStatCard label="Vehicles" value={vehicles.length} icon={Car} tone="slate" />
          <SummaryStatCard label="In the pipeline" value={stats.inTransit} icon={Ship} tone="blue" />
          <SummaryStatCard label="Owed by customers" value={fmtMoney(stats.owed)} icon={CircleDollarSign} tone="amber" />
          {showCosts ? (
            <SummaryStatCard label="Profit (incl. projected)" value={fmtMoney(stats.profit)} icon={TrendingUp} tone="emerald" />
          ) : (
            <SummaryStatCard label="Overdue" value={fmtMoney(stats.overdue)} icon={AlertTriangle} tone="rose" />
          )}
        </div>

        <Tabs defaultValue="vehicles">
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
                <Input id="vehicle-search" className="pl-9" placeholder="Stock no., VIN, make, model, container…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="sm:w-52" id="vehicle-stage-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {VEHICLE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Card className="border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock #</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Customer</TableHead>
                    {showCosts && <TableHead className="text-right">Landed cost</TableHead>}
                    <TableHead className="text-right">Selling price</TableHead>
                    {showCosts && <TableHead className="text-right">Profit</TableHead>}
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8}><LoadingRows rows={5} /></TableCell></TableRow>
                  ) : vehicles.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500">No vehicles yet.</TableCell></TableRow>
                  ) : (
                    vehicles.map((v) => (
                      <TableRow key={v.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/vehicles/${v.id}`)}>
                        <TableCell className="font-mono text-xs">{v.stockNumber}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-900">{v.year} {v.make} {v.model}</div>
                          <div className="text-xs text-slate-500">{v.vin || "No VIN"}{v.containerNumber ? ` · ${v.containerNumber}` : ""}</div>
                        </TableCell>
                        <TableCell><Badge className={`${stageTone[v.stage] ?? ""} border-0`}>{stageLabel(v.stage)}</Badge></TableCell>
                        <TableCell>{v.customerName || <span className="text-slate-400">Unassigned</span>}</TableCell>
                        {showCosts && <TableCell className="text-right">{fmtMoney(v.summary.landedCost)}</TableCell>}
                        <TableCell className="text-right">
                          {fmtMoney(v.summary.sellingPrice)}
                          {v.summary.isProjected && <span className="block text-[10px] text-slate-400">target</span>}
                        </TableCell>
                        {showCosts && (
                          <TableCell className={`text-right font-semibold ${(v.summary.profit ?? 0) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {fmtMoney(v.summary.profit)}
                            <span className="block text-[10px] text-slate-400 font-normal">{v.summary.marginPercent}%</span>
                          </TableCell>
                        )}
                        <TableCell className="text-right">{v.summary.balance > 0 ? fmtMoney(v.summary.balance) : "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="balances">
            <Card className="border-slate-200/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Sale price</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead className="text-right">Remind</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstanding.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500">No outstanding balances.</TableCell></TableRow>
                  ) : (
                    outstanding.map((r: any) => (
                      <TableRow key={r.vehicleId} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/vehicles/${r.vehicleId}`)}>
                        <TableCell>
                          <div className="font-medium">{r.customerName}</div>
                          <div className="text-xs text-slate-500">{r.customerPhone || r.customerEmail}</div>
                        </TableCell>
                        <TableCell>{r.stockNumber} · {r.description}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.salePrice)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.paid)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtMoney(r.balance)}</TableCell>
                        <TableCell className={`text-right ${r.overdue > 0 ? "text-rose-600 font-semibold" : "text-slate-400"}`}>{r.overdue > 0 ? fmtMoney(r.overdue) : "—"}</TableCell>
                        <TableCell>
                          {r.nextDue ? `${r.nextDue.dueDate} · ${fmtMoney(r.nextDue.amount)}` : "—"}
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
                    ))
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
    if (!form.make || !form.model) return toast({ title: "Make and model are required", variant: "destructive" });
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
        },
      });
      setForm(empty);
      setSupplierId("none");
      setSalespersonId("none");
      setEnquiryId("none");
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New vehicle</DialogTitle>
          <DialogDescription>A stock number is assigned automatically. Add costs and the customer on the next screen.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {field("make", "Make *", { placeholder: "Toyota" })}
          {field("model", "Model *", { placeholder: "Hilux" })}
          {field("year", "Year", { type: "number" })}
          {field("colour", "Colour")}
          {field("vin", "VIN / chassis no.")}
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button id="create-vehicle-submit" onClick={submit} disabled={action.isPending}>Create vehicle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
