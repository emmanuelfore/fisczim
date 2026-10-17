import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, buildUrl } from "@shared/routes";
import { type InsertCompany, type Company } from "@shared/schema";
import { apiFetch } from "@/lib/api";
import { cacheCompaniesList, getCachedCompaniesList, cacheCompanySettings, getCachedCompanySettings } from "@/lib/offline-db";
import { getIsOnline } from "@/lib/online-state";

// Super-admin accounts can legitimately receive a large company list. Eight
// seconds was shorter than a healthy local query (about nine seconds), which
// turned a successful response into a permanent client-side loading state.
// Measured p95 on the remote link is ~17s (each DB round-trip costs seconds),
// so allow 30s before giving up; the server keeps working past this anyway.
const COMPANY_LOAD_TIMEOUT_MS = 30_000;

function withCompanyLoadTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Company list request timed out")),
        COMPANY_LOAD_TIMEOUT_MS,
      );
    }),
  ]);
}

export function useCompanies(
  enabled: boolean = true,
  userScopeKey: string | number | null = null,
) {
  // Record why the last attempt failed. React Query can end up reporting
  // isError with a null error (a rejected-with-undefined queryFn), which makes
  // "Company list could not be loaded" undiagnosable. Capturing the reason at
  // the failure site keeps it reliable regardless of what the cache does with
  // the error value.
  const failureReasonRef = useRef<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [api.companies.list.path, userScopeKey ?? "anon"],
    queryFn: () => withCompanyLoadTimeout((async () => {
      if (!getIsOnline()) {
        const cached = await getCachedCompaniesList(userScopeKey);
        if (cached && cached.length > 0) return cached;
        throw new Error("Offline and no cached companies available");
      }
      try {
        const res = await apiFetch(api.companies.list.path);
        if (res.status === 401) {
          throw new Error("Unauthorized while fetching companies (HTTP 401)");
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Company list request failed: HTTP ${res.status}${body ? ` - ${body.slice(0, 200)}` : ""}`);
        }
        const companies = api.companies.list.responses[200].parse(await res.json());
        if (!Array.isArray(companies)) {
          throw new Error(`Company list response was ${companies === null ? "null" : typeof companies}, expected an array`);
        }
        // POS storage is useful offline, but it must never hold the primary
        // application route in a loading state.
        if (companies) {
          void cacheCompaniesList(companies, userScopeKey).catch((error) =>
            console.warn("Could not update POS company cache:", error),
          );
        }
        return companies;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "unknown error");
        failureReasonRef.current = reason;
        setFailureReason(reason);
        console.error("[useCompanies] company list load failed:", reason);
        throw err instanceof Error ? err : new Error(reason);
      }
    })()),
    enabled,
    retry: 1,
    retryDelay: 1_000,
  });

  return { ...query, failureReason };
}

export function useCompany(id: number) {
  return useQuery({
    queryKey: [api.companies.get.path, id],
    queryFn: async () => {
      if (!getIsOnline()) {
        const cached = await getCachedCompanySettings(id);
        if (cached) return cached;
        const list = await getCachedCompaniesList();
        return list?.find((c: any) => c.id === id) ?? null;
      }
      try {
        const url = buildUrl(api.companies.get.path, { id });
        const res = await apiFetch(url);
        if (res.status === 401) {
          const cached = await getCachedCompanySettings(id);
          if (cached) return cached;
          const list = await getCachedCompaniesList();
          return list?.find((c: any) => c.id === id) ?? null;
        }
        if (!res.ok) throw new Error("Failed to fetch company");
        const company = api.companies.get.responses[200].parse(await res.json());
        if (id) await cacheCompanySettings(id, company);
        return company;
      } catch (err) {
        console.warn("Company fetch failed, trying offline cache...", err);
        const cached = await getCachedCompanySettings(id);
        if (cached) return cached;
        const list = await getCachedCompaniesList();
        return list?.find((c: any) => c.id === id) ?? null;
      }
    },
    enabled: !!id,
    retry: false,
    staleTime: 0,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertCompany) => {
      const res = await apiFetch(api.companies.create.path, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to create company");
      }
      return api.companies.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.companies.list.path] });
    },
  });
}

export function useUpdateCompany(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<InsertCompany>) => {
      const res = await apiFetch(`/api/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to update company");
      }
      return await res.json() as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.companies.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.companies.get.path, id] });
    },
  });
}
