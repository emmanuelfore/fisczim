import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HRLayout } from "@/pages/hr/layout";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { Users, FileSpreadsheet, CalendarCheck, Banknote, Building2, AlertCircle, ChevronRight, ListChecks, CalendarClock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { displayCurrency, formatMoney } from "@shared/currency";
import { documentTypeLabel } from "@shared/staff-file";

const RUN_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  REVIEW: { label: "Review", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  APPROVED: { label: "Approved", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  LOCKED: { label: "Locked", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  REVERSED: { label: "Reversed", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" },
};

// Checklist severities arrive from the server as codes; only icon and colour are
// chosen here - the wording itself comes from the API response.
const CHECKLIST_SEVERITY: Record<string, { icon: typeof CheckCircle2; iconClass: string; badgeClass: string }> = {
  BLOCK: {
    icon: XCircle,
    iconClass: "text-rose-600 dark:text-rose-400",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
  },
  WARN: {
    icon: AlertTriangle,
    iconClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  OK: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
};

const RADAR_STATE: Record<string, string> = {
  EXPIRED: "text-rose-600 dark:text-rose-400",
  EXPIRING: "text-amber-600 dark:text-amber-400",
};

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function HRDashboard() {
  const { user } = useAuth();
  const { activeCompanyId: companyId, activeCompany } = useActiveCompany(!!user, user?.id ?? null);

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/dashboard`],
    enabled: !!companyId,
  });

  const [closePeriod, setClosePeriod] = useState(currentPeriod);

  const {
    data: checklist,
    isLoading: checklistLoading,
    isError: checklistError,
  } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/month-end-checklist`, { period: closePeriod }],
    enabled: !!companyId && !!closePeriod,
  });

  const { data: staffFile, isLoading: staffFileLoading } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}/payroll/staff-file/summary`],
    enabled: !!companyId,
  });

  // Year totals are reported per currency; the headline is the one the company books.
  const companyCurrency = displayCurrency(activeCompany?.currency);
  const yearCurrency = data?.yearTotals?.currency ?? companyCurrency;
  const fmt = (v: any) => formatMoney(v, yearCurrency);
  const runFmt = (v: any, currency: any) => formatMoney(v, displayCurrency(currency || companyCurrency));
  const otherYearCurrencies: any[] = (data?.yearTotalsByCurrency ?? []).filter(
    (t: any) => t.currency !== yearCurrency,
  );

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border border-slate-200/60 bg-white"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
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
                    {latest ? runFmt(latest.totalNet, latest.currency) : formatMoney(0, companyCurrency)}
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
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{fmt(data?.yearTotals?.totalGross)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Total Taxes & Deductions</div>
                  <div className="text-xl font-bold text-rose-600 dark:text-rose-400">{fmt(data?.yearTotals?.totalTax)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Total Net Pay</div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(data?.yearTotals?.totalNet)}</div>
                </div>
              </CardContent>
              {otherYearCurrencies.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-3 text-xs text-slate-500">
                  {otherYearCurrencies.map((t: any) => (
                    <span key={t.currency} className="mr-3">
                      {t.currency} runs this year: {formatMoney(t.totalGross, t.currency)} gross, {formatMoney(t.totalNet, t.currency)} net
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 flex-wrap">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-slate-400" />
                    Month-end checklist
                  </CardTitle>
                  <input
                    type="month"
                    aria-label="Checklist period"
                    value={closePeriod}
                    onChange={(e) => e.target.value && setClosePeriod(e.target.value)}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </CardHeader>
                <CardContent>
                  {checklistLoading ? (
                    <LoadingRows rows={5} />
                  ) : checklistError ? (
                    <p className="py-6 text-sm text-slate-500">
                      The checklist could not be loaded for this period. Try another month.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {checklist?.summary && (
                        <div
                          className={`rounded-lg px-3 py-2 text-sm font-medium ${
                            checklist.summary.readyToClose
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                          }`}
                        >
                          {checklist.summary.readyToClose
                            ? "Ready to close"
                            : `${checklist.summary.blockers} blocker(s), ${checklist.summary.warnings} warning(s)`}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            for {checklist.period ?? closePeriod}
                          </span>
                        </div>
                      )}
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(checklist?.items ?? []).map((item: any, idx: number) => {
                          const meta = CHECKLIST_SEVERITY[item.severity] || CHECKLIST_SEVERITY.OK;
                          const Icon = meta.icon;
                          return (
                            <li key={`${item.id}-${idx}`} className="flex items-start gap-3 py-3">
                              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.iconClass}`} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                                    {item.label}
                                  </span>
                                  {item.count > 0 && <Badge className={meta.badgeClass}>{item.count}</Badge>}
                                </div>
                                {item.detail && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                                )}
                              </div>
                              {item.href && (
                                <Link href={item.href}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0 text-blue-600 dark:text-blue-400"
                                  >
                                    Open <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="text-xs text-slate-400">
                        These checks cover your staff files, runs and anything due to your fiscal authority.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-slate-400" />
                    Document expiry radar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {staffFileLoading ? (
                    <LoadingRows rows={5} />
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-900/10">
                          <div className="text-lg font-bold text-rose-700 dark:text-rose-400">
                            {staffFile?.totals?.expiredDocuments ?? 0}
                          </div>
                          <div className="text-xs text-slate-500">Expired</div>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/10">
                          <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                            {staffFile?.totals?.expiringDocuments ?? 0}
                          </div>
                          <div className="text-xs text-slate-500">Expiring soon</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                          <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
                            {staffFile?.totals?.missingHardCopies ?? 0}
                          </div>
                          <div className="text-xs text-slate-500">Missing hard copies</div>
                        </div>
                      </div>
                      {!(staffFile?.expiringDocuments ?? []).length ? (
                        <p className="py-4 text-sm text-slate-500">
                          Nothing is expired or about to expire on your active staff files.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {(staffFile.expiringDocuments as any[]).slice(0, 6).map((d: any) => (
                            <li
                              key={d.documentId}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                                {d.employeeName} · {documentTypeLabel(d.documentType)} · {String(d.expiryDate)}
                              </span>
                              <span
                                className={`shrink-0 text-xs font-medium ${RADAR_STATE[d.state] || "text-slate-500"}`}
                              >
                                {d.state === "EXPIRED" ? "Expired" : "Expiring"}
                              </span>
                            </li>
                          ))}
                          {staffFile.expiringDocuments.length > 6 && (
                            <li className="text-xs text-slate-500">
                              +{staffFile.expiringDocuments.length - 6} more in your staff files
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

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
                            <TableCell className="text-right">{runFmt(r.totalGross, r.currency)}</TableCell>
                            <TableCell className="text-right text-rose-600 dark:text-rose-400">{runFmt(r.totalDeductions, r.currency)}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">{runFmt(r.totalNet, r.currency)}</TableCell>
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
