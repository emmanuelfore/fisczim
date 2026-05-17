import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  AlertCircle,
  FileText,
  User,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type AnalysisData = {
  customer: any;
  metrics: {
    totalOutstanding: number;
    totalSales: number;
    actualPaid: number;
    lastPayment: string | null;
    avgPayLagDays: number;
    invoiceCount: number;
  };
  invoices: any[];
};

export default function DebtorAnalysisPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: analysis, isLoading } = useQuery<AnalysisData>({
    queryKey: [`/api/accounting/reports/debtors/${id}`],
    enabled: !!id
  });

  if (isLoading) return <Layout><div className="flex items-center justify-center h-64">Loading Analysis...</div></Layout>;
  if (!analysis) return <Layout><div>Customer analysis not found.</div></Layout>;

  const { customer, metrics, invoices } = analysis;

  const paymentRatio = metrics.totalSales > 0 ? (metrics.actualPaid / metrics.totalSales) * 100 : 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => window.history.back()} className="rounded-xl">
             <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
               <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-display">Debtor Analysis: {customer.name}</h2>
              <p className="text-sm text-slate-500">Forensic liquidity and behavioral audit</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
             <CardContent className="p-4">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                 <DollarSign className="h-3 w-3" /> Total Outstanding
               </span>
               <p className="text-xl font-black text-slate-900 font-display mt-1">
                 {formatCurrency(metrics.totalOutstanding)}
               </p>
               <p className="text-[10px] text-slate-500 mt-1 font-medium">{metrics.invoiceCount} Unpaid Invoices</p>
             </CardContent>
           </Card>

           <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
             <CardContent className="p-4">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                 <Clock className="h-3 w-3" /> Avg. Pay Lag
               </span>
               <p className={cn(
                 "text-xl font-black font-display mt-1",
                 metrics.avgPayLagDays > 30 ? "text-rose-600" : "text-emerald-600"
               )}>
                 {metrics.avgPayLagDays} Days
               </p>
               <p className="text-[10px] text-slate-500 mt-1 font-medium">Time from Invoice to Settlement</p>
             </CardContent>
           </Card>

           <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
             <CardContent className="p-4">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                 <TrendingUp className="h-3 w-3" /> Payment Ratio
               </span>
               <div className="mt-2 space-y-1.5">
                 <div className="flex justify-between text-[10px] font-bold text-slate-700 uppercase">
                    <span>Settled</span>
                    <span>{Math.round(paymentRatio)}%</span>
                 </div>
                 <Progress value={paymentRatio} className="h-1.5 bg-slate-100" />
               </div>
             </CardContent>
           </Card>

           <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
             <CardContent className="p-4">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                 <Calendar className="h-3 w-3" /> Last Settlement
               </span>
               <p className="text-xl font-black text-slate-900 font-display mt-1 uppercase">
                 {metrics.lastPayment ? format(new Date(metrics.lastPayment), "dd MMM yy") : "Never"}
               </p>
               <p className="text-[10px] text-slate-500 mt-1 font-medium">Date of most recent payment</p>
             </CardContent>
           </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <Card className="lg:col-span-2 border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="border-b border-slate-50 py-4 px-6">
                 <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Outstanding Invoice Details
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                 <Table>
                    <TableHeader className="bg-slate-50/50">
                       <TableRow className="border-slate-50">
                          <TableHead className="pl-6 font-bold text-[10px] text-slate-500 tracking-widest uppercase">Invoice #</TableHead>
                          <TableHead className="font-bold text-[10px] text-slate-500 tracking-widest uppercase text-center">Due Date</TableHead>
                          <TableHead className="text-right font-bold text-[10px] text-slate-500 tracking-widest uppercase">Balance</TableHead>
                          <TableHead className="text-right pr-6 font-bold text-[10px] text-slate-500 tracking-widest uppercase">Aging Status</TableHead>
                       </TableRow>
                    </TableHeader>
                    <TableBody>
                       {invoices.length === 0 ? (
                          <TableRow><TableCell colSpan={4} className="h-40 text-center text-slate-400 italic">No outstanding invoices</TableCell></TableRow>
                       ) : (
                          invoices.map((inv) => (
                             <TableRow key={inv.id} className="group hover:bg-slate-50/50 transition-colors border-slate-50">
                                <TableCell className="pl-6">
                                   <div className="flex flex-col">
                                      <span className="font-bold text-slate-900 text-[13px]">{inv.invoiceNumber}</span>
                                      <span className="text-[10px] text-slate-400 font-medium">Issued: {format(new Date(inv.issueDate), "MMM dd, yyyy")}</span>
                                   </div>
                                </TableCell>
                                <TableCell className="text-center">
                                   <div className="text-[12px] font-medium text-slate-700">
                                      {format(new Date(inv.dueDate), "MMM dd, yyyy")}
                                   </div>
                                </TableCell>
                                <TableCell className="text-right">
                                   <div className="text-[14px] font-bold text-slate-900">
                                      {formatCurrency(Number(inv.total) - Number(inv.paidAmount))}
                                   </div>
                                </TableCell>
                                <TableCell className="text-right pr-6">
                                   {inv.daysOverdue > 0 ? (
                                      <Badge variant="destructive" className={cn(
                                         "rounded-md text-[10px] px-1.5 py-0.5",
                                         inv.daysOverdue > 90 ? "bg-rose-600 border-rose-700" :
                                         inv.daysOverdue > 60 ? "bg-orange-600 border-orange-700" :
                                         "bg-amber-600 border-amber-700"
                                      )}>
                                         {inv.daysOverdue} Days Overdue
                                      </Badge>
                                   ) : (
                                      <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 rounded-md text-[10px] px-1.5 py-0.5">
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
                    <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-tight">Debtor Profile</CardTitle>
                 </CardHeader>
                 <CardContent className="p-6 space-y-4">
                    <div className="space-y-1">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer TIN</span>
                       <p className="text-sm font-bold text-slate-700">{customer.tin || "Not Provided"}</p>
                    </div>
                    <div className="space-y-1">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Information</span>
                       <p className="text-sm font-bold text-slate-700">{customer.phone}</p>
                       <p className="text-xs text-slate-500 font-medium">{customer.email}</p>
                    </div>
                    <div className="space-y-1">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Credit Terms</span>
                       <p className="text-sm font-bold text-slate-700">{customer.creditDays || 0} Days Standard</p>
                       <div className="flex justify-between items-center bg-slate-50 rounded-lg p-2.5 mt-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Limit:</span>
                          <span className="text-sm font-black text-slate-800">{formatCurrency(customer.creditLimit)}</span>
                       </div>
                    </div>
                 </CardContent>
              </Card>

              <Card className="border-rose-100 shadow-sm rounded-2xl bg-rose-50/30 overflow-hidden">
                 <CardContent className="p-6 flex gap-3">
                    <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                       <AlertCircle className="h-5 w-5" />
                    </div>
                    <div>
                       <h4 className="text-sm font-black text-rose-900 uppercase tracking-tight">Collection Priority</h4>
                       <p className="text-xs text-rose-700 font-medium leading-relaxed mt-1">
                          {metrics.totalOutstanding > (Number(customer.creditLimit) || 0) && Number(customer.creditLimit) > 0
                            ? "This customer has exceeded their credit limit. Collection action is highly recommended before further credit is issued."
                            : metrics.avgPayLagDays > 45 
                            ? "Payment behavior is significantly slower than average. Consider tightening terms." 
                            : "Account is in good standing based on behavioral metrics."}
                       </p>
                    </div>
                 </CardContent>
              </Card>
           </div>
        </div>
      </div>
    </Layout>
  );
}
