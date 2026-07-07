import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock } from "lucide-react";

export default function WorkOrderDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wo, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/work-orders/${id}`],
    enabled: !!companyId && !!id,
  });

  const { data: bom } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/bom/${(wo as any)?.bomId}`],
    enabled: !!companyId && !!(wo as any)?.bomId,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/work-orders/${id}/start`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/work-orders/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/work-orders`] });
      toast({ title: "Started", description: "Work order is now in progress." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/work-orders/${id}/complete`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/work-orders/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/work-orders`] });
      toast({ title: "Success", description: "Work order completed and inventory updated!" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!wo) return <div>Work Order not found</div>;

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-start">
        <PageHeader 
          title={`Work Order #WO-${(wo as any)?.id}`} 
           
        />
        <div className="flex gap-4 items-center">
          <Badge variant={(wo as any)?.status === "COMPLETED" ? "default" : "secondary"} className="text-sm py-1">
            {(wo as any)?.status === "COMPLETED" ? <CheckCircle className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
            {(wo as any)?.status}
          </Badge>
          {(wo as any)?.status === "PLANNED" && (
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !bom} variant="outline" className="border-indigo-600 text-indigo-600 hover:bg-indigo-50">
              {startMutation.isPending ? "Processing..." : "Start Production"}
            </Button>
          )}
          {(wo as any)?.status === "IN_PROGRESS" && (
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending || !bom}>
              {completeMutation.isPending ? "Processing..." : "Finalize Production"}
            </Button>
          )}
        </div>
      </div>

      
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 w-full h-1 bg-slate-200 -z-10 -translate-y-1/2 rounded-full"></div>
          
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white z-10 ${(wo as any)?.status === 'PLANNED' || (wo as any)?.status === 'IN_PROGRESS' || (wo as any)?.status === 'COMPLETED' ? 'bg-indigo-600' : 'bg-slate-300'}`}>1</div>
            <span className="text-xs font-bold uppercase text-slate-500">Planned</span>
          </div>

          <div className={`absolute left-0 top-1/2 h-1 -z-10 -translate-y-1/2 rounded-full transition-all duration-500 ${(wo as any)?.status === 'COMPLETED' ? 'w-full bg-emerald-500' : ((wo as any)?.status === 'IN_PROGRESS' ? 'w-1/2 bg-indigo-600' : 'w-0')}`}></div>
          
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white z-10 ${(wo as any)?.status === 'IN_PROGRESS' || (wo as any)?.status === 'COMPLETED' ? 'bg-indigo-600' : 'bg-slate-300'}`}>2</div>
            <span className="text-xs font-bold uppercase text-slate-500">In Progress</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white z-10 ${(wo as any)?.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-slate-300'}`}>3</div>
            <span className="text-xs font-bold uppercase text-slate-500">Completed</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Product</span> <span>{(wo as any)?.product?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Recipe / BOM</span> <span>{(wo as any)?.bom?.name} (v{(wo as any)?.bom?.version})</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Planned Quantity</span> <span>{(wo as any)?.plannedQuantity}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Completed Quantity</span> <span>{(wo as any)?.completedQuantity}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Required Materials (Estimated)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Required Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((bom as any)?.lines as any[])?.map((line: any) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.componentProduct?.name}</TableCell>
                    <TableCell className="text-right">{Number(line.quantity) * Number((wo as any)?.plannedQuantity)} {line.unitOfMeasure}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {(wo as any)?.status === "COMPLETED" && (
        <Card>
          <CardHeader><CardTitle>Actual Consumptions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Consumed Qty</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((wo as any)?.consumptions as any[])?.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.product?.name}</TableCell>
                    <TableCell className="text-right">{c.quantityConsumed}</TableCell>
                    <TableCell>{new Date(c.date).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  
    </Layout>
  );
}
