import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { useFollowUps, useUpdateFollowUp, type EnquiryFollowUp } from "@/hooks/use-crm";
import { usePermissions } from "@/hooks/use-permissions";
import { channelLabel } from "@/lib/crm";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, Check, Inbox } from "lucide-react";

/**
 * Odoo's "My Activities" queue: every open follow-up in the company, late ones
 * first. Marking one done is the same PATCH the enquiry drawer uses, so the
 * board's next-activity badge clears with it.
 */
export function ActivitiesTab({
  companyId,
  onOpenEnquiry,
}: {
  companyId: number;
  onOpenEnquiry: (id: number) => void;
}) {
  const { data: followUps, isLoading } = useFollowUps(companyId, "all");
  const { can } = usePermissions();
  const editable = can("crm.pipeline.manage");

  if (isLoading) return <LoadingRows />;

  const open = (followUps || []) as EnquiryFollowUp[];
  const now = Date.now();
  const late = open.filter((f) => f.dueAt && new Date(f.dueAt).getTime() < now);
  const upcoming = open.filter((f) => f.dueAt && new Date(f.dueAt).getTime() >= now);
  const undated = open.filter((f) => !f.dueAt);

  if (!open.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
        <Inbox className="h-10 w-10" />
        <p className="text-sm">Nothing scheduled - every prospect is being chased.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Late" tone="rose" items={late} companyId={companyId} editable={editable} onOpenEnquiry={onOpenEnquiry} />
      <Section title="Upcoming" tone="blue" items={upcoming} companyId={companyId} editable={editable} onOpenEnquiry={onOpenEnquiry} />
      {undated.length ? (
        <Section title="No date" tone="slate" items={undated} companyId={companyId} editable={editable} onOpenEnquiry={onOpenEnquiry} />
      ) : null}
    </div>
  );
}

const HEADER_TONES: Record<string, string> = {
  rose: "text-rose-600",
  blue: "text-blue-600",
  slate: "text-slate-500",
};

function Section({
  title,
  tone,
  items,
  companyId,
  editable,
  onOpenEnquiry,
}: {
  title: string;
  tone: string;
  items: EnquiryFollowUp[];
  companyId: number;
  editable: boolean;
  onOpenEnquiry: (id: number) => void;
}) {
  if (!items.length) return null;
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-semibold ${HEADER_TONES[tone]}`}>{title}</h3>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        {items.map((f) => (
          <ActivityRow key={f.id} followUp={f} companyId={companyId} editable={editable} onOpenEnquiry={onOpenEnquiry} />
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityRow({
  followUp,
  companyId,
  editable,
  onOpenEnquiry,
}: {
  followUp: EnquiryFollowUp;
  companyId: number;
  editable: boolean;
  onOpenEnquiry: (id: number) => void;
}) {
  const updateFollowUp = useUpdateFollowUp(companyId);
  const late = followUp.dueAt && new Date(followUp.dueAt) < new Date();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${late ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"}`}>
        {late ? <AlertTriangle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-semibold text-slate-800 hover:text-blue-600"
          onClick={() => onOpenEnquiry(followUp.enquiryId)}
        >
          {followUp.enquiry?.name || `Enquiry #${followUp.enquiryId}`}
        </button>
        <p className="truncate text-xs text-slate-500">
          {followUp.notes || channelLabel(followUp.channel)}
          {followUp.assignee?.name ? ` - ${followUp.assignee.name}` : ""}
        </p>
        <p className="text-[11px] text-slate-400">
          {followUp.dueAt ? format(new Date(followUp.dueAt), "dd MMM yyyy HH:mm") : "No date"} ·{" "}
          {channelLabel(followUp.channel)}
        </p>
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
