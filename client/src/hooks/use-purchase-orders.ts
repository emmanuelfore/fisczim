import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type PurchaseOrderLine = {
  id?: number;
  productId: number;
  productName?: string;
  productSku?: string | null;
  quantity: number;
  unitCost: number;
  notes?: string | null;
};

export type PurchaseOrder = {
  id: number;
  companyId: number;
  supplierId: number;
  supplierName?: string | null;
  branchId?: number | null;
  branchName?: string | null;
  poNumber: string;
  status: "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";
  expectedDate?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lineCount: number;
  totalCost: number;
  items: PurchaseOrderLine[];
};

export type CreatePurchaseOrderInput = {
  supplierId: number;
  branchId?: number | null;
  poNumber?: string;
  status?: PurchaseOrder["status"];
  expectedDate?: string | null;
  notes?: string | null;
  items: {
    productId: number;
    quantity: number;
    unitCost: number;
    notes?: string | null;
  }[];
};

export function usePurchaseOrders(companyId: number) {
  return useQuery({
    queryKey: ["/api/companies/:companyId/purchase-orders", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/purchase-orders`);
      if (!res.ok) throw new Error("Failed to fetch purchase orders");
      return (await res.json()) as PurchaseOrder[];
    },
    enabled: !!companyId,
  });
}

export function useCreatePurchaseOrder(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePurchaseOrderInput) => {
      const res = await apiFetch(`/api/companies/${companyId}/purchase-orders`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to create purchase order");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies/:companyId/purchase-orders", companyId] });
    },
  });
}

export function useUpdatePurchaseOrderStatus(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: PurchaseOrder["status"] }) => {
      const res = await apiFetch(`/api/purchase-orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to update purchase order");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies/:companyId/purchase-orders", companyId] });
    },
  });
}
