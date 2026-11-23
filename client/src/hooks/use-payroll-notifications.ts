import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useActiveCompany } from "@/hooks/use-active-company";
import { usePermissions } from "@/hooks/use-permissions";

export interface PendingPayrollRun {
  id: number;
  periodStart: string;
  periodEnd: string;
  payFrequency: string;
  currency: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED";
  totalNet: string | number | null;
  updatedAt: string | null;
  dueDate: string;
  reminderDate: string;
}

export interface PayrollNotification {
  id: number;
  kind: "CREATED" | "SUBMITTED" | "APPROVED";
  title: string;
  message: string;
  href: string;
  isRead: boolean;
  createdAt: string;
  runStatus: string;
  periodStart: string;
  periodEnd: string;
}

export function usePendingPayrollRuns() {
  const { activeCompanyId } = useActiveCompany();
  const { can } = usePermissions();

  return useQuery<{ runs: PendingPayrollRun[]; count: number; currentPeriod?: { periodStart: string; periodEnd: string; dueDate: string } }>({
    queryKey: ["pending-payroll-runs", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return { runs: [], count: 0 };
      const res = await apiFetch(`/api/companies/${activeCompanyId}/payroll/pending-runs`);
      if (!res.ok) return { runs: [], count: 0 };
      return await res.json();
    },
    enabled: !!activeCompanyId && can("payroll.view"),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
  });
}

export function usePayrollNotifications() {
  const { activeCompanyId } = useActiveCompany();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const enabled = !!activeCompanyId && can("payroll.view");
  const invalidate = () => {
    if (!activeCompanyId) return;
    void queryClient.invalidateQueries({ queryKey: ["payroll-notifications", activeCompanyId] });
    void queryClient.invalidateQueries({ queryKey: ["pending-payroll-runs", activeCompanyId] });
  };

  const query = useQuery<{ items: PayrollNotification[]; unreadCount: number }>({
    queryKey: ["payroll-notifications", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return { items: [], unreadCount: 0 };
      const res = await apiFetch(`/api/companies/${activeCompanyId}/payroll/notifications`);
      if (!res.ok) return { items: [], unreadCount: 0 };
      return await res.json();
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/companies/${activeCompanyId}/payroll/notifications/${id}/read`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Could not mark notification as read");
      return id;
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/companies/${activeCompanyId}/payroll/notifications/read-all`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Could not mark notifications as read");
      return true;
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    unreadCount: query.data?.unreadCount ?? 0,
    items: query.data?.items ?? [],
    markRead,
    markAllRead,
  };
}
