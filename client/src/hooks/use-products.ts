import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProduct } from "@shared/schema";
import { apiFetch } from "@/lib/api";
import { cacheProducts, getCachedProducts, setLastCacheTime } from "@/lib/offline-db";
import { getIsOnline } from "@/lib/online-state";

export function refreshProductQueries(queryClient: ReturnType<typeof useQueryClient>, companyId?: number) {
  if (!companyId) {
    queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
    queryClient.refetchQueries({ queryKey: [api.products.list.path], type: "active" });
    return;
  }

  queryClient.invalidateQueries({ queryKey: [api.products.list.path, companyId] });
  queryClient.refetchQueries({ queryKey: [api.products.list.path, companyId], type: "active" });
}

export function useProducts(companyId: number, branchId?: number) {
  return useQuery({
    queryKey: [api.products.list.path, companyId, branchId],
    queryFn: async () => {
      // Always try cache first when offline
      if (!getIsOnline()) {
        const cached = await getCachedProducts(companyId);
        console.log(`[useProducts] offline, cached count: ${cached?.length ?? 0}`);
        return cached && cached.length > 0 ? cached : [];
      }
      // Online path — try API, fall back to cache on any failure or 401
      try {
        const url = buildUrl(api.products.list.path, { companyId });
        const finalUrl = branchId ? `${url}?branchId=${branchId}` : url;
        const res = await apiFetch(finalUrl);
        if (res.status === 401) {
          console.warn('[useProducts] 401 — using cached products');
          const cached = await getCachedProducts(companyId);
          console.log(`[useProducts] cache fallback count: ${cached?.length ?? 0}`);
          return cached ?? [];
        }
        if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
        const products = api.products.list.responses[200].parse(await res.json());
        if (companyId && !branchId) { // Only cache global list for now to simplify
          await cacheProducts(companyId, products);
          await setLastCacheTime(companyId, Date.now());
        }
        return products;
      } catch (err) {
        console.warn('[useProducts] fetch error, falling back to cache:', err);
        const cached = await getCachedProducts(companyId);
        console.log(`[useProducts] error cache fallback count: ${cached?.length ?? 0}`);
        return cached ?? [];
      }
    },
    enabled: !!companyId,
    retry: false,
    staleTime: 0, // always re-run on mount so cache is loaded fresh
  });
}

export function useCreateProduct(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<InsertProduct, "companyId">) => {
      const url = buildUrl(api.products.create.path, { companyId });
      const res = await apiFetch(url, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create product");
      return api.products.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      refreshProductQueries(queryClient, companyId);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, companyId }: { id: number; data: Partial<InsertProduct>; companyId?: number }) => {
      const url = buildUrl(api.products.update.path, { id });
      const res = await apiFetch(url, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update product");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      refreshProductQueries(queryClient, variables.companyId);
    },
  });
}

export function useAdjustPrice(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { newPrice: number | string; reason?: string; effectiveFrom?: string } }) => {
      const url = buildUrl(api.products.adjustPrice.path, { id });
      const res = await apiFetch(url, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to adjust price");
      return await res.json();
    },
    onSuccess: () => {
      refreshProductQueries(queryClient, companyId);
    },
  });
}

export function usePriceHistory(productId: number | undefined) {
  return useQuery({
    queryKey: [api.products.priceHistory.path, productId],
    queryFn: async () => {
      const url = buildUrl(api.products.priceHistory.path, { id: productId });
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Failed to fetch price history");
      return await res.json();
    },
    enabled: !!productId,
  });
}

export function useBulkConvertProducts(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch(`/api/companies/${companyId}/products/bulk-convert`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to convert items");
      return await res.json();
    },
    onSuccess: () => {
      refreshProductQueries(queryClient, companyId);
    },
  });
}
