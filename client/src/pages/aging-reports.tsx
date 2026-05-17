import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

export default function AgingReportsPage() {
  const [, setLocation] = useLocation();
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  const { data: arData, isLoading: isLoadingAR } = useQuery<any[]>({
    queryKey: ["/api/accounting/reports/ar-aging", { date: asOfDate }],
  });

  const { data: apData, isLoading: isLoadingAP } = useQuery<any[]>({
    queryKey: ["/api/accounting/reports/ap-aging", { date: asOfDate }],
  });

  const arTotals = arData?.reduce((acc, curr) => ({
    current: acc.current + curr.current,
    days30: acc.days30 + curr.days30,
    days60: acc.days60 + curr.days60,
    days90: acc.days90 + curr.days90,
    over90: acc.over90 + curr.over90,
    total: acc.total + curr.total,
  }), { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 });

  const apTotals = apData?.reduce((acc, curr) => ({
    current: acc.current + curr.current,
    days30: acc.days30 + curr.days30,
    days60: acc.days60 + curr.days60,
    days90: acc.days90 + curr.days90,
    over90: acc.over90 + curr.over90,
    total: acc.total + curr.total,
  }), { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">Aging Reports</h1>
              <p className="text-sm text-slate-500">Track outstanding receivables and payables</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-600">As Of Date:</div>
            <Input 
              type="date" 
              value={asOfDate} 
              onChange={e => setAsOfDate(e.target.value)}
              className="w-[180px] h-11 rounded-xl"
            />
          </div>
        </div>

        <Tabs defaultValue="ar" className="w-full">
          <TabsList className="mb-6 h-12 bg-slate-100 rounded-xl p-1">
            <TabsTrigger value="ar" className="px-6 rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <TrendingUp className="w-4 h-4 mr-2 text-emerald-600" />
              Accounts Receivable
            </TabsTrigger>
            <TabsTrigger value="ap" className="px-6 rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <TrendingDown className="w-4 h-4 mr-2 text-rose-600" />
              Accounts Payable
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ar" className="m-0 space-y-6 outline-none focus:ring-0">
            <div className="grid grid-cols-1 gap-6">
              <Card className="rounded-2xl border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg">Accounts Receivable Aging</CardTitle>
                  <CardDescription>Customers owing money to the company</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="pl-6 w-[250px]">Customer</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">1-30 Days</TableHead>
                        <TableHead className="text-right">31-60 Days</TableHead>
                        <TableHead className="text-right">61-90 Days</TableHead>
                        <TableHead className="text-right text-rose-600">&gt; 90 Days</TableHead>
                        <TableHead className="text-right pr-6 font-bold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingAR ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-400">Loading...</TableCell></TableRow>
                      ) : arData?.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-400">No outstanding receivables found.</TableCell></TableRow>
                      ) : (
                        <>
                          {arData?.map((row) => (
                            <TableRow 
                              key={row.customerId} 
                              className="hover:bg-slate-50 border-slate-100 cursor-pointer group"
                              onClick={() => setLocation(`/accounting/debtors/${row.customerId}`)}
                            >
                              <TableCell className="pl-6 font-bold text-slate-800">
                                <div className="flex items-center gap-2">
                                  {row.customerName}
                                  <Clock className="h-3 w-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-slate-600">{Number(row.current) > 0 ? formatCurrency(row.current) : "-"}</TableCell>
                              <TableCell className="text-right text-amber-600">{Number(row.days30) > 0 ? formatCurrency(row.days30) : "-"}</TableCell>
                              <TableCell className="text-right text-orange-500">{Number(row.days60) > 0 ? formatCurrency(row.days60) : "-"}</TableCell>
                              <TableCell className="text-right text-orange-600">{Number(row.days90) > 0 ? formatCurrency(row.days90) : "-"}</TableCell>
                              <TableCell className="text-right font-bold text-rose-600">{Number(row.over90) > 0 ? formatCurrency(row.over90) : "-"}</TableCell>
                              <TableCell className="text-right pr-6 font-black text-slate-900">{formatCurrency(row.total)}</TableCell>
                            </TableRow>
                          ))}
                          {arTotals && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-t border-slate-200">
                              <TableCell className="pl-6 font-black text-sm uppercase text-slate-800">Total Receivables</TableCell>
                              <TableCell className="text-right font-bold text-slate-800">{formatCurrency(arTotals.current)}</TableCell>
                              <TableCell className="text-right font-bold text-amber-600">{formatCurrency(arTotals.days30)}</TableCell>
                              <TableCell className="text-right font-bold text-orange-500">{formatCurrency(arTotals.days60)}</TableCell>
                              <TableCell className="text-right font-bold text-orange-600">{formatCurrency(arTotals.days90)}</TableCell>
                              <TableCell className="text-right font-black text-rose-600">{formatCurrency(arTotals.over90)}</TableCell>
                              <TableCell className="text-right pr-6 font-black text-xl text-emerald-600">{formatCurrency(arTotals.total)}</TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ap" className="m-0 space-y-6 outline-none focus:ring-0">
            <div className="grid grid-cols-1 gap-6">
              <Card className="rounded-2xl border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg">Accounts Payable Aging</CardTitle>
                  <CardDescription>Suppliers we owe money to</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="pl-6 w-[250px]">Supplier</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">1-30 Days</TableHead>
                        <TableHead className="text-right">31-60 Days</TableHead>
                        <TableHead className="text-right">61-90 Days</TableHead>
                        <TableHead className="text-right text-rose-600">&gt; 90 Days</TableHead>
                        <TableHead className="text-right pr-6 font-bold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingAP ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-400">Loading...</TableCell></TableRow>
                      ) : apData?.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-400">No outstanding payables found.</TableCell></TableRow>
                      ) : (
                        <>
                          {apData?.map((row) => (
                            <TableRow 
                              key={row.supplierId} 
                              className="hover:bg-slate-50 border-slate-100 cursor-pointer group"
                              onClick={() => setLocation(`/accounting/creditors/${row.supplierId}`)}
                            >
                              <TableCell className="pl-6 font-bold text-slate-800">
                                <div className="flex items-center gap-2">
                                  {row.supplierName}
                                  <Clock className="h-3 w-3 text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-slate-600">{Number(row.current) > 0 ? formatCurrency(row.current) : "-"}</TableCell>
                              <TableCell className="text-right text-amber-600">{Number(row.days30) > 0 ? formatCurrency(row.days30) : "-"}</TableCell>
                              <TableCell className="text-right text-orange-500">{Number(row.days60) > 0 ? formatCurrency(row.days60) : "-"}</TableCell>
                              <TableCell className="text-right text-orange-600">{Number(row.days90) > 0 ? formatCurrency(row.days90) : "-"}</TableCell>
                              <TableCell className="text-right font-bold text-rose-600">{Number(row.over90) > 0 ? formatCurrency(row.over90) : "-"}</TableCell>
                              <TableCell className="text-right pr-6 font-black text-slate-900">{formatCurrency(row.total)}</TableCell>
                            </TableRow>
                          ))}
                          {apTotals && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-t border-slate-200">
                              <TableCell className="pl-6 font-black text-sm uppercase text-slate-800">Total Payables</TableCell>
                              <TableCell className="text-right font-bold text-slate-800">{formatCurrency(apTotals.current)}</TableCell>
                              <TableCell className="text-right font-bold text-amber-600">{formatCurrency(apTotals.days30)}</TableCell>
                              <TableCell className="text-right font-bold text-orange-500">{formatCurrency(apTotals.days60)}</TableCell>
                              <TableCell className="text-right font-bold text-orange-600">{formatCurrency(apTotals.days90)}</TableCell>
                              <TableCell className="text-right font-black text-rose-600">{formatCurrency(apTotals.over90)}</TableCell>
                              <TableCell className="text-right pr-6 font-black text-xl text-rose-600">{formatCurrency(apTotals.total)}</TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
