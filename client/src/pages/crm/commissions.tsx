import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingRows } from "@/components/ui/page-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { formatCurrencyAmount } from "@shared/currency";
import { format } from "date-fns";
import {
  useCommissions,
  useCommissionSettings,
  useUpdateCommissionSettings,
  useCommissionRules,
  useSaveCommissionRule,
  useDeleteCommissionRule,
  useCreateCommission,
  useGenerateCommissions,
  useSubmitCommission,
  useApproveCommission,
  useRejectCommission,
  usePayCommission,
  useCrmTasks,
  useCreateCrmTask,
  useRespondCrmTask,
  useSweepTasks,
  useTaskPenalties,
  type Commission,
  type CommissionSettingsClient,
  type CommissionRule,
  type CrmTask,
  type CommissionBasisName,
} from "@/hooks/use-crm";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  Send,
  Check,
  X,
  Wallet,
  Timer,
  Zap,
  Ban,
} from "lucide-react";

/**
 * Salesperson commission dashboard. Commissions accrue automatically when a
 * vehicle is invoiced; admins approve or reject each statement, and late task
 * responses deduct from the salesperson's net. Everything here is wired to the
 * existing CRM commission + task-penalty API.
 */

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  paid: "bg-blue-100 text-blue-700",
};

const BASIS_LABEL: Record<string, string> = {
  gross_profit: "Gross profit",
  revenue: "Revenue",
  fixed: "Fixed",
};

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

/** Company users endpoint returns membership rows; unwrap to the user. */
function toUserOptions(rows: any): { id: string; name: string }[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const record = row?.user ?? row;
      if (!record?.id) return null;
      return { id: record.id, name: record.name || record.username || record.email || "User" };
    })
    .filter(Boolean) as { id: string; name: string }[];
}

export default function CrmCommissionsPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const currency = (activeCompany as any)?.currency || "USD";
  const { can } = usePermissions();
  const [tab, setTab] = useState("commissions");

  const canViewCommission = can("crm.commission.view");
  const canManageCommission = can("crm.commission.manage");
  const canApproveCommission = can("crm.commission.approve");
  const canViewTasks = can("crm.tasks.view");

  const { data: companyUsers } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiFetch(`/api/companies/${companyId}/users`);
      return res.ok ? res.json() : [];
    },
    enabled: !!companyId,
  });
  const users = toUserOptions(companyUsers);

  return (
    <Layout headerTitle="Commissions & Penalties" headerSubtitle="Salesperson commission statements, late-task penalties and SLA settings.">
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="penalties">Penalties</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          {(canManageCommission || canApproveCommission) && (
            <TabsTrigger value="settings">Settings</TabsTrigger>
          )}
        </TabsList>

        {canViewCommission ? (
          <TabsContent value="commissions" className="space-y-4">
            <CommissionsTab companyId={companyId} currency={currency} users={users} canApprove={canApproveCommission} canManage={canManageCommission} />
          </TabsContent>
        ) : (
          <TabsContent value="commissions">
            <NoPermission label="commission" />
          </TabsContent>
        )}

        {canViewTasks ? (
          <TabsContent value="penalties" className="space-y-4">
            <PenaltiesTab companyId={companyId} currency={currency} />
          </TabsContent>
        ) : (
          <TabsContent value="penalties">
            <NoPermission label="task" />
          </TabsContent>
        )}

        {canViewTasks ? (
          <TabsContent value="tasks" className="space-y-4">
            <TasksTab companyId={companyId} users={users} canManage={can("crm.tasks.manage")} canRespond={can("crm.tasks.respond")} />
          </TabsContent>
        ) : (
          <TabsContent value="tasks">
            <NoPermission label="task" />
          </TabsContent>
        )}

        {(canManageCommission || canApproveCommission) && (
          <TabsContent value="settings" className="space-y-4">
            <SettingsTab companyId={companyId} users={users} canManage={canManageCommission} />
          </TabsContent>
        )}
      </Tabs>
    </Layout>
  );
}

