import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCachedSession } from "./api";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const session = await getCachedSession();
  const branchId = localStorage.getItem("selectedBranchId");
  const companyId = localStorage.getItem("selectedCompanyId");
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  if (branchId) {
    headers["X-Branch-ID"] = branchId;
  }
  if (companyId) {
    headers["X-Company-ID"] = companyId;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const session = await getCachedSession();
    const branchId = localStorage.getItem("selectedBranchId");
    const companyId = localStorage.getItem("selectedCompanyId");
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    if (branchId) {
      headers["X-Branch-ID"] = branchId;
    }
    if (companyId) {
      headers["X-Company-ID"] = companyId;
    }

    let url = String(queryKey[0]);
    const searchParams = new URLSearchParams();
    for (const part of queryKey.slice(1)) {
      if (part && typeof part === "object" && !Array.isArray(part)) {
        for (const [key, value] of Object.entries(part as Record<string, unknown>)) {
          if (value !== undefined && value !== null && value !== "") {
            searchParams.set(key, value instanceof Date ? value.toISOString() : String(value));
          }
        }
      } else if (part !== undefined && part !== null && part !== "") {
        url += `/${encodeURIComponent(String(part))}`;
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `${url.includes("?") ? "&" : "?"}${qs}`;

    const res = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
