import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package } from "lucide-react";

export default function StockOverview() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");

  const { data: stock, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/inventory/stock-overview`],
    enabled: !!companyId,
  });

  const locations = useMemo(() => {
    if (!stock) return [];
    const set = new Set<string>();
    stock.forEach((row: any) => {
      if (row.locationName) set.add(row.locationName);
    });
    return Array.from(set);
  }, [stock]);

  const filtered = useMemo(() => {
    if (!stock) return [];
    return stock.filter((row: any) => {
      if (locationFilter !== "ALL" && row.locationName !== locationFilter) return false;
      if (search && !row.name?.toLowerCase().includes(search.toLowerCase()) && !row.sku?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [stock, search, locationFilter]);

  const totalValue = filtered.reduce((acc: number, row: any) => {
    return acc + (Number(row.globalStock || 0) * Number(row.costPrice || 0));
  }, 0);

  const totalItems = filtered.reduce((acc: number, row: any) => acc + Number(row.globalStock || 0), 0);

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <PageHeader 
          title="Stock Overview" 
          subtitle="Real-time visibility into current stock quantities and financial valuation" 
        />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Physical Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <Input 
            placeholder="Search by product name or SKU..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Locations</SelectItem>
              {locations.map(loc => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Global Stock</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row: any, i: number) => {
                const qty = Number(row.globalStock || 0);
                const cost = Number(row.costPrice || 0);
                const val = qty * cost;
                // Group by product if there are multiple locations, but since we simplified the query to just show product lines for now
                // we'll render each row.
                return (
                  <TableRow key={`${row.productId}-${i}`}>
                    <TableCell>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.sku}</p>
                    </TableCell>
                    <TableCell>{row.locationName || 'All Locations'}</TableCell>
                    <TableCell className="text-right font-bold">{qty.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${cost.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No stock records found.
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
