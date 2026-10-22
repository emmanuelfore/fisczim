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
import { CheckCircle, Clock, PackageMinus, Clock4, DollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GoodsIssueForm } from "@/components/manufacturing/goods-issue-form";
import { TimeConfirmationForm } from "@/components/manufacturing/time-confirmation-form";
import { CompleteProductionRunDialog } from "@/components/manufacturing/complete-production-run-dialog";
import { useState } from "react";

export default function ProductionRunDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGoodsIssueOpen, setIsGoodsIssueOpen] = useState(false);
  const [isTimeConfirmOpen, setIsTimeConfirmOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);

  const { data: wo, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/production-runs/${id}`],
    enabled: !!companyId && !!id,
  });

  const { data: bom } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/bom/${(wo as any)?.bomId}`],
    enabled: !!companyId && !!(wo as any)?.bomId && (wo as any)?.type === "RECIPE",
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/production-runs/${id}/start`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/production-runs/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/production-runs`] });
      toast({ title: "Started", description: "Production run is now in progress." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!wo) return <div>Production Run not found</div>;

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-start">
        <PageHeader 
          title={`Production Run #PR-${(wo as any)?.id}`} 
           
        />
        <div className="flex gap-4 items-center">
          <Badge variant={(wo as any)?.status === "COMPLETED" ? "default" : "secondary"} className="text-sm py-1">
            {(wo as any)?.status === "COMPLETED" ? <CheckCircle className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
            {(wo as any)?.status}
          </Badge>
          <Badge variant="outline" className="text-sm py-1">
            {(wo as any)?.type === "RECIPE" ? "Recipe (BOM)" : "Simple (Manual)"}
          </Badge>
          {(wo as any)?.status === "PLANNED" && (
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || ((wo as any)?.type === "RECIPE" && !bom)} variant="outline" className="border-indigo-600 text-indigo-600 hover:bg-indigo-50">
              {startMutation.isPending ? "Processing..." : "Start Production"}
            </Button>
          )}
          {(wo as any)?.status === "IN_PROGRESS" && (
            <>
              <Dialog open={isGoodsIssueOpen} onOpenChange={setIsGoodsIssueOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><PackageMinus className="mr-2 h-4 w-4" /> Issue Materials</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Post Goods Issue / Return</DialogTitle></DialogHeader>
                  <GoodsIssueForm productionRunId={Number(id)} onSuccess={() => setIsGoodsIssueOpen(false)} />
                </DialogContent>
              </Dialog>

              <Dialog open={isTimeConfirmOpen} onOpenChange={setIsTimeConfirmOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Clock4 className="mr-2 h-4 w-4" /> Log Time</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Log Labor Time</DialogTitle></DialogHeader>
                  <TimeConfirmationForm productionRunId={Number(id)} onSuccess={() => setIsTimeConfirmOpen(false)} />
                </DialogContent>
              </Dialog>

              <Button onClick={() => setIsCompleteOpen(true)} disabled={(wo as any)?.type === "RECIPE" && !bom}>
                Finalize Production
              </Button>
            </>
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
            {(wo as any)?.type === "RECIPE" ? (
              <div className="flex justify-between"><span className="text-muted-foreground">Recipe / BOM</span> <span>{(wo as any)?.bom?.name} (v{(wo as any)?.bom?.version})</span></div>
            ) : (
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span> <span>Simple (Manual Input/Output)</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Planned Quantity</span> <span>{(wo as any)?.plannedQuantity}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Completed Quantity</span> <span>{(wo as any)?.completedQuantity}</span></div>
          </CardContent>
        </Card>

        {(wo as any)?.type === "RECIPE" && (
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
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              Material Transactions
              {(wo as any)?.type === "SIMPLE" && <span className="text-sm font-normal text-muted-foreground ml-2">(Manual Input/Output)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((wo as any)?.goodsIssues as any[])?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No materials issued yet.</TableCell></TableRow>
                )}
                {((wo as any)?.goodsIssues as any[])?.map((issue: any) => (
                  <TableRow key={issue.id}>
                    <TableCell><Badge variant={issue.type === 'ISSUE' ? 'secondary' : 'outline'}>{issue.type}</Badge></TableCell>
                    <TableCell>{issue.product?.name}</TableCell>
                    <TableCell className="text-right">{issue.quantity}</TableCell>
                    <TableCell className="text-right">${(Number(issue.quantity) * Number(issue.unitCost || 0)).toFixed(2)}</TableCell>
                    <TableCell>{new Date(issue.postedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Cost Summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Planned Material</span> <span>${Number((wo as any)?.plannedMaterialCost || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm font-medium"><span>Actual Material</span> <span>${Number((wo as any)?.actualMaterialCost || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                <span>Variance</span> 
                <span className={Number((wo as any)?.varianceMaterial || 0) > 0 ? "text-red-500" : "text-emerald-500"}>
                  ${Number((wo as any)?.varianceMaterial || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-1 pt-4 border-t">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Planned Labor</span> <span>${Number((wo as any)?.plannedLaborCost || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm font-medium"><span>Actual Labor</span> <span>${Number((wo as any)?.actualLaborCost || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                <span>Variance</span> 
                <span className={Number((wo as any)?.varianceLabor || 0) > 0 ? "text-red-500" : "text-emerald-500"}>
                  ${Number((wo as any)?.varianceLabor || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-1 pt-4 border-t bg-slate-50 p-2 rounded">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Actual Cost</span> 
                <span>${(Number((wo as any)?.actualMaterialCost || 0) + Number((wo as any)?.actualLaborCost || 0) + Number((wo as any)?.actualOverheadCost || 0)).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Time Confirmations</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Center</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Labor Cost</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((wo as any)?.timeConfirmations as any[])?.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No time logged yet.</TableCell></TableRow>
              )}
              {((wo as any)?.timeConfirmations as any[])?.map((time: any) => (
                <TableRow key={time.id}>
                  <TableCell>{time.workCenter?.name}</TableCell>
                  <TableCell>{time.employee ? `${time.employee.firstName} ${time.employee.lastName}` : "N/A"}</TableCell>
                  <TableCell className="text-right">{time.hours}</TableCell>
                  <TableCell className="text-right">${Number(time.laborCost || 0).toFixed(2)}</TableCell>
                  <TableCell>{new Date(time.postedAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  
      <CompleteProductionRunDialog 
        open={isCompleteOpen} 
        onOpenChange={setIsCompleteOpen}
        companyId={companyId!}
        productionRunId={id!}
        plannedQuantity={(wo as any)?.plannedQuantity || 0}
      />
    </Layout>
  );
}
