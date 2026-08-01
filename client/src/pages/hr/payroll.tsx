import { useState } from "react";
import { Link } from "wouter";
import { downloadExcel } from "@/lib/export-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  FileSpreadsheet, 
  Plus, 
  ChevronRight,
  CheckCircle2,
  LockKeyhole,
  PlayCircle,
  Clock,
  Send,
  MoreHorizontal,
  ChevronDown,
  Undo2,
  BadgeDollarSign,
  Gift,
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import { HRLayout } from "./layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const money = (value: unknown, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(value || 0),
  );

export default function HRPayrollRuns() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    periodStart: format(new Date(), "yyyy-MM-01"),
    periodEnd: format(new Date(), "yyyy-MM-28"),
    payFrequency: "MONTHLY",
    currency: "USD",
    runType: "REGULAR" as "REGULAR" | "BONUS",
    prorate: true,
    bonuses: {} as Record<number, number>,
  });

  const { data: runs = [] as any[], isLoading } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/runs`],
    enabled: !!companyId,
  });

  const { data: activeEmployees = [] as any[] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/employees`],
    enabled: !!companyId && isAddModalOpen && formData.runType === "BONUS",
  });

  const { data: pendingSalaryChanges = [] as any[] } = useQuery<any[]>({
    queryKey: [`/api/companies/${companyId}/payroll/salary-changes/pending`],
    enabled: !!companyId,
  });

  const createRunMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/runs`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/runs`] });
      setIsAddModalOpen(false);
      toast({ title: "Payroll run created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create payroll run", description: error.message, variant: "destructive" });
    }
  });

  const submitRunMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/runs/${id}/submit-for-approval`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/runs`] });
      toast({ title: "Run Submitted", description: "Payroll run submitted for approval." });
    },
    onError: (error: any) => {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    }
  });

  const approveRunMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/runs/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/runs`] });
      toast({ title: "Run Approved", description: "Payroll run approved successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Approval Failed", description: error.message, variant: "destructive" });
    }
  });

  const lockRunMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/runs/${id}/lock`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/runs`] });
      toast({ title: "Run Locked", description: "Payroll run locked and journal draft generated." });
    },
    onError: (error: any) => {
      toast({ title: "Locking Failed", description: error.message, variant: "destructive" });
    }
  });

  const reverseRunMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/runs/${id}/reverse`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/runs`] });
      toast({ title: "Run Reversed", description: data.message || "Run reversed and reversing journal posted." });
    },
    onError: (error: any) => {
      toast({ title: "Reversal Failed", description: error.message, variant: "destructive" });
    }
  });

  const salaryApproveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/salary-changes/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/salary-changes/pending`] });
      toast({ title: "Salary change approved and applied to contract" });
    },
    onError: (error: any) => {
      toast({ title: "Approval Failed", description: error.message, variant: "destructive" });
    }
  });

  const salaryRejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/salary-changes/${id}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/salary-changes/pending`] });
      toast({ title: "Salary change rejected" });
    },
    onError: (error: any) => {
      toast({ title: "Rejection Failed", description: error.message, variant: "destructive" });
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      ...formData,
      bonuses: formData.runType === "BONUS"
        ? Object.entries(formData.bonuses).filter(([, v]) => v > 0).map(([employeeId, amount]) => ({ employeeId: Number(employeeId), amount }))
        : undefined,
    };
    if (payload.runType !== "BONUS") delete payload.bonuses;
    createRunMutation.mutate(payload);
  };

  return (
    <HRLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Payroll Processing
            </h1>
            <p className="text-muted-foreground mt-1">
              Process monthly cycles, review worksheets, and disburse payments.
            </p>
          </div>
          
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all gap-2">
                <Plus className="h-4 w-4" />
                New Payroll Run
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>New Payroll Run</DialogTitle>
                <DialogDescription>
                  Start a new payroll cycle for the specified period.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period Start</Label>
                    <Input type="date" required value={formData.periodStart} onChange={(e) => setFormData({...formData, periodStart: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Period End</Label>
                    <Input type="date" required value={formData.periodEnd} onChange={(e) => setFormData({...formData, periodEnd: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={formData.payFrequency} onValueChange={(v) => setFormData({...formData, payFrequency: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={formData.currency} onValueChange={(v) => setFormData({...formData, currency: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="ZiG">ZiG</SelectItem>
                        <SelectItem value="SPLIT">SPLIT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Run Type</Label>
                    <Select value={formData.runType} onValueChange={(v) => setFormData({...formData, runType: v as any, bonuses: {}})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="REGULAR">Regular Salary</SelectItem>
                        <SelectItem value="BONUS">Bonus / 13th Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.runType === "REGULAR" && (
                    <div className="space-y-2">
                      <Label>Proration</Label>
                      <label className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.prorate}
                          onChange={(e) => setFormData({ ...formData, prorate: e.target.checked })}
                          className="h-4 w-4 accent-blue-600"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-300">Prorate mid-period joins / leavers</span>
                      </label>
                    </div>
                  )}
                </div>

                {formData.runType === "BONUS" && (
                  <div className="space-y-2 max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase">13th Cheque / Bonus Amounts (tax-free up to $400/yr per Finance Act)</div>
                    {activeEmployees.filter((emp: any) => emp.contracts?.[0]).map((emp: any) => (
                      <div key={emp.id} className="flex items-center gap-2">
                        <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                          {emp.firstName} {emp.lastName}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="h-8 w-28"
                          value={formData.bonuses[emp.id] ?? ""}
                          onChange={(e) => setFormData({
                            ...formData,
                            bonuses: { ...formData.bonuses, [emp.id]: parseFloat(e.target.value) || 0 },
                          })}
                        />
                      </div>
                    ))}
                    {activeEmployees.length === 0 && (
                      <p className="text-xs text-slate-400">No employees with active contracts found.</p>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createRunMutation.isPending}>
                  {createRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Payroll Run"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {pendingSalaryChanges.length > 0 && (
          <Card className="border-amber-200/70 dark:border-amber-900/40 shadow-sm bg-amber-50/40 dark:bg-amber-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <BadgeDollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Pending Salary Changes ({pendingSalaryChanges.length})
                </h2>
              </div>
              <div className="space-y-2">
                {pendingSalaryChanges.map((change: any) => (
                  <div key={change.id} className="flex items-center gap-3 rounded-md border border-amber-200/70 dark:border-amber-900/40 bg-white/60 dark:bg-slate-900/40 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {change.employee?.firstName} {change.employee?.lastName}
                        <span className="text-slate-400 font-normal"> · {change.employee?.employeeNumber}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        ${Number(change.previousBaseSalary).toLocaleString()} → <span className="font-semibold text-emerald-600 dark:text-emerald-400">${Number(change.newBaseSalary).toLocaleString()}</span>
                        {change.currency} · effective {change.effectiveDate} · {change.reason}
                      </div>
                    </div>
                    <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => salaryApproveMutation.mutate(change.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 gap-1" onClick={() => salaryRejectMutation.mutate(change.id)}>
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200/60 shadow-sm bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Period</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Total Net</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-500 mx-auto" />
                        <p className="text-sm text-slate-500 mt-2">Loading payroll cycles...</p>
                      </TableCell>
                    </TableRow>
                  ) : runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center text-slate-500">
                        <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        No payroll runs found. Start a new processing cycle.
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.map((run: any) => (
                      <TableRow key={run.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          {format(new Date(run.periodStart), "MMM d")} - {format(new Date(run.periodEnd), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono">
                            {run.currency}
                          </Badge>
                          {run.runType === "BONUS" && (
                            <Badge className="ml-1 bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/40 dark:text-purple-400">
                              <Gift className="h-3 w-3 mr-1" /> 13th Cheque
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                          {money(run.totalNet, run.currency)}
                        </TableCell>
                        <TableCell className="text-right text-rose-600 dark:text-rose-400 text-sm">
                          {money(run.totalDeductions, run.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary"
                            className={
                              run.status === "LOCKED" ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                              : run.status === "APPROVED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : run.status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }
                          >
                            {run.status === "LOCKED" && <LockKeyhole className="h-3 w-3 mr-1" />}
                            {run.status === "APPROVED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {run.status === "PENDING_APPROVAL" && <Clock className="h-3 w-3 mr-1" />}
                            {run.status === "DRAFT" && <PlayCircle className="h-3 w-3 mr-1" />}
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/hr/payroll/${run.id}/payslips`}>
                              <Button variant="ghost" size="sm" className="text-emerald-600 dark:text-emerald-400">
                                Payslips
                              </Button>
                            </Link>
                            <Link href={`/hr/payroll/${run.id}/report`}>
                              <Button variant="ghost" size="sm" className="text-purple-600 dark:text-purple-400">
                                Report
                              </Button>
                            </Link>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-blue-600 dark:text-blue-400"
                              onClick={() => downloadExcel(`/api/companies/${companyId}/payroll/runs/${run.id}/bank-export`, `bank_export_${run.id}.csv`)}
                            >
                              Export Bank File
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="ml-2 gap-1 border-slate-200">
                                  Actions <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {run.status === "DRAFT" && (
                                  <DropdownMenuItem onClick={() => submitRunMutation.mutate(run.id)}>
                                    <Send className="mr-2 h-4 w-4 text-amber-500" />
                                    Submit for Approval
                                  </DropdownMenuItem>
                                )}
                                {run.status === "PENDING_APPROVAL" && (
                                  <DropdownMenuItem onClick={() => approveRunMutation.mutate(run.id)}>
                                    <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                                    Approve Run
                                  </DropdownMenuItem>
                                )}
                                {run.status === "APPROVED" && (
                                  <DropdownMenuItem onClick={() => lockRunMutation.mutate(run.id)}>
                                    <LockKeyhole className="mr-2 h-4 w-4 text-slate-500" />
                                    Lock & Post Journals
                                  </DropdownMenuItem>
                                )}
                                {run.status === "LOCKED" && run.runType !== "BONUS" && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (window.confirm(`Reverse run #${run.id}? This posts a reversing journal entry and marks the run REVERSED.`)) {
                                        reverseRunMutation.mutate(run.id);
                                      }
                                    }}
                                    className="text-rose-600 dark:text-rose-400"
                                  >
                                    <Undo2 className="mr-2 h-4 w-4" />
                                    Reverse Run
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </HRLayout>
  );
}
