import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Account } from "@shared/schema";
import { format } from "date-fns";
import { Lock, Plus, Scale, Trash2 } from "lucide-react";
import { useState } from "react";

type OpeningState = {
  locked: boolean;
  date?: string | null;
  journalEntryId?: number | null;
  customerBalances?: Array<{ name: string; amount: number }>;
  supplierBalances?: Array<{ name: string; amount: number }>;
  customerSubledgerDocs?: Array<{ customerId: number; customerName: string; invoiceId: number; amount: number }>;
  supplierSubledgerDocs?: Array<{ supplierId: number; supplierName: string; supplierInvoiceId: number; amount: number }>;
  inventoryValue?: number;
};

type OpeningLine = { accountId: string; debit: string; credit: string };
type SubledgerLine = { name: string; amount: string };

const emptyLine = (): OpeningLine => ({ accountId: "", debit: "", credit: "" });
const emptySubledgerLine = (): SubledgerLine => ({ name: "", amount: "" });

export default function OpeningBalancesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [lines, setLines] = useState<OpeningLine[]>([emptyLine(), emptyLine()]);
  const [customers, setCustomers] = useState<SubledgerLine[]>([emptySubledgerLine()]);
  const [suppliers, setSuppliers] = useState<SubledgerLine[]>([emptySubledgerLine()]);
  const [inventoryValue, setInventoryValue] = useState("");

  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounting/accounts"] });
  const { data: opening } = useQuery<OpeningState>({ queryKey: ["/api/accounting/opening-balances"] });

  const totals = lines.reduce((acc, line) => {
    acc.debit += Number(line.debit || 0);
    acc.credit += Number(line.credit || 0);
    return acc;
  }, { debit: 0, credit: 0 });
  const customerTotal = customers.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const supplierTotal = suppliers.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const netDebit = totals.debit + customerTotal + Number(inventoryValue || 0);
  const netCredit = totals.credit + supplierTotal;

  const postMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date,
        trialBalanceLines: lines
          .filter((line) => line.accountId && (Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0))
          .map((line) => ({ accountId: Number(line.accountId), debit: Number(line.debit || 0), credit: Number(line.credit || 0) })),
        customerBalances: customers.filter((row) => row.name && Number(row.amount || 0) > 0).map((row) => ({ name: row.name, amount: Number(row.amount) })),
        supplierBalances: suppliers.filter((row) => row.name && Number(row.amount || 0) > 0).map((row) => ({ name: row.name, amount: Number(row.amount) })),
        inventoryValue: Number(inventoryValue || 0),
      };
      const res = await apiRequest("POST", "/api/accounting/opening-balances", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Opening balances posted", description: "The opening entry is locked and available in the audit trail." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/trial-balance"] });
    },
    onError: (error: any) => {
      toast({ title: "Could not post opening balances", description: error.message, variant: "destructive" });
    },
  });

  const updateLine = (index: number, patch: Partial<OpeningLine>) => {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  };
  const updateSubledger = (kind: "customers" | "suppliers", index: number, patch: Partial<SubledgerLine>) => {
    const setter = kind === "customers" ? setCustomers : setSuppliers;
    setter((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 font-display">Opening Balances</h2>
            <p className="text-sm text-slate-500">Post migration balances from Sage, Pastel, QuickBooks, or Excel.</p>
          </div>
          {opening?.locked ? (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Lock className="mr-1 h-3.5 w-3.5" />
              Locked journal #{opening.journalEntryId}
            </Badge>
          ) : null}
        </div>

        {opening?.locked ? (
          <Card>
            <CardHeader><CardTitle>Opening Balance Lock</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-600">
              Opening balances were posted on {opening.date ? format(new Date(opening.date), "PPP") : "the selected date"}. Reverse journal #{opening.journalEntryId} from the audit trail to unlock and repost.
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="font-bold text-slate-800">Receivables subledger</p>
                  <p className="text-xs text-slate-500">{opening.customerSubledgerDocs?.length || 0} opening customer invoice{(opening.customerSubledgerDocs?.length || 0) === 1 ? "" : "s"} created.</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="font-bold text-slate-800">Payables subledger</p>
                  <p className="text-xs text-slate-500">{opening.supplierSubledgerDocs?.length || 0} opening supplier bill{(opening.supplierSubledgerDocs?.length || 0) === 1 ? "" : "s"} created.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Opening Trial Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-2">
              <Label>Opening balance date</Label>
              <Input type="date" value={date} disabled={opening?.locked} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="w-36 text-right">Debit</TableHead>
                    <TableHead className="w-36 text-right">Credit</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select value={line.accountId} disabled={opening?.locked} onValueChange={(value) => updateLine(index, { accountId: value })}>
                          <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                          <SelectContent>
                            {accounts.map((account) => (
                              <SelectItem key={account.id} value={String(account.id)}>{account.code} - {account.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input className="text-right" value={line.debit} disabled={opening?.locked} onChange={(event) => updateLine(index, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} /></TableCell>
                      <TableCell><Input className="text-right" value={line.credit} disabled={opening?.locked} onChange={(event) => updateLine(index, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} /></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" disabled={opening?.locked || lines.length <= 2} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button variant="outline" disabled={opening?.locked} onClick={() => setLines((current) => [...current, emptyLine()])}>
              <Plus className="mr-2 h-4 w-4" /> Add account line
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {(["customers", "suppliers"] as const).map((kind) => {
            const rows = kind === "customers" ? customers : suppliers;
            return (
              <Card key={kind}>
              <CardHeader><CardTitle>{kind === "customers" ? "Customer Opening Balances" : "Supplier Opening Balances"}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                  {rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_110px] gap-2">
                      <Input placeholder={kind === "customers" ? "Customer name" : "Supplier name"} value={row.name} disabled={opening?.locked} onChange={(event) => updateSubledger(kind, index, { name: event.target.value })} />
                      <Input className="text-right" placeholder="0.00" value={row.amount} disabled={opening?.locked} onChange={(event) => updateSubledger(kind, index, { amount: event.target.value })} />
                    </div>
                  ))}
                  <Button variant="outline" size="sm" disabled={opening?.locked} onClick={() => (kind === "customers" ? setCustomers : setSuppliers)((current) => [...current, emptySubledgerLine()])}>
                    <Plus className="mr-2 h-4 w-4" /> Add line
                  </Button>
                  <p className="text-xs text-slate-500">
                    {kind === "customers" ? "Each line creates an opening receivable invoice for aging and statements." : "Each line creates an opening supplier bill for payables aging and supplier drilldown."}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardHeader><CardTitle>Inventory Opening Value</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Label>Total inventory value</Label>
              <Input className="text-right" placeholder="0.00" value={inventoryValue} disabled={opening?.locked} onChange={(event) => setInventoryValue(event.target.value)} />
              <p className="text-xs text-slate-500">Posts to the inventory control account and balances through opening equity if needed.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
            <div className="text-sm">
              <span className="font-bold text-slate-800">Debit {netDebit.toFixed(2)}</span>
              <span className="mx-3 text-slate-300">|</span>
              <span className="font-bold text-slate-800">Credit {netCredit.toFixed(2)}</span>
              <span className="mx-3 text-slate-300">|</span>
              <span className="text-slate-500">Difference {(netDebit - netCredit).toFixed(2)} will use opening equity.</span>
            </div>
            <Button disabled={opening?.locked || postMutation.isPending} onClick={() => postMutation.mutate()}>
              <Lock className="mr-2 h-4 w-4" /> Post and Lock Opening Balances
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
