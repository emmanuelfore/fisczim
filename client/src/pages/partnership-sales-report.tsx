import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Layout } from "@/components/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePartners, usePartnershipSalesReport } from "@/hooks/use-partners";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download } from "lucide-react";
import { downloadCsv, generateCsv } from "@/lib/report-utils";

export default function PartnershipSalesReportPage() {
  const { activeCompany } = useActiveCompany();
  const companyId = activeCompany?.id || 0;
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [range] = useState({
    from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  });

  const { data: partners = [] } = usePartners(companyId);
  const { data, isLoading } = usePartnershipSalesReport(
    companyId,
    range.from,
    range.to,
    partnerFilter === "all" ? undefined : Number(partnerFilter)
  );

  const summary = data?.summary || [];
  const invoices = data?.invoices || [];

  const totals = useMemo(() => ({
    gross: summary.reduce((s: number, r: any) => s + Number(r.grossTotal || 0), 0),
    partner: summary.reduce((s: number, r: any) => s + Number(r.partnerShare || 0), 0),
    issuer: summary.reduce((s: number, r: any) => s + Number(r.issuerShare || 0), 0),
  }), [summary]);

  const exportCsv = () => {
    const csv = generateCsv(
      ["Invoice", "Date", "Customer", "Partner", "Total", "Share %", "Partner Share", "Issuer Share", "Status"],
      invoices.map((row: any) => [
        row.invoiceNumber,
        row.issueDate ? format(new Date(row.issueDate), "yyyy-MM-dd") : "",
        row.customerName || "",
        row.partnerName || "",
        row.total,
        row.revenueSharePercent,
        row.partnerShareAmount,
        row.issuerShareAmount,
        row.status,
      ])
    );
    downloadCsv(csv, `partnership-sales-${range.from}-${range.to}.csv`);
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Partnership Sales Report</h1>
            <p className="text-sm text-slate-500">Revenue split by commercial partner for co-branded invoices.</p>
          </div>
          <div className="flex gap-2">
            <Select value={partnerFilter} onValueChange={setPartnerFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All partners" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All partners</SelectItem>
                {partners.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={!invoices.length}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Gross Sales</CardTitle></CardHeader><CardContent className="text-2xl font-bold">${totals.gross.toFixed(2)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Partner Share</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-emerald-700">${totals.partner.toFixed(2)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Issuer Share</CardTitle></CardHeader><CardContent className="text-2xl font-bold">${totals.issuer.toFixed(2)}</CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>By Partner</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : summary.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No partnership invoices in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Invoices</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Partner Share</TableHead>
                    <TableHead className="text-right">Issuer Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((row: any) => (
                    <TableRow key={row.partnerId}>
                      <TableCell className="font-medium">{row.partnerName}</TableCell>
                      <TableCell>{row.invoiceCount}</TableCell>
                      <TableCell className="text-right">${Number(row.grossTotal).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-emerald-700">${Number(row.partnerShare).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(row.issuerShare).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Invoice Register</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {invoices.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Partner %</TableHead>
                    <TableHead className="text-right">Partner Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.invoiceNumber}</TableCell>
                      <TableCell>{row.issueDate ? format(new Date(row.issueDate), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell>{row.customerName || "-"}</TableCell>
                      <TableCell>{row.partnerName || "-"}</TableCell>
                      <TableCell className="text-right">${Number(row.total).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{Number(row.revenueSharePercent).toFixed(1)}%</TableCell>
                      <TableCell className="text-right">${Number(row.partnerShareAmount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
