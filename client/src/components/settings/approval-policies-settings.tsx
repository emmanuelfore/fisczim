import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, Save } from "lucide-react";
import {
  APPROVAL_POLICY_MODES,
  DEFAULT_APPROVAL_POLICIES,
  type ApprovalPolicyMode,
  type ApprovalTypePolicy,
  type CompanyApprovalPolicies,
} from "@shared/approval-policies";
import { APPROVAL_TYPES, type ApprovalType } from "@shared/permissions";

interface ApprovalPoliciesSettingsProps {
  companyId: number;
}

type PolicyItem = {
  type: ApprovalType;
  label: string;
  description: string;
  policy: ApprovalTypePolicy;
  supportsAmountThreshold: boolean;
};

export function ApprovalPoliciesSettings({ companyId }: ApprovalPoliciesSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("roles.manage");

  const [policies, setPolicies] = useState<CompanyApprovalPolicies>(DEFAULT_APPROVAL_POLICIES);

  const { data, isLoading } = useQuery({
    queryKey: ["approval-policies", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/approval-policies`);
      if (!res.ok) throw new Error("Failed to load approval policies");
      return await res.json() as { policies: CompanyApprovalPolicies; items: PolicyItem[] };
    },
    enabled: !!companyId && can("roles.view"),
  });

  useEffect(() => {
    if (data?.policies) setPolicies(data.policies);
  }, [data?.policies]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/approval-policies`, {
        method: "PATCH",
        body: JSON.stringify({ policies }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save policies");
      }
      return await res.json();
    },
    onSuccess: (result) => {
      setPolicies(result.policies);
      queryClient.invalidateQueries({ queryKey: ["approval-policies", companyId] });
      toast({ title: "Approval policies saved", description: "Company approval rules are now active." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updatePolicy = (type: ApprovalType, patch: Partial<ApprovalTypePolicy>) => {
    setPolicies((prev) => ({
      ...prev,
      [type]: { ...prev[type], ...patch },
    }));
  };

  const items = data?.items || (Object.values(APPROVAL_TYPES) as ApprovalType[]).map((type) => ({
    type,
    label: type,
    description: "",
    policy: policies[type],
    supportsAmountThreshold: type === APPROVAL_TYPES.INVOICE_ISSUE || type === APPROVAL_TYPES.JOURNAL_POST,
  }));

  if (!can("roles.view")) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-500">
          You do not have permission to view approval policies.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Company Approval Policies
            </CardTitle>
            <CardDescription>
              Set company-wide rules for when stock, goods received, journal postings, and invoices require approval — independent of individual user permissions.
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Policies
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const policy = policies[item.type] || item.policy;
                const modeMeta = APPROVAL_POLICY_MODES.find((m) => m.value === policy.mode);
                return (
                  <div key={item.type} className="rounded-[12px] border border-slate-200 p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{item.label}</h3>
                      <Badge variant="outline">{modeMeta?.label || policy.mode}</Badge>
                    </div>
                    <p className="mb-4 text-sm text-slate-500">{item.description}</p>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Approval mode</Label>
                        <Select
                          value={policy.mode}
                          onValueChange={(value: ApprovalPolicyMode) => updatePolicy(item.type, { mode: value })}
                          disabled={!canManage}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {APPROVAL_POLICY_MODES.map((mode) => (
                              <SelectItem key={mode.value} value={mode.value}>
                                {mode.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {modeMeta && <p className="text-xs text-slate-500">{modeMeta.description}</p>}
                      </div>

                      {item.supportsAmountThreshold && policy.mode === "by_permission" && (
                        <div className="space-y-2">
                          <Label>Amount threshold (optional)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={policy.amountThreshold ?? 0}
                            onChange={(e) =>
                              updatePolicy(item.type, { amountThreshold: Number(e.target.value) || 0 })
                            }
                            disabled={!canManage}
                            placeholder="0 = no threshold"
                          />
                          <p className="text-xs text-slate-500">
                            Require approval when the amount is at or above this value, even for users with direct permission.
                          </p>
                        </div>
                      )}

                      {policy.mode === "always" && (
                        <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 md:col-span-2">
                          <div>
                            <p className="text-sm font-medium text-slate-800">Owner bypass</p>
                            <p className="text-xs text-slate-500">Company owners can complete this action without submitting for approval.</p>
                          </div>
                          <Switch
                            checked={policy.ownerBypass !== false}
                            onCheckedChange={(checked) => updatePolicy(item.type, { ownerBypass: checked })}
                            disabled={!canManage}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
