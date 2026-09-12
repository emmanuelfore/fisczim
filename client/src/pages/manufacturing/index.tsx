import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory, Wrench, Building2, ClipboardList, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function ManufacturingDashboard() {
  const { activeCompanyId: companyId } = useActiveCompany();

  const { data: wos } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/production-runs`],
    enabled: !!companyId,
  });

  const { data: boms } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/bom`],
    enabled: !!companyId,
  });

  const { data: wcs } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/manufacturing/work-centers`],
    enabled: !!companyId,
  });

  const activeWos = wos?.filter((wo: any) => wo.status === "IN_PROGRESS")?.length || 0;
  const plannedWos = wos?.filter((wo: any) => wo.status === "PLANNED")?.length || 0;

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center">
          <PageHeader title="Manufacturing Dashboard" subtitle="Overview of production and manufacturing operations" />
          <div className="flex gap-2">
            <Link href="/manufacturing/reports"><Button variant="outline"><BarChart3 className="mr-2 h-4 w-4" /> Reports</Button></Link>
            <Link href="/manufacturing/standard-costs"><Button variant="outline"><DollarSign className="mr-2 h-4 w-4" /> Standard Costs</Button></Link>
            <Link href="/manufacturing/mrp"><Button variant="outline"><TrendingUp className="mr-2 h-4 w-4" /> MRP Run</Button></Link>
            <Link href="/manufacturing/production-runs/new"><Button><Wrench className="mr-2 h-4 w-4" /> New Production Run</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Production Runs</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeWos}</div>
              <p className="text-xs text-muted-foreground">{plannedWos} planned</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total BOMs</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{boms?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Active recipes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Work Centers</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{wcs?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Operational stations</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Production Output</CardTitle>
              <Factory className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {wos?.filter((wo: any) => wo.status === "COMPLETED")?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Completed production runs</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Recent Production Runs</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {wos?.slice(0, 5).map((wo: any) => (
                  <div key={wo.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-sm">PR-{wo.id}</p>
                      <p className="text-xs text-muted-foreground">{wo.bom?.name || `Product #${wo.bomId}`}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm">{wo.status}</p>
                      <p className="text-xs text-muted-foreground">Qty: {wo.plannedQuantity}</p>
                    </div>
                  </div>
                ))}
                {(!wos || wos.length === 0) && <p className="text-sm text-muted-foreground py-4 text-center">No production runs found</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
