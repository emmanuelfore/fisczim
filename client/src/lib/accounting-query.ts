import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * Accounting queries are keyed by endpoint + company so cached rows can never
 * leak between tenants. The resource path is always the first key element,
 * which also lets a single prefix invalidation refresh every accounting view.
 */
export function accountingKey(
  resource: string,
  companyId: number | null | undefined,
  ...extra: unknown[]
): [string, number, ...unknown[]] {
  return [`/api/accounting/${resource}`, companyId ?? 0, ...extra];
}

export async function fetchAccounting<T>(
  url: string,
  params?: Record<string, unknown>,
  init?: RequestInit,
): Promise<T> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  const res = await apiFetch(query ? `${url}?${query}` : url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body?.message || `Failed to load ${url}`);
  }
  return res.json() as Promise<T>;
}

/** Invalidate every accounting query for the current company and any variants. */
export function invalidateAccountingCache(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["/api/accounting"] });
}
