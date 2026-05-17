import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import React from "react";
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
import { Printer, FileSpreadsheet, Calendar, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";

type TrialBalanceLine = {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
};

type TrialBalanceReport = {
  asOfDate: string;
  lines: TrialBalanceLine[];
  totalDebit: number;
  totalCredit: number;
};

export default function TrialBalancePage() {
  const [, setLocation] = useLocation();
  const [collapsedTypes, setCollapsedTypes] = useState<string[]>([]);
  
  const { data: report, isLoading } = useQuery<TrialBalanceReport>({
    queryKey: ["/api/accounting/trial-balance"],
  });

  const totalDebit = report?.lines.reduce((sum, line) => sum + Number(line.debit), 0) || 0;
  const totalCredit = report?.lines.reduce((sum, line) => sum + Number(line.credit), 0) || 0;

  const toggleCollapse = (type: string) => {
    setCollapsedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const groupedLines = report?.lines.reduce((acc, line) => {
    if (!acc[line.accountType]) acc[line.accountType] = [];
    acc[line.accountType].push(line);
    return acc;
  }, {} as Record<string, TrialBalanceLine[]>) || {};

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <Scale className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-2xl font-bold text-slate-800 font-display tracking-tight">Trial Balance</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="bg-white text-slate-500 font-bold border-slate-200">
                  As of {report ? format(new Date(report.asOfDate), "PPP") : "Today"}
                </Badge>
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                  Math.abs(totalDebit - totalCredit) < 0.01 
                    ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                    : "bg-rose-50 text-rose-600 border-rose-100"
                )}>
                  {Math.abs(totalDebit - totalCredit) < 0.01 ? "Balanced" : "Out of Balance"}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <Button variant="outline" className="h-11 px-5 rounded-xl font-bold border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
               <Printer className="h-4 w-4 text-slate-500" />
               <span>Print Report</span>
             </Button>
             <Button variant="outline" className="h-11 px-5 rounded-xl font-bold border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
               <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
               <span>Export Excel</span>
             </Button>
          </div>
        </div>

        <Card className="border-slate-200/60 shadow-xl overflow-hidden rounded-3xl bg-white/50 backdrop-blur-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-100/50">
                <TableRow className="hover:bg-transparent border-slate-200/60">
                  <TableHead className="w-[140px] font-black text-slate-500 uppercase text-[10px] tracking-widest pl-8">Account Code</TableHead>
                  <TableHead className="font-black text-slate-500 uppercase text-[10px] tracking-widest">Account Name</TableHead>
                  <TableHead className="text-right font-black text-slate-500 uppercase text-[10px] tracking-widest">Debit</TableHead>
                  <TableHead className="text-right pr-8 font-black text-slate-500 uppercase text-[10px] tracking-widest">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse border-slate-50">
                      <TableCell colSpan={4} className="h-12 bg-slate-50/40" />
                    </TableRow>
                  ))
                ) : (
                  <>
                    {Object.entries(groupedLines).map(([type, lines]) => (
                      <React.Fragment key={type}>
                        <TableRow 
                          className="bg-slate-50/80 cursor-pointer hover:bg-slate-100 transition-colors border-slate-200"
                          onClick={() => toggleCollapse(type)}
                        >
                          <TableCell colSpan={4} className="pl-8 py-3">
                            <div className="flex items-center gap-2">
                              {collapsedTypes.includes(type) ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                              <span className="font-black text-[11px] uppercase tracking-widest text-slate-900">{type}</span>
                              <Badge variant="secondary" className="bg-white text-[10px] py-0">{lines.length} Accounts</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        {!collapsedTypes.includes(type) && lines.map((line) => (
                          <TableRow 
                            key={line.accountId} 
                            className="hover:bg-slate-50/80 border-slate-100 transition-colors group cursor-pointer"
                            onClick={() => setLocation(`/accounting/ledger/${line.accountId}`)}
                          >
                            <TableCell className="font-bold text-slate-600 pl-14 font-mono text-[13px]">{line.accountCode}</TableCell>
                            <TableCell className="font-semibold text-slate-700 text-[14px]">
                              <div className="flex items-center gap-2">
                                {line.accountName}
                                <ExternalLink className="h-3 w-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-slate-900 text-[14px]">
                              {line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                            </TableCell>
                            <TableCell className="text-right pr-8 font-bold text-slate-900 text-[14px]">
                              {line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}
                    <TableRow className="bg-slate-900 text-white hover:bg-slate-900/95 border-none mt-4">
                      <TableCell colSpan={2} className="pl-8 py-5">
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Total Company Balances</span>
                      </TableCell>
                      <TableCell className="text-right py-5 text-xl font-black">
                        {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right pr-8 py-5 text-xl font-black">
                        {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {Math.abs(totalDebit - totalCredit) >= 0.01 && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-800 animate-in fade-in slide-in-from-bottom-2">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
               <Scale className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-bold">The Trial Balance is out of equilibrium by {(totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <p className="text-xs opacity-80">This usually indicates a missing ledger entry or a manual database intervention. Please audit your recent journal entries.</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
