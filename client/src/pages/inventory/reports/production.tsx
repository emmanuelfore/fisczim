import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory, Package } from "lucide-react";

export default function ProductionReportPage() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const [search, setSearch] = useState("");

  const { data: runs, isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/inventory/production-runs`],
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    if (!runs) return [];
    return runs.filter((row: any) => {
      if (search && !row.notes?.toLowerCase().includes(search.toLowerCase()) && !row.batchNumber?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [runs, search]);

  const totalRuns = filtered.length;
  const totalYield = filtered.reduce((acc: number, row: any) => acc + Number(row.yieldQuantity || 0), 0);

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <PageHeader 
          title="Production Report" 
          subtitle="Overview of inventory production and assemblies" 
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Production Runs</CardTitle>
              <Factory className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRuns}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Yield Quantity</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalYield.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <Input 
            placeholder="Search by batch number or notes..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Yield Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row: any, i: number) => {
                const qty = Number(row.yieldQuantity || 0);
                return (
                  <TableRow key={`${row.id}-${i}`}>
                    <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{row.batchNumber || '-'}</TableCell>
                    <TableCell>{row.status || 'Completed'}</TableCell>
                    <TableCell className="text-right font-bold">{qty.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No production records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
