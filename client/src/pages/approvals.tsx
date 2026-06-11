import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { APPROVAL_TYPE_LABELS, type ApprovalType } from "@shared/permissions";
import { format } from "date-fns";

type ApprovalRequest = {
  id: number;
  type: ApprovalType;
  status: string;
  title: string;
  description?: string | null;
  payload: Record<string, unknown>;
  requesterName?: string;
  reviewerName?: string;
  reviewNotes?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
};

export default function ApprovalsPage() {
  const { activeCompany } = useActiveCompany();
  const companyId = activeCompany?.id || 0;
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["approvals", companyId, status],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/approvals?status=${status}`);
      if (!res.ok) throw new Error("Failed to load approvals");
      return await res.json() as ApprovalRequest[];
    },
    enabled: !!companyId && can("approvals.view"),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await apiFetch(`/api/companies/${companyId}/approvals/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes: reviewNotes[id] || "" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `Failed to ${action} request`);
      }
      return await res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["approvals", companyId] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals-count", companyId] });
      toast({
        title: vars.action === "approve" ? "Approved" : "Rejected",
        description: "The request has been processed.",
      });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!can("approvals.view")) {
    return (
      <Layout>
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            You do not have permission to view the approvals inbox.
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Approvals Inbox
            </CardTitle>
            <CardDescription>
              Review and approve stock adjustments, goods received, journal postings, and invoice issuances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
              <TabsContent value={status} className="mt-4">
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : requests.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-500">No {status} requests.</p>
                ) : (
                  <div className="space-y-3">
                    {requests.map((req) => (
                      <div key={req.id} className="rounded-[12px] border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-slate-900">{req.title}</h3>
                              <Badge variant="outline">{APPROVAL_TYPE_LABELS[req.type] || req.type}</Badge>
                              <Badge>{req.status}</Badge>
                            </div>
                            {req.description && <p className="mt-1 text-sm text-slate-600">{req.description}</p>}
                            <p className="mt-2 text-xs text-slate-400">
                              Requested by {req.requesterName || "Unknown"} on {format(new Date(req.createdAt), "dd MMM yyyy HH:mm")}
                            </p>
                            {req.reviewedAt && (
                              <p className="text-xs text-slate-400">
                                Reviewed by {req.reviewerName || "Unknown"} on {format(new Date(req.reviewedAt), "dd MMM yyyy HH:mm")}
                              </p>
                            )}
                            {req.reviewNotes && <p className="mt-1 text-xs text-slate-500">Note: {req.reviewNotes}</p>}
                          </div>
                          {status === "pending" && can("approvals.action") && (
                            <div className="flex w-full max-w-sm flex-col gap-2 sm:w-auto">
                              <Textarea
                                placeholder="Review notes (optional)"
                                value={reviewNotes[req.id] || ""}
                                onChange={(e) => setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => reviewMutation.mutate({ id: req.id, action: "approve" })}
                                  disabled={reviewMutation.isPending}
                                >
                                  <CheckCircle2 className="mr-1 h-4 w-4" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="flex-1"
                                  onClick={() => reviewMutation.mutate({ id: req.id, action: "reject" })}
                                  disabled={reviewMutation.isPending}
                                >
                                  <XCircle className="mr-1 h-4 w-4" />
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
