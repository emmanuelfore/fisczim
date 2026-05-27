import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { type Account } from "@shared/schema";
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
import { Landmark, ArrowLeft, FileText } from "lucide-react";
import { format } from "date-fns";

type FullLedgerEntry = {
  id: number;
  date: string;
  description: string;
  type: "DEBIT" | "CREDIT";
  amount: string;
  referenceType: string;
  referenceId: string;
  account: Account;
};

export default function AccountDrilledLedgerPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts"],
  });

  const account = accounts?.find(a => a.id === Number(id));

  const { data: ledgerEntries, isLoading } = useQuery<FullLedgerEntry[]>({
    queryKey: ["/api/accounting/ledger", { accountId: id }],
    enabled: !!id
  });

  // Running balance calculation based on account type
  let currentBalance = 0;
  const entriesWithBalance = ledgerEntries?.map(entry => {
    const amount = Number(entry.amount);
    const isDebit = entry.type === "DEBIT";
    
    // Logic: 
    // Assets/Expenses: Balance = Balance + Debit - Credit
    // Liabilities/Equity/Revenue: Balance = Balance + Credit - Debit
    const isNormalDebit = ["ASSET", "EXPENSE"].includes(account?.type || "");
    
    if (isNormalDebit) {
      currentBalance += isDebit ? amount : -amount;
    } else {
      currentBalance += isDebit ? -amount : amount;
    }
    
    return { ...entry, runningBalance: currentBalance };
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => window.history.back()} className="rounded-xl">
             <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
               <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 font-display">Account Ledger: {account?.name || "Loading..."}</h2>
              <p className="text-sm text-slate-500">Chronological history for account {account?.code}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <Card className="border-slate-200/60 shadow-sm rounded-xl">
             <CardContent className="p-4">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Account Type</span>
               <p className="text-lg font-bold text-slate-800">{account?.type || "..."}</p>
             </CardContent>
           </Card>
           <Card className="border-slate-200/60 shadow-sm rounded-xl">
             <CardContent className="p-4">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Normal Balance</span>
               <p className="text-lg font-bold text-slate-800">
                 {["ASSET", "EXPENSE"].includes(account?.type || "") ? "Debit" : "Credit"}
               </p>
             </CardContent>
           </Card>
           <Card className="border-slate-200/60 shadow-sm rounded-xl bg-slate-900 border-slate-800 text-white col-span-2">
             <CardContent className="p-4">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Final Running Balance</span>
               <p className="text-2xl font-black font-display tracking-tight mt-1">
                 {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </p>
             </CardContent>
           </Card>
        </div>

        <Card className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl bg-white">
          <CardHeader className="border-b border-slate-50 px-6 py-4">
            <CardTitle className="text-base font-bold text-slate-800 font-display flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Transaction Feed
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-slate-50">
                  <TableHead className="pl-6 font-bold text-slate-500 text-[10px] uppercase tracking-widest">Date</TableHead>
                  <TableHead className="font-bold text-slate-500 text-[10px] uppercase tracking-widest text-center">Reference</TableHead>
                  <TableHead className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">Narrative</TableHead>
                  <TableHead className="text-right font-bold text-slate-500 text-[10px] uppercase tracking-widest">Debit</TableHead>
                  <TableHead className="text-right font-bold text-slate-500 text-[10px] uppercase tracking-widest">Credit</TableHead>
                  <TableHead className="text-right pr-6 font-bold text-slate-900 text-[10px] uppercase tracking-widest">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                   Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell colSpan={6} className="h-14 bg-slate-50/20" />
                    </TableRow>
                   ))
                ) : entriesWithBalance?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40 text-center text-slate-400 font-medium italic">
                      No transactions found for this account.
                    </TableCell>
                  </TableRow>
                ) : (
                  entriesWithBalance?.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-slate-50/40 border-slate-50 transition-colors">
                      <TableCell className="pl-6 text-[13px] font-medium text-slate-600">
                        {format(new Date(entry.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {entry.referenceType} #{entry.referenceId}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] font-bold text-slate-800">
                        {entry.description}
                      </TableCell>
                      <TableCell className="text-right text-[14px] font-bold text-slate-700">
                        {entry.type === "DEBIT" ? Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}
                      </TableCell>
                      <TableCell className="text-right text-[14px] font-bold text-slate-700">
                        {entry.type === "CREDIT" ? Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}
                      </TableCell>
                      <TableCell className="text-right pr-6 text-[14px] font-black text-slate-900 font-display">
                        {entry.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
