import { Layout } from "@/components/layout";
import { VehicleModuleNav } from "@/components/vehicles/module-nav";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { QuickAddCostDialog } from "@/components/vehicles/quick-add-cost-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportMetrics } from "@/components/vehicles/report-metrics";
import { ReportPagination } from "@/components/vehicles/report-pagination";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  ChevronDown,
  ChevronRight,
  Download,
  Package,
  Plus,
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
  accountingModel?: "agent" | "principal";
  processingFee?: number;
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
  const [costPage, setCostPage] = useState(0);
  const [consignmentPage, setConsignmentPage] = useState(0);
  const [consignmentSearch, setConsignmentSearch] = useState("");
  const pageSize = 10;
  useEffect(() => setCostPage(0), [from, to, supplierId, status, stage, search, companyId]);
  useEffect(() => setConsignmentPage(0), [consignmentSearch, companyId]);
  const [weights, setWeights] = useState<"purchase" | "equal">("purchase");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addFor, setAddFor] = useState<{ id: number; label: string } | null>(null);
  const canEditCosts = can("vehicles.costs");

  const filters = { from, to, supplierId, status, stage, search };
  const { data, isLoading, isError, refetch } = useVehicleReport<{ totals: any; items: CostingRow[] }>(companyId, "costing", allowed, filters);
  const { data: consignmentData, isLoading: consignmentLoading, isError: consignmentError, refetch: refetchConsignments } = useVehicleReport<{ items: ConsignmentRow[] }>(
    companyId,
    "consignments",
    allowed,
  );
  const allocate = useAllocateConsignment(companyId);

  const items = data?.items ?? [];
  const consignmentTerm = consignmentSearch.trim().toLowerCase();
  const consignments = (consignmentData?.items ?? []).filter(row => [row.referenceNumber, row.supplierName, row.forwarderName]
    .some(value => value?.toLowerCase().includes(consignmentTerm)));
  const shownCostPage = Math.min(costPage, Math.max(0, Math.ceil(items.length / pageSize) - 1));
  const shownConsignmentPage = Math.min(consignmentPage, Math.max(0, Math.ceil(consignments.length / pageSize) - 1));
  const totals = data?.totals;
  const alerts = useMemo(
    () => items.filter((i) => (i.accountingModel !== "agent" && (i.negativeMargin || i.lowMargin)) || i.hasUnpaidCosts),
    [items],
  );

  const exportCsv = () => {
    const head = [
      "Stock #", "Vehicle", "VIN", "Status", "Stage", "Customer", "Model",
      ...COST_CATEGORIES.map((c) => c.label),
      "Landed cost", "Pending costs", "Paid costs", "Selling price", "Processing fee", "Projected", "Profit / fee", "Margin %", "Alerts",
    ];
    const rows = items.map((i) => [
      i.stockNumber, i.description, i.vin ?? "", i.status, stageLabel(i.stage), i.customerName ?? "", i.accountingModel ?? "agent",
      ...COST_CATEGORIES.map((c) => i.costsByCategory?.[c.value] ?? 0),
      i.landedCost, i.pendingCosts, i.paidCosts, i.sellingPrice, i.processingFee ?? 0, i.isProjected ? "yes" : "no", i.profit, i.marginPercent,
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
              Estimated, actual and customer-charge costs per vehicle. On agency deals the customer funds third-party costs;
              Prime Imports&apos; revenue is the processing fee only. On principal deals sale less landed cost is profit.
            </p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!items.length}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
        </div>

        <VehicleModuleNav />
        {isError && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">Could not load this report. <Button variant="link" onClick={() => refetch()}>Retry</Button></div>}
        <Tabs defaultValue="costing">
          <TabsList>
            <TabsTrigger value="costing">Costing</TabsTrigger>
            <TabsTrigger value="consignments">Consignment allocation</TabsTrigger>
          </TabsList>

          <TabsContent value="costing" className="space-y-6 pt-4">
            {!isError && <ReportMetrics metrics={[
              { label: "Landed costs", value: isLoading ? "—" : fmtMoney(totals?.landedCost) },
              { label: "Import costs", value: isLoading ? "—" : fmtMoney(totals?.importCosts) },
              { label: "Customer import costs", value: isLoading ? "—" : fmtMoney(items.filter(row => row.accountingModel !== "principal").reduce((sum, row) => sum + row.landedCost, 0)) },
              { label: "Agreed processing fees", value: isLoading ? "—" : fmtMoney(items.reduce((sum, row) => sum + (row.processingFee ?? 0), 0)) },
              { label: "Unpaid costs", value: isLoading ? "—" : fmtMoney(totals?.pendingCosts) },
              { label: "Paid costs", value: isLoading ? "—" : fmtMoney(totals?.paidCosts) },
            ]} />}
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
                {(from || to || supplierId !== "all" || status !== "all" || stage !== "all" || search) &&
                  <Button variant="link" className="justify-self-start px-0" onClick={() => {
                    setFrom(""); setTo(""); setSupplierId("all"); setStatus("all"); setStage("all"); setSearch("");
                  }}>Clear filters</Button>}
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
              <Table className="table-fixed">
                <TableHeader><TableRow>
                  <TableHead className="w-9 px-1"><span className="sr-only">Cost details</span></TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="w-24 px-2 text-right sm:w-40">Landed cost</TableHead>
                  <TableHead className="hidden w-32 text-right md:table-cell">Fee / profit</TableHead>
                  <TableHead className="w-12 px-1 text-right sm:w-24"><span className="sr-only">Actions</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {isLoading ? <TableRow><TableCell colSpan={5}><LoadingRows rows={5} /></TableCell></TableRow>
                    : items.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-600">No vehicles match these filters.</TableCell></TableRow>
                    : items.slice(shownCostPage * pageSize, (shownCostPage + 1) * pageSize).map(i => {
                      const isOpen = expanded === i.id;
                      const agency = i.accountingModel !== "principal";
                      const costs = COST_CATEGORIES.filter(category => Number(i.costsByCategory?.[category.value] ?? 0) !== 0);
                      return <Fragment key={i.id}>
                        <TableRow>
                          <TableCell className="px-1"><Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-expanded={isOpen} aria-label={"Cost breakdown for " + i.stockNumber} onClick={() => setExpanded(isOpen ? null : i.id)}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button></TableCell>
                          <TableCell className="break-words px-1 sm:px-3">
                            <Link href={"/vehicles/" + i.id} className="font-semibold text-blue-700 hover:underline">{i.description}</Link>
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-600">
                              <span className="font-mono">{i.stockNumber}</span>
                              <Badge className={"capitalize " + (statusTone[i.status] ?? "")}>{i.status}</Badge>
                              <span className="hidden sm:inline">{stageLabel(i.stage)}</span>
                            </div>
                            {i.pendingCosts > 0 && <span className="mt-1 block text-xs text-amber-800">{fmtMoney(i.pendingCosts)} unpaid</span>}
                          </TableCell>
                          <TableCell className="px-2 text-right text-sm font-semibold tabular-nums">{fmtMoney(i.landedCost)}</TableCell>
                          <TableCell className={"hidden text-right tabular-nums md:table-cell " + (i.profit < 0 ? "text-rose-700" : "text-slate-800")}>
                            {fmtMoney(agency ? i.processingFee ?? 0 : i.profit)}<span className="block text-xs text-slate-500">{agency ? "Processing fee" : i.marginPercent + "% margin"}</span>
                          </TableCell>
                          <TableCell className="px-1 text-right">{canEditCosts && <Button id={"add-cost-" + i.id} size="sm" variant="outline" className="h-8 px-2" aria-label={"Add cost for " + i.stockNumber} onClick={() => setAddFor({ id: i.id, label: i.stockNumber + " · " + i.description })}>
                            <Plus className="h-4 w-4" /><span className="ml-1 hidden sm:inline">Cost</span>
                          </Button>}</TableCell>
                        </TableRow>
                        {isOpen && <TableRow className="bg-slate-50"><TableCell colSpan={5} className="space-y-3 p-3 sm:p-4">
                          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                            <div><dt className="text-slate-600">Purchase</dt><dd className="font-medium">{fmtMoney(i.purchasePrice)}</dd></div>
                            <div><dt className="text-slate-600">Import costs</dt><dd className="font-medium">{fmtMoney(i.importCosts)}</dd></div>
                            <div><dt className="text-slate-600">{i.isProjected ? "Target price" : "Selling price"}</dt><dd className="font-medium">{fmtMoney(i.sellingPrice)}</dd></div>
                            <div><dt className="text-slate-600">{agency ? "Processing fee" : "Profit"}</dt><dd className="font-medium">{fmtMoney(agency ? i.processingFee ?? 0 : i.profit)}{!agency && " · " + i.marginPercent + "%"}</dd></div>
                          </dl>
                          {costs.length > 0 && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs md:grid-cols-4">
                            {costs.map(category => <div key={category.value}><dt className="text-slate-600">{category.label}</dt><dd className="font-medium">{fmtMoney(i.costsByCategory[category.value])}</dd></div>)}
                          </dl>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span>Paid <strong className="text-emerald-700">{fmtMoney(i.paidCosts)}</strong></span>
                            <span>Pending <strong className="text-amber-700">{fmtMoney(i.pendingCosts)}</strong></span>
                            {i.disputedCosts > 0 && <span>Disputed <strong className="text-rose-700">{fmtMoney(i.disputedCosts)}</strong></span>}
                            {i.customerName && <span>Customer <strong>{i.customerName}</strong></span>}
                          </div>
                        </TableCell></TableRow>}
                      </Fragment>;
                    })}
                </TableBody>
              </Table>
              <ReportPagination total={items.length} pageSize={pageSize} page={shownCostPage} onChange={value => { setCostPage(value); setExpanded(null); }} />
              {items.length > 0 && <details className="border-t px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium">Totals for {items.length} matching vehicles</summary>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <div><dt className="text-slate-600">Purchase</dt><dd>{fmtMoney(totals?.byCategory?.purchase)}</dd></div>
                  <div><dt className="text-slate-600">Import costs</dt><dd>{fmtMoney(totals?.importCosts)}</dd></div>
                  <div><dt className="text-slate-600">Landed costs</dt><dd>{fmtMoney(totals?.landedCost)}</dd></div>
                  <div><dt className="text-slate-600">Selling prices</dt><dd>{fmtMoney(totals?.sellingPrice)}</dd></div>
                  <div><dt className="text-slate-600">Profit / fees</dt><dd>{fmtMoney(totals?.profit)}</dd></div>
                </dl>
              </details>}
            </Card>
            <QuickAddCostDialog companyId={companyId} vehicle={addFor} open={!!addFor} onOpenChange={(o) => !o && setAddFor(null)} />
          </TabsContent>

          <TabsContent value="consignments" className="space-y-4 pt-4">
            <Input aria-label="Search consignments" value={consignmentSearch} onChange={event => setConsignmentSearch(event.target.value)} placeholder="Search by reference, supplier or forwarder" className="max-w-md" />
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
                <Table className="table-fixed">
                  <TableHeader><TableRow><TableHead>Consignment</TableHead><TableHead className="w-24 px-2 text-right sm:w-36">Total cost</TableHead><TableHead className="hidden w-36 text-right md:table-cell">Allocated</TableHead><TableHead className="w-24 px-1 text-right sm:w-32"><span className="sr-only">Allocation</span></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {consignmentLoading ? <TableRow><TableCell colSpan={4}><LoadingRows rows={4} /></TableCell></TableRow>
                      : consignmentError ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-rose-700">Could not load consignments. <Button variant="link" onClick={() => refetchConsignments()}>Retry</Button></TableCell></TableRow>
                      : consignments.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-slate-600">{consignmentTerm ? "No consignments match this search." : "No consignments yet."}</TableCell></TableRow>
                      : consignments.slice(shownConsignmentPage * pageSize, (shownConsignmentPage + 1) * pageSize).map(c => <TableRow key={c.id}>
                        <TableCell className="break-words px-2 sm:px-4">
                          <div className="font-semibold">{c.referenceNumber}</div>
                          <div className="text-xs text-slate-600">{[c.supplierName, c.vehicleCount + " vehicles"].filter(Boolean).join(" · ")}</div>
                          <details className="mt-1 text-xs text-slate-600">
                            <summary className="cursor-pointer">Freight breakdown</summary>
                            <dl className="mt-2 space-y-1">
                              {c.forwarderName && <div><dt>Forwarder</dt><dd>{c.forwarderName}</dd></div>}
                              <div><dt>Method</dt><dd>{c.shippingMethod}</dd></div>
                              {Object.entries({ Shipping: c.shippingCost, Insurance: c.insuranceCost, Duty: c.customsDuty, Handling: c.handlingCharges }).map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-x-2"><dt>{label}</dt><dd>{fmtMoney(amount)}</dd></div>)}
                              <div className="md:hidden"><dt>Allocated</dt><dd>{fmtMoney(c.allocatedTotal)}</dd></div>
                            </dl>
                          </details>
                        </TableCell>
                        <TableCell className="px-2 text-right text-sm font-semibold tabular-nums">{fmtMoney(c.totalCost)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-emerald-700 md:table-cell">{fmtMoney(c.allocatedTotal)}{c.allocatedRows > 0 && <span className="block text-xs text-slate-600">{c.allocatedRows} lines</span>}</TableCell>
                        <TableCell className="px-1 text-right">
                          <Button size="sm" className="px-2" variant={c.allocatedRows > 0 ? "outline" : "default"} disabled={!c.canAllocate || allocate.isPending} onClick={() => runAllocation(c)}>
                            <Sparkles className="mr-1 hidden h-4 w-4 sm:inline" />{c.allocatedRows > 0 ? "Re-allocate" : "Allocate"}
                          </Button>
                        </TableCell>
                      </TableRow>)}
                  </TableBody>
                </Table>
                <ReportPagination total={consignments.length} pageSize={pageSize} page={shownConsignmentPage} onChange={setConsignmentPage} />
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
