import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Activity,
  ShieldAlert,
  Clock,
  Server,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { format } from "date-fns";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

const CLOSE_JOB = "fiscal_day_closure";

interface JobStatus {
  name: string;
  description: string;
  schedule: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: "running" | "completed" | "failed" | null;
  lastRunDurationMs: number | null;
  lastRunSummary: any | null;
}

interface JobLog {
  id: number;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  resultData: any | null;
  errorData: any | null;
  companyId: number | null;
  metadata: any | null;
}

interface CompanyResult {
  companyId: number;
  companyName: string;
  status: string;
  fiscalDayNo: number | null;
  error: string | null;
}

interface ZimraLog {
  id: number;
  endpoint: string | null;
  requestPayload: any;
  responsePayload: any;
  statusCode: number | null;
  errorMessage: string | null;
  createdAt: string;
}

function timeAgo(value: string | null): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
}

function timeUntil(value: string | null): string {
  if (!value) return "—";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "due";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "completed")
    return (
      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
        <CheckCircle className="w-3 h-3 mr-1" /> Completed
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100">
        <XCircle className="w-3 h-3 mr-1" /> Failed
      </Badge>
    );
  if (status === "running" || status === "started")
    return (
      <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-slate-500">
      Never ran
    </Badge>
  );
}

function CompanyStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return (
        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
          <CheckCircle className="w-3 h-3 mr-1" /> Closed
        </Badge>
      );
    case "already_closed":
      return (
        <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50">
          Already Closed
        </Badge>
      );
    case "close_failed":
      return (
        <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100">
          <XCircle className="w-3 h-3 mr-1" /> Close Failed
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100">
          <AlertTriangle className="w-3 h-3 mr-1" /> Error
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
          {status || "unknown"}
        </Badge>
      );
  }
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-600"
      : tone === "red"
        ? "text-red-600"
        : tone === "amber"
          ? "text-amber-600"
          : "text-slate-900";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function JsonBlock({ data }: { data: any }) {
  if (data == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <pre className="mt-1 bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-[10px] font-mono max-h-64">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function CompanyResponses({
  companyId,
  startedAt,
  completedAt,
}: {
  companyId: number;
  startedAt: string;
  completedAt: string | null;
}) {
  const {
    data: logs,
    isLoading,
    isError,
  } = useQuery<ZimraLog[]>({
    queryKey: ["company-close-responses", companyId, startedAt],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/zimra/logs?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch device responses");
      return res.json();
    },
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading device responses...
      </div>
    );
  if (isError)
    return (
      <div className="text-xs text-red-600 py-2">Failed to load device responses.</div>
    );

  const start = new Date(startedAt).getTime() - 60_000;
  const end = (completedAt ? new Date(completedAt).getTime() : Date.now()) + 120_000;
  const relevant = (logs || []).filter((l) => {
    const t = new Date(l.createdAt).getTime();
    const isCloseEndpoint =
      (l.endpoint || "").toLowerCase().includes("close") ||
      (l.endpoint || "").toLowerCase().includes("status");
    return isCloseEndpoint && t >= start && t <= end;
  });

  if (relevant.length === 0)
    return (
      <div className="text-xs text-muted-foreground py-2">
        No device close/status responses recorded for this run window.
      </div>
    );

  return (
    <div className="space-y-2 py-1">
      {relevant.map((l) => (
        <div key={l.id} className="rounded border border-slate-200 bg-white p-2">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono">
              {l.endpoint || "—"}
            </Badge>
            <Badge
              variant="outline"
              className={
                l.statusCode && l.statusCode < 400
                  ? "text-green-600 border-green-200 bg-green-50"
                  : "text-red-600 border-red-200 bg-red-50"
              }
            >
              {l.statusCode ?? "?"}
            </Badge>
            <span className="text-muted-foreground">
              {format(new Date(l.createdAt), "MMM d, HH:mm:ss")}
            </span>
          </div>
          {l.errorMessage && (
            <div className="text-xs text-red-600 font-mono mt-1 break-all">
              {l.errorMessage}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-500">
                Request
              </div>
              <JsonBlock data={l.requestPayload} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-500">
                Response
              </div>
              <JsonBlock data={l.responsePayload} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompanyRow({
  c,
  startedAt,
  completedAt,
}: {
  c: CompanyResult;
  startedAt: string;
  completedAt: string | null;
}) {
  const [showResponses, setShowResponses] = useState(false);
  const failed = c.status === "close_failed" || c.status === "error";
  return (
    <>
      <TableRow className={failed ? "bg-red-50/40" : ""}>
        <TableCell className="font-medium text-sm">{c.companyName}</TableCell>
        <TableCell>
          <CompanyStatusBadge status={c.status} />
        </TableCell>
        <TableCell className="text-xs font-mono">
          {c.fiscalDayNo != null ? `Day ${c.fiscalDayNo}` : "—"}
        </TableCell>
        <TableCell className="max-w-md">
          {c.error ? (
            <span className="text-xs font-mono text-red-600 break-all">{c.error}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowResponses((v) => !v)}
          >
            <Server className="w-3 h-3 mr-1" />
            {showResponses ? "Hide" : "Responses"}
          </Button>
        </TableCell>
      </TableRow>
      {showResponses && (
        <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
          <TableCell colSpan={5} className="p-0">
            <div className="px-4 py-2">
              <CompanyResponses
                companyId={c.companyId}
                startedAt={startedAt}
                completedAt={completedAt}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function RunSummaryChips({ resultData }: { resultData: any }) {
  if (!resultData) return <span className="text-xs text-muted-foreground">—</span>;
  const ok = resultData.successfulClosures || 0;
  const already = resultData.alreadyClosed || 0;
  const failed = resultData.closeFailed || 0;
  const errors = resultData.failedClosures || 0;
  const total = resultData.totalCompanies ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{total} companies</span>
      {ok > 0 && (
        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
          {ok} closed
        </Badge>
      )}
      {already > 0 && (
        <Badge variant="outline" className="text-slate-500">
          {already} already closed
        </Badge>
      )}
      {failed > 0 && (
        <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200">
          <AlertTriangle className="w-3 h-3 mr-1" /> {failed} close failed
        </Badge>
      )}
      {errors > 0 && (
        <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200">
          <XCircle className="w-3 h-3 mr-1" /> {errors} errored
        </Badge>
      )}
    </div>
  );
}

function RunRow({ log }: { log: JobLog }) {
  const [expanded, setExpanded] = useState(false);
  const companies: CompanyResult[] = Array.isArray(log.resultData?.companies)
    ? log.resultData.companies
    : [];

  return (
    <>
      <TableRow
        className={`cursor-pointer ${log.status === "failed" ? "bg-red-50/40" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="w-8">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </TableCell>
        <TableCell className="font-mono text-xs whitespace-nowrap">
          {format(new Date(log.startedAt), "MMM d, HH:mm:ss")}
        </TableCell>
        <TableCell>
          <StatusBadge status={log.status} />
        </TableCell>
        <TableCell className="text-xs">
          {log.duration != null ? `${(log.duration / 1000).toFixed(1)}s` : "—"}
        </TableCell>
        <TableCell>
          {log.errorData ? (
            <span className="text-xs font-mono text-red-600 break-all">
              {log.errorData.message || log.errorData.stack}
            </span>
          ) : (
            <RunSummaryChips resultData={log.resultData} />
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
          <TableCell colSpan={5} className="p-0">
            <div className="p-3 space-y-3">
              {companies.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No per-company breakdown recorded for this run.
                </div>
              ) : (
                <div className="rounded-md border bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Fiscal Day</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead className="text-right">Device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies.map((c, i) => (
                        <CompanyRow
                          key={`${c.companyId}-${i}`}
                          c={c}
                          startedAt={log.startedAt}
                          completedAt={log.completedAt}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {log.errorData && (
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">
                    Error detail
                  </div>
                  <JsonBlock data={log.errorData} />
                </div>
              )}
              {log.resultData && (
                <details>
                  <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                    Raw run result
                  </summary>
                  <JsonBlock data={log.resultData} />
                </details>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function JobsPage() {
  const { user } = useAuth();
  const isSuperAdmin = !!user?.isSuperAdmin;

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [limit, setLimit] = useState<number>(50);

  const {
    data: statusData,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["/api/jobs/status"],
    queryFn: async () => {
      const res = await apiFetch("/api/jobs/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job status");
      return res.json();
    },
    enabled: isSuperAdmin,
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const {
    data: report,
    isLoading: isLoadingReport,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ["/api/jobs/report", CLOSE_JOB],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/jobs/report?jobName=${CLOSE_JOB}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch job report");
      return res.json();
    },
    enabled: isSuperAdmin,
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const {
    data: logs,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery<JobLog[]>({
    queryKey: ["/api/jobs/logs", CLOSE_JOB, statusFilter, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        jobName: CLOSE_JOB,
        limit: String(limit),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await apiFetch(`/api/jobs/logs?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch job logs");
      return res.json();
    },
    enabled: isSuperAdmin,
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const jobs: JobStatus[] = statusData?.jobs || [];
  const jobLogs: JobLog[] = logs || [];
  const closeSchedule = jobs.find((j) => j.name === CLOSE_JOB);

  const refreshAll = () => {
    refetchStatus();
    refetchReport();
    refetchLogs();
  };

  if (!isSuperAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShieldAlert className="w-10 h-10 text-red-500 mb-4" />
          <h1 className="text-xl font-bold">Superadmin access required</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Scheduled job monitoring is restricted to superadmins.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Scheduled Jobs</h1>
            <p className="text-muted-foreground text-sm">
              Monitor the fiscal day closure sweep and other background schedules.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-blue-600"
              />
              Auto-refresh
            </label>
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Close-day stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Runs" value={report?.total ?? "—"} />
          <StatCard
            label="Success Rate"
            value={report ? `${report.successRate.toFixed(1)}%` : "—"}
            tone="green"
            hint={report ? `${report.completed} completed` : undefined}
          />
          <StatCard
            label="Failed Runs"
            value={report?.failed ?? "—"}
            tone={report?.failed ? "red" : "default"}
          />
          <StatCard
            label="Avg Duration"
            value={
              report?.avgDuration
                ? `${(report.avgDuration / 1000).toFixed(1)}s`
                : "—"
            }
          />
        </div>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Schedule
            </CardTitle>
            <CardDescription>
              Next run time and latest outcome of each scheduled job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStatus ? (
              <div className="text-center py-8 text-muted-foreground">Loading schedule...</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Next Run</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No jobs registered.
                        </TableCell>
                      </TableRow>
                    ) : (
                      jobs.map((job) => (
                        <TableRow key={job.name}>
                          <TableCell>
                            <div className="font-mono text-sm font-medium">{job.name}</div>
                            <div className="text-xs text-muted-foreground max-w-xs">
                              {job.description}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {job.schedule}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-xs whitespace-nowrap">
                              {job.nextRunAt
                                ? format(new Date(job.nextRunAt), "MMM d, HH:mm")
                                : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {timeUntil(job.nextRunAt)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs whitespace-nowrap">
                              {job.lastRunAt
                                ? format(new Date(job.lastRunAt), "MMM d, HH:mm")
                                : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {timeAgo(job.lastRunAt)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={job.lastRunStatus} />
                          </TableCell>
                          <TableCell className="text-xs">
                            {job.lastRunDurationMs != null
                              ? `${(job.lastRunDurationMs / 1000).toFixed(1)}s`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Close day runs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Fiscal Day Closure Runs
                </CardTitle>
                <CardDescription>
                  Click a run to expand per-company status, errors, and device responses.
                  {closeSchedule?.nextRunAt &&
                    ` Next sweep ${timeUntil(closeSchedule.nextRunAt)}.`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={String(limit)}
                  onValueChange={(v) => setLimit(Number(v))}
                >
                  <SelectTrigger className="w-[110px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">Last 25</SelectItem>
                    <SelectItem value="50">Last 50</SelectItem>
                    <SelectItem value="100">Last 100</SelectItem>
                    <SelectItem value="200">Last 200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLogs || isLoadingReport ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Loading runs...
                      </TableCell>
                    </TableRow>
                  ) : jobLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        <Clock className="w-5 h-5 mx-auto mb-2" />
                        No closure runs recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    jobLogs.map((log) => <RunRow key={log.id} log={log} />)
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
