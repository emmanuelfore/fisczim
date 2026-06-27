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

export default function WorkOrderList() {
  const { activeCompanyId: companyId } = useActiveCompany();

  const { data: workOrders, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/work-orders`],
    enabled: !!companyId,
  });

  return (
    <Layout>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Work Orders" 
           
        />
        <Link href={`/manufacturing/work-orders/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Work Order
          </Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>WO #</TableHead>
              <TableHead>Product / BOM</TableHead>
              <TableHead>Planned Qty</TableHead>
              <TableHead>Completed Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
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
            ) : (workOrders as any[])?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                  No work orders found.
                </TableCell>
              </TableRow>
            ) : (
              (workOrders as any[])?.map((wo: any) => (
                <TableRow key={wo.id}>
                  <TableCell className="font-medium">WO-{wo.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{wo.product?.name || "Unknown Product"}</div>
                    <div className="text-xs text-muted-foreground">BOM: {wo.bom?.name} (v{wo.bom?.version})</div>
                  </TableCell>
                  <TableCell>{wo.plannedQuantity}</TableCell>
                  <TableCell>{wo.completedQuantity}</TableCell>
                  <TableCell>
                    <Badge variant={wo.status === "COMPLETED" ? "default" : "secondary"} className="flex w-fit items-center gap-1">
                      {wo.status === "COMPLETED" ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {wo.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(wo.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    <Link href={`/manufacturing/work-orders/${wo.id}`}>
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
