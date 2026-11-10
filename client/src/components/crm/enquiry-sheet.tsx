import { useEffect, useState } from "react";
import { Link } from "wouter";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LoadingRows } from "@/components/ui/page-skeleton";
import {
  useConvertEnquiry,
  useEnquiryDetail,
  useLogActivity,
  useMoveEnquiryStage,
  useReserveVehicle,
  useUpdateEnquiry,
  useUpdateFollowUp,
  useCreateFollowUp,
  type CrmStage,
} from "@/hooks/use-crm";
import { useVehicles } from "@/hooks/use-vehicles";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyAmount } from "@shared/currency";
import { channelLabel, CHANNELS, LOST_REASONS, sourceLabel, stageColor } from "@/lib/crm";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Car,
  FileText,
  MessageSquare,
  Phone,
  StickyNote,
  UserPlus,
  CalendarClock,
} from "lucide-react";
import { QuotationFromEnquiryDialog } from "./quotation-dialog";
import { LostReasonDialog } from "./lost-reason-dialog";

const ACTIVITY_TYPES = [
  { value: "note", label: "Note", icon: StickyNote },
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: MessageSquare },
  { value: "meeting", label: "Meeting", icon: CalendarClock },
];

/**
 * The right-hand drawer for one enquiry: editable fields on top, the chatter
 * underneath. Mirrors Odoo's record form + discussion trail, but the timeline
 * comes from enquiry_activities, which the server already writes on every
 * stage move, assignment, merge and quotation.
 */
