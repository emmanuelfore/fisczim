import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useActiveCompany } from "@/hooks/use-active-company";
import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  DollarSign,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const debitAmount = (entry: any) =>
  entry.type === "DEBIT" ? Number(entry.amount) : 0;
const creditAmount = (entry: any) =>
  entry.type === "CREDIT" ? Number(entry.amount) : 0;

export default function CashbookPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferData, setTransferData] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    reference: "",
    notes: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || 0;

  const { data: accounts } = useQuery<any[]>({
    queryKey: ["/api/accounting/accounts", companyId],
    enabled: !!companyId,
  });

  // Filter for Cash and Bank equivalents
  const cashAccounts = accounts?.filter(
    (acc) =>
      acc.type === "ASSET" &&
      (acc.category?.toLowerCase().includes("cash") ||
        acc.category?.toLowerCase().includes("bank") ||
        acc.name.toLowerCase().includes("bank") ||
        acc.name.toLowerCase().includes("cash"))
  ) || [];

  const { data: ledgerEntries, isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/accounting/ledger", { accountId: selectedAccountId }, companyId],
    enabled: !!companyId && !!selectedAccountId,
  });

  const transferMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/accounting/transfer", {
        ...data,
        amount: Number(data.amount),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Funds transferred successfully.",
      });
      setIsTransferOpen(false);
      setTransferData({
        fromAccountId: "",
        toAccountId: "",
        amount: "",
        reference: "",
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/accounts"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Running balance calculation if a specific account is selected
  let runningBalance = 0;
  const entriesWithBalance =
    selectedAccountId !== "all"
      ? ledgerEntries?.map((entry) => {
          // Debit increases asset (cash in), Credit decreases asset (cash out)
          const amountChange = debitAmount(entry) - creditAmount(entry);
          runningBalance += amountChange;
          return { ...entry, runningBalance };
        })
      : ledgerEntries;

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">
                Cashbook & Banks
              </h1>
              <p className=" text-slate-500">
                Monitor cash flows and bank accounts
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
            <Select
              value={selectedAccountId}
              onValueChange={setSelectedAccountId}
            >
              <SelectTrigger className="w-full sm:w-[200px] h-11 rounded-xl">
                <SelectValue placeholder="Select Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cash Accounts</SelectItem>
                {cashAccounts?.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id.toString()}>
                    {acc.code} - {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white flex items-center justify-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" />
                  <span>Funds Transfer</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transfer Funds</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>From Account</Label>
                      <Select
                        value={transferData.fromAccountId}
                        onValueChange={(v) =>
                          setTransferData((p) => ({ ...p, fromAccountId: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent>
                          {cashAccounts?.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id.toString()}>
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>To Account</Label>
                      <Select
                        value={transferData.toAccountId}
                        onValueChange={(v) =>
                          setTransferData((p) => ({ ...p, toAccountId: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Destination" />
                        </SelectTrigger>
                        <SelectContent>
                          {cashAccounts?.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id.toString()}>
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={transferData.amount}
                      onChange={(e) =>
                        setTransferData((p) => ({
                          ...p,
                          amount: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input
                      placeholder="e.g. TRF-1029"
                      value={transferData.reference}
                      onChange={(e) =>
                        setTransferData((p) => ({
                          ...p,
                          reference: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsTransferOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => transferMutation.mutate(transferData)}
                      disabled={
                        transferMutation.isPending ||
                        !transferData.amount ||
                        !transferData.fromAccountId ||
                        !transferData.toAccountId
                      }
                    >
                      {transferMutation.isPending
                        ? "Processing..."
                        : "Transfer"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                </div>
                <p className=" font-bold text-slate-500 uppercase">Money In</p>
              </div>
              <p className="text-3xl font-black text-slate-900 mt-4">
                {formatCurrency(
                  entriesWithBalance?.reduce(
                    (acc, curr) => acc + debitAmount(curr),
                    0,
                  ) || 0,
                )}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-rose-600" />
                </div>
                <p className=" font-bold text-slate-500 uppercase">Money Out</p>
              </div>
              <p className="text-3xl font-black text-slate-900 mt-4">
                {formatCurrency(
                  entriesWithBalance?.reduce(
                    (acc, curr) => acc + creditAmount(curr),
                    0,
                  ) || 0,
                )}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 bg-primary text-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <p className=" font-bold text-primary-foreground/80 uppercase">
                  Net Balance
                </p>
              </div>
              <p className="text-3xl font-black text-white mt-4">
                {formatCurrency(
                  entriesWithBalance?.reduce(
                    (acc, curr) =>
                      acc + (debitAmount(curr) - creditAmount(curr)),
                    0,
                  ) || 0,
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Transaction History</CardTitle>
            <CardDescription>
              View recent deposits, payments, and transfers.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isError && (
              <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-rose-100 bg-rose-50">
                <p className="text-sm font-semibold text-rose-700">
                  Could not load transactions.
                </p>
                <Button variant="outline" size="sm" className="shrink-0 rounded-lg" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            )}
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="pl-6 w-[140px]">Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right text-emerald-600">
                    Money In (Dr)
                  </TableHead>
                  <TableHead className="text-right text-rose-600">
                    Money Out (Cr)
                  </TableHead>
                  {selectedAccountId !== "all" && (
                    <TableHead className="text-right pr-6">Balance</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell
                        colSpan={selectedAccountId !== "all" ? 6 : 5}
                        className="h-16 bg-slate-50/20"
                      />
                    </TableRow>
                  ))
                ) : entriesWithBalance?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={selectedAccountId !== "all" ? 6 : 5}
                      className="h-32 text-center text-slate-400"
                    >
                      No transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  entriesWithBalance?.map((entry, index) => (
                    <TableRow
                      key={index}
                      className="hover:bg-slate-50 border-slate-100"
                    >
                      <TableCell className="pl-6  font-medium text-slate-600">
                        {format(new Date(entry.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.referenceId || entry.referenceType || "-"}
                      </TableCell>
                      <TableCell className=" text-slate-700">
                        {entry.description}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">
                        {debitAmount(entry) > 0
                          ? formatCurrency(debitAmount(entry))
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-rose-600">
                        {creditAmount(entry) > 0
                          ? formatCurrency(creditAmount(entry))
                          : "-"}
                      </TableCell>
                      {selectedAccountId !== "all" && (
                        <TableCell className="text-right pr-6 font-bold text-slate-900">
                          {formatCurrency(Number(entry.runningBalance))}
                        </TableCell>
                      )}
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
