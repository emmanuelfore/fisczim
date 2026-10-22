import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FlaskConical,
  Loader2,
  MinusCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

type CaseStatus = "pass" | "fail" | "blocked" | "skipped";

interface UatCaseMeta {
  id: string;
  title: string;
  group: string;
  mode: "setup" | "read" | "fiscal" | "cert";
  description: string;
  requires?: string[];
}

interface CaseResult {
  id: string;
  title: string;
  status: CaseStatus;
  startedAt: string;
  durationMs: number;
  summary?: unknown;
  request?: unknown;
  response?: unknown;
  validationErrors?: Array<{ code?: string; color?: string; message?: string }>;
  error?: { message?: string; statusCode?: number; details?: unknown } | string;
  notes?: string[];
}

interface UatRunState {
  runId: string;
  companyId: number;
  status: "running" | "completed" | "failed";
  selected: string[] | null;
  plan: string[];
  currentCase: string | null;
  results: CaseResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    blocked: number;
    skipped: number;
    byId: Array<{ id: string; status: CaseStatus }>;
  } | null;
  startedAt: string;
  finishedAt: string | null;
  error: { message?: string } | string | null;
}

interface Props {
  companyId: number;
  gateway?: string | null;
  deviceId?: string | null;
}

function errorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return JSON.stringify(error);
}

function StatusBadge({ status }: { status?: CaseStatus | "running" | "pending" }) {
  if (!status) return <span className="text-xs text-slate-400">Not run</span>;
  if (status === "running") {
    return (
      <Badge className="border-blue-200 bg-blue-50 text-blue-700">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running
      </Badge>
    );
  }
  if (status === "pending") {
    return <Badge variant="outline" className="text-slate-500">Pending</Badge>;
  }
  if (status === "pass") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Pass
      </Badge>
    );
  }
  if (status === "fail") {
    return (
      <Badge className="border-red-200 bg-red-50 text-red-700">
        <XCircle className="mr-1 h-3 w-3" /> Fail
      </Badge>
    );
  }
  if (status === "blocked") {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700">
        <ShieldAlert className="mr-1 h-3 w-3" /> Blocked
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-slate-500">
      <MinusCircle className="mr-1 h-3 w-3" /> Skipped
    </Badge>
  );
}