function NoPermission({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <Ban className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">You don't have permission to view {label} data.</p>
        <p className="text-xs text-slate-400">Ask an administrator for the relevant CRM permission.</p>
      </CardContent>
    </Card>
  );
}

// ── Commissions tab ──────────────────────────────────────────────────────────

function CommissionsTab({
  companyId,
  currency,
  users,
  canApprove,
  canManage,
}: {
  companyId: number;
  currency: string;
  users: { id: string; name: string }[];
  canApprove: boolean;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useCommissions(companyId, {
    status: status || undefined,
    periodMonth: period || undefined,
    salespersonId: salespersonId || undefined,
  });

  const generate = useGenerateCommissions(companyId);
  const submit = useSubmitCommission(companyId);
  const approve = useApproveCommission(companyId);
  const reject = useRejectCommission(companyId);
  const pay = usePayCommission(companyId);
  const create = useCreateCommission(companyId);

  const [newOpen, setNewOpen] = useState(false);

  const wrap = (label: string, fn: () => void) => () => {
    try {
      fn();
    } catch (e: any) {
      toast({ title: label, description: e.message, variant: "destructive" });
    }
  };

  const act = async (
    mut: { mutateAsync: (arg: any) => Promise<any> },
    arg: any,
    ok: string,
    err: string,
  ) => {
    try {
      await mut.mutateAsync(arg);
      toast({ title: ok });
    } catch (e: any) {
      toast({ title: err, description: e.message, variant: "destructive" });
    }
  };

  const submitCommission = async (id: number) => {
    try {
      const result: any = await submit.mutateAsync(id);
      toast({
        title: result?.requiresApproval ? "Submitted for approval" : "Commission approved",
        description: result?.requiresApproval
          ? "An approver has been notified."
          : "Company policy allows this commission to post immediately.",
      });
    } catch (e: any) {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    }
  };

  const summary = data?.summary;
  const commissions = data?.commissions ?? [];
  const periods = useMemo(
    () => Array.from(new Set(commissions.map((c) => c.periodMonth).filter(Boolean))) as string[],
    [commissions],
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Gross" value={formatCurrencyAmount(summary?.gross ?? 0, currency)} tone="slate" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Penalties" value={formatCurrencyAmount(summary?.penalties ?? 0, currency)} tone="rose" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Net" value={formatCurrencyAmount(summary?.net ?? 0, currency)} tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard
          label="Pending approval"
          value={`${summary?.pendingCount ?? 0} · ${formatCurrencyAmount(summary?.pendingNet ?? 0, currency)}`}
          tone="amber"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {data?.pendingPenalties ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{formatCurrencyAmount(data.pendingPenalties, currency)}</strong> in late-task penalties is waiting to be carried onto the next commission.
          </span>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={salespersonId || "all"} onValueChange={(v) => setSalespersonId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Salesperson" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All salespeople</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period || "all"} onValueChange={(v) => setPeriod(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All periods</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={generate.isPending}
                  onClick={() => act(generate, undefined, "Commissions generated", "Failed to generate commissions")}
                >
                  <RefreshCw className={generate.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                  Generate
                </Button>
              )}
              {canManage && (
                <Button size="sm" className="h-9" onClick={() => setNewOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New statement
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <LoadingRows />
          ) : commissions.length === 0 ? (
            <EmptyState label="No commission statements yet" hint="Statements accrue automatically when a vehicle is invoiced, or create one manually." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-[26%]">Reference</TableHead>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Penalties</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <CommissionRow
                      key={c.id}
                      commission={c}
                      currency={currency}
                      canApprove={canApprove}
                      canManage={canManage}
                      expanded={expanded === c.id}
                      onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                      onSubmit={() => submitCommission(c.id)}
                      onApprove={(notes) => act(approve, { id: c.id, reviewNotes: notes }, "Commission approved", "Failed to approve")}
                      onReject={(notes) => act(reject, { id: c.id, reviewNotes: notes }, "Commission rejected", "Failed to reject")}
                      onPay={() => act(pay, c.id, "Marked as paid", "Failed to mark paid")}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewCommissionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        users={users}
        currency={currency}
        onCreate={async (payload) => {
          try {
            await create.mutateAsync(payload);
            toast({ title: "Commission statement created" });
            setNewOpen(false);
          } catch (e: any) {
            toast({ title: "Failed to create commission", description: e.message, variant: "destructive" });
          }
        }}
        pending={create.isPending}
      />
    </>
  );
}

function CommissionRow({
  commission,
  currency,
  canApprove,
  canManage,
  expanded,
  onToggle,
  onSubmit,
  onApprove,
  onReject,
  onPay,
}: {
  commission: Commission;
  currency: string;
  canApprove: boolean;
  canManage: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSubmit: () => void;
  onApprove: (notes?: string) => void;
  onReject: (notes?: string) => void;
  onPay: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState<null | "approve" | "reject">(null);
  const [notes, setNotes] = useState("");
  const money = (v: any) => formatCurrencyAmount(Number(v || 0), currency);
  const hasPenalties = commission.penalties?.length > 0;

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-slate-50" onClick={onToggle}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {hasPenalties ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : null}
            <div className="min-w-0">
              <div className="truncate">{commission.reference || `#${commission.id}`}</div>
              <div className="text-[11px] text-slate-400">{commission.periodMonth}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>{commission.salespersonName ?? "User"}</TableCell>
        <TableCell className="text-xs">{BASIS_LABEL[commission.basis] ?? commission.basis}</TableCell>
        <TableCell className="text-right">{money(commission.grossAmount)}</TableCell>
        <TableCell className="text-right text-rose-600">{money(commission.penaltyAmount)}</TableCell>
        <TableCell className="text-right font-semibold">{money(commission.netAmount)}</TableCell>
        <TableCell>
          <Badge className={STATUS_TONE[commission.status] ?? STATUS_TONE.draft}>{STATUS_LABEL[commission.status] ?? commission.status}</Badge>
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            {commission.status === "draft" && (canManage) && (
              <Button size="sm" variant="outline" onClick={onSubmit} title="Submit for approval">
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
            {(commission.status === "pending_approval" || commission.status === "draft") && canApprove && (
              <>
                <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setReviewOpen("approve")} title="Approve">
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setReviewOpen("reject")} title="Reject">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {commission.status === "approved" && canApprove && (
              <Button size="sm" variant="outline" onClick={onPay} title="Mark as paid">
                <Wallet className="h-3.5 w-3.5" />
              </Button>
            )}
            {commission.status === "rejected" && canManage && (
              <Button size="sm" variant="outline" onClick={onSubmit} title="Resubmit">
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-slate-50/60">
          <TableCell colSpan={8} className="p-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs md:grid-cols-3">
              <Field label="Sale amount" value={money(commission.saleAmount)} />
              <Field label="Cost amount" value={money(commission.costAmount)} />
              <Field label="Basis amount" value={money(commission.basisAmount)} />
              <Field label="Rate" value={`${Number(commission.ratePercent).toFixed(2)}%`} />
              <Field label="Fixed" value={money(commission.fixedAmount)} />
              <Field label="Created" value={commission.createdAt ? format(new Date(commission.createdAt), "dd MMM yyyy") : "-"} />
              {commission.reviewNotes && <Field label="Review notes" value={commission.reviewNotes} />}
            </div>
            {hasPenalties && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late-task penalties</p>
                <div className="space-y-1">
                  {commission.penalties.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded border border-amber-100 bg-amber-50/60 px-2 py-1 text-xs">
                      <span className="min-w-0 truncate text-amber-900">{p.reason}</span>
                      <span className="ml-2 shrink-0 font-semibold text-rose-600">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}

      <Dialog open={reviewOpen !== null} onOpenChange={(o) => !o && setReviewOpen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{reviewOpen === "approve" ? "Approve commission" : "Reject commission"}</DialogTitle>
            <DialogDescription>
              {reviewOpen === "approve"
                ? "Approving releases this statement for payment."
                : "Rejecting sends it back to the salesperson for correction."}
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Review notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(null)}>Cancel</Button>
            <Button
              variant={reviewOpen === "approve" ? "default" : "destructive"}
              onClick={() => {
                if (reviewOpen === "approve") onApprove(notes || undefined);
                else onReject(notes || undefined);
                setReviewOpen(null);
                setNotes("");
              }}
            >
              {reviewOpen === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewCommissionDialog({
  open,
  onOpenChange,
  users,
  currency,
  onCreate,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: { id: string; name: string }[];
  currency: string;
  onCreate: (payload: any) => void;
  pending: boolean;
}) {
  const [salespersonId, setSalespersonId] = useState("");
  const [reference, setReference] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [costAmount, setCostAmount] = useState("0");
  const [basis, setBasis] = useState<CommissionBasisName>("gross_profit");
  const [ratePercent, setRatePercent] = useState("");
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7));

  const submit = () => {
    if (!salespersonId) return;
    onCreate({
      salespersonId,
      reference: reference || null,
      saleAmount: Number(saleAmount || 0),
      costAmount: Number(costAmount || 0),
      basis,
      ratePercent: ratePercent ? Number(ratePercent) : undefined,
      periodMonth,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New commission statement</DialogTitle>
          <DialogDescription>Record a deal the vehicle module did not capture automatically. Leave the rate blank to use the salesperson's rule.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Salesperson</Label>
            <Select value={salespersonId} onValueChange={setSalespersonId}>
              <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Stock Cc68u18 — Toyota Axio" />
          </div>
          <div className="space-y-1">
            <Label>Sale amount ({currency})</Label>
            <Input type="number" step="0.01" value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cost amount ({currency})</Label>
            <Input type="number" step="0.01" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Basis</Label>
            <Select value={basis} onValueChange={(v) => setBasis(v as CommissionBasisName)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gross_profit">Gross profit</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Rate % (optional)</Label>
            <Input type="number" step="0.01" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} placeholder="default" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Period</Label>
            <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !salespersonId || !saleAmount}>
            {pending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create statement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Penalties tab ────────────────────────────────────────────────────────────

function PenaltiesTab({ companyId, currency }: { companyId: number; currency: string }) {
  const { data: penalties, isLoading } = useTaskPenalties(companyId);
  const { data: settingsData } = useCommissionSettings(companyId);
  const pendingCarried = settingsData?.pendingPenalties ?? 0;
  const money = (v: any) => formatCurrencyAmount(Number(v || 0), currency);
  const rows = penalties ?? [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Carried (not yet on a statement)" value={money(pendingCarried)} tone="amber" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Total deductions" value={money(rows.reduce((s, r) => s + Number(r.amount || 0), 0))} tone="rose" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Deductions logged" value={String(rows.length)} tone="slate" icon={<Timer className="h-4 w-4" />} />
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><LoadingRows /></div>
          ) : rows.length === 0 ? (
            <EmptyState label="No late-task penalties" hint="When a salesperson misses the response window on a task, the deduction appears here." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Salesperson</TableHead>
                    <TableHead className="w-[45%]">Reason</TableHead>
                    <TableHead className="text-right">Late hrs</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Applied to</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.salespersonName ?? "User"}</TableCell>
                      <TableCell className="text-xs text-slate-600">{p.reason ?? "-"}</TableCell>
                      <TableCell className="text-right">{Number(p.lateHours || 0).toFixed(1)}</TableCell>
                      <TableCell className="text-right font-semibold text-rose-600">{money(p.amount)}</TableCell>
                      <TableCell>
                        {p.commissionId ? (
                          <Badge className="bg-emerald-100 text-emerald-700">Statement #{p.commissionId}</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800">Carried</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">{p.createdAt ? format(new Date(p.createdAt), "dd MMM yy, HH:mm") : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({
  companyId,
  users,
  canManage,
  canRespond,
}: {
  companyId: number;
  users: { id: string; name: string }[];
  canManage: boolean;
  canRespond: boolean;
}) {
  const { toast } = useToast();
  const [scope, setScope] = useState<"all" | "mine">(canManage ? "all" : "mine");
  const [status, setStatus] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const { data, isLoading } = useCrmTasks(companyId, { scope, status: status || undefined });
  const settings = data?.settings;
  const tasks = data?.tasks ?? [];
  const respond = useRespondCrmTask(companyId);
  const create = useCreateCrmTask(companyId);
  const sweep = useSweepTasks(companyId);

  const [responding, setResponding] = useState<number | null>(null);
  const [responseNote, setResponseNote] = useState("");

  return (
    <>
      {settings && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Timer className="h-4 w-4 text-slate-400" />
          <span>
            Response window <strong>{settings.responseWindowHours} working hours</strong>. Late replies deduct{" "}
            <strong className="text-rose-600">{formatCurrencyAmount(settings.penaltyPerLateTask, "USD")}</strong> from commission
            {settings.penaltyCapPercent < 100 ? ` (capped at ${settings.penaltyCapPercent}% of gross)` : ""}.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={scope} onValueChange={(v) => setScope(v as "all" | "mine")}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {canManage && <SelectItem value="all">All team</SelectItem>}
                <SelectItem value="mine">My tasks</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="responded">Responded</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              {canManage && (
                <Button variant="outline" size="sm" className="h-9" disabled={sweep.isPending}
                  onClick={async () => { try { const r = await sweep.mutateAsync(); toast({ title: `${r.applied} task(s) penalised` }); } catch (e: any) { toast({ title: "Sweep failed", description: e.message, variant: "destructive" }); } }}>
                  <Zap className="mr-2 h-4 w-4" /> Sweep overdue
                </Button>
              )}
              {canManage && (
                <Button size="sm" className="h-9" onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" /> Assign task</Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <LoadingRows />
          ) : tasks.length === 0 ? (
            <EmptyState label="No tasks" hint={canManage ? "Assign a task to a team member to start tracking the response SLA." : "You have no open tasks."} />
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  canRespond={canRespond || canManage}
                  onRespond={() => { setResponding(t.id); setResponseNote(""); }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={responding !== null} onOpenChange={(o) => !o && setResponding(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Respond to task</DialogTitle>
            <DialogDescription>Your reply is timestamped. If the deadline has passed, a penalty is applied to your commission.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Your response…" value={responseNote} onChange={(e) => setResponseNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponding(null)}>Cancel</Button>
            <Button
              disabled={respond.isPending}
              onClick={async () => {
                try {
                  await respond.mutateAsync({ id: responding!, responseNote: responseNote || null });
                  toast({ title: "Response recorded" });
                  setResponding(null);
                } catch (e: any) {
                  toast({ title: "Failed to respond", description: e.message, variant: "destructive" });
                }
              }}
            >
              {respond.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewTaskDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        users={users}
        windowHours={settings?.responseWindowHours}
        pending={create.isPending}
        onCreate={async (payload) => {
          try {
            await create.mutateAsync(payload);
            toast({ title: "Task assigned" });
            setNewOpen(false);
          } catch (e: any) {
            toast({ title: "Failed to assign task", description: e.message, variant: "destructive" });
          }
        }}
      />
    </>
  );
}

function TaskRow({ task, canRespond, onRespond }: { task: CrmTask; canRespond: boolean; onRespond: () => void }) {
  const priorityTone: Record<string, string> = {
    low: "bg-slate-100 text-slate-600",
    normal: "bg-blue-100 text-blue-700",
    high: "bg-amber-100 text-amber-800",
    urgent: "bg-rose-100 text-rose-700",
  };
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{task.title}</span>
            <Badge className={priorityTone[task.priority] ?? priorityTone.normal}>{task.priority}</Badge>
            {task.overdue && <Badge className="bg-rose-100 text-rose-700"><AlertTriangle className="mr-1 h-3 w-3" />Overdue</Badge>}
            {task.penaltyApplied && <Badge className="bg-rose-100 text-rose-700">Penalised {task.penaltyAmount}</Badge>}
          </div>
          {task.body && <p className="mt-1 text-xs text-slate-500">{task.body}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span>Assigned to <strong className="text-slate-600">{task.assigneeName ?? "User"}</strong></span>
            <span>Due {format(new Date(task.dueAt), "dd MMM, HH:mm")}</span>
            {task.status === "pending" && task.remainingHours > 0 && <span className="text-emerald-600">{task.remainingHours}h left</span>}
            {task.status === "pending" && task.lateHours > 0 && <span className="text-rose-600">{task.lateHours}h late</span>}
            {task.status === "responded" && task.respondedAt && <span className="text-emerald-600">Responded {format(new Date(task.respondedAt), "dd MMM, HH:mm")}</span>}
          </div>
        </div>
        {canRespond && task.status === "pending" && (
          <Button size="sm" variant="outline" onClick={onRespond}><Send className="mr-1 h-3.5 w-3.5" /> Respond</Button>
        )}
      </div>
      {task.responseNote && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">"{task.responseNote}"</p>}
    </div>
  );
}

function NewTaskDialog({
  open,
  onOpenChange,
  users,
  windowHours,
  pending,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: { id: string; name: string }[];
  windowHours?: number;
  pending: boolean;
  onCreate: (payload: any) => void;
}) {
  const [assignedTo, setAssignedTo] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a task</DialogTitle>
          <DialogDescription>
            The response deadline is calculated on the working clock{windowHours ? ` (${windowHours} working hours)` : ""}. A late reply costs the assignee a commission penalty.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Assign to</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up the Azio lead" />
          </div>
          <div className="space-y-1">
            <Label>Details</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What needs to happen…" />
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onCreate({ assignedTo, title, body: body || null, priority })} disabled={pending || !assignedTo || !title}>
            {pending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            Assign task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({ companyId, users, canManage }: { companyId: number; users: { id: string; name: string }[]; canManage: boolean }) {
  return (
    <div className="space-y-4">
      <CommissionSettingsCard companyId={companyId} canManage={canManage} />
      <CommissionRulesCard companyId={companyId} users={users} canManage={canManage} />
    </div>
  );
}

function CommissionSettingsCard({ companyId, canManage }: { companyId: number; canManage: boolean }) {
  const { toast } = useToast();
  const { data } = useCommissionSettings(companyId);
  const update = useUpdateCommissionSettings(companyId);
  const s = data?.settings;

  const [form, setForm] = useState<CommissionSettingsClient | null>(null);
  // Keep the local form in sync once the server value lands.
  if (s && !form) setForm(s);
  const set = (patch: Partial<CommissionSettingsClient>) => setForm((f) => (f ? { ...f, ...patch } : f));

  if (!s) return <LoadingRows />;

  const save = async () => {
    if (!form) return;
    try {
      await update.mutateAsync(form);
      toast({ title: "Commission settings saved" });
    } catch (e: any) {
      toast({ title: "Failed to save settings", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">Commission & penalty settings</h3>
            <p className="text-xs text-slate-500">Defaults apply when a salesperson has no override. The response window drives the late-task penalty.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Default basis</Label>
            <Select value={form?.defaultBasis ?? "gross_profit"} onValueChange={(v) => set({ defaultBasis: v as CommissionBasisName })} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gross_profit">Gross profit</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Default rate %</Label>
            <Input type="number" step="0.01" disabled={!canManage} value={form?.defaultRatePercent ?? 0} onChange={(e) => set({ defaultRatePercent: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Default fixed amount</Label>
            <Input type="number" step="0.01" disabled={!canManage} value={form?.defaultFixedAmount ?? 0} onChange={(e) => set({ defaultFixedAmount: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Response window (hrs)</Label>
            <Input type="number" min={1} max={168} disabled={!canManage} value={form?.responseWindowHours ?? 2} onChange={(e) => set({ responseWindowHours: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Penalty per late task</Label>
            <Input type="number" step="0.01" min={0} disabled={!canManage} value={form?.penaltyPerLateTask ?? 25} onChange={(e) => set({ penaltyPerLateTask: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Penalty cap %</Label>
            <Input type="number" min={0} max={100} disabled={!canManage} value={form?.penaltyCapPercent ?? 100} onChange={(e) => set({ penaltyCapPercent: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Workday start</Label>
            <Input type="time" disabled={!canManage} value={form?.workdayStart ?? "08:00"} onChange={(e) => set({ workdayStart: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Workday end</Label>
            <Input type="time" disabled={!canManage} value={form?.workdayEnd ?? "17:00"} onChange={(e) => set({ workdayEnd: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>UTC offset (mins)</Label>
            <Input type="number" disabled={!canManage} value={form?.utcOffsetMinutes ?? 120} onChange={(e) => set({ utcOffsetMinutes: Number(e.target.value) })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Working days</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const active = (form?.workingDays ?? []).includes(d.value);
              return (
                <Button
                  key={d.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  disabled={!canManage}
                  onClick={() =>
                    set({
                      workingDays: active
                        ? (form?.workingDays ?? []).filter((x) => x !== d.value)
                        : [...(form?.workingDays ?? []), d.value].sort(),
                    })
                  }
                >
                  {d.label}
                </Button>
              );
            })}
          </div>
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save settings
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommissionRulesCard({ companyId, users, canManage }: { companyId: number; users: { id: string; name: string }[]; canManage: boolean }) {
  const { toast } = useToast();
  const { data: rules, isLoading } = useCommissionRules(companyId);
  const save = useSaveCommissionRule(companyId);
  const remove = useDeleteCommissionRule(companyId);

  const [salespersonId, setSalespersonId] = useState("");
  const [basis, setBasis] = useState<CommissionBasisName>("gross_profit");
  const [ratePercent, setRatePercent] = useState("");
  const [fixedAmount, setFixedAmount] = useState("0");

  const add = async () => {
    if (!salespersonId) return;
    try {
      await save.mutateAsync({
        salespersonId,
        basis,
        ratePercent: ratePercent ? Number(ratePercent) : 0,
        fixedAmount: Number(fixedAmount || 0),
      });
      toast({ title: "Override saved" });
      setSalespersonId("");
      setRatePercent("");
    } catch (e: any) {
      toast({ title: "Failed to save override", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <h3 className="font-semibold text-slate-800">Per-salesperson overrides</h3>
          <p className="text-xs text-slate-500">An active override replaces the company default for that salesperson.</p>
        </div>
        {isLoading ? (
          <LoadingRows />
        ) : (rules ?? []).length === 0 ? (
          <EmptyState label="No overrides" hint="Every salesperson uses the company default until you add one here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Salesperson</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead className="text-right">Rate %</TableHead>
                <TableHead className="text-right">Fixed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules ?? []).map((r: CommissionRule) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.salespersonName ?? users.find((u) => u.id === r.salespersonId)?.name ?? "User"}</TableCell>
                  <TableCell className="text-xs">{BASIS_LABEL[r.basis] ?? r.basis}</TableCell>
                  <TableCell className="text-right">{Number(r.ratePercent).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{Number(r.fixedAmount).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:bg-rose-50"
                        onClick={async () => { try { await remove.mutateAsync(r.id); toast({ title: "Override removed" }); } catch (e: any) { toast({ title: "Failed to remove", description: e.message, variant: "destructive" }); } }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canManage && (
          <div className="grid grid-cols-2 items-end gap-3 border-t pt-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Salesperson</Label>
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Basis</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as CommissionBasisName)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gross_profit">Gross profit</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Rate %</Label>
              <Input type="number" step="0.01" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} />
            </div>
            <Button onClick={add} disabled={save.isPending || !salespersonId} className="h-9">
              {save.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add override
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function StatCard({ label, value, tone, icon }: { label: string; value: string; tone: "slate" | "emerald" | "amber" | "rose" | "blue"; icon: React.ReactNode }) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 truncate text-lg font-bold text-slate-900">{value}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <p className="text-slate-700">{value}</p>
    </div>
  );
}

function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Wallet className="h-8 w-8 text-slate-200" />
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="max-w-sm text-xs text-slate-400">{hint}</p>
    </div>
  );
}
