import { Layout } from "@/components/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { History, Calendar } from "lucide-react";

export default function HistoricalStock() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const { toast } = useToast();
  
  // Default to today
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const [results, setResults] = useState<any[]>([]);

  const calculateMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      // Append time to get end of day
      const date = new Date(`${dateStr}T23:59:59.999Z`);
      const res = await apiRequest("POST", `/api/companies/${companyId}/inventory/historical-stock`, { targetDate: date });
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data);
      if (data.length === 0) {
        toast({ title: "No Data", description: "No tracked products found." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const totalValue = results.reduce((acc: number, row: any) => acc + Number(row.historicalValue || 0), 0);

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <PageHeader 
          title="Historical Stock Balances (MB5B)" 
          subtitle="Retroactively calculate inventory balances and financial value for a specific past date." 
        />
        
        <Card className="bg-slate-50 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center"><Calendar className="mr-2 h-5 w-5" /> Select Target Date</CardTitle>
            <CardDescription>The system will reverse-calculate all material movements back to this exact date (End of Day).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-center">
              <Input 
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="max-w-[200px]"
              />
              <Button 
                onClick={() => calculateMutation.mutate(targetDate)}
                disabled={calculateMutation.isPending || !targetDate}
              >
                {calculateMutation.isPending ? "Calculating..." : "Calculate Balances"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <h3 className="text-lg font-semibold flex items-center"><History className="mr-2 h-5 w-5" /> Balances as of {targetDate}</h3>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Inventory Value</p>
                <p className="text-xl font-bold">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div className="border rounded-md bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Historical Qty</TableHead>
                    <TableHead className="text-right">Implied Unit Cost</TableHead>
                    <TableHead className="text-right">Historical Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row: any) => (
                    <TableRow key={row.productId}>
                      <TableCell>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.sku}</p>
                      </TableCell>
                      <TableCell className="text-right font-bold">{Number(row.historicalQuantity).toLocaleString()}</TableCell>
                      <TableCell className="text-right">${Number(row.impliedUnitCost || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(row.historicalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
