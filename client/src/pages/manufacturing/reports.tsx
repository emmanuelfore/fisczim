import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Factory, 
  Clock, 
  Package, 
  Wrench,
  Download,
  Calendar,
  Filter
} from "lucide-react";
import { useState } from "react";
import { format, subDays, subMonths } from "date-fns";

export default function ManufacturingReports() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const [dateRange, setDateRange] = useState("30"); // days

  const { data: productionRuns } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/production-runs`],
    enabled: !!companyId,
  });

  const { data: boms } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/bom`],
    enabled: !!companyId,
  });

  const { data: workCenters } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/work-centers`],
    enabled: !!companyId,
  });

  // Calculate production performance metrics
  const completedRuns = productionRuns?.filter((run: any) => run.status === "COMPLETED") || [];
  const inProgressRuns = productionRuns?.filter((run: any) => run.status === "IN_PROGRESS") || [];
  
  const totalPlannedQty = completedRuns.reduce((sum: number, run: any) => sum + Number(run.plannedQuantity || 0), 0);
  const totalCompletedQty = completedRuns.reduce((sum: number, run: any) => sum + Number(run.completedQuantity || 0), 0);
  const yieldRate = totalPlannedQty > 0 ? (totalCompletedQty / totalPlannedQty) * 100 : 0;

  const totalPlannedMaterialCost = completedRuns.reduce((sum: number, run: any) => sum + Number(run.plannedMaterialCost || 0), 0);
  const totalActualMaterialCost = completedRuns.reduce((sum: number, run: any) => sum + Number(run.actualMaterialCost || 0), 0);
  const materialVariance = totalPlannedMaterialCost - totalActualMaterialCost;

  const totalPlannedLaborCost = completedRuns.reduce((sum: number, run: any) => sum + Number(run.plannedLaborCost || 0), 0);
  const totalActualLaborCost = completedRuns.reduce((sum: number, run: any) => sum + Number(run.actualLaborCost || 0), 0);
  const laborVariance = totalPlannedLaborCost - totalActualLaborCost;

  // Work center utilization (simplified calculation)
  const workCenterUtilization = workCenters?.map((wc: any) => {
    const runsForCenter = completedRuns.filter((run: any) => 
      run.timeConfirmations?.some((tc: any) => tc.workCenterId === wc.id)
    );
    const totalHours = runsForCenter.reduce((sum: number, run: any) => 
      sum + run.timeConfirmations?.reduce((hSum: number, tc: any) => hSum + Number(tc.hours || 0), 0), 0
    );
    return {
      ...wc,
      totalHours,
      runsCount: runsForCenter.length
    };
  }) || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <PageHeader 
            title="Manufacturing Reports" 
            subtitle="Production performance, cost analysis, and utilization metrics" 
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calendar className="mr-2 h-4 w-4" />
              Last {dateRange} days
            </Button>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
            <Button size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Production Yield</CardTitle>
              <Factory className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{yieldRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {totalCompletedQty} / {totalPlannedQty} units
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Material Variance</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${materialVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${Math.abs(materialVariance).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                {materialVariance >= 0 ? 'Under budget' : 'Over budget'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Labor Variance</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${laborVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${Math.abs(laborVariance).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                {laborVariance >= 0 ? 'Under budget' : 'Over budget'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Runs</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inProgressRuns.length}</div>
              <p className="text-xs text-muted-foreground">
                {completedRuns.length} completed
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList>
            <TabsTrigger value="performance">Production Performance</TabsTrigger>
            <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
            <TabsTrigger value="utilization">Work Center Utilization</TabsTrigger>
            <TabsTrigger value="wip">Work in Progress</TabsTrigger>
            <TabsTrigger value="bom">BOM Costs</TabsTrigger>
          </TabsList>

          {/* Production Performance Report */}
          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Production Run Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Planned Qty</TableHead>
                      <TableHead className="text-right">Completed Qty</TableHead>
                      <TableHead className="text-right">Yield %</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Completion Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedRuns.map((run: any) => {
                      const yieldPct = Number(run.plannedQuantity) > 0 
                        ? (Number(run.completedQuantity) / Number(run.plannedQuantity)) * 100 
                        : 0;
                      return (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">PR-{run.id}</TableCell>
                          <TableCell>{run.product?.name || `Product #${run.bomId}`}</TableCell>
                          <TableCell className="text-right">{run.plannedQuantity}</TableCell>
                          <TableCell className="text-right">{run.completedQuantity}</TableCell>
                          <TableCell className="text-right">
                            <span className={yieldPct >= 95 ? 'text-emerald-600' : yieldPct >= 80 ? 'text-amber-600' : 'text-red-600'}>
                              {yieldPct.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={run.status === "COMPLETED" ? "default" : "secondary"}>
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {run.updatedAt ? format(new Date(run.updatedAt), "dd MMM yyyy") : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {completedRuns.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No completed production runs found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cost Analysis Report */}
          <TabsContent value="costs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Cost Variance Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Planned Material</TableHead>
                      <TableHead className="text-right">Actual Material</TableHead>
                      <TableHead className="text-right">Material Variance</TableHead>
                      <TableHead className="text-right">Planned Labor</TableHead>
                      <TableHead className="text-right">Actual Labor</TableHead>
                      <TableHead className="text-right">Labor Variance</TableHead>
                      <TableHead className="text-right">Total Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedRuns.map((run: any) => {
                      const matVar = Number(run.plannedMaterialCost || 0) - Number(run.actualMaterialCost || 0);
                      const laborVar = Number(run.plannedLaborCost || 0) - Number(run.actualLaborCost || 0);
                      const totalVar = matVar + laborVar;
                      return (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">PR-{run.id}</TableCell>
                          <TableCell>{run.product?.name || `Product #${run.bomId}`}</TableCell>
                          <TableCell className="text-right">${Number(run.plannedMaterialCost || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">${Number(run.actualMaterialCost || 0).toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${matVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            ${Math.abs(matVar).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">${Number(run.plannedLaborCost || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">${Number(run.actualLaborCost || 0).toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${laborVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            ${Math.abs(laborVar).toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${totalVar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            ${Math.abs(totalVar).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {completedRuns.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No completed production runs found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Work Center Utilization Report */}
          <TabsContent value="utilization" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Work Center Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Center</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Cost/Hour</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                      <TableHead className="text-right">Runs Processed</TableHead>
                      <TableHead className="text-right">Utilization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workCenterUtilization.map((wc: any) => {
                      const utilization = wc.totalHours > 0 ? "Active" : "Idle";
                      return (
                        <TableRow key={wc.id}>
                          <TableCell className="font-medium">{wc.name}</TableCell>
                          <TableCell className="text-muted-foreground">{wc.description || "-"}</TableCell>
                          <TableCell className="text-right">${Number(wc.costPerHour || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{wc.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{wc.runsCount}</TableCell>
                          <TableCell>
                            <Badge variant={utilization === "Active" ? "default" : "secondary"}>
                              {utilization}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {workCenterUtilization.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No work centers found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Work in Progress Report */}
          <TabsContent value="wip" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Work in Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Planned Qty</TableHead>
                      <TableHead className="text-right">Completed Qty</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Days in Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inProgressRuns.map((run: any) => {
                      const progress = Number(run.plannedQuantity) > 0 
                        ? (Number(run.completedQuantity) / Number(run.plannedQuantity)) * 100 
                        : 0;
                      const daysInProgress = run.plannedStart 
                        ? Math.floor((new Date().getTime() - new Date(run.plannedStart).getTime()) / (1000 * 60 * 60 * 24))
                        : 0;
                      return (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">PR-{run.id}</TableCell>
                          <TableCell>{run.product?.name || `Product #${run.bomId}`}</TableCell>
                          <TableCell className="text-right">{run.plannedQuantity}</TableCell>
                          <TableCell className="text-right">{run.completedQuantity}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-indigo-600 transition-all" 
                                  style={{ width: `${Math.min(progress, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs">{progress.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">{run.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {run.plannedStart ? format(new Date(run.plannedStart), "dd MMM yyyy") : "-"}
                          </TableCell>
                          <TableCell className="text-right">{daysInProgress} days</TableCell>
                        </TableRow>
                      );
                    })}
                    {inProgressRuns.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No work in progress found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BOM Costs Report */}
          <TabsContent value="bom" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  BOM Cost Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>BOM</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead className="text-right">Components</TableHead>
                      <TableHead className="text-right">Material Cost</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boms?.map((bom: any) => {
                      const materialCost = (bom.lines as any[])?.reduce((sum: number, line: any) => 
                        sum + (Number(line.quantity) * Number(line.componentProduct?.price || 0)), 0
                      ) || 0;
                      return (
                        <TableRow key={bom.id}>
                          <TableCell className="font-medium">{bom.name}</TableCell>
                          <TableCell>{bom.product?.name || "-"}</TableCell>
                          <TableCell>v{bom.version || 1}</TableCell>
                          <TableCell className="text-right">{bom.lines?.length || 0}</TableCell>
                          <TableCell className="text-right">${materialCost.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="default">Active</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!boms || boms.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No BOMs found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
