import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { type JournalEntry, type LedgerEntry, type Account } from "@shared/schema";
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
import { Plus, History, ArrowRightLeft, User, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type FullJournalEntry = JournalEntry & {
  ledgerEntries: (LedgerEntry & { account: Account })[];
};

export default function AccountingJournalPage() {
  const { data: entries, isLoading } = useQuery<FullJournalEntry[]>({
    queryKey: ["/api/accounting/journal"],
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-slate-800 font-display">General Journal</h2>
            <p className="text-sm text-slate-500">Review all financial transactions and double-entry postings.</p>
          </div>
          <Button className="h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>New Journal Voucher</span>
          </Button>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse border-slate-100 h-32 bg-slate-50/50" />
            ))
          ) : entries?.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 bg-slate-50/30 py-12">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <History className="h-12 w-12 text-slate-300 mb-4" />
                <p className="text-lg font-bold text-slate-500">No Journal Entries Yet</p>
                <p className="text-sm text-slate-400 max-w-sm mt-1">Start by creating an invoice or recording an expense to see automated ledger postings here.</p>
              </CardContent>
            </Card>
          ) : (
            entries?.map((entry) => (
              <Card key={entry.id} className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl group hover:shadow-md transition-all duration-300">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
                        <History className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{entry.description}</span>
                        <div className="flex items-center gap-3 mt-0.5">
                           <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-100">
                             <Calendar className="h-3 w-3" />
                             {format(new Date(entry.entryDate), "PPP")}
                           </div>
                           <Badge variant="outline" className="text-[10px] font-black uppercase tracking-wider py-0 px-2 h-5 bg-white border-slate-100 text-slate-400 shadow-none">
                             {entry.referenceType} #{entry.referenceId}
                           </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                       <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 mb-1">
                         <User className="h-3 w-3" />
                         {entry.createdBy}
                       </div>
                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Entry ID: #{entry.id}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-white">
                      <TableRow className="hover:bg-transparent border-slate-100">
                        <TableHead className="w-[120px] font-bold text-slate-400 uppercase text-[10px] tracking-widest pl-6">Account Code</TableHead>
                        <TableHead className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Account Name</TableHead>
                        <TableHead className="text-right font-bold text-slate-400 uppercase text-[10px] tracking-widest">Debit</TableHead>
                        <TableHead className="text-right pr-6 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.ledgerEntries.map((line) => (
                        <TableRow key={line.id} className="hover:bg-slate-50/30 border-slate-50">
                          <TableCell className={cn("font-bold text-[13px] pl-6 transition-colors", line.type === 'DEBIT' ? "text-primary" : "text-slate-400")}>
                            {line.account.code}
                          </TableCell>
                          <TableCell className={cn("font-medium text-[13px]", line.type === 'DEBIT' ? "text-slate-900" : "text-slate-500 pl-8")}>
                            {line.account.name}
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-700">
                            {line.type === "DEBIT" ? Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}
                          </TableCell>
                          <TableCell className="text-right pr-6 font-bold text-slate-700">
                            {line.type === "CREDIT" ? Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
