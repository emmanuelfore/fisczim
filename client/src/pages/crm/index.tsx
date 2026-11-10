import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ActivitiesTab } from "@/components/crm/activities-tab";
import { DuplicatesTab } from "@/components/crm/duplicates-tab";
import { EnquirySheet } from "@/components/crm/enquiry-sheet";
import { LostReasonDialog } from "@/components/crm/lost-reason-dialog";
import { ReportingTab } from "@/components/crm/reporting-tab";
import { SocialTab } from "@/components/crm/social-tab";
import { StagesDialog } from "@/components/crm/stages-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  useConvertEnquiry,
  useCreateEnquiry,
  useCrmStages,
  useDormantEnquiries,
  useEnquiries,
  useFollowUps,
  useMoveEnquiryStage,
  usePipelineReport,
  useSocialInbox,
  type CrmStage,
  type EnquiryRecord,
} from "@/hooks/use-crm";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { amount, initials, SOURCES, sourceLabel, stageColor } from "@/lib/crm";
import { formatCurrencyAmount } from "@shared/currency";
import { format } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  Filter,
  PhoneCall,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

/**
 * The CRM board. Columns are the company's own crm_stages rows, not a fixed
 * status list, so renaming or reordering a stage in configuration reshapes this
 * screen. Dragging a card posts to /enquiries/:id/stage, which logs the move in
 * the record's chatter and re-derives its open/won/lost status server-side.
 */
