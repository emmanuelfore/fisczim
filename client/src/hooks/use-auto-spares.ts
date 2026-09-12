import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useProductSerials(companyId: number, productId?: number, status?: string) {
  return useQuery({
    queryKey: ["product-serials", companyId, productId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (productId) params.set("productId", String(productId));
      if (status) params.set("status", status);
      const qs = params.toString();
      const res = await apiFetch(`/api/companies/${companyId}/product-serials${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch serial numbers");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useCreateProductSerials(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any | any[]) => {
      const res = await apiFetch(`/api/companies/${companyId}/product-serials`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create serial numbers");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product-serials", companyId] }),
  });
}

export function useWarrantyClaims(companyId: number) {
  return useQuery({
    queryKey: ["warranty-claims", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/warranty-claims`);
      if (!res.ok) throw new Error("Failed to fetch warranty claims");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useLaybys(companyId: number) {
  return useQuery({
    queryKey: ["laybys", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/laybys`);
      if (!res.ok) throw new Error("Failed to fetch lay-bys");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useCreateLayby(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch(`/api/companies/${companyId}/laybys`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create lay-by");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["laybys", companyId] }),
  });
}

export function useAddLaybyPayment(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ laybyId, data }: { laybyId: number; data: any }) => {
      const res = await apiFetch(`/api/companies/${companyId}/laybys/${laybyId}/payments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to add lay-by payment");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["laybys", companyId] }),
  });
}
