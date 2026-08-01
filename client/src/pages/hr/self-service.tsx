import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HRLayout } from "./layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, UserRound, CalendarCheck, FileText, PhoneCall, Save } from "lucide-react";

const LEAVE_TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "STUDY"];

export default function HRSelfService() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany(!!user, user?.id ?? null);
  const companyId = activeCompanyId ?? null;
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/self-service`],
    enabled: !!companyId,
  });

  const [leaveForm, setLeaveForm] = useState({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
  const [profileForm, setProfileForm] = useState<any>(null);

  const leaveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/payroll/self-service/leave`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/self-service`] });
      toast({ title: "Leave request submitted", description: "It will be processed by HR." });
      setLeaveForm({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
    },
    onError: (e: any) => {
      toast({ title: "Request failed", description: e.message, variant: "destructive" });
    }
  });

  const profileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/companies/${companyId}/payroll/self-service/profile`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/payroll/self-service`] });
      toast({ title: "Profile updated" });
      setProfileForm(null);
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <HRLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </HRLayout>
    );
  }

  if (isError || !data?.employee) {
    return (
      <HRLayout>
        <div className="p-8 text-center text-muted-foreground">
          No employee record is linked to this account ({user?.email}). Ask HR to add you as an employee with your login email.
        </div>
      </HRLayout>
    );
  }

  const emp = data.employee;

  const submitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    leaveMutation.mutate(leaveForm);
  };

  const submitProfile = (e: React.FormEvent) => {
    e.preventDefault();
    profileMutation.mutate(profileForm);
  };

  return (
    <HRLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <UserRound className="h-6 w-6 text-blue-600" />
            Employee Self-Service
          </h1>
          <p className="text-muted-foreground">Your payslips, leave balances and requests — no HR needed.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserRound className="h-4 w-4 text-slate-400" />
                My Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="font-medium">{emp.firstName} {emp.lastName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Employee No.</span><span className="font-mono">{emp.employeeNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Email</span><span>{emp.email}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Phone</span><span>{emp.phone || "-"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Joined</span><span>{emp.joiningDate}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Status</span>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{emp.status}</Badge>
              </div>

              <Dialog open={!!profileForm} onOpenChange={(open) => setProfileForm(open ? { phone: emp.phone || "", emergencyContactName: emp.emergencyContactName || "", emergencyContactPhone: emp.emergencyContactPhone || "" } : null)}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    <PhoneCall className="mr-2 h-4 w-4" /> Update Contact Details
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Contact Details</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitProfile} className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={profileForm?.phone ?? ""} onChange={(e) => setProfileForm((f: any) => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Emergency Contact Name</Label>
                      <Input value={profileForm?.emergencyContactName ?? ""} onChange={(e) => setProfileForm((f: any) => ({ ...f, emergencyContactName: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Emergency Contact Phone</Label>
                      <Input value={profileForm?.emergencyContactPhone ?? ""} onChange={(e) => setProfileForm((f: any) => ({ ...f, emergencyContactPhone: e.target.value }))} />
                    </div>
                    <Button type="submit" className="w-full gap-2" disabled={profileMutation.isPending}>
                      {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Changes
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                My Payslips (locked runs)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.payslips.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <FileText className="h-8 w-8 opacity-20" />
                  <p className="text-sm">No locked payslips yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">PAYE + AIDS</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead className="text-right pr-6">Download</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payslips.slice(0, 24).map((p: any) => (
                      <TableRow key={p.runId + p.periodStart} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="font-medium">
                          {new Date(p.periodStart).toLocaleDateString()} — {new Date(p.periodEnd).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">${Number(p.grossSalary).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-red-600 dark:text-red-400">
                          ${(Number(p.paye) + Number(p.aidsLevy)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                          ${Number(p.netSalary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <a
                            href={`/api/companies/${companyId}/payroll/self-service/payslip/${p.runId}`}
                            download={`payslip_${p.periodStart.slice(0, 7)}.pdf`}
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                          >
                            PDF
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-slate-400" />
                Leave Balances
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.leaveBalances.length === 0 ? (
                <p className="text-sm text-slate-400">No leave balances configured.</p>
              ) : (
                data.leaveBalances.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between rounded-md border border-slate-100 dark:border-slate-800 px-3 py-2">
                    <span className="text-sm font-medium">{b.leaveType}</span>
                    <span className="text-sm">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{b.availableDays}</span>
                      <span className="text-slate-400"> available · </span>
                      {b.pendingDays > 0 && <span className="text-amber-600 dark:text-amber-400">{b.pendingDays} pending · </span>}
                      <span className="text-slate-400">{b.usedDays} used</span>
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-slate-400" />
                My Leave Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.leaveRequests.length === 0 ? (
                <div className="h-24 flex items-center justify-center text-sm text-slate-400">No requests yet.</div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.leaveRequests.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.leaveType}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(r.startDate).toLocaleDateString()} — {new Date(r.endDate).toLocaleDateString()} ({r.totalDays}d)
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={
                            r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : r.status === "REJECTED" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          }>
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
                      <CalendarCheck className="h-4 w-4" /> Request Leave
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New Leave Request</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitLeave} className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>Leave Type</Label>
                        <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm((f) => ({ ...f, leaveType: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Input type="date" required value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>End Date</Label>
                          <Input type="date" required value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Reason</Label>
                        <Input required value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} />
                      </div>
                      <Button type="submit" className="w-full" disabled={leaveMutation.isPending}>
                        {leaveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Request"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </HRLayout>
  );
}
