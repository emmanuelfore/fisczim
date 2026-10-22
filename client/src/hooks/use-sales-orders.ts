import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useSalesOrders(companyId?: number, filters?: { type?: string; approvalStatus?: string; status?: string }) {
  const params = new URLSearchParams();
  if (companyId) params.set('companyId', companyId.toString());
  if (filters?.type) params.set('type', filters.type);
  if (filters?.approvalStatus) params.set('approvalStatus', filters.approvalStatus);
  if (filters?.status) params.set('status', filters.status);

  return useQuery<any[]>({
    queryKey: ["/api/sales-orders", companyId, filters],
    queryFn: async () => {
      const res = await apiFetch(`/api/sales-orders?${params.toString()}`);
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
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
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

export function useApproveSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: 'approve' | 'reject'; notes?: string }) => {
      const res = await apiFetch(`/api/sales-orders/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to process approval");
      }
      return await res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", id] });
    },
  });
}

export function useRecordLayByPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, scheduleId, paymentMethod, paymentReference }: { id: string; amount: number; scheduleId?: number; paymentMethod?: string; paymentReference?: string }) => {
      const res = await apiFetch(`/api/sales-orders/${id}/record-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, scheduleId, paymentMethod, paymentReference }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to record payment");
      }
      return await res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
  });
}

export function useReceiveGoods() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/sales-orders/${id}/receive-goods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to receive goods");
      }
      return await res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders", id] });
    },
  });
}

export function useLayBySchedules(companyId?: number) {
  return useQuery<any[]>({
    queryKey: ["/api/lay-by-schedules", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/lay-by-schedules?companyId=${companyId}`);
      if (!res.ok) throw new Error("Failed to fetch lay-by schedules");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useStockReservations(companyId?: number) {
  return useQuery<any[]>({
    queryKey: ["/api/stock-reservations", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/stock-reservations?companyId=${companyId}`);
      if (!res.ok) throw new Error("Failed to fetch stock reservations");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useSalesOrderReports(companyId?: number, type?: 'preorders' | 'lay-bys' | 'bundles') {
  return useQuery<any>({
    queryKey: ["/api/sales-orders/reports", companyId, type],
    queryFn: async () => {
      const res = await apiFetch(`/api/sales-orders/reports/${type}?companyId=${companyId}`);
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: !!companyId && !!type,
  });
}

export function useSalesOrderSettings(companyId?: number) {
  return useQuery<any>({
    queryKey: ["/api/sales-order-settings", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/sales-order-settings?companyId=${companyId}`);
      if (!res.ok) throw new Error("Failed to fetch sales order settings");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useUpdateSalesOrderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch("/api/sales-order-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update sales order settings");
      }
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-order-settings", variables.companyId] });
    },
  });
}
