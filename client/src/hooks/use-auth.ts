import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, invalidateSessionCache } from "@/lib/api";
import { auth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { isElectron } from "@/lib/utils";
import { getIsOnline, setOnlineState } from "@/lib/online-state";

let authInitStarted = false;
let authInitDone = false;
const authInitListeners = new Set<(ready: boolean) => void>();
let lastUserInvalidateAt = 0;

const POS_STORAGE_TIMEOUT_MS = 2_500;
const AUTH_REQUEST_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), POS_STORAGE_TIMEOUT_MS);
    }),
  ]);
}

async function fetchCurrentUser() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    return await apiFetch("/api/user", { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

// IndexedDB belongs to the POS offline flow. Keep it out of the application
// startup path; these helpers run only after a cashier explicitly signs in.
async function getPosOfflineUsers() {
  const { getOfflineUsers } = await import("@/lib/offline-db");
  return withTimeout(getOfflineUsers(), "Offline terminal storage did not respond");
}

// If auth client already has a valid session from localStorage (cold reload while logged in),
// skip the async init wait entirely.
if (auth.isAuthenticated()) {
  authInitDone = true;
  authInitStarted = true;
}

function notifyAuthInitListeners() {
  for (const listener of authInitListeners) listener(authInitDone);
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // If offline, skip network auth initialization entirely. In Electron we keep
  // the short failsafe so the POS login route can take over.
  const startOffline = !isElectron() && !navigator.onLine;
  const [isAuthLoading, setIsAuthLoading] = useState(
    startOffline ? false : !authInitDone
  );

  useEffect(() => {
    // Offline on mount — mark auth as ready immediately so query runs against cache
    if (startOffline) {
      if (!authInitDone) {
        authInitDone = true;
        notifyAuthInitListeners();
      }
      return;
    }

    const listener = (ready: boolean) => setIsAuthLoading(!ready);
    authInitListeners.add(listener);
    listener(authInitDone);

    if (!authInitStarted) {
      authInitStarted = true;

      const failSafe = window.setTimeout(() => {
        if (authInitDone) return;
        console.warn("[Auth] Auth init timed out; continuing without blocking UI");
        authInitDone = true;
        notifyAuthInitListeners();
      }, isElectron() ? 1500 : 4000);

      // Listen to auth state changes from custom auth client
      const unsubscribe = auth.onAuthStateChange((user) => {
        window.clearTimeout(failSafe);
        if (!authInitDone) {
          authInitDone = true;
          notifyAuthInitListeners();
        }
        if (user) {
          const now = Date.now();
          if (now - lastUserInvalidateAt > 2000) {
            lastUserInvalidateAt = now;
            queryClient.invalidateQueries({ queryKey: ["/api/user"] });
          }
        }
      });

      // If auth client already has a user from localStorage (restored before this effect ran),
      // the listener above won't fire retroactively — resolve init immediately.
      if (!authInitDone && auth.isAuthenticated()) {
        window.clearTimeout(failSafe);
        authInitDone = true;
        notifyAuthInitListeners();
      }

      return () => {
        unsubscribe();
      };
    }

    return () => {
      authInitListeners.delete(listener);
    };
  }, [queryClient]);

  const userQuery = useQuery({
    queryKey: ["/api/user"],
    queryFn: async () => {
      // Do not open IndexedDB while the application is starting. POS opens its
      // own offline store after the user chooses the terminal login flow.
      if (!getIsOnline()) {
        return null;
      }

      try {
        const res = await fetchCurrentUser();
        if (res.status === 304) {
          const cachedFromQuery = queryClient.getQueryData(["/api/user"]);
          if (cachedFromQuery) return cachedFromQuery;
          return null;
        }
        if (res.status === 401) {
          return null;
        }
        if (!res.ok) {
          throw new Error("Network response was not ok");
        }
        const data = await res.json();
        const user = typeof data === "object" && data !== null && "user" in data ? data.user : data;
        return user;
      } catch (err) {
        console.warn("[Auth] User fetch failed; continuing to the sign-in screen", err);
        const cachedFromQuery = queryClient.getQueryData(["/api/user"]);
        if (cachedFromQuery) return cachedFromQuery;
        return null;
      }
    },
    enabled: !isAuthLoading,
    // Cache user for 30 min (token lifetime ~1hr). Only refetch on token refresh or manual invalidate.
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const loginWithGoogle = async () => {
    // Google OAuth not implemented in custom auth yet
    throw new Error("Google login not available with custom auth");
  };

  const loginWithPassword = async ({ email, password }: any) => {
    // Try online login first; fall back to offline credentials if network fails
    if (getIsOnline()) {
      try {
        const loginPromise = auth.login(email, password);
        const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Login request timed out")), 12000);
        });
        const data = await Promise.race([loginPromise, timeoutPromise]) as Awaited<ReturnType<typeof auth.login>>;

        if (data.user) {
          try { sessionStorage.removeItem('__electron_forced_logout'); } catch {}
          queryClient.setQueryData(["/api/user"], data.user);

          const isPosLogin = window.location.pathname.startsWith("/pos");
          // Only the POS flow prepares IndexedDB, and it never delays login.
          if (isPosLogin) {
            void import("@/lib/offline-db").then(({ saveOfflineCredentials }) =>
              saveOfflineCredentials(email, password, { ...data.user, sessionStatus: "offline_cached" }),
            ).then(() => warmOfflineCache(data.user)).catch(err =>
              console.warn("[Auth] Failed to prepare POS offline cache:", err),
            );
          }
        }
        return;
      } catch (err: any) {
        // The server RESPONDED with an HTTP error (wrong password, 500, …):
        // surface it. Only network-level failures (no response at all — the
        // error carries no HTTP status) fall through to offline credentials.
        // Otherwise we build a tokenless offline session that bounces straight
        // back to login with "session expired" on the first online request.
        if (typeof err?.status === "number") throw err;
        // Network error — fall through to offline path
        console.warn("[Auth] Online login unreachable, trying offline credentials:", err?.message);
      }
    }

    // Offline path
    const { verifyOfflineCredentials } = await import("@/lib/offline-db");
    const user = await withTimeout(
      verifyOfflineCredentials(email, password),
      "Offline terminal storage did not respond",
    );
    if (!user) {
      throw new Error("Invalid credentials or no offline profile cached");
    }

    console.log("[Auth] Offline verification successful");
    try { sessionStorage.removeItem('__electron_forced_logout'); } catch {}

    // Restore selectedCompanyId BEFORE setting user in query cache
    const storedId = localStorage.getItem("selectedCompanyId");
    if (!storedId || storedId === "0") {
      const { getCachedCompaniesList } = await import("@/lib/offline-db");
      const cachedCompanies = await withTimeout(
        getCachedCompaniesList(user.id),
        "Offline terminal storage did not respond",
      );
      if (cachedCompanies && cachedCompanies.length > 0) {
        const best =
          cachedCompanies.find((c: any) => c.role === "owner") ||
          cachedCompanies.find((c: any) => c.role === "cashier") ||
          cachedCompanies[0];
        localStorage.setItem("selectedCompanyId", String(best.id));
        console.log("[Auth] Offline — restored selectedCompanyId:", best.id);
      }
    }

    queryClient.setQueryData(["/api/user"], user);

    if (!authInitDone) {
      authInitDone = true;
      notifyAuthInitListeners();
    }
  };

  const loginWithOfflinePin = async ({ email, pin }: { email: string; pin: string }) => {
    if (getIsOnline()) {
      throw new Error("Online logins must use passwords, not PINs.");
    }
    const { verifyOfflinePinCredentials } = await import("@/lib/offline-db");
    const user = await withTimeout(
      verifyOfflinePinCredentials(email, pin),
      "Offline terminal storage did not respond",
    );
    if (!user) {
      throw new Error("Invalid PIN or no offline profile cached");
    }

    console.log("[Auth] Offline PIN verification successful");
    try { sessionStorage.removeItem('__electron_forced_logout'); } catch {}

    // Restore selectedCompanyId
    const storedId = localStorage.getItem("selectedCompanyId");
    if (!storedId || storedId === "0") {
      const { getCachedCompaniesList } = await import("@/lib/offline-db");
      const cachedCompanies = await withTimeout(
        getCachedCompaniesList(user.id),
        "Offline terminal storage did not respond",
      );
      if (cachedCompanies && cachedCompanies.length > 0) {
        const best =
          cachedCompanies.find((c: any) => c.role === "owner") ||
          cachedCompanies.find((c: any) => c.role === "cashier") ||
          cachedCompanies[0];
        localStorage.setItem("selectedCompanyId", String(best.id));
      }
    }

    queryClient.setQueryData(["/api/user"], user);
    if (!authInitDone) {
      authInitDone = true;
      notifyAuthInitListeners();
    }
  };

  async function warmOfflineCache(_user: any) {
    const { cacheCompaniesList, cacheCompanySettings, cacheProducts, cacheCustomers, cacheCurrencies, cacheTaxConfig, setLastCacheTime } = await import("@/lib/offline-db");

    const companiesRes = await apiFetch("/api/companies");
    if (!companiesRes.ok) return;
    const companies = await companiesRes.json();
    await cacheCompaniesList(companies, _user?.id);

    if (!localStorage.getItem("selectedCompanyId") || localStorage.getItem("selectedCompanyId") === "0") {
      const best = companies.find((c: any) => c.role === "owner") ||
                   companies.find((c: any) => c.role === "cashier") ||
                   companies[0];
      if (best) localStorage.setItem("selectedCompanyId", String(best.id));
    }

    for (const company of companies) {
      const cid = company.id;
      try { await cacheCompanySettings(cid, company); } catch {}

      const [prodRes, custRes, currRes, taxRes, salesRes] = await Promise.allSettled([
        apiFetch(`/api/companies/${cid}/products`),
        apiFetch(`/api/companies/${cid}/customers`),
        apiFetch(`/api/companies/${cid}/currencies`),
        apiFetch(`/api/tax/types?companyId=${cid}`),
        apiFetch(`/api/pos/my-sales?companyId=${cid}&includeItems=true`)
      ]);

      if (prodRes.status === "fulfilled" && prodRes.value.ok) {
        await cacheProducts(cid, await prodRes.value.json());
        await setLastCacheTime(cid, Date.now());
      }
      if (custRes.status === "fulfilled" && custRes.value.ok) {
        await cacheCustomers(cid, await custRes.value.json());
      }
      if (currRes.status === "fulfilled" && currRes.value.ok) {
        await cacheCurrencies(cid, await currRes.value.json());
      }
      if (taxRes.status === "fulfilled" && taxRes.value.ok) {
        const types = await taxRes.value.json();
        const existing = (await import("@/lib/offline-db").then(m => m.getCachedTaxConfig(cid))) || {};
        await cacheTaxConfig(cid, { ...existing, types });
      }
      if (salesRes.status === "fulfilled" && salesRes.value.ok) {
        const { addSalesHistory } = await import("@/lib/offline-db");
        await addSalesHistory(cid, await salesRes.value.json());
      }
    }
    console.log("[Auth] Offline cache warmed for", companies.length, "company/companies");
  }

  const registerWithPassword = async ({ email, password, name }: any) => {
    const data = await auth.register(email, password, name);
    if (data.user) {
      queryClient.setQueryData(["/api/user"], data.user);
    }
    return data;
  };

  const logout = async () => {
    // Clear the in-memory application session. POS records and credentials are
    // intentionally retained for its separate offline-login flow.
    queryClient.clear();
    localStorage.removeItem("selectedCompanyId");
    localStorage.removeItem("selectedBranchId");

    // Invalidate session cache so next apiFetch calls fresh getSession
    invalidateSessionCache();

    // Mark auth as done so the login page never shows a spinner.
    // Do NOT reset authInitStarted — resetting it causes a second subscription
    // to race with the existing one, which can deadlock the login page offline.
    authInitDone = true;
    notifyAuthInitListeners();

    if (getIsOnline()) {
      try { await auth.logout(); } catch { /* ignore network errors */ }
    }

    setLocation(isElectron() ? "/pos-login" : "/auth");

    if (!getIsOnline()) {
      toast({
        title: "Logged Out",
        description: "You can log back in with your cached credentials.",
      });
    }
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    await auth.changePassword(currentPassword, newPassword);
    const res = await apiFetch("/api/user/password", {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
    if (!res.ok) console.warn("Failed to sync password change status with backend");
    queryClient.invalidateQueries({ queryKey: ["/api/user"] });
  };

  const updateProfile = async (data: { name: string }) => {
    const res = await apiFetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to update profile" }));
      throw new Error(err.message || "Failed to update profile");
    }
    const updatedUser = await res.json();
    queryClient.setQueryData(["/api/user"], updatedUser);
    return updatedUser;
  };

  return {
    user: userQuery.data ?? null,
    isLoading: isAuthLoading || (userQuery.isPending && userQuery.fetchStatus !== "idle"),
    loginWithGoogle,
    loginWithPassword,
    loginWithOfflinePin,
    getOfflineUsers: getPosOfflineUsers,
    registerWithPassword,
    logout,
    updatePassword,
    updateProfile,
  };
}
