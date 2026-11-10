import { Layout } from "@/components/layout";
import { Fragment, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useSuppliers } from "@/hooks/use-suppliers";
import { AlertTriangle, ArrowLeft, Banknote, ChevronDown, ChevronRight, Download, Package, TrendingUp, Wallet } from "lucide-react";
import { COST_CATEGORIES, VEHICLE_STAGES, fmtMoney, stageLabel, useVehicleReport } from "@/hooks/use-vehicles";
import { statusTone } from "./index";

type Row = {
  id: number;
  stockNumber: string;
  description: string;
  status: string;
  stage: string;
  customerName: string | null;
  purchasePrice: number;
  landedCost: number;
  importCosts: number;
  sellingPrice: number;
  isProjected: boolean;
  profit: number;
  marginPercent: number;
  costsByCategory: Record<string, number>;
  pendingCosts: number;
  paidCosts: number;
  negativeMargin: boolean;
  lowMargin: boolean;
  hasUnpaidCosts: boolean;
  costCount: number;
};

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function VehicleProfitabilityPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const { can } = usePermissions();
  const { data: suppliers = [] } = useSuppliers(companyId);
  const [, navigate] = useLocation();
  const [view, setView] = useState<"all" | "sold" | "stock">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const allowed = can("vehicles.costs");

  const filters = { from, to, supplierId, status, stage, search };
  const { data, isLoading } = useVehicleReport<{ totals: any; items: Row[] }>(companyId, "profitability", allowed, filters);

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => (view === "sold" ? !i.isProjected : view === "stock" ? i.isProjected : true)),
    [data, view],
  );
  const t = data?.totals;
  const alerts = useMemo(
    () => items.filter((i) => i.negativeMargin || i.lowMargin || i.hasUnpaidCosts),
    [items],
  );

  const exportCsv = () => {
    const head = [
      "Stock #", "Vehicle", "Status", "Stage", "Customer",
      ...COST_CATEGORIES.map((c) => c.label),
      "Landed cost", "Pending costs", "Paid costs", "Import costs", "Selling price", "Projected", "Profit", "Margin %", "Alerts",
    ];
    const rows = items.map((i) => [
      i.stockNumber, i.description, i.status, stageLabel(i.stage), i.customerName ?? "",
      ...COST_CATEGORIES.map((c) => i.costsByCategory?.[c.value] ?? 0),
      i.landedCost, i.pendingCosts, i.paidCosts, i.importCosts, i.sellingPrice, i.isProjected ? "yes" : "no", i.profit, i.marginPercent,
      [i.negativeMargin ? "negative margin" : "", i.lowMargin ? "low margin" : "", i.hasUnpaidCosts ? "unpaid costs" : ""].filter(Boolean).join("; "),
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `vehicle-profitability-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (!allowed) return <Layout><div className="p-8 text-slate-600">You need the “Vehicle Costs &amp; Profit” permission to view this report.</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <Link href="/vehicles" className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center"><ArrowLeft className="w-4 h-4 mr-1" />Vehicles</Link>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Vehicle Profitability</h1>
            <p className="text-sm text-slate-500">Purchase price, landed cost and retail selling price per vehicle (USD)</p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!items.length}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryStatCard label={`Revenue (${t?.sold ?? 0} sold)`} value={fmtMoney(t?.revenue)} icon={Banknote} tone="blue" />
          <SummaryStatCard label="Realised profit" value={fmtMoney(t?.profit)} icon={TrendingUp} tone="emerald" />
          <SummaryStatCard label="Stock at landed cost" value={fmtMoney(t?.stockValue)} icon={Package} tone="slate" />
          <SummaryStatCard label="Projected profit on stock" value={fmtMoney(t?.projectedProfit)} icon={Wallet} tone="violet" />
        </div>

        {alerts.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/60">
            <CardContent className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" />{alerts.length} vehicle(s) need attention
              </div>
              <div className="flex flex-wrap gap-2">
                {alerts.slice(0, 8).map((i) => (
                  <Link key={i.id} href={`/vehicles/${i.id}`} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs text-amber-900 hover:border-amber-300">
                    {i.stockNumber}
                    {i.negativeMargin ? " · negative margin" : i.lowMargin ? ` · ${i.marginPercent}% margin` : ""}
                    {i.hasUnpaidCosts ? ` · ${fmtMoney(i.pendingCosts)} unpaid` : ""}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200/80">
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="profit-from">Added from</Label>
              <Input id="profit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profit-to">Added to</Label>
              <Input id="profit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {VEHICLE_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profit-search">Search</Label>
              <Input id="profit-search" placeholder="Stock, VIN, model…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {(["all", "sold", "stock"] as const).map((k) => (
            <Button key={k} size="sm" variant={view === k ? "default" : "outline"} onClick={() => setView(k)}>
              {k === "all" ? "All" : k === "sold" ? "Sold" : "Unsold (projected)"}
            </Button>
          ))}
        </div>

        <Card className="border-slate-200/80">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Import costs</TableHead>
                  <TableHead className="text-right">Landed cost</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Selling price</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="w-40">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9}><LoadingRows rows={5} /></TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-slate-500">No vehicles match these filters.</TableCell></TableRow>
                ) : items.map((i) => {
                  const open = expanded === i.id;
                  return (
                    <Fragment key={i.id}>
                      <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(open ? null : i.id)}>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : i.id); }}>
                            {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold flex items-center gap-2">
                            {i.description}
                            {(i.negativeMargin || i.lowMargin) && <AlertTriangle className={`w-3.5 h-3.5 ${i.negativeMargin ? "text-rose-500" : "text-amber-500"}`} />}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            <span className="font-mono">{i.stockNumber}</span>
                            <Badge className={`${statusTone[i.status] ?? ""} border-0 capitalize text-[10px] py-0`}>{i.status}</Badge>
                            <span className="text-[10px] text-slate-400">{stageLabel(i.stage)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{fmtMoney(i.purchasePrice)}</TableCell>
                        <TableCell className="text-right text-slate-500">{fmtMoney(i.importCosts)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(i.landedCost)}</TableCell>
                        <TableCell className="text-right text-xs text-amber-700">{i.pendingCosts ? fmtMoney(i.pendingCosts) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(i.sellingPrice)}
                          {i.isProjected && <span className="block text-[10px] text-slate-400">target</span>}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${i.profit < 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtMoney(i.profit)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${i.profit < 0 ? "bg-rose-500" : i.lowMargin ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.abs(i.marginPercent) * 2)}%` }} />
                            </div>
                            <span className={`text-xs w-12 text-right ${i.marginPercent < 0 ? "text-rose-600" : ""}`}>{i.marginPercent}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow key={`${i.id}-breakdown`} className="bg-slate-50/70">
                          <TableCell />
                          <TableCell colSpan={8}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1 py-1">
                              {COST_CATEGORIES.map((c) => (
                                <div key={c.value} className="flex justify-between text-xs">
                                  <span className="text-slate-500">{c.label}</span>
                                  <span className={i.costsByCategory?.[c.value] ? "font-medium text-slate-800" : "text-slate-300"}>{fmtMoney(i.costsByCategory?.[c.value] ?? 0)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-xs font-semibold border-t pt-1">
                                <span>Landed cost</span><span>{fmtMoney(i.landedCost)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Pending costs</span><span className="text-amber-700">{fmtMoney(i.pendingCosts)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Paid costs</span><span className="text-emerald-700">{fmtMoney(i.paidCosts)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Cost lines</span><span>{i.costCount}</span>
                              </div>
                              <div className="col-span-2 sm:col-span-3 lg:col-span-4 pt-1">
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/vehicles/${i.id}`); }}>
                                  Open vehicle to edit costs
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        {t?.byCategory && Object.values(t.byCategory).some((v) => Number(v) > 0) && (
          <Card className="border-slate-200/80">
            <CardHeader><CardTitle className="text-base">Cost breakdown (filtered)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
              {COST_CATEGORIES.map((c) => (
                <div key={c.value} className="flex justify-between">
                  <span className="text-slate-600">{c.label}</span>
                  <span className={t.byCategory[c.value] ? "font-medium" : "text-slate-300"}>{fmtMoney(t.byCategory[c.value] ?? 0)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 font-bold col-span-2 sm:col-span-1">
                <span>Landed cost</span><span>{fmtMoney(t.landedCost)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
