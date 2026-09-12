import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type PurchaseOrderLine = {
  id?: number;
  productId?: number | null;
  productName?: string | null;
  productSku?: string | null;
  description?: string | null;
  accountCode?: string | null;
  quantity: number;
  unitCost: number;
  quantityReceived?: number;
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
  shipTo?: string | null;
  notes?: string | null;
  currency?: string;
  taxInclusive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  lineCount: number;
  totalCost: number;
  items: PurchaseOrderLine[];
  grvs?: Array<{ id: number; grvNumber?: string | null; gdnNumber: string; status: string }>;
  bills?: Array<{ id: number; invoiceNumber: string; status: string }>;
  approval?: { id: number; status: string; reviewerName?: string | null } | null;
};

export type CreatePurchaseOrderInput = {
  supplierId: number;
  branchId?: number | null;
  poNumber?: string;
  status?: PurchaseOrder["status"];
  expectedDate?: string | null;
  shipTo?: string | null;
  notes?: string | null;
  currency?: string;
  taxInclusive?: boolean;
  items: {
    productId?: number | null;
    description?: string | null;
    accountCode?: string | null;
    quantity: number;
    unitCost: number;
    notes?: string | null;
  }[];
};

export type UpdatePurchaseOrderInput = {
  supplierId?: number;
  branchId?: number | null;
  expectedDate?: string | null;
  shipTo?: string | null;
  notes?: string | null;
  currency?: string;
  taxInclusive?: boolean;
  items?: {
    productId?: number | null;
    description?: string | null;
    accountCode?: string | null;
    quantity: number;
    unitCost: number;
    notes?: string | null;
  }[];
};

const QUERY_KEY = (companyId: number) => ["/api/companies/:companyId/purchase-orders", companyId];

export function usePurchaseOrders(companyId: number) {
  return useQuery({
    queryKey: QUERY_KEY(companyId),
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(companyId) });
    },
  });
}

export function useUpdatePurchaseOrder(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdatePurchaseOrderInput }) => {
      const res = await apiFetch(`/api/purchase-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to update purchase order");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(companyId) });
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(companyId) });
    },
  });
}

export function useCreateGdn(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (poId: number) => {
      const res = await apiFetch(`/api/purchase-orders/${poId}/create-gdn`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to create GDN");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(companyId) });
    },
  });
}
