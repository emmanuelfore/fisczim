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
  unitCost: number;
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
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  notes?: string | null;
  dispatchedAt?: string | null;
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

export function useInventoryLocations(companyId: number) {
  return useQuery<InventoryLocationView[]>({
    queryKey: ["inventory-locations", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/inventory/locations`);
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
      items: { productId: number; quantity: number | string }[];
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

export function useReceiveStockTransfer(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      transferId: number;
      notes?: string;
      items?: { productId: number; quantityReceived: number | string }[];
    }) => {
      const res = await apiFetch(
        `/api/companies/${companyId}/inventory/transfers/${data.transferId}/receive`,
        {
          method: "POST",
          body: JSON.stringify({ notes: data.notes, items: data.items }),
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