export default function CrmEnquiriesPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany(true);
  const companyId = activeCompanyId || 0;
  const currency = (activeCompany as any)?.currency;
  const { user } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();

  const [tab, setTab] = useState("pipeline");
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [quietOnly, setQuietOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStageId, setOverStageId] = useState<number | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ enquiryId: number; stage: CrmStage } | null>(null);

  const editable = can("crm.pipeline.manage");
  const filters = {
    search,
    assignedTo: onlyMine && user?.id ? user.id : undefined,
  };

  const stagesQuery = useCrmStages(companyId);
  const { data: stages } = stagesQuery;
  const { data: enquiries, isLoading } = useEnquiries(companyId, filters);
  const { data: dueFollowUps } = useFollowUps(companyId, "due");
  const { data: dormant } = useDormantEnquiries(companyId, 30);
  const { data: report } = usePipelineReport(companyId);
  const { data: socialInbox } = useSocialInbox(companyId, can("crm.social.view"));
  const moveStage = useMoveEnquiryStage(companyId);

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
  const activeStages = useMemo(
    () => (stages || []).filter((s) => s.isActive !== false).sort((a, b) => a.sequence - b.sequence),
    [stages],
  );
  const quietIds = useMemo(() => new Set((dormant || []).map((d: any) => d.id)), [dormant]);
  const pendingSocial = socialInbox ? socialInbox.leads.length + socialInbox.comments.length : 0;
  const overdueIds = useMemo(() => {
    const set = new Set<number>();
    for (const f of dueFollowUps || []) set.add(f.enquiryId);
    return set;
  }, [dueFollowUps]);

  const visible = useMemo(
    () => (enquiries || []).filter((e) => !quietOnly || quietIds.has(e.id)),
    [enquiries, quietOnly, quietIds],
  );

  const drop = (stage: CrmStage) => {
    const enquiryId = draggingId;
    setDraggingId(null);
    setOverStageId(null);
    if (!enquiryId || !editable) return;
    const current = (enquiries || []).find((e) => e.id === enquiryId);
    if (!current || current.stageId === stage.id) return;
    if (stage.isLost) {
      setLostPrompt({ enquiryId, stage });
      return;
    }
    moveStage.mutate(
      { id: enquiryId, stageId: stage.id },
      {
        onSuccess: () => toast({ title: `${current.name} moved to ${stage.name}` }),
        onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Layout>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CRM Pipeline</h1>
          <p className="text-sm text-slate-500">
            Drag an enquiry to change its stage. Every move, note and call is kept on the record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search name, phone, email or interest"
              className="bg-white pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {can("crm.stages.manage") ? (
            <Button variant="outline" onClick={() => setStagesOpen(true)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Stages
            </Button>
          ) : null}
          <Button onClick={() => setNewOpen(true)} disabled={!editable}>
            <Plus className="mr-2 h-4 w-4" /> New enquiry
          </Button>
        </div>
      </div>

      {report ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeaderStat label="Open enquiries" value={String(report.totals.open)} hint={`${report.totals.total} captured all-time`} />
          <HeaderStat label="Pipeline value" value={formatCurrencyAmount(report.totals.openValue || 0, currency)} hint="sum of expected revenue" />
          <HeaderStat label="Forecast" value={formatCurrencyAmount(report.totals.weightedForecast || 0, currency)} hint="weighted by stage probability" />
          <HeaderStat label="Win rate" value={`${Math.round(report.totals.winRate || 0)}%`} hint={`${report.totals.won} won, ${report.totals.lost} lost`} />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="activities">
            Activities
            {dueFollowUps?.length ? (
              <Badge className="ml-2 bg-rose-500 text-white hover:bg-rose-500">{dueFollowUps.length}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
          {can("crm.social.view") ? (
            <TabsTrigger value="social">
              Social
              {pendingSocial ? (
                <Badge className="ml-2 bg-violet-500 text-white hover:bg-violet-500">{pendingSocial}</Badge>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="m-0 pt-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Button
              size="sm"
              variant={onlyMine ? "default" : "outline"}
              className="h-8"
              onClick={() => setOnlyMine((value) => !value)}
            >
              My pipeline
            </Button>
            <Button
              size="sm"
              variant={quietOnly ? "default" : "outline"}
              className="h-8"
              onClick={() => setQuietOnly((value) => !value)}
            >
              Quiet 30d+ ({quietIds.size})
            </Button>
            <span className="text-xs text-slate-400">
              {visible.length} of {(enquiries || []).length} shown
            </span>
          </div>

          {isLoading || stagesQuery.isLoading ? (
            <LoadingRows />
          ) : stagesQuery.error ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-rose-100 bg-rose-50/50 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">The pipeline stages could not be loaded</p>
              <p className="max-w-md text-xs text-slate-500">{stagesQuery.error.message}</p>
              <Button size="sm" variant="outline" onClick={() => stagesQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : !activeStages.length ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 py-10 text-center">
              <p className="text-sm text-slate-600">No stages are configured for this company yet.</p>
              {can("crm.stages.manage") ? (
                <Button size="sm" variant="outline" onClick={() => setStagesOpen(true)}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" /> Configure stages
                </Button>
              ) : (
                <p className="text-xs text-slate-400">Ask someone with the CRM stage permission to set them up.</p>
              )}
            </div>
          ) : (
            <div
              className="grid items-start gap-2 pb-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
            >
              {activeStages.map((stage) => {
                const cards = visible.filter((e) => e.stageId === stage.id);
                const value = cards.reduce((sum, e) => sum + amount(e.expectedRevenue), 0);
                const color = stageColor(stage.color);
                return (
                  <div
                    key={stage.id}
                    onDragOver={(event) => {
                      if (!editable) return;
                      event.preventDefault();
                      setOverStageId(stage.id);
                    }}
                    onDragLeave={() => setOverStageId((id) => (id === stage.id ? null : id))}
                    onDrop={() => drop(stage)}
                    className={`min-w-0 overflow-hidden rounded-lg border-t-2 p-1.5 transition-colors ${color.bar.replace("bg-", "border-")} ${
                      overStageId === stage.id ? "bg-blue-50 ring-2 ring-blue-200" : "bg-slate-50"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between px-1 pt-1">
                      <h3 className="truncate text-[13px] font-semibold text-slate-700">{stage.name}</h3>
                      <Badge variant="secondary" className="ml-1 h-5 shrink-0 bg-white px-1.5 text-[11px] text-slate-600">
                        {cards.length}
                      </Badge>
                    </div>
                    <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-slate-500">
                      <span className="truncate">{formatCurrencyAmount(value, currency)}</span>
                      <span className="shrink-0">{stage.probability}%</span>
                    </div>
                    <div className="min-h-[60px] space-y-1.5">
                      {cards.map((enquiry) => (
                        <EnquiryCard
                          key={enquiry.id}
                          enquiry={enquiry}
                          currency={currency}
                          overdue={overdueIds.has(enquiry.id)}
                          dragging={draggingId === enquiry.id}
                          editable={editable}
                          onDragStart={() => setDraggingId(enquiry.id)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setOverStageId(null);
                          }}
                          onOpen={() => setSelectedId(enquiry.id)}
                        />
                      ))}
                      {!cards.length ? (
                        <p className="py-4 text-center text-[11px] text-slate-300">Drop an enquiry here</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activities" className="m-0 pt-4">
          <ActivitiesTab companyId={companyId} onOpenEnquiry={setSelectedId} />
        </TabsContent>

        <TabsContent value="duplicates" className="m-0 pt-4">
          <DuplicatesTab companyId={companyId} onOpenEnquiry={setSelectedId} />
        </TabsContent>

        <TabsContent value="reporting" className="m-0 pt-4">
          <ReportingTab companyId={companyId} currency={currency} />
        </TabsContent>

        <TabsContent value="social" className="m-0 pt-4">
          <SocialTab companyId={companyId} />
        </TabsContent>
      </Tabs>

      <EnquirySheet
        companyId={companyId}
        enquiryId={selectedId}
        stages={activeStages}
        users={users}
        currency={currency}
        onClose={() => setSelectedId(null)}
      />

      <StagesDialog
        companyId={companyId}
        stages={stages || []}
        error={stagesQuery.error}
        onRetry={() => stagesQuery.refetch()}
        open={stagesOpen}
        onOpenChange={setStagesOpen}
      />

      <LostReasonDialog
        prompt={lostPrompt}
        onCancel={() => setLostPrompt(null)}
        onConfirm={(reason) => {
          if (!lostPrompt) return;
          moveStage.mutate(
            { id: lostPrompt.enquiryId, stageId: lostPrompt.stage.id, lostReason: reason },
            {
              onSuccess: () => {
                toast({ title: `Marked lost - ${reason}` });
                setLostPrompt(null);
              },
              onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
            },
          );
        }}
        pending={moveStage.isPending}
      />

      <NewEnquiryDialog
        companyId={companyId}
        stages={activeStages}
        users={users}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(created: EnquiryRecord) => {
          setNewOpen(false);
          if (created?.id) setSelectedId(created.id);
        }}
      />
    </Layout>
  );
}

function HeaderStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-400">{hint}</div>
    </div>
  );
}

function EnquiryCard({
  enquiry,
  currency,
  overdue,
  dragging,
  editable,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  enquiry: EnquiryRecord;
  currency?: string | null;
  overdue: boolean;
  dragging: boolean;
  editable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const next = enquiry.nextFollowUp;
  const late = next?.dueAt && new Date(next.dueAt) < new Date();
  return (
    <div
      draggable={editable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`cursor-pointer rounded-md border bg-white p-1.5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow ${
        overdue ? "border-rose-200" : "border-slate-100"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-slate-800">{enquiry.name}</div>
          <div className="truncate text-[10px] text-slate-500">{enquiry.phone || enquiry.email || "no contact detail"}</div>
        </div>
        <div
          title={enquiry.assignee?.name || "Unassigned"}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600"
        >
          {initials(enquiry.assignee?.name)}
        </div>
      </div>

      {enquiry.interest ? <div className="mt-1 truncate text-[10px] text-slate-600">{enquiry.interest}</div> : null}

      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="min-w-0 truncate text-[10px] font-semibold text-slate-700">
          {formatCurrencyAmount(amount(enquiry.expectedRevenue), currency)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">{sourceLabel(enquiry.source)}</span>
        {(enquiry.tags || []).slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary" className="h-4 px-1 text-[10px]">
            {tag}
          </Badge>
        ))}
      </div>

      {next ? (
        <div className={`mt-1.5 flex items-center gap-1 text-[10px] ${late ? "text-rose-600" : "text-slate-500"}`}>
          {late ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
          {next.dueAt ? format(new Date(next.dueAt), "dd MMM HH:mm") : "no date"} · {next.channel || "task"}
        </div>
      ) : null}

      {enquiry.lostReason ? (
        <div className="mt-1 truncate text-[10px] text-rose-600">Lost: {enquiry.lostReason}</div>
      ) : null}
    </div>
  );
}

function NewEnquiryDialog({
  companyId,
  stages,
  users,
  open,
  onOpenChange,
  onCreated,
}: {
  companyId: number;
  stages: CrmStage[];
  users: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: EnquiryRecord) => void;
}) {
  const { toast } = useToast();
  const createEnquiry = useCreateEnquiry(companyId);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    source: "walk_in",
    interest: "",
    expectedRevenue: "",
    expectedCloseDate: "",
    assignedTo: "unassigned",
    stageId: "",
    tags: "",
    notes: "",
  });

  const reset = () =>
    setForm({
      name: "",
      phone: "",
      email: "",
      source: "walk_in",
      interest: "",
      expectedRevenue: "",
      expectedCloseDate: "",
      assignedTo: "unassigned",
      stageId: "",
      tags: "",
      notes: "",
    });

  const submit = () => {
    if (!form.name.trim()) {
      toast({ title: "A contact name is required", variant: "destructive" });
      return;
    }
    createEnquiry.mutate(
      {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        source: form.source,
        interest: form.interest.trim() || null,
        expectedRevenue: form.expectedRevenue ? String(form.expectedRevenue) : "0.00",
        expectedCloseDate: form.expectedCloseDate || null,
        assignedTo: form.assignedTo === "unassigned" ? null : form.assignedTo,
        stageId: form.stageId ? Number(form.stageId) : undefined,
        tags: form.tags
          ? form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : [],
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: (created: any) => {
          // The server has two different answers to a repeat contact: an open
          // enquiry is re-used, a closed one spawns a new tagged record.
          toast({
            title: created?.reusedExisting ? "Matched to an existing enquiry" : "Enquiry captured",
            description: created?.reusedExisting
              ? "This phone or email is already open in the pipeline, so the contact was logged on that enquiry instead of starting a second one."
              : created?.returning
                ? "They have been through the pipeline before, so this one is tagged returning."
                : undefined,
          });
          reset();
          onCreated(created);
        },
        onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New enquiry</DialogTitle>
          <DialogDescription>
            Existing customers and open enquiries are matched automatically by phone or email.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="enq-name">Contact name *</Label>
            <Input id="enq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="enq-phone">Phone</Label>
              <Input id="enq-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="enq-email">Email</Label>
              <Input id="enq-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="enq-interest">Interest</Label>
            <Input
              id="enq-interest"
              placeholder="e.g. Toyota Hilux 2019 double cab"
              value={form.interest}
              onChange={(e) => setForm({ ...form, interest: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Stage</Label>
              <Select value={form.stageId || String(stages[0]?.id ?? "")} onValueChange={(v) => setForm({ ...form, stageId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="enq-revenue">Expected revenue</Label>
              <Input
                id="enq-revenue"
                type="number"
                value={form.expectedRevenue}
                onChange={(e) => setForm({ ...form, expectedRevenue: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="enq-close">Expected close</Label>
              <Input
                id="enq-close"
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Salesperson</Label>
            <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="enq-tags">Tags</Label>
            <Input
              id="enq-tags"
              placeholder="luxury, trade-in"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="enq-notes">Notes</Label>
            <Textarea id="enq-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createEnquiry.isPending}>
            <PhoneCall className="mr-2 h-4 w-4" />
            {createEnquiry.isPending ? "Saving..." : "Capture enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The company users endpoint returns membership rows; unwrap to the user. */
function toUserOptions(rows: any): { id: string; name: string }[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const record = row.user ?? row;
      if (!record?.id) return null;
      return { id: record.id, name: record.name || record.username || record.email || "User" };
    })
    .filter(Boolean) as { id: string; name: string }[];
}
