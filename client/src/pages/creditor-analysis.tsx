import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  FileText,
  Warehouse,
  History,
  TrendingDown,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type AnalysisData = {
  supplier: any;
  metrics: {
    totalOutstanding: number;
    totalPurchases: number;
    actualPaid: number;
    lastPayment: string | null;
    invoiceCount: number;
  };
  invoices: any[];
};

export default function CreditorAnalysisPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: analysis, isLoading, isError, refetch } = useQuery<AnalysisData>({
    queryKey: [`/api/accounting/reports/creditors/${id}`],
    enabled: !!id,
  });

  if (isLoading)
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
          Loading Analysis...
        </div>
      </Layout>
    );
  if (isError)
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <span className="text-rose-600 font-semibold">
            Could not load creditor analysis.
          </span>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Layout>
    );
  if (!analysis)
    return (
      <Layout>
        <div>Creditor analysis not found.</div>
      </Layout>
    );

  const { supplier, metrics, invoices } = analysis;

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/accounting/reports/aging?tab=ap")}
            className="rounded-xl"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 border border-orange-100 shadow-sm">
              <Warehouse className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-display">
                Creditor Analysis: {supplier.name}
              </h2>
              <p className=" text-slate-500">
                Accounts payable and supplier liability audit
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-4">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" /> Total Liability
              </span>
              <p className="text-xl font-black text-rose-600 font-display mt-1">
                {formatCurrency(metrics.totalOutstanding)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                {metrics.invoiceCount} Pending Supplier Invoices
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-4">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" /> Historical Purchases
              </span>
              <p className="text-xl font-black text-slate-900 font-display mt-1">
                {formatCurrency(metrics.totalPurchases)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                Life-to-date purchase volume
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-4">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Last Payment
              </span>
              <p className="text-xl font-black text-slate-900 font-display mt-1 uppercase">
                {metrics.lastPayment
                  ? format(new Date(metrics.lastPayment), "dd MMM yy")
                  : "Never"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                Most recent outflow to supplier
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="border-b border-slate-50 py-4 px-6">
              <CardTitle className=" font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <History className="h-4 w-4 text-orange-500" />
                Open Payables List
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto min-w-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="border-slate-50">
                    <TableHead className="pl-6 font-bold text-[10px] text-slate-500 tracking-widest uppercase">
                      Invoice #
                    </TableHead>
                    <TableHead className="font-bold text-[10px] text-slate-500 tracking-widest uppercase text-center">
                      Due Date
                    </TableHead>
                    <TableHead className="text-right font-bold text-[10px] text-slate-500 tracking-widest uppercase">
                      Balance
                    </TableHead>
                    <TableHead className="text-right pr-6 font-bold text-[10px] text-slate-500 tracking-widest uppercase">
                      Aging
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-40 text-center text-slate-400 italic"
                      >
                        No open payables
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="group hover:bg-slate-50/50 transition-colors border-slate-50 cursor-pointer"
                        onClick={() => setLocation(`/supplier-invoices/${inv.id}`)}
                      >
                        <TableCell className="pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 group-hover:text-primary transition-colors">
                              {inv.invoiceNumber}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Dated:{" "}
                              {format(new Date(inv.date), "MMM dd, yyyy")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="text-[12px] font-medium text-slate-700">
                            {format(
                              new Date(inv.dueDate || inv.date),
                              "MMM dd, yyyy",
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-[14px] font-bold text-slate-900 text-rose-600">
                            {formatCurrency(
                              Number(inv.totalAmount) - Number(inv.paidAmount),
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {inv.daysOverdue > 0 ? (
                            <Badge
                              variant="destructive"
                              className={cn(
                                "rounded-md text-[10px] px-1.5 py-0.5",
                                inv.daysOverdue > 30
                                  ? "bg-rose-600"
                                  : "bg-orange-500",
                              )}
                            >
                              {inv.daysOverdue} Days Late
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-slate-50 text-slate-500 border-slate-200 rounded-md text-[10px] px-1.5 py-0.5"
                            >
                              Current
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-slate-200/60 shadow-sm rounded-2xl bg-white overflow-hidden">
              <CardHeader className="border-b border-slate-50 py-4 px-6">
                <CardTitle className=" font-bold text-slate-800 uppercase tracking-tight">
                  Supplier Terms
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Supplier TIN
                  </span>
                  <p className=" font-bold text-slate-700">
                    {supplier.tin || "Not Provided"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Contact Details
                  </span>
                  <p className=" font-bold text-slate-700">
                    {supplier.phone || "No phone"}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    {supplier.email || "No email"}
                  </p>
                </div>
                <div className="space-y-1 mt-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        Payment Terms:
                      </span>
                      <span className=" font-black text-slate-800">
                        {supplier.creditDays || 0} Days
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        Credit Limit:
                      </span>
                      <span className=" font-black text-slate-800">
                        {formatCurrency(supplier.creditLimit)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm rounded-2xl bg-slate-50/30 overflow-hidden">
              <CardContent className="p-6">
                <h4 className=" font-black text-slate-800 uppercase tracking-tight mb-2">
                  Liquidity Sentiment
                </h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  This supplier accounts for{" "}
                  {metrics.totalPurchases > 0
                    ? Math.round(
                        (metrics.totalOutstanding / metrics.totalPurchases) *
                          100,
                      )
                    : 0}
                  % of historical engagement currently outstanding. Maintain
                  standard terms to preserve supply chain stability.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
