import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { type Account } from "@shared/schema";
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
import { Landmark, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink } from "lucide-react";

type FullLedgerEntry = {
  id: number;
  date: string;
  description: string;
  type: "DEBIT" | "CREDIT";
  amount: string;
  referenceType?: string;
  referenceId?: string;
  account: Account;
};

export default function GeneralLedgerPage() {
  const [, setLocation] = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts"],
  });

  const { data: ledgerEntries, isLoading } = useQuery<FullLedgerEntry[]>({
    queryKey: ["/api/accounting/ledger", { accountId: selectedAccountId }],
    enabled: !!selectedAccountId,
  });

  const totalDebit =
    ledgerEntries
      ?.filter((e) => e.type === "DEBIT")
      .reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const totalCredit =
    ledgerEntries
      ?.filter((e) => e.type === "CREDIT")
      .reduce((sum, e) => sum + Number(e.amount), 0) || 0;

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
              <Landmark className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-2xl font-bold text-slate-800 font-display tracking-tight">
                General Ledger
              </h2>
              <p className=" text-slate-500">
                Examine detailed transaction history for specific accounts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-[300px]">
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200">
                  <SelectValue placeholder="Filter by Account..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                  <SelectItem value="all" className="font-bold">
                    All Accounts
                  </SelectItem>
                  {accounts?.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id.toString()}>
                      {acc.code} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <ArrowUpRight className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Total Debits
                </span>
                <span className="text-2xl font-black text-slate-800 font-display">
                  {totalDebit.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <ArrowDownLeft className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Total Credits
                </span>
                <span className="text-2xl font-black text-slate-800 font-display">
                  {totalCredit.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <Landmark className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Net Movement
                </span>
                <span className="text-2xl font-black text-slate-800 font-display">
                  {(totalDebit - totalCredit).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="bg-white border-b border-slate-100 px-6 py-5">
            <CardTitle className="text-lg font-bold text-slate-800 font-display">
              Ledger Movements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="w-[120px] font-bold text-slate-500 uppercase text-[10px] tracking-widest pl-8">
                    Date
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">
                    Account
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">
                    Description / Narrative
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-500 uppercase text-[10px] tracking-widest">
                    Debit
                  </TableHead>
                  <TableHead className="text-right pr-8 font-bold text-slate-500 uppercase text-[10px] tracking-widest">
                    Credit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse border-slate-50">
                      <TableCell colSpan={5} className="h-16 bg-slate-50/20" />
                    </TableRow>
                  ))
                ) : ledgerEntries?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-slate-400 font-medium"
                    >
                      No ledger entries found for this selection.
                    </TableCell>
                  </TableRow>
                ) : (
                  ledgerEntries?.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="hover:bg-slate-50/50 border-slate-50 transition-colors cursor-pointer group"
                      onClick={() =>
                        setLocation(`/accounting/ledger/${entry.account.id}`)
                      }
                    >
                      <TableCell className="text-slate-500 font-medium pl-8 ">
                        {format(new Date(entry.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 ">
                              {entry.account.code}
                            </span>
                            <ExternalLink className="h-3 w-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <span className="text-[11px] text-slate-400 font-bold uppercase">
                            {entry.account.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700 ">
                            {entry.description}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            Ref: {entry.referenceType || "-"}{" "}
                            {entry.referenceId || ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-800 text-[14px]">
                        {entry.type === "DEBIT"
                          ? Number(entry.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right pr-8 font-bold text-slate-800 text-[14px]">
                        {entry.type === "CREDIT"
                          ? Number(entry.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })
                          : "-"}
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
