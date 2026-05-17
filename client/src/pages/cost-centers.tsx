import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Building2, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export default function CostCentersPage() {
  const [fromDate, setFromDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  const { data: costCenters, isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/reports/cost-centers", { from: fromDate, to: toDate }],
  });

  const totals = costCenters?.reduce((acc, curr) => ({
    revenue: acc.revenue + curr.revenue,
    cogs: acc.cogs + curr.cogs,
    grossProfit: acc.grossProfit + curr.grossProfit,
    expenses: acc.expenses + curr.expenses,
    netProfit: acc.netProfit + curr.netProfit,
  }), { revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0 });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">Cost Center Accounting</h1>
              <p className="text-sm text-slate-500">Track profitability across different branches and departments</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-600">From:</div>
            <Input 
              type="date" 
              value={fromDate} 
              onChange={e => setFromDate(e.target.value)}
              className="w-[140px] h-11 rounded-xl"
            />
            <div className="text-sm font-semibold text-slate-600">To:</div>
            <Input 
              type="date" 
              value={toDate} 
              onChange={e => setToDate(e.target.value)}
              className="w-[140px] h-11 rounded-xl"
            />
          </div>
        </div>

        {totals && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="rounded-2xl border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-500 uppercase">Total Revenue</p>
                </div>
                <p className="text-2xl font-black text-slate-900 mt-4">{formatCurrency(totals.revenue)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-orange-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-500 uppercase">Total COGS</p>
                </div>
                <p className="text-2xl font-black text-slate-900 mt-4">{formatCurrency(totals.cogs)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-rose-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-500 uppercase">Total Expenses</p>
                </div>
                <p className="text-2xl font-black text-slate-900 mt-4">{formatCurrency(totals.expenses)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-none bg-primary text-white shadow-xl shadow-primary/20">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-bold text-primary-foreground/80 uppercase">Consolidated Net Profit</p>
                </div>
                <p className="text-2xl font-black text-white mt-4">{formatCurrency(totals.netProfit)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="rounded-2xl border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Profitability by Cost Center (Branch)</CardTitle>
            <CardDescription>Income statements broken down for each center</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="pl-6 w-[250px]">Cost Center</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost of Sales</TableHead>
                  <TableHead className="text-right font-bold">Gross Profit</TableHead>
                  <TableHead className="text-right text-rose-600">Expenses</TableHead>
                  <TableHead className="text-right pr-6 font-bold text-primary">Net Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-400">Loading...</TableCell></TableRow>
                ) : costCenters?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-400">No cost centers found.</TableCell></TableRow>
                ) : (
                  <>
                    {costCenters?.map((row) => (
                      <TableRow key={row.id} className="hover:bg-slate-50 border-slate-100">
                        <TableCell className="pl-6">
                          <p className="font-bold text-slate-800">{row.name}</p>
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">{row.transactionCount} transactions</p>
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right text-orange-600 font-medium">{formatCurrency(row.cogs)}</TableCell>
                        <TableCell className="text-right font-bold text-slate-800">{formatCurrency(row.grossProfit)}</TableCell>
                        <TableCell className="text-right text-rose-600 font-medium">{formatCurrency(row.expenses)}</TableCell>
                        <TableCell className="text-right pr-6 font-black text-primary text-lg">
                          {formatCurrency(row.netProfit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
