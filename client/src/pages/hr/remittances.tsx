import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HRLayout } from "./layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, CheckCircle2, Landmark, Loader2, XCircle } from "lucide-react";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { displayCurrency, formatMoney } from "@shared/currency";
import { jurisdictionForCountry } from "@shared/statutory/jurisdictions";

export default function StatutoryRemittances() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { activeCompanyId, activeCompany } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();

  // The amounts are what the authority is owed in the currency the run paid in,
  // so each row carries its own sign instead of a guessed dollar.
  const companyCurrency = displayCurrency(String(activeCompany?.currency || "USD"));
  const money = (value: unknown, currency?: string | null) => formatMoney(value, displayCurrency(currency || companyCurrency));
  const jurisdiction = jurisdictionForCountry(activeCompany?.country);
  const canSaveSchedule = can("payroll.write");
  const canMarkPaid = can("payroll.approve");

  const [marking, setMarking] = useState<any | null>(null);
  const [markForm, setMarkForm] = useState({ referenceNumber: "", paidAmount: "" });

  const { data: remittances = [] as any[], isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/statutory-remittances`],
    enabled: !!companyId,
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, referenceNumber, paidAmount }: { id: number; referenceNumber?: string; paidAmount?: number }) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/statutory-remittances/${id}/mark-paid`, { referenceNumber, paidAmount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/statutory-remittances`] });
      toast({ title: "Remittance marked as submitted" });
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/statutory-remittances/regenerate`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/statutory-remittances`] });
      toast({ title: "Filing schedule saved", description: `${data?.saved ?? 0} obligation(s) tracked.` });
    },
    onError: (e: any) => {
      toast({ title: "Could not save the schedule", description: e.message, variant: "destructive" });
    }
  });

  const openMarkPaid = (r: any) => {
    if (!r.id) {
      toast({ title: "Save the schedule first", description: "This obligation is calculated but not tracked yet.", variant: "destructive" });
      return;
    }
    setMarkForm({ referenceNumber: r.referenceNumber || "", paidAmount: String(r.amount ?? "") });
    setMarking(r);
  };

  const submitMarkPaid = () => {
    if (!marking?.id) return;
    const amount = markForm.paidAmount.trim();
    // Only a real number overrides the computed figure: a typed "1,500" would
    // otherwise post as NaN and silently wipe what the tenant actually remitted.
    const paidAmount = amount === "" || Number(amount) === Number(marking.amount) ? undefined : Number(amount);
    if (amount !== "" && !Number.isFinite(paidAmount)) {
      toast({ title: "Enter a number", description: "The remitted amount has to be a figure like 1500.00.", variant: "destructive" });
      return;
    }
    markPaidMutation.mutate(
      { id: marking.id, referenceNumber: markForm.referenceNumber.trim() || undefined, paidAmount },
      { onSuccess: () => setMarking(null) },
    );
  };

  const dueState = (r: any) => {
    const days = Math.floor((new Date(r.dueDate).getTime() - Date.now()) / 86400000);
    if (r.status === "SUBMITTED") return { label: "Submitted", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
    if (days < 0) return { label: "Overdue", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" };
    if (days <= 2) return { label: "Due soon", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
    return { label: "Upcoming", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" };
  };

  return (
    <HRLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Statutory Remittances</h1>
          <p className="text-slate-500">
            {jurisdiction.name} obligations derived from locked payroll runs. Saving the schedule turns them into tracked filings you can mark as paid.
          </p>
        </div>

        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-blue-500" />
                  Filing calendar
                </CardTitle>
                <CardDescription>
                  {jurisdiction.countryCode === "ZW"
                    ? "P2 & ZIMDEF due the 10th of the following month; NSSA due the last day of the following month."
                    : "Only the obligations this payroll actually charges are listed."}
                </CardDescription>
              </div>
              {canSaveSchedule && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={saveScheduleMutation.isPending}
                  onClick={() => saveScheduleMutation.mutate()}
                >
                  {saveScheduleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Schedule
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="h-40 flex items-center justify-center">
                <LoadingRows rows={4} />
              </div>
            ) : remittances.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Calendar className="h-8 w-8 opacity-20" />
                <p className="text-sm">Nothing is due yet. Lock a payroll run to see its obligations.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Obligation</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remittances.map((r: any) => {
                      const state = dueState(r);
                      const overdue = r.status !== "SUBMITTED" && new Date(r.dueDate).getTime() < Date.now();
                      return (
                        <TableRow key={`${r.reportType}:${r.period}`} className={overdue ? "bg-rose-50/40 dark:bg-rose-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}>
                          <TableCell className="font-mono text-sm">{r.period}</TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900 dark:text-white">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.authority} · {r.reportType}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{money(r.amount, r.currency)}</TableCell>
                          <TableCell className={overdue ? "text-rose-600 dark:text-rose-400 font-medium" : ""}>
                            {new Date(r.dueDate).toLocaleDateString()}
                            {overdue && " (overdue)"}
                          </TableCell>
                          <TableCell>
                            <Badge className={state.className}>
                              {r.status === "SUBMITTED" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : overdue ? <XCircle className="h-3 w-3 mr-1" /> : null}
                              {state.label}
                            </Badge>
                            {r.referenceNumber && (
                              <div className="text-xs text-slate-400 mt-0.5">Ref: {r.referenceNumber}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            {r.status === "SUBMITTED" ? (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                {r.paidDate ? `Paid ${r.paidDate}` : "Submitted"}
                              </span>
                            ) : canMarkPaid ? (
                              <Button variant="outline" size="sm" className="h-8" disabled={markPaidMutation.isPending} onClick={() => openMarkPaid(r)}>
                                Mark Paid
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">Approval needed</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!marking} onOpenChange={(open) => { if (!open) setMarking(null); }}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Record a remittance</DialogTitle>
              <DialogDescription>
                {marking ? `${marking.name} for ${marking.period}. The reference is what the authority can trace the payment back to.` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="remittance-reference">Reference number</Label>
                <Input
                  id="remittance-reference"
                  value={markForm.referenceNumber}
                  onChange={(e) => setMarkForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                  placeholder="e.g. BP-1184432"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remittance-amount">Amount remitted</Label>
                <Input
                  id="remittance-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={markForm.paidAmount}
                  onChange={(e) => setMarkForm((f) => ({ ...f, paidAmount: e.target.value }))}
                />
                <p className="text-xs text-slate-500">
                  Defaults to the {money(marking?.amount, marking?.currency)} due. Change it only if the bank payment differed.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMarking(null)}>Cancel</Button>
              <Button onClick={submitMarkPaid} disabled={markPaidMutation.isPending}>
                {markPaidMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Mark as submitted
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HRLayout>
  );
}
