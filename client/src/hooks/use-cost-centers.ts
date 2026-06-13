import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type CostCenter, type InsertCostCenter } from "@shared/schema";
import { apiFetch } from "@/lib/api";

export function useCostCenters(companyId: number) {
  return useQuery<CostCenter[]>({
    queryKey: ["/api/companies", companyId, "cost-centers"],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/cost-centers`);
      if (!res.ok) throw new Error("Failed to fetch cost centers");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useCreateCostCenter(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertCostCenter) => {
      const res = await apiFetch(`/api/companies/${companyId}/cost-centers`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create cost center");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "cost-centers"] });
    },
  });
}

export function useUpdateCostCenter(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<InsertCostCenter> & { id: number }) => {
      const res = await apiFetch(`/api/companies/${companyId}/cost-centers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update cost center");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "cost-centers"] });
    },
  });
}

export function useDeleteCostCenter(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/companies/${companyId}/cost-centers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete cost center");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "cost-centers"] });
    },
  });
}
