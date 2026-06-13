import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useAuth } from "@/hooks/use-auth";
import { NAV_PERMISSION_MAP, DIRECT_ACTION_PERMISSION, REQUEST_ACTION_PERMISSION, type ApprovalType } from "@shared/permissions";
import { type CompanyApprovalPolicies } from "@shared/approval-policies";

export function usePermissions() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();

  const query = useQuery({
    queryKey: ["my-permissions", activeCompanyId, user?.id],
    queryFn: async () => {
      if (!activeCompanyId) return { permissions: [] as string[], legacyRole: "member", companyRoleId: null, approvalPolicies: null };
      const res = await apiFetch(`/api/companies/${activeCompanyId}/my-permissions`);
      if (!res.ok) throw new Error("Failed to load permissions");
      return await res.json() as {
        permissions: string[];
        legacyRole: string;
        companyRoleId: number | null;
        approvalPolicies: CompanyApprovalPolicies | null;
      };
    },
    enabled: !!user && !!activeCompanyId,
    staleTime: 60_000,
  });

  const permissions = new Set(query.data?.permissions || []);
  const isSuperAdmin = !!user?.isSuperAdmin;

  const can = (permission: string) => isSuperAdmin || permissions.has(permission);

  const canAccessPath = (href: string) => {
    if (isSuperAdmin) return true;
    const path = href.split("?")[0];
    const required = NAV_PERMISSION_MAP[path];
    if (!required) return true;
    if (Array.isArray(required)) return required.some((p) => permissions.has(p));
    return permissions.has(required);
  };

  const requiresApproval = (type: ApprovalType, amount?: number) => {
    if (isSuperAdmin) return false;
    
    const policy = query.data?.approvalPolicies?.[type];
    if (!policy || policy.mode === "disabled") {
      return false;
    }

    const isOwner = query.data?.legacyRole === "owner";
    const ownerBypass = policy.ownerBypass !== false;
    if (isOwner && ownerBypass) {
      return false;
    }

    if (policy.mode === "always") {
      return true;
    }

    // mode is "by_permission"
    const threshold = Number(policy.amountThreshold || 0);
    if (threshold > 0 && amount != null && Number.isFinite(amount) && amount >= threshold) {
      return true;
    }

    const directPermission = DIRECT_ACTION_PERMISSION[type];
    const hasDirect = permissions.has(directPermission);
    
    return !hasDirect;
  };

  return {
    ...query,
    permissions: query.data?.permissions || [],
    legacyRole: query.data?.legacyRole || "member",
    companyRoleId: query.data?.companyRoleId || null,
    approvalPolicies: query.data?.approvalPolicies || null,
    can,
    canAccessPath,
    requiresApproval,
    isSuperAdmin,
  };
}

export function usePendingApprovalsCount() {
  const { activeCompanyId } = useActiveCompany();
  const { can } = usePermissions();

  return useQuery({
    queryKey: ["pending-approvals-count", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return 0;
      const res = await apiFetch(`/api/companies/${activeCompanyId}/approvals/pending-count`);
      if (!res.ok) return 0;
      const data = await res.json();
      return Number(data.count || 0);
    },
    enabled: !!activeCompanyId && can("approvals.view"),
    refetchInterval: 60_000,
  });
}