export function EnquirySheet({
  companyId,
  enquiryId,
  stages,
  users,
  currency,
  onClose,
}: {
  companyId: number;
  enquiryId: number | null;
  stages: CrmStage[];
  users: { id: string; name: string }[];
  currency?: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const { data: enquiry, isLoading } = useEnquiryDetail(companyId, enquiryId);
  const updateEnquiry = useUpdateEnquiry(companyId);
  const moveStage = useMoveEnquiryStage(companyId);
  const convertEnquiry = useConvertEnquiry(companyId);
  const logActivity = useLogActivity(companyId);
  const [form, setForm] = useState<Record<string, any>>({});
  const [lostReason, setLostReason] = useState("");
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [lostPrompt, setLostPrompt] = useState<CrmStage | null>(null);

  const editable = can("crm.pipeline.manage");
  const canReserve = can("vehicles.manage");
  const linkedVehicles = enquiry?.vehicles || [];

  useEffect(() => {
    if (!enquiry) return;
    setForm({
      name: enquiry.name || "",
      phone: enquiry.phone || "",
      email: enquiry.email || "",
      source: enquiry.source || "walk_in",
      interest: enquiry.interest || "",
      expectedRevenue: enquiry.expectedRevenue || "0",
      expectedCloseDate: enquiry.expectedCloseDate || "",
      notes: enquiry.notes || "",
      tags: Array.isArray(enquiry.tags) ? enquiry.tags.join(", ") : "",
    });
    setLostReason(enquiry.lostReason || "");
  }, [enquiry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (data: Record<string, unknown>, message?: string) => {
    if (!enquiryId) return;
    updateEnquiry.mutate(
      { id: enquiryId, data },
      {
        onSuccess: () => message && toast({ title: message }),
        onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const saveField = (key: string) => {
    const value = key === "tags"
      ? String(form.tags || "").split(",").map((t) => t.trim()).filter(Boolean)
      : form[key];
    patch({ [key]: value });
  };

  const handleStage = (stageId: string) => {
    const stage = stages.find((s) => s.id === Number(stageId));
    if (!stage || !enquiryId) return;
    if (stage.isLost && !lostReason) {
      // Same dialog the board shows after a drag - the sheet cannot ask for a
      // reason it only reveals once the enquiry is already lost.
      setLostPrompt(stage);
      return;
    }
    moveStage.mutate(
      { id: enquiryId, stageId: stage.id, lostReason: stage.isLost ? lostReason : undefined },
      {
        onSuccess: () => toast({ title: `Moved to ${stage.name}` }),
        onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const activities = enquiry?.activities || [];

  return (
    <Sheet open={!!enquiryId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="border-b border-slate-100">
          <SheetTitle className="truncate text-lg">{enquiry?.name || "Enquiry"}</SheetTitle>
          <SheetDescription className="truncate">
            {enquiry
              ? `${sourceLabel(enquiry.source)} · captured ${enquiry.createdAt ? format(new Date(enquiry.createdAt), "dd MMM yyyy") : "recently"}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !enquiry ? (
          <div className="p-6">
            <LoadingRows />
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="space-y-5 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${stageColor(enquiry.stage?.color).badge} hover:opacity-100`}>
                  {enquiry.stage?.name || "Unscheduled"}
                </Badge>
                {enquiry.stage ? (
                  <span className="text-xs text-slate-500">{enquiry.stage.probability}% expected</span>
                ) : null}
                <span className="text-sm font-semibold text-slate-800">
                  {formatCurrencyAmount(Number(enquiry.expectedRevenue || 0), currency)}
                </span>
                {enquiry.customer ? (
                  <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-200">
                    <Check className="h-3 w-3" /> {enquiry.customer.name}
                  </Badge>
                ) : null}
                {(enquiry.tags || []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-600">
                    {tag}
                  </Badge>
                ))}
              </div>

              {/* Pipeline position: the same move the board does by dragging. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-slate-500">Stage</Label>
                  <Select value={String(enquiry.stageId ?? "")} onValueChange={handleStage} disabled={!editable}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages
                        .filter((s) => s.isActive !== false)
                        .map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name} · {s.probability}%
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-slate-500">Salesperson</Label>
                  <Select
                    value={enquiry.assignedTo || "unassigned"}
                    onValueChange={(v) => patch({ assignedTo: v === "unassigned" ? null : v })}
                    disabled={!editable}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Unassigned" />
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
              </div>

              {(() => {
                const lostStage = stages.find((s) => s.id === Number(enquiry.stageId))?.isLost;
                if (!lostStage) return null;
                return (
                  <div className="grid gap-1.5 rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                    <Label className="text-xs text-rose-700">Lost reason</Label>
                    <div className="flex gap-2">
                      <Input
                        list="crm-lost-reasons"
                        value={lostReason}
                        onChange={(e) => setLostReason(e.target.value)}
                        placeholder="Why was this lost?"
                        disabled={!editable}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!editable || !lostReason}
                        onClick={() => patch({ lostReason })}
                      >
                        Save
                      </Button>
                    </div>
                    <datalist id="crm-lost-reasons">
                      {LOST_REASONS.map((r) => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  </div>
                );
              })()}

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} onBlur={() => saveField("name")} disabled={!editable} />
                <Field label="Interest" value={form.interest} onChange={(v) => setForm({ ...form, interest: v })} onBlur={() => saveField("interest")} disabled={!editable} placeholder="What are they after?" />
                <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} onBlur={() => saveField("phone")} disabled={!editable} />
                <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} onBlur={() => saveField("email")} disabled={!editable} />
                <Field
                  label="Expected revenue"
                  value={form.expectedRevenue}
                  onChange={(v) => setForm({ ...form, expectedRevenue: v })}
                  onBlur={() => saveField("expectedRevenue")}
                  disabled={!editable}
                  type="number"
                />
                <Field
                  label="Expected close"
                  value={form.expectedCloseDate}
                  onChange={(v) => setForm({ ...form, expectedCloseDate: v })}
                  onBlur={() => saveField("expectedCloseDate")}
                  disabled={!editable}
                  type="date"
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-500">Tags</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  onBlur={() => saveField("tags")}
                  disabled={!editable}
                  placeholder="luxury, trade-in, repeat"
                  className="h-9"
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-500">Notes</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  onBlur={() => saveField("notes")}
                  disabled={!editable}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {!enquiry.customerId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!editable || convertEnquiry.isPending}
                    onClick={() =>
                      convertEnquiry.mutate(enquiry.id, {
                        onSuccess: () => toast({ title: "Linked to a customer record" }),
                      })
                    }
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    {enquiry.customerId ? "Linked" : "Create customer"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!can("crm.quotation.create")}
                  onClick={() => setQuotationOpen(true)}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  New quotation
                </Button>
                {canReserve ? (
                  <Button size="sm" variant="outline" onClick={() => setReserveOpen(true)}>
                    <Car className="mr-1.5 h-3.5 w-3.5" />
                    Reserve a vehicle
                  </Button>
                ) : null}
              </div>

              {linkedVehicles.length ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Linked vehicles
                    </h4>
                    {linkedVehicles.map((vehicle) => (
                      <Link
                        key={vehicle.id}
                        href={`/vehicles/${vehicle.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                            <Car className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {vehicle.stockNumber}
                              {vehicle.salePrice
                                ? ` · ${formatCurrencyAmount(Number(vehicle.salePrice), vehicle.saleCurrency || currency)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0 capitalize">
                          {vehicle.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}

              <Separator />

              <Chatter
                companyId={companyId}
                enquiry={enquiry}
                editable={editable}
                onLogged={(body, type) =>
                  logActivity.mutate(
                    { enquiryId: enquiry.id, type, body },
                    { onError: (err: Error) => toast({ title: err.message, variant: "destructive" }) },
                  )
                }
              />
            </div>
          </ScrollArea>
        )}

        <QuotationFromEnquiryDialog
          companyId={companyId}
          enquiry={enquiry ?? null}
          currency={currency}
          open={quotationOpen}
          onOpenChange={setQuotationOpen}
        />

        {canReserve ? (
          <ReserveVehicleDialog
            companyId={companyId}
            enquiry={enquiry ?? null}
            users={users}
            currency={currency}
            open={reserveOpen}
            onOpenChange={setReserveOpen}
          />
        ) : null}

        <LostReasonDialog
          prompt={lostPrompt && enquiryId ? { enquiryId, stage: lostPrompt } : null}
          onCancel={() => setLostPrompt(null)}
          onConfirm={(reason) =>
            moveStage.mutate(
              { id: enquiryId!, stageId: lostPrompt!.id, lostReason: reason },
              {
                onSuccess: () => {
                  setLostPrompt(null);
                  setLostReason(reason);
                  toast({ title: `Marked lost - ${reason}` });
                },
                onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
              },
            )
          }
          pending={moveStage.isPending}
        />
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  type = "text",
  placeholder,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="h-9"
      />
    </div>
  );
}

/**
 * The timeline plus two composers: log an activity you already did, or
 * schedule a follow-up for later. Both write through the same endpoints the
 * board uses, so the card's next-activity badge updates with them.
 */
function Chatter({
  companyId,
  enquiry,
  editable,
  onLogged,
}: {
  companyId: number;
  enquiry: any;
  editable: boolean;
  onLogged: (body: string, type: string) => void;
}) {
  const createFollowUp = useCreateFollowUp(companyId);
  const { toast } = useToast();
  const [mode, setMode] = useState("log");
  const [type, setType] = useState("note");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [channel, setChannel] = useState("call");
  const [followNotes, setFollowNotes] = useState("");

  const pending = (enquiry.followUps || []).filter((f: any) => !f.completedAt);

  const submit = () => {
    if (mode === "log") {
      if (!body.trim()) return;
      onLogged(body.trim(), type);
      setBody("");
      return;
    }
    if (!followNotes.trim() && !dueAt) return;
    createFollowUp.mutate(
      {
        enquiryId: enquiry.id,
        data: {
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          channel,
          notes: followNotes.trim(),
        },
      },
      {
        onSuccess: () => {
          setDueAt("");
          setChannel("call");
          setFollowNotes("");
        },
        onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="log">Log activity</TabsTrigger>
          <TabsTrigger value="schedule">Schedule activity</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "log" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            {ACTIVITY_TYPES.map((t) => {
              const Icon = t.icon;
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <Textarea
            rows={2}
            value={body}
            disabled={!editable}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened on this call?"
          />
          <Button size="sm" disabled={!editable || !body.trim()} onClick={submit}>
            Log it
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" value={dueAt} disabled={!editable} onChange={(e) => setDueAt(e.target.value)} className="h-9" />
            <Select value={channel} onValueChange={setChannel} disabled={!editable}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            rows={2}
            value={followNotes}
            disabled={!editable}
            onChange={(e) => setFollowNotes(e.target.value)}
            placeholder="Remind me to..."
          />
          <Button size="sm" disabled={!editable} onClick={submit}>
            Schedule
          </Button>
        </div>
      )}

      {pending.length ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open activities</h4>
          {pending.map((f: any) => (
            <FollowUpRow key={f.id} companyId={companyId} followUp={f} editable={editable} />
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">History</h4>
        {(enquiry.activities || []).map((activity: any) => (
          <ActivityRow key={activity.id} activity={activity} />
        ))}
        {!enquiry.activities?.length ? (
          <p className="text-sm text-slate-400">Nothing logged yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function FollowUpRow({
  companyId,
  followUp,
  editable,
}: {
  companyId: number;
  followUp: any;
  editable: boolean;
}) {
  const updateFollowUp = useUpdateFollowUp(companyId);
  const overdue = followUp.dueAt && new Date(followUp.dueAt) < new Date();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${overdue ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"}`}>
        {overdue ? <AlertTriangle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-700">{followUp.notes || channelLabel(followUp.channel)}</div>
        <div className="text-xs text-slate-500">
          {followUp.dueAt ? format(new Date(followUp.dueAt), "dd MMM yyyy HH:mm") : "No date"} · {channelLabel(followUp.channel)}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={!editable || updateFollowUp.isPending}
        onClick={() => updateFollowUp.mutate({ id: followUp.id, data: { completedAt: new Date().toISOString() } })}
      >
        <Check className="mr-1 h-3.5 w-3.5" /> Done
      </Button>
    </div>
  );
}

const ACTIVITY_ICONS: Record<string, any> = {
  created: UserPlus,
  stage: ArrowRightLeft,
  assignment: UserPlus,
  note: StickyNote,
  call: Phone,
  email: MessageSquare,
  meeting: CalendarClock,
  follow_up: CalendarClock,
  quotation: FileText,
  merge: AlertTriangle,
  customer: UserPlus,
  returned: ArrowRightLeft,
  vehicle: Car,
};

function ActivityRow({ activity }: { activity: any }) {
  const Icon = ACTIVITY_ICONS[activity.type] || MessageSquare;
  const stamp = activity.createdAt ? format(new Date(activity.createdAt), "dd MMM yyyy HH:mm") : "";
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 border-b border-slate-50 pb-2">
        <p className="text-sm text-slate-700">{activity.body || activity.type}</p>
        <p className="text-xs text-slate-400">{stamp}</p>
      </div>
    </div>
  );
}

/**
 * The won-lead hand-off: pick a vehicle from available stock, agree the price
 * and link it to this enquiry. The server creates/links the customer and
 * assigns the salesperson; the vehicle moves to reserved.
 */
function ReserveVehicleDialog({
  companyId,
  enquiry,
  users,
  currency,
  open,
  onOpenChange,
}: {
  companyId: number;
  enquiry: any;
  users: { id: string; name: string }[];
  currency?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const reserve = useReserveVehicle(companyId);
  const { data: vehicles = [] } = useVehicles(companyId, { status: "available" }, open);
  const [vehicleId, setVehicleId] = useState("");
  const [price, setPrice] = useState("");
  const [salespersonId, setSalespersonId] = useState("unassigned");

  useEffect(() => {
    if (!open) return;
    setVehicleId("");
    setPrice(enquiry?.expectedRevenue ? String(Number(enquiry.expectedRevenue)) : "");
    setSalespersonId(enquiry?.assignedTo || "unassigned");
  }, [open, enquiry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseVehicle = (id: string) => {
    setVehicleId(id);
    const vehicle = vehicles.find((v) => String(v.id) === id);
    if (!vehicle) return;
    const agreed = vehicle.salePrice ?? vehicle.targetPrice;
    if (agreed != null) setPrice(String(Number(agreed)));
  };

  const submit = () => {
    if (!enquiry || !vehicleId) return;
    reserve.mutate(
      {
        vehicleId: Number(vehicleId),
        enquiryId: enquiry.id,
        salePrice: price === "" ? undefined : Number(price),
        salespersonId: salespersonId === "unassigned" ? null : salespersonId,
      },
      {
        onSuccess: () => {
          toast({ title: "Vehicle reserved", description: "The lead and vehicle are now linked." });
          onOpenChange(false);
        },
        onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
      },
    );
  };

  const selected = vehicles.find((v) => String(v.id) === vehicleId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserve a vehicle</DialogTitle>
          <DialogDescription>
            Pick available stock, agree the sale price and attach {enquiry?.name || "this lead"} to it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Available vehicle</Label>
            <Select value={vehicleId} onValueChange={chooseVehicle}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                    {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")} · {vehicle.stockNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <p className="text-xs text-slate-500">
                {selected.vin ? `VIN ${selected.vin} · ` : ""}
                {selected.colour || "colour not set"}
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                {vehicles.length ? "Choose the stock this lead asked for." : "No available vehicles. Add stock first."}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Sale price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {selected?.saleCurrency || currency || "USD"}
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Salesperson</Label>
            <Select value={salespersonId} onValueChange={setSalespersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!vehicleId || reserve.isPending} onClick={submit}>
            {reserve.isPending ? "Reserving..." : "Reserve vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
