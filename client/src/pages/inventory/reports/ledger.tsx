import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function MaterialDocumentLedger() {
  const { activeCompanyId: companyId } = useActiveCompany();
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const { data: ledger, isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/inventory/ledger`],
    enabled: !!companyId,
  });

  const filtered = ledger?.filter((row: any) => {
    if (typeFilter !== "ALL" && row.type !== typeFilter) return false;
    if (search && !row.productName?.toLowerCase().includes(search.toLowerCase()) && !row.productSku?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <PageHeader 
          title="Material Document Ledger (MB51)" 
          subtitle="Detailed audit trail of all inventory movements and transactions" 
        />
        
        <div className="flex gap-4 items-center">
          <Input 
            placeholder="Search by product name or SKU..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Movement Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Movement Types</SelectItem>
              <SelectItem value="STOCK_IN">GRV / Stock In (101)</SelectItem>
              <SelectItem value="STOCK_OUT">Sales Issue (601)</SelectItem>
              <SelectItem value="ISSUE">Manufacturing Issue (261)</SelectItem>
              <SelectItem value="FINISHED_GOOD">Manufacturing Receipt (101)</SelectItem>
              <SelectItem value="ADJUSTMENT">Manual Adjustment (561)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Mvt Type</TableHead>
                <TableHead className="text-right">Qty Delta</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row: any) => {
                const qty = Number(row.quantity);
                const isPositive = qty > 0;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(row.date).toLocaleString()}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.productName || `Product #${row.productId}`}</p>
                      <p className="text-xs text-muted-foreground">{row.productSku}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{row.type}</Badge>
                    </TableCell>
                    <TableCell className={`text-right font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{qty}
                    </TableCell>
                    <TableCell className="text-right">${Number(row.unitCost || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">${Number(row.totalCost || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <p className="text-sm">{row.referenceType || 'SYS'}</p>
                      <p className="text-xs text-muted-foreground">{row.referenceId}</p>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No transactions found.
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
