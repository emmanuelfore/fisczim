import { Layout } from "@/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type JournalEntry,
  type LedgerEntry,
  type Account,
} from "@shared/schema";
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
  Plus,
  History,
  User,
  Calendar,
  Trash2,
  Save,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type FullJournalEntry = JournalEntry & {
  lines?: Array<
    LedgerEntry & {
      account?: Account;
      accountCode?: string;
      accountName?: string;
    }
  >;
  ledgerEntries?: Array<
    LedgerEntry & {
      account?: Account;
      accountCode?: string;
      accountName?: string;
    }
  >;
};

type JournalDraft = {
  id: number;
  entryDate: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  status: string;
  lines: Array<{
    id?: number;
    accountId: number;
    accountCode: string;
    accountName: string;
    type: "DEBIT" | "CREDIT";
    amount: string;
  }>;
};

type VoucherLine = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
};

const emptyVoucherLine = (): VoucherLine => ({
  accountId: "",
  debit: "",
  credit: "",
  memo: "",
});

export default function AccountingJournalPage() {
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [voucher, setVoucher] = useState({
    entryDate: format(new Date(), "yyyy-MM-dd"),
    description: "",
    referenceId: "",
    lines: [emptyVoucherLine(), emptyVoucherLine()],
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: entries, isLoading } = useQuery<FullJournalEntry[]>({
    queryKey: ["/api/accounting/journal"],
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts"],
  });

  const { data: drafts } = useQuery<JournalDraft[]>({
    queryKey: ["/api/accounting/journal-drafts"],
  });

  const totals = voucher.lines.reduce(
    (acc, line) => {
      acc.debit += Number(line.debit || 0);
      acc.credit += Number(line.credit || 0);
      return acc;
    },
    { debit: 0, credit: 0 },
  );
  const isBalanced =
    Math.abs(totals.debit - totals.credit) < 0.005 && totals.debit > 0;

  const buildPayload = () => {
    if (!voucher.description.trim()) throw new Error("Description is required");
    const lines = voucher.lines.flatMap((line) => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      if (!line.accountId && (debit > 0 || credit > 0))
        throw new Error("Each amount needs an account");
      if (!line.accountId) return [];
      if (debit > 0 && credit > 0)
        throw new Error("A line cannot have both debit and credit");
      if (debit <= 0 && credit <= 0) return [];
      return [
        {
          accountId: Number(line.accountId),
          type: debit > 0 ? "DEBIT" : "CREDIT",
          amount: debit > 0 ? debit : credit,
          memo: line.memo,
        },
      ];
    });
    if (lines.length < 2) throw new Error("Add at least two journal lines");
    if (!isBalanced)
      throw new Error(
        `Journal is out of balance. Debits: ${totals.debit.toFixed(2)}, Credits: ${totals.credit.toFixed(2)}`,
      );
    return {
      entryDate: voucher.entryDate,
      description: voucher.description,
      referenceType: "JOURNAL",
      referenceId: voucher.referenceId || `JV-${Date.now()}`,
      lines,
    };
  };

  const resetVoucher = () => {
    setVoucher({
      entryDate: format(new Date(), "yyyy-MM-dd"),
      description: "",
      referenceId: "",
      lines: [emptyVoucherLine(), emptyVoucherLine()],
    });
  };

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/accounting/journal-drafts",
        buildPayload(),
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Journal draft saved" });
      setIsVoucherOpen(false);
      resetVoucher();
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/journal-drafts"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not save draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const postVoucherMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/accounting/journal",
        buildPayload(),
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Journal voucher posted" });
      setIsVoucherOpen(false);
      resetVoucher();
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/ledger"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/trial-balance"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not post voucher",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const postDraftMutation = useMutation({
    mutationFn: async (draftId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/accounting/journal-drafts/${draftId}/post`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Draft posted to ledger" });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/journal-drafts"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/ledger"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/trial-balance"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not post draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-slate-800 font-display">
              General Journal
            </h2>
            <p className=" text-slate-500">
              Review all financial transactions and double-entry postings.
            </p>
          </div>
          <Dialog open={isVoucherOpen} onOpenChange={setIsVoucherOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>New Journal Voucher</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Journal Voucher</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={voucher.entryDate}
                      onChange={(e) =>
                        setVoucher({ ...voucher, entryDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input
                      value={voucher.referenceId}
                      placeholder="JV-0001"
                      onChange={(e) =>
                        setVoucher({ ...voucher, referenceId: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Description</Label>
                    <Input
                      value={voucher.description}
                      placeholder="Narrative"
                      onChange={(e) =>
                        setVoucher({ ...voucher, description: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="w-[36%]">Account</TableHead>
                        <TableHead>Memo</TableHead>
                        <TableHead className="w-[130px] text-right">
                          Debit
                        </TableHead>
                        <TableHead className="w-[130px] text-right">
                          Credit
                        </TableHead>
                        <TableHead className="w-[48px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {voucher.lines.map((line, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Select
                              value={line.accountId}
                              onValueChange={(value) =>
                                setVoucher((current) => ({
                                  ...current,
                                  lines: current.lines.map((item, lineIndex) =>
                                    lineIndex === index
                                      ? { ...item, accountId: value }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                              <SelectContent>
                                {accounts?.map((account) => (
                                  <SelectItem
                                    key={account.id}
                                    value={String(account.id)}
                                  >
                                    {account.code} - {account.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={line.memo}
                              placeholder="Optional"
                              onChange={(e) =>
                                setVoucher((current) => ({
                                  ...current,
                                  lines: current.lines.map((item, lineIndex) =>
                                    lineIndex === index
                                      ? { ...item, memo: e.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="text-right"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.debit}
                              onChange={(e) =>
                                setVoucher((current) => ({
                                  ...current,
                                  lines: current.lines.map((item, lineIndex) =>
                                    lineIndex === index
                                      ? {
                                          ...item,
                                          debit: e.target.value,
                                          credit: e.target.value
                                            ? ""
                                            : item.credit,
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="text-right"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.credit}
                              onChange={(e) =>
                                setVoucher((current) => ({
                                  ...current,
                                  lines: current.lines.map((item, lineIndex) =>
                                    lineIndex === index
                                      ? {
                                          ...item,
                                          credit: e.target.value,
                                          debit: e.target.value
                                            ? ""
                                            : item.debit,
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={voucher.lines.length <= 2}
                              onClick={() =>
                                setVoucher((current) => ({
                                  ...current,
                                  lines: current.lines.filter(
                                    (_, lineIndex) => lineIndex !== index,
                                  ),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-slate-50">
                        <TableCell colSpan={2}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setVoucher((current) => ({
                                ...current,
                                lines: [...current.lines, emptyVoucherLine()],
                              }))
                            }
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add Line
                          </Button>
                        </TableCell>
                        <TableCell className="text-right font-black">
                          {totals.debit.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="text-right font-black">
                          {totals.credit.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "w-fit font-bold",
                      isBalanced
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200",
                    )}
                  >
                    {isBalanced
                      ? "Balanced"
                      : `Difference ${(totals.debit - totals.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  </Badge>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => saveDraftMutation.mutate()}
                      disabled={saveDraftMutation.isPending}
                    >
                      <Save className="h-4 w-4 mr-2" />{" "}
                      {saveDraftMutation.isPending ? "Saving..." : "Save Draft"}
                    </Button>
                    <Button
                      onClick={() => postVoucherMutation.mutate()}
                      disabled={postVoucherMutation.isPending || !isBalanced}
                    >
                      <Send className="h-4 w-4 mr-2" />{" "}
                      {postVoucherMutation.isPending
                        ? "Posting..."
                        : "Post Now"}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {drafts?.some((draft) => draft.status === "DRAFT") && (
          <Card className="border-amber-200 bg-amber-50/40 rounded-2xl">
            <CardHeader className="px-6 py-4">
              <CardTitle className="text-base font-bold text-amber-900">
                Draft Journal Batches
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts
                    .filter((draft) => draft.status === "DRAFT")
                    .map((draft) => {
                      const debit = draft.lines
                        .filter((line) => line.type === "DEBIT")
                        .reduce((sum, line) => sum + Number(line.amount), 0);
                      const credit = draft.lines
                        .filter((line) => line.type === "CREDIT")
                        .reduce((sum, line) => sum + Number(line.amount), 0);
                      return (
                        <TableRow key={draft.id}>
                          <TableCell className="pl-6  font-medium">
                            {format(new Date(draft.entryDate), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="font-bold text-slate-800">
                            {draft.description}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {draft.referenceType || "JOURNAL"} #
                            {draft.referenceId || draft.id}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {debit.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {credit.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button
                              size="sm"
                              onClick={() => postDraftMutation.mutate(draft.id)}
                              disabled={
                                postDraftMutation.isPending ||
                                Math.abs(debit - credit) > 0.005
                              }
                            >
                              Post Draft
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card
                key={i}
                className="animate-pulse border-slate-100 h-32 bg-slate-50/50"
              />
            ))
          ) : entries?.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 bg-slate-50/30 py-12">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <History className="h-12 w-12 text-slate-300 mb-4" />
                <p className="text-lg font-bold text-slate-500">
                  No Journal Entries Yet
                </p>
                <p className=" text-slate-400 max-w-sm mt-1">
                  Start by creating an invoice or recording an expense to see
                  automated ledger postings here.
                </p>
              </CardContent>
            </Card>
          ) : (
            entries?.map((entry) => (
              <Card
                key={entry.id}
                className="border-slate-200/60 shadow-sm overflow-hidden rounded-2xl group hover:shadow-md transition-all duration-300"
              >
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
                        <History className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className=" font-bold text-slate-700">
                          {entry.description}
                        </span>
                        <div className="flex items-center gap-3 mt-0.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-100">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(entry.entryDate), "PPP")}
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-black uppercase tracking-wider py-0 px-2 h-5 bg-white border-slate-100 text-slate-400 shadow-none"
                          >
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
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        Entry ID: #{entry.id}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-white">
                      <TableRow className="hover:bg-transparent border-slate-100">
                        <TableHead className="w-[120px] font-bold text-slate-400 uppercase text-[10px] tracking-widest pl-6">
                          Account Code
                        </TableHead>
                        <TableHead className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">
                          Account Name
                        </TableHead>
                        <TableHead className="text-right font-bold text-slate-400 uppercase text-[10px] tracking-widest">
                          Debit
                        </TableHead>
                        <TableHead className="text-right pr-6 font-bold text-slate-400 uppercase text-[10px] tracking-widest">
                          Credit
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(entry.lines || entry.ledgerEntries || []).map(
                        (line) => (
                          <TableRow
                            key={line.id}
                            className="hover:bg-slate-50/30 border-slate-50"
                          >
                            <TableCell
                              className={cn(
                                "font-bold  pl-6 transition-colors",
                                line.type === "DEBIT"
                                  ? "text-primary"
                                  : "text-slate-400",
                              )}
                            >
                              {line.account?.code || line.accountCode}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "font-medium ",
                                line.type === "DEBIT"
                                  ? "text-slate-900"
                                  : "text-slate-500 pl-8",
                              )}
                            >
                              {line.account?.name || line.accountName}
                            </TableCell>
                            <TableCell className="text-right font-bold text-slate-700">
                              {line.type === "DEBIT"
                                ? Number(line.amount).toLocaleString(
                                    undefined,
                                    { minimumFractionDigits: 2 },
                                  )
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right pr-6 font-bold text-slate-700">
                              {line.type === "CREDIT"
                                ? Number(line.amount).toLocaleString(
                                    undefined,
                                    { minimumFractionDigits: 2 },
                                  )
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
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
