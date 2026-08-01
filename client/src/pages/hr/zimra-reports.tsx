import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HRLayout } from "./layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, Building, Users, Calendar, Calculator, Loader2, Landmark, CheckCircle2, XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type P2Result = {
  month: string;
  employeeCount: number;
  totalGross: string;
  totalPaye: string;
  totalAids: string;
  totalRemittable: string;
};

type ZimdefResult = {
  month: string;
  totalGrossWageBill: string;
  zimdefAmount: string;
  standardsLevyAmount: string;
  totalDue: string;
};

export default function ZimraReports() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState<string>(String(currentYear));
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState<"itf16" | "p2" | "zimdef" | "p6" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [p2, setP2] = useState<P2Result | null>(null);
  const [zimdef, setZimdef] = useState<ZimdefResult | null>(null);

  const { data: remittances = [] as any[], isLoading: remittancesLoading } = useQuery<any[]>({
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

  const handleMarkPaid = (r: any) => {
    const referenceNumber = window.prompt(`Reference number for ${r.name} (${r.period}):`, "");
    if (referenceNumber === null) return;
    const paidAmount = Number(window.prompt("Amount remitted (leave blank to keep computed amount):", r.amount) || r.amount);
    markPaidMutation.mutate({ id: r.id, referenceNumber: referenceNumber || undefined, paidAmount: paidAmount || undefined });
  };

  const dueState = (r: any) => {
    const days = Math.floor((new Date(r.dueDate).getTime() - Date.now()) / 86400000);
    if (r.status === "SUBMITTED") return { label: "Submitted", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
    if (days < 0) return { label: "Overdue", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" };
    if (days <= 2) return { label: "Due soon", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
    return { label: "Upcoming", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" };
  };

  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleItf16 = async () => {
    if (!companyId) return;
    setBusy("itf16");
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/companies/${companyId}/payroll/exports/itf16?taxYear=${taxYear}`);
      downloadCSV(`ITF16_${taxYear}.csv`, await res.text());
    } catch (e: any) {
      setError(e.message || "Failed to generate ITF16");
    } finally {
      setBusy(null);
    }
  };

  const handleP2 = async () => {
    if (!companyId) return;
    setBusy("p2");
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/companies/${companyId}/payroll/exports/p2?month=${month}`);
      setP2(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to generate P2");
    } finally {
      setBusy(null);
    }
  };

  const handleZimdef = async () => {
    if (!companyId) return;
    setBusy("zimdef");
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/companies/${companyId}/payroll/exports/zimdef?month=${month}`);
      setZimdef(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to generate ZIMDEF");
    } finally {
      setBusy(null);
    }
  };

  const handleP6 = async () => {
    if (!companyId) return;
    setBusy("p6");
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/companies/${companyId}/payroll/exports/p6?taxYear=${taxYear}`);
      downloadCSV(`P6_${taxYear}.csv`, await res.text());
    } catch (e: any) {
      setError(e.message || "Failed to generate P6 certificates");
    } finally {
      setBusy(null);
    }
  };

  return (
    <HRLayout>
      <div className="flex flex-col gap-6 h-full max-w-5xl mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            ZIMRA Compliance Reports
          </h1>
          <p className="text-slate-500">Generate statutory exports and remittance schedules for Zimbabwe.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ITF16 Card */}
          <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center mb-2">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle>ITF16 Return</CardTitle>
              <CardDescription>Year-end employee tax return (CSV format for e-Taxes portal)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Tax Year</label>
                <Select value={taxYear} onValueChange={setTaxYear}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {[0,1,2].map(i => {
                      const y = currentYear - i;
                      return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleItf16} disabled={busy !== null} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white gap-2">
                {busy === "itf16" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
              </Button>
            </CardContent>
          </Card>

          {/* P2 Return Card */}
          <Card className="border-emerald-100 dark:border-emerald-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 dark:bg-emerald-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center mb-2">
                <Building className="h-5 w-5" />
              </div>
              <CardTitle>P2 Monthly Return</CardTitle>
              <CardDescription>Monthly PAYE and AIDS Levy remittance schedule</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Month</label>
                <Input type="month" value={month} onChange={(e: any) => setMonth(e.target.value)} />
              </div>
              <Button onClick={handleP2} disabled={busy !== null} variant="outline" className="w-full gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                {busy === "p2" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Generate Report
              </Button>
              {p2 && (
                <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Employees paid</span><span className="font-semibold">{p2.employeeCount}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Total gross</span><span className="font-semibold">${p2.totalGross}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">PAYE</span><span className="font-semibold">${p2.totalPaye}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">AIDS Levy</span><span className="font-semibold">${p2.totalAids}</span></div>
                  <div className="flex justify-between border-t border-emerald-200/60 dark:border-emerald-900/40 pt-1"><span className="text-slate-500">Total remittable</span><span className="font-semibold text-emerald-700 dark:text-emerald-400">${p2.totalRemittable}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* P6 Certificates Card */}
          <Card className="border-amber-100 dark:border-amber-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 dark:bg-amber-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-lg flex items-center justify-center mb-2">
                <Users className="h-5 w-5" />
              </div>
              <CardTitle>P6 Certificates</CardTitle>
              <CardDescription>Employee annual tax deduction certificates (CSV for e-Taxes portal)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Tax Year</label>
                <Select value={taxYear} onValueChange={setTaxYear}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {[0,1,2].map(i => {
                      const y = currentYear - i;
                      return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleP6} disabled={busy !== null} variant="outline" className="w-full gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/20">
                {busy === "p6" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
              </Button>
            </CardContent>
          </Card>

          {/* ZIMDEF Levy Card */}
          <Card className="border-rose-100 dark:border-rose-900/40 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 dark:bg-rose-900/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <CardHeader className="pb-3 relative z-10">
              <div className="h-10 w-10 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center mb-2">
                <Calendar className="h-5 w-5" />
              </div>
              <CardTitle>ZIMDEF & Standards Levy</CardTitle>
              <CardDescription>Monthly Manpower and Standards Development return</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Month</label>
                <Input type="month" value={month} onChange={(e: any) => setMonth(e.target.value)} />
              </div>
              <Button onClick={handleZimdef} disabled={busy !== null} variant="outline" className="w-full gap-2 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-900/20">
                {busy === "zimdef" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Generate Report
              </Button>
              {zimdef && (
                <div className="rounded-lg border border-rose-100 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Gross wage bill</span><span className="font-semibold">${zimdef.totalGrossWageBill}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">ZIMDEF (1%)</span><span className="font-semibold">${zimdef.zimdefAmount}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Standards Levy (0.5%)</span><span className="font-semibold">${zimdef.standardsLevyAmount}</span></div>
                  <div className="flex justify-between border-t border-rose-200/60 dark:border-rose-900/40 pt-1"><span className="text-slate-500">Total due</span><span className="font-semibold text-rose-700 dark:text-rose-400">${zimdef.totalDue}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Remittance Tracker */}
        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 py-4">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-blue-500" />
              Statutory Remittance Tracker
            </CardTitle>
            <CardDescription>
              Computed from LOCKED payroll runs. P2 & ZIMDEF due the 10th of the following month; NSSA due the last day of the following month.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {remittancesLoading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : remittances.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Calendar className="h-8 w-8 opacity-20" />
                <p className="text-sm">No remittance schedule yet. Lock a payroll run to generate it.</p>
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
                        <TableRow key={r.id} className={overdue ? "bg-rose-50/40 dark:bg-rose-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}>
                          <TableCell className="font-mono text-sm">{r.period}</TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900 dark:text-white">{r.name}</div>
                            <div className="text-xs text-slate-500">{r.authority} · {r.reportType}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono">${Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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
                            ) : (
                              <Button variant="outline" size="sm" className="h-8" disabled={markPaidMutation.isPending} onClick={() => handleMarkPaid(r)}>
                                Mark Paid
                              </Button>
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
      </div>
    </HRLayout>
  );
}
