import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type GrvListItem = {
  id: string;
  grvNumber: string;
  supplierId: number | null;
  supplierName: string;
  createdAt: string;
  createdBy: string;
  notes: string;
  lineCount: number;
  totalQuantity: number;
  totalCost: number;
};

export type GrvDetail = {
  id: string;
  grvNumber: string;
  createdAt: string;
  createdBy: string;
  supplierId: number | null;
  supplierName: string;
  notes: string;
  totalQuantity: number;
  totalCost: number;
  lines: Array<{
    id: number;
    productId: number;
    productName: string;
    sku: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
};

export function useGrvs(companyId: number) {
  return useQuery({
    queryKey: ["grvs", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<GrvListItem[]> => {
      const res = await apiFetch(`/api/companies/${companyId}/grvs`);
      if (!res.ok) throw new Error("Failed to fetch GRVs");
      return res.json();
    },
  });
}

export function useGrv(companyId: number, grvId?: string) {
  return useQuery({
    queryKey: ["grv", companyId, grvId],
    enabled: !!companyId && !!grvId,
    queryFn: async (): Promise<GrvDetail> => {
      const res = await apiFetch(`/api/companies/${companyId}/grvs/${encodeURIComponent(grvId!)}`);
      if (!res.ok) throw new Error("Failed to fetch GRV");
      return res.json();
    },
  });
}

