import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Plus, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

export default function ProductionRunList() {
  const { activeCompanyId: companyId } = useActiveCompany();

  const { data: productionRuns, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/production-runs`],
    enabled: !!companyId,
  });

  return (
    <Layout>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Production Runs" 
           
        />
        <Link href={`/manufacturing/production-runs/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Production Run
          </Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PR #</TableHead>
              <TableHead>Product / BOM</TableHead>
              <TableHead>Planned Qty</TableHead>
              <TableHead>Completed Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Planned Start</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ) : (productionRuns as any[])?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                  No production runs found.
                </TableCell>
              </TableRow>
            ) : (
              (productionRuns as any[])?.map((pr: any) => (
                <TableRow key={pr.id}>
                  <TableCell className="font-medium">PR-{pr.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{pr.product?.name || "Unknown Product"}</div>
                    <div className="text-xs text-muted-foreground">BOM: {pr.bom?.name} (v{pr.bom?.version})</div>
                  </TableCell>
                  <TableCell>{pr.plannedQuantity}</TableCell>
                  <TableCell>{pr.goodQuantity || pr.completedQuantity || 0}</TableCell>
                  <TableCell>
                    <Badge variant={pr.status === "COMPLETED" || pr.status === "SETTLED" ? "default" : "secondary"} className="flex w-fit items-center gap-1">
                      {pr.status === "COMPLETED" || pr.status === "SETTLED" ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {pr.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{pr.plannedStart ? format(new Date(pr.plannedStart), "MMM d, yyyy") : "N/A"}</TableCell>
                  <TableCell>
                    <Link href={`/manufacturing/production-runs/${pr.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  
    </Layout>
  );
}
