import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useSalesOrders(companyId?: number) {
  return useQuery<any[]>({
    queryKey: ["/api/sales-orders", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/sales-orders?companyId=${companyId}`);
      if (!res.ok) throw new Error("Failed to fetch sales orders");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useSalesOrder(id?: string) {
  return useQuery<any>({
    queryKey: ["/api/sales-orders", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/sales-orders/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch sales order");
      }
      return res.json();
    },
    enabled: !!id,
  });
}

export function useConvertToSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (quotationId: number) => {
      const res = await apiFetch("/api/sales-orders/from-quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to convert to sales order");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
  });
}

export function useCreateSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create sales order");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
    },
  });
}

export function useUpdateSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiFetch(`/api/sales-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update sales order");
      }
      return await res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", id] });
    },
  });
}
