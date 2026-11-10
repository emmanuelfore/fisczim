import { Layout } from "@/components/layout";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Download,
  Package,
  Ship,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  COST_CATEGORIES,
  VEHICLE_STAGES,
  fmtMoney,
  stageLabel,
  useAllocateConsignment,
  useVehicleReport,
} from "@/hooks/use-vehicles";
import { statusTone } from "./index";

type CostingRow = {
  id: number;
  stockNumber: string;
  description: string;
  vin: string | null;
  status: string;
  stage: string;
  customerId: number | null;
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
  disputedCosts: number;
  negativeMargin: boolean;
  lowMargin: boolean;
  hasUnpaidCosts: boolean;
  costCount: number;
  costSuppliers: { id: number; name: string | null }[];
};

type ConsignmentRow = {
  id: number;
  referenceNumber: string;
  shippingMethod: string;
  status: string;
  forwarderName: string | null;
  supplierName: string | null;
  currency: string;
  shippingCost: number;
  insuranceCost: number;
  customsDuty: number;
  handlingCharges: number;
  totalCost: number;
  vehicleCount: number;
  purchaseValue: number;
  allocatedRows: number;
  allocatedTotal: number;
  canAllocate: boolean;
};

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function VehicleCostingPage() {
  const { activeCompanyId } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const { can } = usePermissions();
  const { toast } = useToast();
  const { data: suppliers = [] } = useSuppliers(companyId);
  const allowed = can("vehicles.costs");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [weights, setWeights] = useState<"purchase" | "equal">("purchase");

  const filters = { from, to, supplierId, status, stage, search };
  const { data, isLoading } = useVehicleReport<{ totals: any; items: CostingRow[] }>(companyId, "costing", allowed, filters);
  const { data: consignmentData, isLoading: consignmentLoading } = useVehicleReport<{ items: ConsignmentRow[] }>(
    companyId,
    "consignments",
    allowed,
  );
  const allocate = useAllocateConsignment(companyId);

  const items = data?.items ?? [];
  const totals = data?.totals;
  const alerts = useMemo(
    () => items.filter((i) => i.negativeMargin || i.lowMargin || i.hasUnpaidCosts),
    [items],
  );

  const exportCsv = () => {
    const head = [
      "Stock #", "Vehicle", "VIN", "Status", "Stage", "Customer",
      ...COST_CATEGORIES.map((c) => c.label),
      "Landed cost", "Pending costs", "Paid costs", "Selling price", "Projected", "Profit", "Margin %", "Alerts",
    ];
    const rows = items.map((i) => [
      i.stockNumber, i.description, i.vin ?? "", i.status, stageLabel(i.stage), i.customerName ?? "",
      ...COST_CATEGORIES.map((c) => i.costsByCategory?.[c.value] ?? 0),
      i.landedCost, i.pendingCosts, i.paidCosts, i.sellingPrice, i.isProjected ? "yes" : "no", i.profit, i.marginPercent,
      [i.negativeMargin ? "negative margin" : "", i.lowMargin ? "low margin" : "", i.hasUnpaidCosts ? "unpaid costs" : ""].filter(Boolean).join("; "),
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `vehicle-costing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const runAllocation = async (row: ConsignmentRow) => {
    try {
      const result = await allocate.mutateAsync({ consignmentId: row.id, weights });
      toast({
        title: "Consignment costs allocated",
        description: `${result.created} cost lines across ${result.vehicles} vehicle(s), weighted by ${result.weights} value.`,
      });
    } catch (e: any) {
      toast({ title: "Allocation failed", description: e.message, variant: "destructive" });
    }
  };

  if (!allowed) {
    return (
      <Layout>
        <div className="p-8 text-slate-600">You need the “Vehicle Costs &amp; Profit” permission to view this report.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <Link href="/vehicles" className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center">
              <ArrowLeft className="w-4 h-4 mr-1" />Vehicles
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Vehicle Costing</h1>
            <p className="text-sm text-slate-500">
              Full landed cost per vehicle — purchase price, logistics, admin fees, bank charges, clearing and delivery (USD)
            </p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!items.length}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
        </div>

        <Tabs defaultValue="costing">
          <TabsList>
            <TabsTrigger value="costing">Costing</TabsTrigger>
            <TabsTrigger value="consignments">Consignment allocation</TabsTrigger>
          </TabsList>

          <TabsContent value="costing" className="space-y-6 pt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryStatCard label={`Landed cost (${totals?.vehicles ?? 0} vehicles)`} value={fmtMoney(totals?.landedCost)} icon={Package} tone="blue" />
              <SummaryStatCard label="Import costs" value={fmtMoney(totals?.importCosts)} icon={Wallet} tone="violet" />
              <SummaryStatCard label="Pending / unpaid costs" value={fmtMoney(totals?.pendingCosts)} icon={Banknote} tone="amber" />
              <SummaryStatCard label="Paid costs" value={fmtMoney(totals?.paidCosts)} icon={TrendingUp} tone="emerald" />
            </div>

            <Card className="border-slate-200/80">
              <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="costing-from">Added from</Label>
                  <Input id="costing-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="costing-to">Added to</Label>
                  <Input id="costing-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
                  <Label htmlFor="costing-search">Search</Label>
                  <Input id="costing-search" placeholder="Stock, VIN, model…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {alerts.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4" />{alerts.length} vehicle(s) need attention
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alerts.slice(0, 12).map((i) => (
                      <Link key={i.id} href={`/vehicles/${i.id}`} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs text-amber-900 hover:border-amber-300">
                        {i.stockNumber} · {i.description}
                        {i.negativeMargin ? " · negative margin" : i.lowMargin ? ` · ${i.marginPercent}% margin` : ""}
                        {i.hasUnpaidCosts ? ` · ${fmtMoney(i.pendingCosts)} unpaid` : ""}
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200/80">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-white">Vehicle</TableHead>
                      {COST_CATEGORIES.map((c) => (
                        <TableHead key={c.value} className="text-right whitespace-nowrap">{c.label}</TableHead>
                      ))}
                      <TableHead className="text-right whitespace-nowrap">Landed cost</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Pending</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Selling price</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Profit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={COST_CATEGORIES.length + 6}><LoadingRows rows={5} /></TableCell></TableRow>
                    ) : items.length === 0 ? (
                      <TableRow><TableCell colSpan={COST_CATEGORIES.length + 6} className="text-center py-12 text-slate-500">No vehicles match these filters.</TableCell></TableRow>
                    ) : (
                      <>
                        {items.map((i) => (
                          <TableRow key={i.id} className="hover:bg-slate-50">
                            <TableCell className="sticky left-0 bg-white">
                              <Link href={`/vehicles/${i.id}`} className="font-semibold hover:text-blue-700">{i.description}</Link>
                              <div className="text-xs text-slate-500 flex items-center gap-2">
                                <span className="font-mono">{i.stockNumber}</span>
                                <Badge className={`${statusTone[i.status] ?? ""} border-0 capitalize text-[10px] py-0`}>{i.status}</Badge>
                                {(i.negativeMargin || i.lowMargin) && <AlertTriangle className={`w-3.5 h-3.5 ${i.negativeMargin ? "text-rose-500" : "text-amber-500"}`} />}
                              </div>
                              <div className="text-[10px] text-slate-400">{stageLabel(i.stage)}</div>
                            </TableCell>
                            {COST_CATEGORIES.map((c) => (
                              <TableCell key={c.value} className="text-right text-xs whitespace-nowrap">
                                {i.costsByCategory?.[c.value] ? fmtMoney(i.costsByCategory[c.value]) : <span className="text-slate-300">—</span>}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold whitespace-nowrap">{fmtMoney(i.landedCost)}</TableCell>
                            <TableCell className="text-right text-xs whitespace-nowrap text-amber-700">{i.pendingCosts ? fmtMoney(i.pendingCosts) : "—"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {fmtMoney(i.sellingPrice)}
                              {i.isProjected && <span className="block text-[10px] text-slate-400">target</span>}
                            </TableCell>
                            <TableCell className={`text-right font-bold whitespace-nowrap ${i.profit < 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtMoney(i.profit)}</TableCell>
                            <TableCell className={`text-right whitespace-nowrap ${i.marginPercent < 0 ? "text-rose-600" : ""}`}>{i.marginPercent}%</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 bg-slate-50 font-semibold">
                          <TableCell className="sticky left-0 bg-slate-50">Totals ({items.length})</TableCell>
                          {COST_CATEGORIES.map((c) => (
                            <TableCell key={c.value} className="text-right text-xs whitespace-nowrap">{fmtMoney(totals?.byCategory?.[c.value] ?? 0)}</TableCell>
                          ))}
                          <TableCell className="text-right whitespace-nowrap">{fmtMoney(totals?.landedCost)}</TableCell>
                          <TableCell className="text-right text-xs whitespace-nowrap text-amber-700">{fmtMoney(totals?.pendingCosts)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{fmtMoney(totals?.sellingPrice)}</TableCell>
                          <TableCell className={`text-right whitespace-nowrap ${(totals?.profit ?? 0) < 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtMoney(totals?.profit)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="consignments" className="space-y-4 pt-4">
            <Card className="border-slate-200/80">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Allocate freight costs to vehicles</CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Shipping, insurance, customs duty and handling are split across the vehicles linked to each consignment.
                    Re-running replaces the previous automatic lines.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Weight by</Label>
                  <Select value={weights} onValueChange={(v) => setWeights(v as "purchase" | "equal")}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Purchase value</SelectItem>
                      <SelectItem value="equal">Equal split</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Consignment</TableHead>
                        <TableHead>Forwarder</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Vehicles</TableHead>
                        <TableHead className="text-right">Shipping</TableHead>
                        <TableHead className="text-right">Insurance</TableHead>
                        <TableHead className="text-right">Duty</TableHead>
                        <TableHead className="text-right">Handling</TableHead>
                        <TableHead className="text-right">Total cost</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consignmentLoading ? (
                        <TableRow><TableCell colSpan={11}><LoadingRows rows={4} /></TableCell></TableRow>
                      ) : (consignmentData?.items ?? []).length === 0 ? (
                        <TableRow><TableCell colSpan={11} className="text-center py-12 text-slate-500">No consignments yet.</TableCell></TableRow>
                      ) : (consignmentData?.items ?? []).map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="font-semibold">{c.referenceNumber}</div>
                            <div className="text-xs text-slate-500">{c.supplierName || "—"}</div>
                          </TableCell>
                          <TableCell className="text-sm">{c.forwarderName || "—"}</TableCell>
                          <TableCell className="text-sm">{c.shippingMethod}</TableCell>
                          <TableCell className="text-right">{c.vehicleCount}</TableCell>
                          <TableCell className="text-right text-xs">{fmtMoney(c.shippingCost)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtMoney(c.insuranceCost)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtMoney(c.customsDuty)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtMoney(c.handlingCharges)}</TableCell>
                          <TableCell className="text-right font-medium">{fmtMoney(c.totalCost)}</TableCell>
                          <TableCell className="text-right">
                            <span className={c.allocatedTotal > 0 ? "text-emerald-700" : "text-slate-400"}>{fmtMoney(c.allocatedTotal)}</span>
                            {c.allocatedRows > 0 && <span className="block text-[10px] text-slate-400">{c.allocatedRows} lines</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={c.allocatedRows > 0 ? "outline" : "default"}
                              disabled={!c.canAllocate || allocate.isPending}
                              onClick={() => runAllocation(c)}
                            >
                              <Sparkles className="w-3.5 h-3.5 mr-1" />
                              {c.allocatedRows > 0 ? "Re-allocate" : "Allocate"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <Ship className="w-4 h-4 mt-0.5" />
              <p>
                Vehicles are linked to a consignment through their import tracking record. Only vehicles with a purchase
                cost can be weighted by purchase value; otherwise an equal split is used automatically.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
