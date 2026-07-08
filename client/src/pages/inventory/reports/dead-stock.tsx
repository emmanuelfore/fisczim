import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, DollarSign, Package } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function DeadStockReportPage() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [ageingFilter, setAgeingFilter] = useState("ALL");

  // Date range state - defaults to past 90 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const { data: deadStock = [], isLoading } = useQuery<any[]>({
    queryKey: ["inventory-dead-stock", companyId, startDate, endDate],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/reports/dead-stock?startDate=${startDate}T00:00:00.000Z&endDate=${endDate}T23:59:59.999Z`);
      if (!res.ok) throw new Error("Failed to load dead stock report");
      return res.json();
    },
    enabled: !!companyId && !!startDate && !!endDate,
  });

  const filtered = useMemo(() => {
    return deadStock.filter((row: any) => {
      if (ageingFilter !== "ALL" && row.ageingBucket !== ageingFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        const part = String(row.part || "").toLowerCase();
        const sku = String(row.sku || "").toLowerCase();
        const category = String(row.category || "").toLowerCase();
        const brand = String(row.brand || "").toLowerCase();
        if (!part.includes(term) && !sku.includes(term) && !category.includes(term) && !brand.includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [deadStock, search, ageingFilter]);

  const totalValue = filtered.reduce((acc: number, row: any) => {
    return acc + Number(row.stockValue || 0);
  }, 0);

  const totalItems = filtered.reduce((acc: number, row: any) => {
    return acc + Number(row.stockLevel || 0);
  }, 0);

  // Extract unique buckets for dropdown
  const uniqueBuckets = useMemo(() => {
    const buckets = new Set<string>();
    deadStock.forEach((row: any) => {
      if (row.ageingBucket) buckets.add(row.ageingBucket);
    });
    return Array.from(buckets);
  }, [deadStock]);

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <PageHeader 
          title="Dead Stock Report" 
          subtitle="Identify slow-moving stock with no sales activity within the selected period" 
        />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Idle Inventory Value</CardTitle>
              <DollarSign className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Idle Items</CardTitle>
              <Package className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Risk Items</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {filtered.filter(r => Number(r.daysSinceLastSale || 0) > 90).length} items
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="w-full sm:w-auto">
            <Input 
              placeholder="Search by part, SKU, brand, category..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">From:</span>
            <Input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">To:</span>
            <Input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <Select value={ageingFilter} onValueChange={setAgeingFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Ageing Buckets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Ageing Buckets</SelectItem>
              {uniqueBuckets.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part / Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stock Level</TableHead>
                <TableHead className="text-right">Stock Value</TableHead>
                <TableHead className="text-right">Days Idle</TableHead>
                <TableHead>Last Sold</TableHead>
                <TableHead>Ageing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row: any, i: number) => {
                const stockQty = Number(row.stockLevel || 0);
                const stockVal = Number(row.stockValue || 0);
                const daysIdle = Number(row.daysSinceLastSale || 0);
                return (
                  <TableRow key={`${row.sku}-${i}`}>
                    <TableCell>
                      <p className="font-medium">{row.part}</p>
                      <p className="text-xs text-muted-foreground">{row.sku}</p>
                      {row.brand && <p className="text-xs text-slate-400">Brand: {row.brand}</p>}
                    </TableCell>
                    <TableCell>{row.category || "-"}</TableCell>
                    <TableCell className="text-right font-bold">{stockQty.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">${stockVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-rose-600 font-medium">{daysIdle} days</TableCell>
                    <TableCell>{row.lastSoldAt ? new Date(row.lastSoldAt).toLocaleDateString() : 'Never Sold'}</TableCell>
                    <TableCell>
                      <Badge variant={daysIdle > 90 ? "destructive" : "secondary"}>
                        {row.ageingBucket || "N/A"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No dead stock records found.
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
