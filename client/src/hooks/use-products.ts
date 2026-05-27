import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProduct } from "@shared/schema";
import { apiFetch } from "@/lib/api";
import { cacheProducts, getCachedProducts, setLastCacheTime } from "@/lib/offline-db";
import { getIsOnline } from "@/lib/online-state";

export function refreshProductQueries(queryClient: ReturnType<typeof useQueryClient>, companyId?: number) {
  const matchesProductList = (query: { queryKey: readonly unknown[] }) => {
    const [path, queryCompanyId] = query.queryKey;
    return path === api.products.list.path && (!companyId || queryCompanyId === companyId);
  };

  if (!companyId) {
    queryClient.invalidateQueries({ predicate: matchesProductList });
    return queryClient.refetchQueries({ predicate: matchesProductList, type: "active" });
  }

  queryClient.invalidateQueries({ predicate: matchesProductList });
  return queryClient.refetchQueries({ predicate: matchesProductList, type: "active" });
}

export async function refreshProductQueriesAsync(queryClient: ReturnType<typeof useQueryClient>, companyId?: number) {
  const matchesProductList = (query: { queryKey: readonly unknown[] }) => {
    const [path, queryCompanyId] = query.queryKey;
    return path === api.products.list.path && (!companyId || queryCompanyId === companyId);
  };

  if (!companyId) {
    await queryClient.invalidateQueries({ predicate: matchesProductList });
    await queryClient.refetchQueries({ predicate: matchesProductList, type: "active" });
    return;
  }

  await queryClient.invalidateQueries({ predicate: matchesProductList });
  await queryClient.refetchQueries({ predicate: matchesProductList, type: "active" });
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
      // Online path — try API, but do not hide expired sessions behind stale cached prices.
      try {
        const url = buildUrl(api.products.list.path, { companyId });
        const finalUrl = branchId ? `${url}?branchId=${branchId}` : url;
        const res = await apiFetch(finalUrl);
        if (res.status === 401) {
          throw new Error("Unauthorized. Please sign in again to refresh products.");
        }
        if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
        const products = api.products.list.responses[200].parse(await res.json());
        if (companyId && !branchId) { // Only cache global list for now to simplify
          await cacheProducts(companyId, products);
          await setLastCacheTime(companyId, Date.now());
        }
        return products;
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Unauthorized.")) {
          throw err;
        }
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

export function useBulkAdjustPrice(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      companyId: number;
      reason?: string;
      effectiveFrom?: string;
      adjustments: { productId: number; newPrice: number | string }[];
    }) => {
      const url = api.products.bulkAdjustPrice.path;
      const res = await apiFetch(url, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.message || "Failed to perform bulk price adjustment");
      }
      return await res.json();
    },
    onSuccess: async (data) => {
      if (Array.isArray(data?.updatedProducts) && data.updatedProducts.length > 0) {
        queryClient.setQueriesData(
          {
            predicate: (query) => {
              const [path, queryCompanyId] = query.queryKey;
              return path === api.products.list.path && queryCompanyId === companyId;
            },
          },
          (current: unknown) => {
            if (!Array.isArray(current)) return current;
            const updatedById = new Map(data.updatedProducts.map((product: any) => [product.id, product]));
            return current.map((product: any) => updatedById.get(product.id) || product);
          }
        );

        const cached = await getCachedProducts(companyId);
        if (cached?.length) {
          const updatedById = new Map(data.updatedProducts.map((product: any) => [product.id, product]));
          await cacheProducts(
            companyId,
            cached.map((product: any) => updatedById.get(product.id) || product)
          );
          await setLastCacheTime(companyId, Date.now());
        }
      }

      await refreshProductQueriesAsync(queryClient, companyId);
    },
  });
}
