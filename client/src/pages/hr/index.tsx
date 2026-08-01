import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HRLayout } from "@/pages/hr/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { Users, FileSpreadsheet, CalendarCheck, Banknote, Building2, AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const RUN_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  REVIEW: { label: "Review", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  APPROVED: { label: "Approved", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  LOCKED: { label: "Locked", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  REVERSED: { label: "Reversed", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" },
};

export default function HRDashboard() {
  const { user } = useAuth();
  const { activeCompanyId: companyId } = useActiveCompany(!!user, user?.id ?? null);

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/dashboard`],
    enabled: !!companyId,
  });

  const fmt = (v: any) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const latest = data?.latestRun;
  const statusMeta = latest ? RUN_STATUS[latest.status] || { label: latest.status, className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" } : null;

  return (
    <HRLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">HR Dashboard</h1>
          <p className="text-muted-foreground">Live overview of your HR & Payroll metrics.</p>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{data?.totalEmployees ?? 0}</div>
                  <p className="text-xs text-slate-500">Active staff members across {data?.totalDepartments ?? 0} departments</p>
                </CardContent>
              </Card>

              <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Last Payroll Run</CardTitle>
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {latest ? `$${fmt(latest.totalNet)}` : "$0.00"}
                  </div>
                  <p className="text-xs text-slate-500">
                    {latest ? `${latest.periodStart} to ${latest.periodEnd}` : "No payroll runs yet"}
                    {latest && statusMeta && (
                      <Badge className={`ml-2 ${statusMeta.className}`}>{statusMeta.label}</Badge>
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-amber-50/50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">Pending Leave</CardTitle>
                  <CalendarCheck className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{data?.pendingLeaveRequests ?? 0}</div>
                  <p className="text-xs text-slate-500">Leave requests awaiting approval</p>
                </CardContent>
              </Card>

              <Card className="bg-rose-50/50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-rose-700 dark:text-rose-400">Pending Loans</CardTitle>
                  <Banknote className="h-4 w-4 text-rose-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{data?.pendingLoans ?? 0}</div>
                  <p className="text-xs text-slate-500">Loan applications awaiting approval</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  Payroll Summary — {new Date().getFullYear()}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Total Gross</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">${fmt(data?.yearTotals?.totalGross)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Total Taxes & Deductions</div>
                  <div className="text-xl font-bold text-rose-600 dark:text-rose-400">${fmt(data?.yearTotals?.totalTax)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Total Net Pay</div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">${fmt(data?.yearTotals?.totalNet)}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Recent Payroll Runs</CardTitle>
                <Link href="/hr/payroll">
                  <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400">
                    View all <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {!data?.recentRuns?.length ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <AlertCircle className="h-8 w-8 opacity-20" />
                    <p className="text-sm">No payroll runs yet. Create your first run to see it here.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right pr-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentRuns.map((r: any) => {
                        const meta = RUN_STATUS[r.status] || { label: r.status, className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
                        return (
                          <TableRow key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <TableCell className="font-medium">
                              {new Date(r.periodStart).toLocaleDateString()} — {new Date(r.periodEnd).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">${fmt(r.totalGross)}</TableCell>
                            <TableCell className="text-right text-rose-600 dark:text-rose-400">${fmt(r.totalDeductions)}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">${fmt(r.totalNet)}</TableCell>
                            <TableCell>
                              <Badge className={meta.className}>{meta.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <Link href={`/hr/payroll/${r.id}/payslips`}>
                                <Button variant="outline" size="sm" className="h-8">Payslips</Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </HRLayout>
  );
}
