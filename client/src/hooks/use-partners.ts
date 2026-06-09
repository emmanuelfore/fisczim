import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PartnershipSettings } from "@shared/partnership";

export type CompanyPartner = {
  id: number;
  companyId: number;
  name: string;
  tradingName?: string | null;
  logoUrl?: string | null;
  tin?: string | null;
  vatNumber?: string | null;
  displayLabel?: string | null;
  defaultRevenueSharePercent?: string | number | null;
  ownerGroupMatch?: string | null;
  isActive?: boolean;
  notes?: string | null;
};

export function usePartners(companyId: number) {
  return useQuery({
    queryKey: ["company-partners", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/partners`);
      if (!res.ok) throw new Error("Failed to load partners");
      return await res.json() as CompanyPartner[];
    },
    enabled: !!companyId,
  });
}

export function usePartnershipSettings(companyId: number) {
  return useQuery({
    queryKey: ["partnership-settings", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/partnership-settings`);
      if (!res.ok) throw new Error("Failed to load partnership settings");
      return await res.json() as PartnershipSettings;
    },
    enabled: !!companyId,
  });
}

export function usePartnershipSalesReport(companyId: number, startDate?: string, endDate?: string, partnerId?: number) {
  return useQuery({
    queryKey: ["partnership-sales-report", companyId, startDate, endDate, partnerId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (partnerId) params.set("partnerId", String(partnerId));
      const res = await apiFetch(`/api/companies/${companyId}/reports/partnership-sales?${params}`);
      if (!res.ok) throw new Error("Failed to load partnership report");
      return await res.json();
    },
    enabled: !!companyId && !!startDate && !!endDate,
  });
}

export function useSavePartnershipSettings(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: PartnershipSettings) => {
      const res = await apiFetch(`/api/companies/${companyId}/partnership-settings`, {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save settings");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partnership-settings", companyId] });
    },
  });
}
