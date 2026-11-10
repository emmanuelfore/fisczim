import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  useCaptureSocial,
  useConnectSocial,
  useDisconnectSocial,
  useIgnoreSocial,
  useRefetchSocialLead,
  useSocialConnections,
  useSocialDeliveries,
  useSocialInbox,
  useSocialSetup,
  useSyncSocialConnection,
  useTestSocialConnection,
  type InboxRef,
  type SocialConnectionDraft,
} from "@/hooks/use-crm";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AtSign, Link2, Plug, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";

/**
 * Social capture. Platforms push here; nothing is invented. A delivery is stored
 * exactly as the platform sent it and only becomes an enquiry when someone reads
 * it and clicks, which is what keeps a junk comment or a duplicate form submission
 * out of the pipeline.
 */

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const when = (value: string | null) => (value ? format(new Date(value), "dd MMM HH:mm") : "-");

export function SocialTab({ companyId }: { companyId: number }) {
  const { can } = usePermissions();
  const { toast } = useToast();

  const connections = useSocialConnections(companyId);
  const setup = useSocialSetup(companyId);
  const inbox = useSocialInbox(companyId, true, true);
  const deliveries = useSocialDeliveries(companyId, true, true);
  const connect = useConnectSocial(companyId);
  const disconnect = useDisconnectSocial(companyId);
  const testConnection = useTestSocialConnection(companyId);
  const sync = useSyncSocialConnection(companyId);
  const capture = useCaptureSocial(companyId);
  const discard = useIgnoreSocial(companyId);
  const refetchLead = useRefetchSocialLead(companyId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<SocialConnectionDraft>({ platform: "facebook" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canManage = can("crm.social.manage");
  const canCapture = can("crm.social.capture");
  const rows = [...(inbox.data?.leads ?? []), ...(inbox.data?.comments ?? [])];

  const toggle = (ref: InboxRef) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const token = `${ref.kind}:${ref.id}`;
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });

  const selectedRefs = rows
    .filter((row) => selected.has(`${row.kind}:${row.id}`))
    .map((row) => ({ kind: row.kind, id: row.id }));

  function runCapture(refs: InboxRef[]) {
    capture.mutate(refs, {
      onSuccess: (result) => {
        setSelected(new Set());
        if (result.captured) {
          toast({
            title: `${result.captured} enquiry${result.captured === 1 ? "" : "s"} captured`,
            description: result.failed.length
              ? `${result.failed.length} could not be captured: ${result.failed[0].error}`
              : "They are in the pipeline now, in the opening stage.",
          });
          return;
        }
        toast({ title: result.failed[0]?.error ?? "Nothing was captured", variant: "destructive" });
      },
      onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
    });
  }

  function runDiscard(refs: InboxRef[]) {
    discard.mutate(refs, {
      onSuccess: (result) => {
        setSelected(new Set());
        toast({ title: `${result.ignored} discarded`, description: "Still on the platform - only kept out of the pipeline." });
      },
      onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
    });
  }

  function runRefetch(id: number) {
    refetchLead.mutate(id, {
      onSuccess: (lead) => {
        const contact = [lead.fullName, lead.phone, lead.email].filter(Boolean).join(" · ");
        toast(
          contact
            ? { title: "Details fetched", description: contact }
            : { title: "Still no contact details", description: "The platform returned no name, phone or email for this submission." },
        );
      },
      onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
    });
  }

  function submitConnect() {
    const externalAccountId = draft.externalAccountId?.trim();
    if (!draft.platform || !externalAccountId) {
      toast({ title: "The account id is what deliveries are matched on", variant: "destructive" });
      return;
    }
    connect.mutate({ ...draft, platform: draft.platform, externalAccountId }, {
      onSuccess: () => {
        setDialogOpen(false);
        setDraft({ platform: "facebook" });
        toast({ title: "Account connected", description: "Paste the callback address into the app's webhook screen." });
      },
      onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
    });
  }

  if (connections.isLoading || inbox.isLoading) return <LoadingRows rows={3} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Connected accounts</h3>
              <p className="text-xs text-slate-500">
                A delivery is only ingested for an account listed here, and only if it is signed
                with that app's secret.
              </p>
            </div>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                <Plug className="mr-2 h-4 w-4" />
                Connect account
              </Button>
            )}
          </div>

          {!connections.data?.length ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <AtSign className="h-9 w-9" />
              <p className="text-sm">No page, profile or advertiser is linked yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {connections.data.map((connection) => (
                <li key={connection.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {connection.accountName || PLATFORM_LABELS[connection.platform] || connection.platform}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {PLATFORM_LABELS[connection.platform] || connection.platform} · id{" "}
                      {connection.externalAccountId} · synced {when(connection.lastSyncAt)}
                    </div>
                    {connection.lastError && (
                      <p className="mt-1 truncate text-xs text-rose-600">{connection.lastError}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {connection.platform === "facebook" && !connection.hasAccessToken && (
                      <Badge variant="secondary">no page token</Badge>
                    )}
                    {!connection.hasAppSecret && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        deliveries dropped
                      </Badge>
                    )}
                    {connection.platform !== "tiktok" && !connection.hasWebhookToken && (
                      <Badge variant="secondary">verify token missing</Badge>
                    )}
                    {!connection.active && <Badge variant="outline">paused</Badge>}
                    {canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          disabled={testConnection.isPending}
                          onClick={() =>
                            testConnection.mutate(connection.id, {
                              onSuccess: (result) =>
                                result.verified
                                  ? toast({
                                      title: "Token works",
                                      description: result.accountName
                                        ? `Page name read back: ${result.accountName}`
                                        : undefined,
                                    })
                                  : toast({ title: result.message ?? "Not verified", variant: "destructive" }),
                              onError: (err: Error) =>
                                toast({ title: err.message, variant: "destructive" }),
                            })
                          }
                        >
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          disabled={sync.isPending}
                          onClick={() =>
                            sync.mutate(connection.id, {
                              onSuccess: (result) =>
                                toast(
                                  result.skipped
                                    ? { title: result.skipped }
                                    : {
                                        title: `${result.leads} lead(s), ${result.comments} comment(s) pulled in`,
                                        description:
                                          "Anything the webhook already delivered was not stored twice.",
                                      },
                                ),
                              onError: (err: Error) =>
                                toast({ title: err.message, variant: "destructive" }),
                            })
                          }
                        >
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-rose-600"
                          disabled={disconnect.isPending}
                          onClick={() =>
                            disconnect.mutate(connection.id, {
                              onSuccess: () =>
                                toast({ title: "Disconnected", description: "Stored submissions were kept." }),
                              onError: (err: Error) =>
                                toast({ title: err.message, variant: "destructive" }),
                            })
                          }
                        >
                          Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Waiting to be captured
                <span className="ml-2 text-xs font-normal text-slate-500">{rows.length}</span>
              </h3>
              <p className="text-xs text-slate-500">
                Form submissions and comments as the platform sent them.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canCapture || !rows.length || capture.isPending}
                onClick={() => runCapture(rows.map((row) => ({ kind: row.kind, id: row.id })))}
              >
                Capture all
              </Button>
              <Button
                size="sm"
                disabled={!canCapture || !selectedRefs.length || capture.isPending}
                onClick={() => runCapture(selectedRefs)}
              >
                Capture {selectedRefs.length || ""}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canCapture || !selectedRefs.length || discard.isPending}
                onClick={() => runDiscard(selectedRefs)}
              >
                Discard
              </Button>
            </div>
          </div>

          {!rows.length ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
              <TriangleAlert className="h-9 w-9" />
              <p className="text-sm">Nothing has arrived from a connected account.</p>
              <p className="max-w-md text-center text-xs">
                Leads only land here once the platform's webhook is pointed at this install and
                subscribed to the lead or comment fields.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const token = `${row.kind}:${row.id}`;
                const lead = row.kind === "lead" ? row : null;
                const comment = row.kind === "comment" ? row : null;
                const title =
                  lead?.fullName || lead?.phone || lead?.email || comment?.fromName || "(no name)";
                const detail = lead
                  ? [lead.formName || lead.campaignName, lead.phone, lead.email]
                      .filter(Boolean)
                      .join(" · ")
                  : comment?.message || "no text";
                return (
                  <li key={token} className="flex items-start gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(token)}
                      onChange={() => toggle({ kind: row.kind, id: row.id })}
                      className="mt-1 accent-blue-600"
                      aria-label={`Select ${title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{title}</div>
                      <div className="truncate text-xs text-slate-500">
                        {[PLATFORM_LABELS[row.platform] || row.platform, detail, when(row.receivedAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {lead && Object.keys(lead.answers ?? {}).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(lead.answers ?? {})
                            .slice(0, 4)
                            .map(([question, answer]) => (
                              <Badge key={question} variant="secondary" className="max-w-full truncate font-normal">
                                {question}: {answer}
                              </Badge>
                            ))}
                        </div>
                      )}
                      {comment?.postPermalink && (
                        <a
                          href={comment.postPermalink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          the post it was left on
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {lead && lead.platform === "facebook" && !lead.fullName && !lead.phone && !lead.email && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-blue-600"
                          disabled={!canCapture || refetchLead.isPending}
                          onClick={() => runRefetch(lead.id)}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Fetch details
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={!canCapture || capture.isPending}
                        onClick={() => runCapture([{ kind: row.kind, id: row.id }])}
                      >
                        Capture
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-slate-400"
                        disabled={!canCapture || discard.isPending}
                        onClick={() => runDiscard([{ kind: row.kind, id: row.id }])}
                      >
                        Discard
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Recent deliveries</h3>
            <p className="text-xs text-slate-500">
              Every call the platforms made for these accounts, with what was taken and why not.
            </p>
          </div>

          {deliveries.isLoading ? (
            <LoadingRows rows={2} />
          ) : !deliveries.data?.length ? (
            <p className="py-6 text-sm text-slate-400">
              Nothing has posted to the callback address yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {deliveries.data.map((delivery) => {
                const stored = delivery.leadsStored + delivery.commentsStored;
                const account =
                  connections.data?.find((c) => c.id === delivery.connectionId)?.accountName ||
                  PLATFORM_LABELS[delivery.platform] ||
                  delivery.platform;
                const detail = !delivery.signed
                  ? delivery.reason || "The signature did not match"
                  : stored
                    ? `${delivery.leadsStored} lead(s) and ${delivery.commentsStored} comment(s) stored`
                    : delivery.reason || "Nothing new in it";
                return (
                  <li key={delivery.id} className="flex items-start gap-3 py-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        !delivery.signed ? "bg-rose-500" : stored ? "bg-emerald-500" : "bg-amber-400"
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-700">{account}</div>
                      <div className="truncate text-xs text-slate-500">
                        {[
                          PLATFORM_LABELS[delivery.platform] || delivery.platform,
                          delivery.externalAccountId,
                          detail,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{when(delivery.receivedAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect a social account</DialogTitle>
            <DialogDescription>
              The identifiers all come from the platform's own dashboard, and the account id is what
              every later delivery is matched on.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {setup.data && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-medium text-slate-700">Callback address for this install</p>
                {(
                  [
                    ["Meta", setup.data.metaCallbackUrl],
                    ["TikTok", setup.data.tiktokCallbackUrl],
                  ] as const
                ).map(([label, url]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="shrink-0 text-slate-500">{label}</span>
                    <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-[11px]">
                      {url}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0"
                      onClick={() => {
                        navigator.clipboard?.writeText(url);
                        toast({ title: `${label} address copied` });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="social-platform">Platform</Label>
                <Select
                  value={draft.platform}
                  onValueChange={(platform) => setDraft((prev) => ({ ...prev, platform }))}
                >
                  <SelectTrigger id="social-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="social-account-id">Page, profile or advertiser id</Label>
                <Input
                  id="social-account-id"
                  value={draft.externalAccountId ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, externalAccountId: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="social-name">Name to show in the CRM</Label>
                <Input
                  id="social-name"
                  value={draft.accountName ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, accountName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="social-app-id">App id (optional)</Label>
                <Input
                  id="social-app-id"
                  value={draft.appId ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, appId: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="social-token">Page access token</Label>
                <Input
                  id="social-token"
                  type="password"
                  value={draft.accessToken ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, accessToken: e.target.value }))}
                  placeholder="needed to read a lead's answers"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="social-secret">App secret</Label>
                <Input
                  id="social-secret"
                  type="password"
                  value={draft.appSecret ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, appSecret: e.target.value }))}
                  placeholder="without it every delivery is dropped, not stored"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="social-verify">Webhook verify token</Label>
                <Input
                  id="social-verify"
                  value={draft.webhookToken ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, webhookToken: e.target.value }))}
                  placeholder="the same string you paste into the app's verify token field"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Tokens and secrets are encrypted at rest with this install's vault key and are never
              sent back to this screen.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitConnect} disabled={connect.isPending}>
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
