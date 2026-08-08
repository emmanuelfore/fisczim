import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useCompoundProducts(companyId?: number) {
  return useQuery<any[]>({
    queryKey: ["/api/compound-products", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/compound-products?companyId=${companyId}`);
      if (!res.ok) throw new Error("Failed to fetch compound products");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useCompoundProduct(id?: string) {
  return useQuery<any>({
    queryKey: ["/api/compound-products", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/compound-products/${id}`);
      if (!res.ok) throw new Error("Failed to fetch compound product");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateCompoundProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch("/api/compound-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create compound product");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compound-products"] });
    },
  });
}

export function useUpdateCompoundProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiFetch(`/api/compound-products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update compound product");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compound-products"] });
    },
  });
}
