import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { FileText, Calculator, Calendar as CalendarIcon, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function VatReturnPage() {
  const [dateRange, setDateRange] = useState({
    from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: format(endOfMonth(new Date()), "yyyy-MM-dd")
  });

  const { data: report, isLoading } = useQuery<any>({
    queryKey: ["/api/accounting/reports/vat-return", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await apiFetch(`/api/accounting/reports/vat-return?startDate=${dateRange.from}&endDate=${dateRange.to}`);
      if (!res.ok) throw new Error("Failed to fetch VAT report");
      return res.json();
    }
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">VAT Returns</h1>
              <p className="text-sm text-slate-500">Automated calculation of Input and Output taxes</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 px-2">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              <Label className="text-sm font-medium">Period:</Label>
            </div>
            <Input 
              type="date" 
              value={dateRange.from} 
              onChange={e => setDateRange({...dateRange, from: e.target.value})} 
              className="h-8 w-36 border-none bg-slate-50 shadow-none focus-visible:ring-0" 
            />
            <span className="text-slate-400">to</span>
            <Input 
              type="date" 
              value={dateRange.to} 
              onChange={e => setDateRange({...dateRange, to: e.target.value})} 
              className="h-8 w-36 border-none bg-slate-50 shadow-none focus-visible:ring-0" 
            />
          </div>
        </div>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-500">
            Calculating...
          </div>
        ) : report ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
              <div className="h-2 w-full bg-emerald-500" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-widest">Output VAT</CardTitle>
                    <CardDescription>Tax collected on Sales</CardDescription>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-800">
                  {formatCurrency(Number(report.outputVat))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
              <div className="h-2 w-full bg-rose-500" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-widest">Input VAT</CardTitle>
                    <CardDescription>Tax paid on Purchases</CardDescription>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                    <ArrowDownRight className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-800">
                  {formatCurrency(Number(report.inputVat))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden bg-slate-50/50">
              <div className="h-2 w-full bg-indigo-500" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm font-black text-indigo-900 uppercase tracking-widest">Net VAT Due</CardTitle>
                    <CardDescription>Total payable to Revenue Authority</CardDescription>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Scale className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-4xl font-black ${report.netVat > 0 ? "text-rose-600" : report.netVat < 0 ? "text-emerald-600" : "text-slate-800"}`}>
                  {formatCurrency(Number(report.netVat))}
                </div>
                {report.netVat < 0 && <p className="text-xs text-emerald-600 font-bold mt-1">Refund Claimable</p>}
                {report.netVat > 0 && <p className="text-xs text-rose-600 font-bold mt-1">Payment Required</p>}
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card className="rounded-2xl border-slate-200 bg-amber-50 border-amber-200">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="mt-1 bg-amber-200/50 p-2 rounded-xl text-amber-700">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 mb-1">How is this calculated?</h3>
                <p className="text-sm text-amber-800/80 mb-2">
                  The system aggregates all validated records dynamically between the selected dates.
                </p>
                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                  <li><strong>Output Tax:</strong> Sum of standard tax applied on issued POS/Sales Invoices (Status != Cancelled).</li>
                  <li><strong>Input Tax:</strong> Sum of explicitly recorded tax applied on Supplier Invoices.</li>
                  <li><strong>Net Tax:</strong> Simply Output minus Input. A positive value means you owe tax. A negative value represents an input credit.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