function RunStatusBadge({ run }: { run: UatRunState }) {
  if (run.status === "running") return <StatusBadge status="running" />;
  if (run.status === "failed") {
    return (
      <Badge className="border-red-200 bg-red-50 text-red-700">
        <XCircle className="mr-1 h-3 w-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
      <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
    </Badge>
  );
}

export function LekukaUatPanel({ companyId, gateway, deviceId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<UatCaseMeta[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [run, setRun] = useState<UatRunState | null>(null);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingCase, setPendingCase] = useState<string | null>(null);
  const [skipRenewal, setSkipRenewal] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [autoDownload, setAutoDownload] = useState(true);
  const startedRunIds = useRef<Set<string>>(new Set());
  const downloadedRunIds = useRef<Set<string>>(new Set());

  const showError = useCallback(
    (title: string, error: unknown) => {
      toast({
        title,
        description: errorMessage(error) || "Unexpected error",
        variant: "destructive",
      });
    },
    [toast],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/lekuka/uat`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load UAT cases");
      setCases(Array.isArray(data.cases) ? data.cases : []);
      setOrder(Array.isArray(data.order) ? data.order : []);
      setRun(data.activeRun || data.lastRun || null);
    } catch (error) {
      showError("Could not load UAT suite", error);
    } finally {
      setLoading(false);
    }
  }, [companyId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiFetch(
          `/api/companies/${companyId}/lekuka/uat/runs/${run.runId}`,
        );
        if (!res.ok) return;
        const next = await res.json();
        if (!cancelled) setRun(next);
      } catch {
        // The next poll will retry; a transient failure should not stop the UI.
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [companyId, run?.runId, run?.status]);

  const orderedCases = useMemo(() => {
    const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
    const ids = order.length ? order : cases.map((testCase) => testCase.id);
    return ids.map((id) => byId.get(id)).filter((testCase): testCase is UatCaseMeta => !!testCase);
  }, [cases, order]);

  const groupedCases = useMemo(() => {
    const groups: Array<{ name: string; cases: UatCaseMeta[] }> = [];
    for (const testCase of orderedCases) {
      let group = groups.find((candidate) => candidate.name === testCase.group);
      if (!group) {
        group = { name: testCase.group, cases: [] };
        groups.push(group);
      }
      group.cases.push(testCase);
    }
    return groups;
  }, [orderedCases]);

  const resultById = useMemo(() => {
    const map = new Map<string, CaseResult>();
    for (const result of run?.results || []) map.set(result.id, result);
    return map;
  }, [run?.results]);

  const completedInPlan = run
    ? run.plan.filter((id) => resultById.has(id)).length
    : 0;
  const progress = run?.plan.length
    ? Math.round((completedInPlan / run.plan.length) * 100)
    : 0;

  const openRunDialog = (caseId?: string) => {
    setPendingCase(caseId || null);
    setDryRun(false);
    setDialogOpen(true);
  };

  const startRun = async () => {
    setStarting(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}/lekuka/uat/runs`, {
        method: "POST",
        body: JSON.stringify({
          caseIds: pendingCase ? [pendingCase] : undefined,
          dryRun,
          skipRenewal,
          closeAfter: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to start UAT run");
      setRun(data);
      if (data?.runId) startedRunIds.current.add(data.runId);
      setDialogOpen(false);
      toast({
        title: "UAT run started",
        description: pendingCase
          ? `${pendingCase} — prerequisites will run automatically`
          : "Full LEKUKA UAT cycle",
      });
    } catch (error) {
      showError("Could not start UAT run", error);
    } finally {
      setStarting(false);
    }
  };

  const performDownload = useCallback(
    async (runId: string) => {
      setDownloading(true);
      try {
        const res = await apiFetch(
          `/api/companies/${companyId}/lekuka/uat/runs/${runId}/download`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "UAT report is not ready yet");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `lekuka-uat-${runId}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        showError("Could not download UAT report", error);
      } finally {
        setDownloading(false);
      }
    },
    [companyId, showError],
  );

  const downloadReport = () => {
    if (run) void performDownload(run.runId);
  };

  useEffect(() => {
    if (!autoDownload || !run) return;
    if (run.status === "running" || run.results.length === 0) return;
    if (!startedRunIds.current.has(run.runId)) return;
    if (downloadedRunIds.current.has(run.runId)) return;
    downloadedRunIds.current.add(run.runId);
    void performDownload(run.runId);
  }, [autoDownload, performDownload, run?.runId, run?.status, run?.results.length]);

  const pendingMeta = pendingCase
    ? cases.find((testCase) => testCase.id === pendingCase)
    : null;
  const isBusy = starting || run?.status === "running";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center text-base">
                <FlaskConical className="mr-2 h-4 w-4 text-violet-600" />
                LEKUKA UAT Suite
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Executes the RSL acceptance tests against the configured LEKUKA
                gateway. Individual tests run their prerequisites and close the
                fiscal day afterwards; the full cycle submits every receipt in a
                single fiscal day.
              </CardDescription>
              {(gateway || deviceId) && (
                <div className="mt-2 break-all font-mono text-[11px] text-slate-500">
                  {deviceId ? `device ${deviceId}` : ""}
                  {deviceId && gateway ? " · " : ""}
                  {gateway || ""}
                  {gateway && !gateway.includes(":8443") ? (
                    <Badge className="ml-2 border-amber-200 bg-amber-50 align-middle text-amber-700">
                      Check gateway
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                disabled={loading || isBusy}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void downloadReport()}
                disabled={!run || run.status === "running" || downloading}
              >
                <Download className={`mr-2 h-4 w-4 ${downloading ? "animate-spin" : ""}`} />
                Download log
              </Button>
              <Button
                size="sm"
                className="bg-violet-600 text-white hover:bg-violet-700"
                onClick={() => openRunDialog()}
                disabled={isBusy}
              >
                <Play className="mr-2 h-4 w-4" />
                Run full cycle
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {run ? (
            <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <RunStatusBadge run={run} />
                <span className="font-mono text-xs text-slate-500">
                  {run.runId}
                </span>
                <span className="text-xs text-slate-500">
                  started {new Date(run.startedAt).toLocaleString()}
                </span>
                {run.finishedAt && (
                  <span className="text-xs text-slate-500">
                    · finished {new Date(run.finishedAt).toLocaleString()}
                  </span>
                )}
                {run.currentCase && (
                  <span className="text-xs font-medium text-blue-700">
                    · running {run.currentCase}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  {run.summary?.pass ?? 0} pass
                </Badge>
                <Badge className="border-red-200 bg-red-50 text-red-700">
                  {run.summary?.fail ?? 0} fail
                </Badge>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                  {run.summary?.blocked ?? 0} blocked
                </Badge>
                <Badge variant="secondary">
                  {run.summary?.skipped ?? 0} skipped
                </Badge>
                <Badge variant="outline">
                  {completedInPlan}/{run.plan.length} planned
                </Badge>
              </div>

              <Progress value={progress} className="h-2" />

              {run.error && (
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Run failed</AlertTitle>
                  <AlertDescription>{errorMessage(run.error)}</AlertDescription>
                </Alert>
              )}

              {run.status === "running" && (
                <p className="text-xs text-slate-500">
                  Keep this page open. You can download the JSON log when the run
                  finishes.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
              No UAT run yet. Run the full cycle, or start with a single test case
              below.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Test cases</CardTitle>
          <CardDescription>
            Read-only tests can run any time. Receipt tests automatically open and
            close a fiscal day unless you run the full cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading test cases…
            </div>
          ) : groupedCases.length === 0 ? (
            <p className="text-sm text-slate-500">No test cases available.</p>
          ) : (
            groupedCases.map((group) => (
              <div key={group.name} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {group.name}
                </h3>
                <div className="divide-y rounded-lg border">
                  {group.cases.map((testCase) => {
                    const result = resultById.get(testCase.id);
                    const isCurrent = run?.currentCase === testCase.id;
                    const isPending =
                      !!run &&
                      run.status === "running" &&
                      run.plan.includes(testCase.id) &&
                      !result &&
                      !isCurrent;
                    const isDisabled =
                      isBusy ||
                      testCase.mode === "setup" ||
                      (testCase.mode === "cert" && testCase.id === "TC-006");
                    const open = expanded === testCase.id;
                    return (
                      <div key={testCase.id} className="bg-white">
                        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                            onClick={() =>
                              setExpanded(open ? null : testCase.id)
                            }
                          >
                            <span className="mt-0.5 text-slate-400">
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-slate-800">
                                <span className="mr-2 font-mono text-xs text-slate-400">
                                  {testCase.id}
                                </span>
                                {testCase.title}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {testCase.description}
                              </span>
                              {testCase.requires?.length ? (
                                <span className="mt-1 block text-[11px] text-slate-400">
                                  Requires: {testCase.requires.join(", ")}
                                </span>
                              ) : null}
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                            <StatusBadge
                              status={
                                isCurrent
                                  ? "running"
                                  : isPending
                                    ? "pending"
                                    : result?.status
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isDisabled}
                              title={
                                testCase.mode === "setup"
                                  ? "Requires a spare device ID and activation key"
                                  : testCase.id === "TC-006"
                                    ? "Runs automatically with TC-004"
                                    : testCase.mode === "fiscal"
                                      ? "Runs prerequisites, opens a fiscal day and closes it afterwards"
                                      : undefined
                              }
                              onClick={() => openRunDialog(testCase.id)}
                            >
                              Run
                            </Button>
                          </div>
                        </div>

                        {open && (
                          <div className="border-t bg-slate-950 p-3 font-mono text-xs text-emerald-300">
                            {result ? (
                              <pre className="max-h-80 overflow-auto whitespace-pre-wrap">
                                {JSON.stringify(result, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-slate-400">
                                No result recorded for this case yet.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCase
                ? `Run ${pendingCase}${pendingMeta ? ` — ${pendingMeta.title}` : ""}`
                : "Run full LEKUKA UAT cycle"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                {pendingCase
                  ? pendingMeta?.mode === "fiscal"
                    ? "The runner will include the case's prerequisites. It opens a fiscal day, submits the required receipts, and closes the day afterwards."
                    : "The runner will include the case's prerequisites. This check does not open a fiscal day."
                  : "This opens a fiscal day, submits every UAT receipt, closes the day, and renews the device certificate (unless disabled below)."}
              </span>
              <span className="block text-xs text-amber-700">
                Only run this against the RSL test gateway, and do not process
                normal sales while the run is active. A failed close can leave the
                device blocked until RSL support reconciles the fiscal day.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="uat-dry-run"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked === true)}
                disabled={!!pendingCase}
              />
              <div className="space-y-1">
                <Label htmlFor="uat-dry-run" className="text-sm font-medium">
                  Dry run (read-only)
                </Label>
                <p className="text-xs text-slate-500">
                  Runs only the certificate, configuration, status and ping checks.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="uat-auto-download"
                checked={autoDownload}
                onCheckedChange={(checked) => setAutoDownload(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="uat-auto-download" className="text-sm font-medium">
                  Download JSON when finished
                </Label>
                <p className="text-xs text-slate-500">
                  Saves the full request/response log as a JSON file.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="uat-skip-renewal"
                checked={skipRenewal}
                onCheckedChange={(checked) => setSkipRenewal(checked === true)}
                disabled={dryRun}
              />
              <div className="space-y-1">
                <Label htmlFor="uat-skip-renewal" className="text-sm font-medium">
                  Skip certificate renewal
                </Label>
                <p className="text-xs text-slate-500">
                  Do not run TC-004/TC-006. The existing device certificate stays in
                  place.
                </p>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={starting}>Cancel</AlertDialogCancel>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => void startRun()}
              disabled={starting}
            >
              {starting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start run
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
