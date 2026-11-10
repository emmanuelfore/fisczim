import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingRows } from "@/components/ui/page-skeleton";
import { useCrmDuplicates, useMergeEnquiries } from "@/hooks/use-crm";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Copy, GitMerge } from "lucide-react";

type DuplicateEnquiry = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  stageId: number | null;
  createdAt: string | null;
};

/**
 * Odoo dedupes leads the same way - by phone or email - and merging moves the
 * activities and follow-ups onto the survivor and deletes the rest. The server
 * does that; this screen only picks which record wins.
 */
export function DuplicatesTab({ companyId, onOpenEnquiry }: { companyId: number; onOpenEnquiry: (id: number) => void }) {
  const { data: groups, isLoading } = useCrmDuplicates(companyId);
  const { can } = usePermissions();
  const { toast } = useToast();
  const merge = useMergeEnquiries(companyId);
  const [targets, setTargets] = useState<Record<string, number>>({});

  const canMerge = can("crm.duplicates.merge");
  const list = (groups || []) as { matchKey: string; enquiries: DuplicateEnquiry[] }[];

  if (isLoading) return <LoadingRows />;

  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
        <Copy className="h-10 w-10" />
        <p className="text-sm">No two enquiries share a phone or email address.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {list.map((group) => {
        const targetId = targets[group.matchKey] ?? group.enquiries[0].id;
        const sources = group.enquiries.filter((e) => e.id !== targetId);
        return (
          <Card key={group.matchKey}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    {group.enquiries[0].name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    matched on {group.matchKey.startsWith("p:") ? "phone" : "email"}{" "}
                    {group.matchKey.replace(/^(p|e):/, "")}
                  </p>
                </div>
                <Badge variant="secondary">{group.enquiries.length} records</Badge>
              </div>

              <div className="space-y-2">
                {group.enquiries.map((e) => (
                  <label
                    key={e.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      e.id === targetId ? "border-blue-300 bg-blue-50/50" : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`target-${group.matchKey}`}
                      checked={e.id === targetId}
                      onChange={() => setTargets((prev) => ({ ...prev, [group.matchKey]: e.id }))}
                      className="accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-800">
                        #{e.id} · {e.name}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {e.phone || "no phone"} · {e.email || "no email"} ·{" "}
                        {e.createdAt ? format(new Date(e.createdAt), "dd MMM yyyy") : "no date"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-blue-600"
                      onClick={(event) => {
                        event.preventDefault();
                        onOpenEnquiry(e.id);
                      }}
                    >
                      Open
                    </Button>
                  </label>
                ))}
              </div>

              <Button
                size="sm"
                disabled={!canMerge || !sources.length || merge.isPending}
                onClick={() =>
                  merge.mutate(
                    { targetId, sourceIds: sources.map((s) => s.id) },
                    {
                      onSuccess: (result: any) =>
                        toast({
                          title: `Merged ${result?.merged ?? sources.length} enquiries`,
                          description: `Their history now sits on record #${targetId}.`,
                        }),
                      onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
                    },
                  )
                }
              >
                <GitMerge className="mr-1.5 h-3.5 w-3.5" />
                Merge {sources.length} into #{targetId}
              </Button>
              {!canMerge ? (
                <p className="text-xs text-slate-400">You need the merge permission to do this.</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
