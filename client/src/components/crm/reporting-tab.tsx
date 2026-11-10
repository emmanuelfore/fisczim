import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { usePipelineReport } from "@/hooks/use-crm";
import { formatCurrencyAmount } from "@shared/currency";
import { sourceLabel } from "@/lib/crm";
import { CheckCircle2, Car, CircleDollarSign, Target, TrendingUp, Wallet } from "lucide-react";

/**
 * Odoo's "Reporting" menu. The server already buckets the pipeline by stage,
 * source and salesperson and computes the weighted forecast, so this is a
 * rendering job rather than a second query layer.
 */
export function ReportingTab({ companyId, currency }: { companyId: number; currency?: string | null }) {
  const { data: report, isLoading } = usePipelineReport(companyId);

  if (isLoading) return <LoadingRows />;
  if (!report) return <p className="text-sm text-slate-500">No pipeline data yet.</p>;

  const { totals, byStage, bySource, byAssignee } = report;
  const money = (value: number) => formatCurrencyAmount(Number(value || 0), currency);
  const widest = Math.max(1, ...byStage.map((s: any) => s.value));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Open pipeline value" value={money(totals.openValue)} hint={`${totals.open} open enquiries`} />
        <Kpi icon={Target} label="Weighted forecast" value={money(totals.weightedForecast)} hint="each stage's probability applied" />
        <Kpi icon={CheckCircle2} label="Win rate" value={`${Math.round(totals.winRate || 0)}%`} hint={`${totals.won} won of ${totals.won + totals.lost} closed`} />
        <Kpi icon={TrendingUp} label="Logged to revenue" value={`${totals.quotations} quotes`} hint={`${totals.activitiesLast30Days} activities in 30 days`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={Car}
          label="Units delivered"
          value={String(totals.vehiclesSold ?? 0)}
          hint={`${totals.vehiclesLinked ?? 0} leads linked to stock`}
        />
        <Kpi
          icon={CircleDollarSign}
          label="Vehicle revenue"
          value={money(totals.vehicleRevenue ?? 0)}
          hint={`${Math.round(totals.leadToDeliveryRate || 0)}% of linked leads delivered`}
        />
        <Kpi
          icon={TrendingUp}
          label="Vehicle gross profit"
          value={money(totals.vehicleGrossProfit ?? 0)}
          hint={`${money(totals.vehicleCogs ?? 0)} cost of sales`}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Stage</TableHead>
                <TableHead className="text-right">Enquiries</TableHead>
                <TableHead className="text-right">Probability</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="pr-4 text-right">Weighted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byStage.map((stage: any) => (
                <TableRow key={stage.stageId}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{stage.name}</span>
                      {stage.isWon ? <Badge className="bg-emerald-100 text-emerald-700">Won</Badge> : null}
                      {stage.isLost ? <Badge className="bg-rose-100 text-rose-700">Lost</Badge> : null}
                    </div>
                    <Progress value={(stage.value / widest) * 100} className="mt-1 h-1.5 bg-slate-100" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{stage.count}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">{stage.probability}%</TableCell>
                  <TableCell className="text-right tabular-nums">{money(stage.value)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums text-slate-500">{money(stage.weightedValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Leads by source
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Source</TableHead>
                  <TableHead className="text-right">Captured</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="pr-4 text-right">GP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySource.map((row: any) => (
                  <TableRow key={row.source}>
                    <TableCell className="pl-4">{sourceLabel(row.source)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.count ? `${Math.round((row.won / row.count) * 100)}%` : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.units ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.vehicleRevenue ?? 0)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{money(row.vehicleGrossProfit ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Salesperson performance
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Salesperson</TableHead>
                  <TableHead className="text-right">Carrying</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="pr-4 text-right">GP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byAssignee.map((row: any) => (
                  <TableRow key={row.userId}>
                    <TableCell className="pl-4">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.won}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.units ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.vehicleRevenue ?? 0)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{money(row.vehicleGrossProfit ?? 0)}</TableCell>
                  </TableRow>
                ))}
                {!byAssignee.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-400">
                      Nothing assigned yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
        <div className="text-xs text-slate-400">{hint}</div>
      </CardContent>
    </Card>
  );
}
