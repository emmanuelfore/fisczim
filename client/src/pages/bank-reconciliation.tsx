import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  Wand2,
  UploadCloud,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function BankReconciliationPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedStatementId, setSelectedStatementId] = useState<string>("");

  const [csvText, setCsvText] = useState("");
  const [stmtDate, setStmtDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [stmtBalance, setStmtBalance] = useState("0");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const [selectedBankLine, setSelectedBankLine] = useState<number | null>(null);
  const [selectedLedgerLine, setSelectedLedgerLine] = useState<number | null>(
    null,
  );

  const [isCreateMatchOpen, setIsCreateMatchOpen] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState("");
  const [matchDescription, setMatchDescription] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery<any[]>({
    queryKey: ["/api/accounting/accounts"],
  });
  const bankAccounts = accounts?.filter(
    (a) =>
      a.type === "ASSET" &&
      (a.category?.toLowerCase().includes("cash") ||
        a.category?.toLowerCase().includes("bank") ||
        a.name.toLowerCase().includes("bank") ||
        a.name.toLowerCase().includes("cash"))
  ) || [];

  const { data: statements } = useQuery<any[]>({
    queryKey: [
      "/api/accounting/reconciliation/statements",
      { accountId: selectedAccountId },
    ],
    enabled: !!selectedAccountId,
  });

  const { data: bankLines } = useQuery<any[]>({
    queryKey: [
      `/api/accounting/reconciliation/statements/${selectedStatementId}/lines`,
    ],
    enabled: !!selectedStatementId,
  });

  const { data: ledgerLines } = useQuery<any[]>({
    queryKey: [
      "/api/accounting/reconciliation/ledger",
      { accountId: selectedAccountId },
    ],
    enabled: !!selectedAccountId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      // Parse CSV: Date, Description, Amount
      const parsedLines = csvText
        .trim()
        .split("\n")
        .map((l) => {
          const parts = l.split(",");
          if (parts.length >= 3) {
            return {
              date: new Date(parts[0].trim()).toISOString(),
              description: parts[1].trim(),
              amount: parts[2].trim(),
            };
          }
          return null;
        })
        .filter(Boolean);

      const payload = {
        accountId: selectedAccountId,
        statementDate: stmtDate,
        closingBalance: stmtBalance,
        lines: parsedLines,
      };

      const res = await apiRequest(
        "POST",
        "/api/accounting/reconciliation/statements",
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Statement Uploaded successfully" });
      setIsUploadOpen(false);
      setCsvText("");
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/reconciliation/statements"],
      });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/accounting/reconciliation/statements/${selectedStatementId}/auto-match`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Auto-Match Complete",
        description: `Successfully automatically matched ${data.matchedCount} transactions.`,
      });
      queryClient.invalidateQueries({
        queryKey: [
          `/api/accounting/reconciliation/statements/${selectedStatementId}/lines`,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/reconciliation/ledger"],
      });
    },
  });

  const manualMatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBankLine || !selectedLedgerLine) return;
      const res = await apiRequest(
        "POST",
        "/api/accounting/reconciliation/match",
        {
          lineId: selectedBankLine,
          ledgerEntryId: selectedLedgerLine,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Matched successfully!" });
      setSelectedBankLine(null);
      setSelectedLedgerLine(null);
      queryClient.invalidateQueries({
        queryKey: [
          `/api/accounting/reconciliation/statements/${selectedStatementId}/lines`,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/reconciliation/ledger"],
      });
    },
  });

  const createMatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBankLine || !targetAccountId) return;
      const res = await apiRequest(
        "POST",
        "/api/accounting/reconciliation/create-match",
        {
          statementLineId: selectedBankLine,
          targetAccountId: targetAccountId,
          description: matchDescription,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Entry Created & Reconciled successfully!" });
      setIsCreateMatchOpen(false);
      setSelectedBankLine(null);
      setTargetAccountId("");
      setMatchDescription("");
      queryClient.invalidateQueries({
        queryKey: [
          `/api/accounting/reconciliation/statements/${selectedStatementId}/lines`,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/accounting/reconciliation/ledger"],
      });
    },
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-800">
                Bank Reconciliation
              </h1>
              <p className=" text-slate-500">
                Match external bank statements to your internal ledger
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center bg-white p-4 rounded-2xl border border-slate-200">
          <div className="w-full md:w-1/3">
            <Label className="text-xs font-bold text-slate-500 uppercase">
              1. Selected GL Account
            </Label>
            <Select
              value={selectedAccountId}
              onValueChange={(v) => {
                setSelectedAccountId(v);
                setSelectedStatementId("");
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose Bank Account..." />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.code} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-1/3">
            <Label className="text-xs font-bold text-slate-500 uppercase">
              2. Bank Statement
            </Label>
            <Select
              disabled={!selectedAccountId}
              value={selectedStatementId}
              onValueChange={setSelectedStatementId}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select Statement..." />
              </SelectTrigger>
              <SelectContent>
                {statements?.map((s: any) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {format(new Date(s.statementDate), "MMM dd, yyyy")} -
                    Balance: {formatCurrency(Number(s.closingBalance))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-1/3 flex items-end md:pt-5 pt-2">
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <Button
                  disabled={!selectedAccountId}
                  className="w-full gap-2 font-bold cursor-pointer"
                >
                  <UploadCloud className="h-4 w-4" /> Upload Bank Statement
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Bank Feed (CSV text)</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                      <Label>Statement Date</Label>
                      <Input
                        type="date"
                        value={stmtDate}
                        onChange={(e) => setStmtDate(e.target.value)}
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>Closing Balance</Label>
                      <Input
                        type="number"
                        value={stmtBalance}
                        onChange={(e) => setStmtBalance(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Paste CSV lines (Format: Date,Description,Amount)
                    </Label>
                    <Textarea
                      rows={6}
                      placeholder="2026-06-01, Wire Transfer IN, 5000.00&#10;2026-06-02, Bank Fee, -15.00"
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => uploadMutation.mutate()}
                  >
                    Import Feed into GL
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {selectedAccountId && selectedStatementId && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left side: External Bank Feed */}
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    Bank Statement Lines
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a line to match.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => autoMatchMutation.mutate()}
                  disabled={autoMatchMutation.isPending}
                  className="gap-2 h-9 text-indigo-700 bg-indigo-100 font-bold hover:bg-indigo-200"
                >
                  <Wand2 className="h-4 w-4" /> Auto Match
                </Button>
              </CardHeader>
              <div className="max-h-[500px] overflow-y-auto w-full">
                <Table>
                  <TableBody>
                    {bankLines?.map((line) => (
                      <TableRow
                        key={line.id}
                        className={`cursor-pointer ${line.isReconciled ? "opacity-50" : "hover:bg-slate-50"} ${selectedBankLine === line.id ? "bg-indigo-50/80 border-l-4 border-l-indigo-500" : ""}`}
                        onClick={() =>
                          !line.isReconciled && setSelectedBankLine(line.id)
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {line.isReconciled ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-500" />
                            )}
                            <span className="font-bold text-slate-700 ">
                              {format(new Date(line.date), "dd MMM")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {line.description}
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold ${Number(line.amount) < 0 ? "text-rose-600" : "text-emerald-600"}`}
                        >
                          {formatCurrency(Number(line.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!bankLines?.length && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center h-20 text-slate-400"
                        >
                          No bank lines found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Right side: Internal Unreconciled Ledger */}
            <Card className="rounded-2xl border-slate-200">
              <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    Unreconciled System Ledger
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Select an entry to pair with bank line.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                  <Dialog open={isCreateMatchOpen} onOpenChange={setIsCreateMatchOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={!selectedBankLine}
                        className="w-full sm:w-auto font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        Create Entry
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Journal Entry from Bank Line</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Select Target Account</Label>
                          <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose Account..." />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts?.map((a: any) => (
                                <SelectItem key={a.id} value={a.id.toString()}>
                                  {a.code} - {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            placeholder="Bank fee, interest, etc."
                            value={matchDescription}
                            onChange={(e) => setMatchDescription(e.target.value)}
                          />
                        </div>
                        <Button
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                          disabled={!targetAccountId || createMatchMutation.isPending}
                          onClick={() => createMatchMutation.mutate()}
                        >
                          Create & Reconcile
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Button
                    onClick={() => manualMatchMutation.mutate()}
                    disabled={
                      !selectedBankLine ||
                      !selectedLedgerLine ||
                      manualMatchMutation.isPending
                    }
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 font-bold"
                  >
                    Confirm Match
                  </Button>
                </div>
              </CardHeader>
              <div className="max-h-[500px] overflow-y-auto w-full">
                <Table>
                  <TableBody>
                    {ledgerLines?.map((entry) => {
                      // if amount > 0 and type DEBIT, meaning money came IN to Asset Account. Wait, for assets, Debit is positive.
                      const realAmt =
                        entry.type === "DEBIT"
                          ? Number(entry.amount)
                          : -Number(entry.amount);
                      return (
                        <TableRow
                          key={entry.id}
                          className={`cursor-pointer hover:bg-slate-50 ${selectedLedgerLine === entry.id ? "bg-emerald-50/80 border-l-4 border-l-emerald-500" : ""}`}
                          onClick={() => setSelectedLedgerLine(entry.id)}
                        >
                          <TableCell className="font-bold text-slate-700  whitespace-nowrap">
                            {format(new Date(entry.date), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">
                            {entry.description}
                            {entry.referenceId && (
                              <Badge
                                variant="secondary"
                                className="ml-2 py-0 text-[10px]"
                              >
                                {entry.referenceId}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right font-bold ${realAmt < 0 ? "text-rose-600" : "text-emerald-600"}`}
                          >
                            {formatCurrency(realAmt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!ledgerLines?.length && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center h-20 text-slate-400"
                        >
                          All ledger lines reconciled!
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
