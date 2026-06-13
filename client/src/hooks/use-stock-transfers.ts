import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { refreshProductQueries } from "@/hooks/use-products";

export type StockTransferItemView = {
  id: number;
  productId: number;
  productName: string;
  sku?: string | null;
  quantity: number;
  quantityReceived?: number | null;
  quantityDamaged?: number | null;
  quantityLost?: number | null;
  unitCost: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
};

export type StockTransferView = {
  id: number;
  companyId: number;
  transferNumber: string;
  fromBranchId?: number | null;
  toBranchId?: number | null;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  fromLocationName: string;
  toLocationName: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  notes?: string | null;
  transitCost?: string | number | null;
  transitCostCurrency?: string | null;
  freightCarrier?: string | null;
  vehicleReg?: string | null;
  varianceReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  dispatchedBy?: string | null;
  dispatchedAt?: string | null;
  receivedBy?: string | null;
  receivedAt?: string | null;
  createdAt?: string | null;
  lineCount: number;
  totalQuantity: number;
  items: StockTransferItemView[];
};

export type InventoryLocationView = {
  id: number;
  companyId: number;
  type: "WAREHOUSE" | "BRANCH" | "VAN" | "SHOP_FLOOR" | string;
  name: string;
  code?: string | null;
  address?: string | null;
  branchId?: number | null;
  isDefaultReceiving: boolean;
  isDefaultDispatch: boolean;
  isActive: boolean;
  stockQuantity?: number;
  stockValue?: number;
};

export function useInventoryLocations(companyId: number, params?: { all?: boolean }) {
  return useQuery<InventoryLocationView[]>({
    queryKey: ["inventory-locations", companyId, params?.all],
    queryFn: async () => {
      const queryStr = params?.all ? "?all=true" : "";
      const res = await apiFetch(`/api/companies/${companyId}/inventory/locations${queryStr}`);
      if (!res.ok) throw new Error("Failed to fetch inventory locations");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useStockTransfers(companyId: number, status = "all") {
  return useQuery<StockTransferView[]>({
    queryKey: ["stock-transfers", companyId, status],
    queryFn: async () => {
      const url = `/api/companies/${companyId}/inventory/transfers${
        status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""
      }`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Failed to fetch stock transfers");
      return res.json();
    },
    enabled: !!companyId,
  });
}

export function useCreateStockTransfer(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      fromLocationId?: number | null;
      toLocationId?: number | null;
      fromBranchId?: number | null;
      toBranchId?: number | null;
      notes?: string;
      status?: string;
      transitCost?: number;
      transitCostCurrency?: string;
      freightCarrier?: string;
      vehicleReg?: string;
      items: { productId: number; quantity: number | string; unitCost?: number; batchNumber?: string; expiryDate?: string }[];
    }) => {
      const res = await apiFetch(`/api/companies/${companyId}/inventory/transfers`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create transfer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-locations", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "branches"] });
      refreshProductQueries(queryClient, companyId);
    },
  });
}

export function useSubmitStockTransfer(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: number) => {
      const res = await apiFetch(`/api/companies/${companyId}/inventory/transfers/${transferId}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit transfer for approval");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers", companyId] });
    },
  });
}

export function useApproveStockTransfer(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: number) => {
      const res = await apiFetch(`/api/companies/${companyId}/inventory/transfers/${transferId}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to approve transfer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers", companyId] });
    },
  });
}

export function useDispatchStockTransfer(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: number) => {
      const res = await apiFetch(`/api/companies/${companyId}/inventory/transfers/${transferId}/dispatch`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to dispatch transfer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-locations", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "branches"] });
      refreshProductQueries(queryClient, companyId);
    },
  });
}

export function useReceiveStockTransfer(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      transferId: number;
      notes?: string;
      varianceReason?: string;
      items?: { productId: number; quantityReceived: number | string; quantityDamaged?: number | string; quantityLost?: number | string; batchNumber?: string; expiryDate?: string }[];
    }) => {
      const res = await apiFetch(
        `/api/companies/${companyId}/inventory/transfers/${data.transferId}/receive`,
        {
          method: "POST",
          body: JSON.stringify({ notes: data.notes, items: data.items, varianceReason: data.varianceReason }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to receive transfer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-locations", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "branches"] });
      refreshProductQueries(queryClient, companyId);
    },
  });
}

export function useCancelStockTransfer(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: number) => {
      const res = await apiFetch(
        `/api/companies/${companyId}/inventory/transfers/${transferId}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to cancel transfer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-locations", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "branches"] });
      refreshProductQueries(queryClient, companyId);
    },
  });
}
