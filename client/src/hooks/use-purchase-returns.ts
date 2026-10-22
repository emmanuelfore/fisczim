import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type PurchaseReturnLine = {
  id: number;
  productId: number | null;
  productName: string | null;
  productSku: string | null;
  quantity: number;
  unitCost: number;
  reason: string | null;
  notes: string | null;
};

export type PurchaseReturn = {
  id: number;
  companyId: number;
  supplierId: number;
  supplierName: string;
  branchId: number | null;
  branchName: string | null;
  purchaseOrderId: number | null;
  goodsDeliveryNoteId: number | null;
  gdnNumber: string | null;
  returnNumber: string;
  status: "DRAFT" | "APPROVED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  reason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  creditNoteId?: number | null;
  creditNoteNumber?: string | null;
  items: PurchaseReturnLine[];
  lineCount: number;
  totalCost: number;
};

export function usePurchaseReturns(companyId: number) {
  return useQuery<PurchaseReturn[]>({
    queryKey: ["/api/companies", companyId, "purchase-returns"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await apiRequest("GET", `/api/companies/${companyId}/purchase-returns`);
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function usePurchaseReturn(companyId: number, returnId: number) {
  return useQuery<PurchaseReturn>({
    queryKey: ["/api/companies", companyId, "purchase-returns", returnId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/purchase-returns`);
      const all = await res.json();
      return all.find((r: any) => r.id === returnId);
    },
    enabled: !!companyId && !!returnId,
  });
}

export function useCreatePurchaseReturn(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/purchase-returns`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "purchase-returns"] });
    },
  });
}

export function useUpdatePurchaseReturn(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/purchase-returns/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "purchase-returns"] });
    },
  });
}

export function useUpdatePurchaseReturnStatus(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/purchase-returns/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "purchase-returns"] });
    },
  });
}
