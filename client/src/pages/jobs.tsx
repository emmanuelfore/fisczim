import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CalendarClock,
  ChevronDown,
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
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { format } from "date-fns";
import { useState } from "react";

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
  if (status === "running")
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

function ClosureSummary({ summary }: { summary: any }) {
  if (!summary) return null;
  const failed = summary.closeFailed || 0;
  const ok = summary.successfulClosures || 0;
  const already = summary.alreadyClosed || 0;
  const total = summary.totalCompanies ?? "?";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
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
          <AlertTriangle className="w-3 h-3 mr-1" /> {failed} failed
        </Badge>
      )}
      {summary.failedCompanies?.length > 0 && (
        <details className="ml-1">
          <summary className="cursor-pointer text-red-600 hover:text-red-800 flex items-center gap-1">
            <ChevronDown className="w-3 h-3" /> View
          </summary>
          <div className="mt-2 space-y-1.5 bg-slate-50 border border-slate-200 rounded p-2">
            {summary.failedCompanies.map((c: any, i: number) => (
              <div key={i} className="text-[11px]">
                <span className="font-semibold">{c.companyName}</span>
                <span className="text-muted-foreground"> (day {c.fiscalDayNo ?? "?"})</span>
                {c.error && (
                  <span className="text-red-600 font-mono block break-all">{c.error}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function JobsPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const {
    data: statusData,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["/api/jobs/status"],
    queryFn: async () => {
      const res = await fetch("/api/jobs/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job status");
      return res.json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const {
    data: logs,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["/api/jobs/logs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs/logs?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job logs");
      return res.json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const jobs: JobStatus[] = statusData?.jobs || [];
  const jobLogs: JobLog[] = logs || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Scheduled Jobs</h1>
            <p className="text-muted-foreground text-sm">
              Background schedules and their run outcomes.
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
            <Button
              variant="outline"
              onClick={() => {
                refetchStatus();
                refetchLogs();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Schedules
            </CardTitle>
            <CardDescription>
              Next run times and latest outcome of each scheduled job.
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
                      <TableHead>Outcome</TableHead>
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
                          <TableCell className="text-xs whitespace-nowrap">{job.schedule}</TableCell>
                          <TableCell>
                            <div className="font-medium text-xs whitespace-nowrap">
                              {job.nextRunAt ? format(new Date(job.nextRunAt), "MMM d, HH:mm") : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {timeUntil(job.nextRunAt)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs whitespace-nowrap">
                              {job.lastRunAt ? format(new Date(job.lastRunAt), "MMM d, HH:mm") : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">{timeAgo(job.lastRunAt)}</div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={job.lastRunStatus} />
                          </TableCell>
                          <TableCell>
                            {job.name === "fiscal_day_closure" ? (
                              <ClosureSummary summary={job.lastRunSummary} />
                            ) : job.lastRunSummary ? (
                              <span className="text-xs font-mono">
                                {JSON.stringify(job.lastRunSummary).substring(0, 120)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
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

        <Card>
          <CardHeader>
            <CardTitle>Run History</CardTitle>
            <CardDescription>Recent executions recorded in the job log ({jobLogs.length} shown).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLogs ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Loading history...
                      </TableCell>
                    </TableRow>
                  ) : jobLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No job runs recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    jobLogs.map((log) => (
                      <TableRow key={log.id} className={log.status === "failed" ? "bg-red-50/40" : ""}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {format(new Date(log.startedAt), "MMM d, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.jobName}</TableCell>
                        <TableCell>
                          <StatusBadge status={log.status} />
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.duration != null ? `${(log.duration / 1000).toFixed(1)}s` : "—"}
                        </TableCell>
                        <TableCell className="max-w-md">
                          {log.jobName === "fiscal_day_closure" && log.resultData ? (
                            <div className="space-y-1.5">
                              <ClosureSummary
                                summary={{
                                  totalCompanies: log.resultData.totalCompanies,
                                  successfulClosures: log.resultData.successfulClosures,
                                  alreadyClosed: log.resultData.alreadyClosed,
                                  closeFailed: log.resultData.closeFailed,
                                  failedCompanies: (log.resultData.companies || []).filter(
                                    (c: any) => c.status === "close_failed" || c.status === "error"
                                  ),
                                }}
                              />
                              {log.errorData && (
                                <div className="text-xs font-mono text-red-600 break-all">
                                  {log.errorData.message}
                                </div>
                              )}
                            </div>
                          ) : log.errorData ? (
                            <div className="text-xs font-mono text-red-600 break-all">
                              {log.errorData.message || log.errorData.stack}
                            </div>
                          ) : log.resultData ? (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                                View result
                              </summary>
                              <pre className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-[10px] font-mono">
                                {JSON.stringify(log.resultData, null, 2).substring(0, 2000)}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
    </Layout>
  );
}
