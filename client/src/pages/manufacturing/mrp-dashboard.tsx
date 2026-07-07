import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, RefreshCw, AlertTriangle, CheckCircle, ShoppingCart, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

export default function MrpDashboard() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mrpRuns, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/mrp/runs`],
    enabled: !!companyId,
  });

  const latestRun = mrpRuns?.[0];

  const { data: recommendations } = useQuery({
    queryKey: [`/api/companies/${companyId}/manufacturing/mrp/runs/${latestRun?.id}/recommendations`],
    enabled: !!companyId && !!latestRun?.id,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/mrp/run`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/mrp/runs`] });
      toast({ title: "MRP Complete", description: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/mrp/recommendations/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/mrp/runs/${latestRun?.id}/recommendations`] });
      toast({ title: "Success", description: "Recommendation approved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center">
          <PageHeader 
            title="Material Requirements Planning" 
            subtitle="Analyze supply vs demand and generate purchasing/production recommendations" 
          />
          <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} size="lg">
            {runMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
            {runMutation.isPending ? "Running MRP..." : "Run MRP Analysis"}
          </Button>
        </div>

        {latestRun ? (
          <div className="space-y-6">
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500">Latest MRP Run</p>
                  <p className="text-lg font-bold">Run #{latestRun.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-500">Date</p>
                  <p className="text-sm font-bold">{new Date(latestRun.createdAt).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="recommendations">
              <TabsList>
                <TabsTrigger value="recommendations">Action Recommendations</TabsTrigger>
                <TabsTrigger value="shortages">Detected Shortages</TabsTrigger>
              </TabsList>
              
              <TabsContent value="recommendations" className="pt-4">
                <div className="border rounded-md bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recommendations?.map((rec: any) => (
                        <TableRow key={rec.id}>
                          <TableCell>
                            <div className="flex items-center">
                              {rec.type === "PURCHASE" ? <ShoppingCart className="mr-2 h-4 w-4 text-amber-500" /> : <Wrench className="mr-2 h-4 w-4 text-blue-500" />}
                              {rec.type}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{rec.product?.name || `Product #${rec.productId}`}</TableCell>
                          <TableCell className="text-right">{rec.quantity}</TableCell>
                          <TableCell>
                            <Badge variant={rec.status === "APPROVED" ? "default" : "secondary"}>
                              {rec.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {rec.status === "PENDING" && (
                              <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(rec.id)} disabled={approveMutation.isPending}>
                                <CheckCircle className="mr-2 h-3 w-3" /> Approve
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!recommendations || recommendations.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No recommendations generated in this run. Stock levels are sufficient.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              
              <TabsContent value="shortages" className="pt-4">
                <div className="border rounded-md bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Shortage Qty</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Shortages are part of the run details conceptually, but since we didn't fetch them specifically, we'll omit them from the quick view for now or rely on recommendations */}
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Please see recommendations for action items.
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-20 border rounded-lg bg-slate-50 border-dashed">
            <AlertTriangle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No MRP Runs Found</h3>
            <p className="text-slate-500 mt-2 mb-6">Run the Material Requirements Planning analysis to calculate shortages.</p>
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
              {runMutation.isPending ? "Running..." : "Run First Analysis"}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
