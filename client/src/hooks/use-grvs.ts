import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { refreshProductQueries } from "@/hooks/use-products";

export type GrvListItem = {
  id: string;
  grvNumber: string;
  supplierId: number | null;
  supplierName: string;
  createdAt: string;
  createdBy: string;
  notes: string;
  status?: string;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  purchaseOrderId?: number | null;
  matchingStatus?: "MATCHED" | "QTY_MISMATCH" | "PRICE_VARIANCE" | "PENDING_INVOICE";
  landedCostsBreakdown?: { freight: number; duty: number; handling: number };
  serialNumbers?: string[];
  journalEntry?: { id: number; description: string; lines: Array<{ accountCode: string; accountName: string; type: "DEBIT" | "CREDIT"; amount: number }> } | null;
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
  status?: string;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  purchaseOrderId?: number | null;
  matchingStatus?: "MATCHED" | "QTY_MISMATCH" | "PRICE_VARIANCE" | "PENDING_INVOICE";
  landedCostsBreakdown?: { freight: number; duty: number; handling: number };
  serialNumbers?: string[];
  journalEntry?: { id: number; description: string; lines: Array<{ accountCode: string; accountName: string; type: "DEBIT" | "CREDIT"; amount: number }> } | null;
  taxInclusive?: boolean;
  totalQuantity: number;
  totalCost: number;
  lines: Array<{
    id: number;
    productId: number;
    accountCode?: string | null;
    description?: string | null;
    productName: string;
    sku: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    taxRate: number;
    taxTypeId: number | null;
    taxTypeName: string | null;
    taxTypeCode: string | null;
    taxAmount?: number;
    isRecoverable?: boolean;
  }>;
};

export type GdnListItem = {
  id: number;
  gdnNumber: string;
  status: string;
  supplierId: number | null;
  supplierName: string;
  createdAt: string;
  createdBy: string;
  notes: string;
  lineCount: number;
  totalQuantity: number;
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    sku: string;
    costPrice: number;
    quantityReceived: number;
  }>;
};

async function readJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  const looksLikeHtml = text.trim().startsWith("<");

  if (!res.ok) {
    if (looksLikeHtml) throw new Error(`${fallbackMessage}: API route returned HTML instead of JSON.`);
    try {
      const parsed = text ? JSON.parse(text) : {};
      if (parsed?.message) throw new Error(parsed.message);
    } catch (error: any) {
      if (error?.message && !error.message.startsWith("Unexpected")) throw error;
    }
    throw new Error(text || fallbackMessage);
  }

  if (!contentType.includes("application/json") && looksLikeHtml) {
    throw new Error(`${fallbackMessage}: API route returned HTML instead of JSON.`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

export function useGrvs(companyId: number) {
  return useQuery({
    queryKey: ["grvs", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<GrvListItem[]> => {
      const res = await apiFetch(`/api/companies/${companyId}/grvs`);
      if (!res.ok) throw new Error("Failed to fetch GRVs");
      return readJsonOrThrow<GrvListItem[]>(res, "Failed to fetch GRVs");
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
      return readJsonOrThrow<GrvDetail>(res, "Failed to fetch GRV");
    },
  });
}

export function usePendingGdns(companyId: number) {
  return useQuery({
    queryKey: ["gdns", companyId, "DRAFT"],
    enabled: !!companyId,
    refetchInterval: 60000,
    queryFn: async (): Promise<GdnListItem[]> => {
      const res = await apiFetch(`/api/companies/${companyId}/gdns?status=DRAFT`);
      return readJsonOrThrow<GdnListItem[]>(res, "Failed to fetch pending GDNs");
    },
  });
}

export function useCreateGdn(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      gdnNumber: string;
      supplierId?: number | null;
      notes?: string;
      items: Array<{ productId: number; quantity: number | string; notes?: string }>;
    }) => {
      const res = await apiFetch(`/api/companies/${companyId}/gdns`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return readJsonOrThrow(res, "Failed to record GDN");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdns", companyId, "DRAFT"] });
    },
  });
}

export function useConfirmGdn(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      gdnId: number;
      grvNumber?: string;
      notes?: string;
      landedCosts?: number | string;
      allocationMethod?: "quantity" | "value" | "manual";
      receivingLocationId?: number | null;
      items: Array<{
        productId: number;
        quantity: number | string;
        unitCost: number | string;
        landedCost?: number | string;
      }>;
    }) => {
      const res = await apiFetch(`/api/companies/${companyId}/gdns/${data.gdnId}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          grvNumber: data.grvNumber,
          notes: data.notes,
          landedCosts: data.landedCosts,
          allocationMethod: data.allocationMethod || "value",
          receivingLocationId: data.receivingLocationId,
          items: data.items,
        }),
      });
      return readJsonOrThrow(res, "Failed to confirm GDN");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdns", companyId, "DRAFT"] });
      queryClient.invalidateQueries({ queryKey: ["grvs", companyId] });
      refreshProductQueries(queryClient, companyId);
    },
  });
}
