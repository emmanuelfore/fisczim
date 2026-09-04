import { supabase } from "./supabase";
import { ENV } from "./env";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function joinUrl(base: string, path: string) {
  if (!base) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

import { getSelectedBranchId } from "./storage";

// ── In-memory Session Cache for Offline-First Speed ──
let cachedSession: any = null;
let sessionInitialized = false;

if (supabase) {
  // 1. Kick off an initial session fetch
  supabase.auth.getSession().then(({ data }) => {
    cachedSession = data?.session ?? null;
    sessionInitialized = true;
  }).catch(() => {
    sessionInitialized = true;
  });

  // 2. Keep the cache perfectly synced with auth events (login, logout, token refresh)
  supabase.auth.onAuthStateChange((event, session) => {
    cachedSession = session;
    sessionInitialized = true;
  });
}

export async function apiFetch(path: string, init?: RequestInit & { timeout?: number }) {
  let session = null;
  let branchId = null;
  
  // Skip session check for health endpoint to speed up online detection
  if (path !== "/api/health") {
    try {
      // Always get a fresh session for write operations to ensure valid token
      const isWriteOperation = init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method);
      
      if (supabase) {
        if (isWriteOperation || !sessionInitialized || !cachedSession) {
          // For write ops or if cache not ready, force a fresh session with refresh
          const sessionResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise<{ data: { session: null } }>((resolve) => setTimeout(() => resolve({ data: { session: null } }), 5000))
          ]).catch(() => ({ data: { session: null } }));
          session = sessionResult?.data?.session ?? null;
          
          // If session is null or expired, try to refresh it
          if (!session || !session.access_token) {
            console.warn("[API] No valid session, attempting refresh...");
            try {
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {
                console.error("[API] Session refresh failed:", refreshError.message);
                // Try to get current user to trigger implicit refresh
                const { data: userData } = await supabase.auth.getUser();
                session = userData?.user ? await supabase.auth.getSession().then(s => s.data.session) : null;
              } else {
                session = refreshData.session;
                console.log("[API] Session refreshed successfully");
              }
            } catch (refreshErr) {
              console.error("[API] Session refresh exception:", refreshErr);
            }
          }
          
          if (session) {
            cachedSession = session;
            sessionInitialized = true;
          }
        } else {
          session = cachedSession;
        }
      }
      
      // Get branch ID for scoping
      branchId = await getSelectedBranchId();
    } catch (e) {
      console.warn("[API] Context fetch failed:", e);
    }
  }


  const headers = new Headers(init?.headers);

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  if (branchId) {
    headers.set("X-Branch-ID", branchId.toString());
  }

  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const timeoutMs = init?.timeout ?? 15000;
  
  // AbortController is polyfilled globally in polyfills.ts for older devices
  const controller = init?.signal ? null : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const url = joinUrl(ENV.apiBaseUrl, path);
    // console.log(`[API] Fetching ${url}...`);
    const response = await fetch(url, {
      ...init,
      headers,
      signal: init?.signal ?? (controller ? controller.signal : undefined)
    });
    
    // If we get a 401, try to refresh session and retry once
    if (response.status === 401 && supabase) {
      console.warn("[API] Got 401, attempting session refresh and retry...");
      try {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error("[API] Session refresh on 401 failed:", refreshError.message);
        } else if (refreshData.session) {
          cachedSession = refreshData.session;
          sessionInitialized = true;
          // Retry with fresh token
          const retryHeaders = new Headers(init?.headers);
          retryHeaders.set("Authorization", `Bearer ${refreshData.session.access_token}`);
          if (branchId) retryHeaders.set("X-Branch-ID", branchId.toString());
          if (init?.body && !(init.body instanceof FormData) && !retryHeaders.has("Content-Type")) {
            retryHeaders.set("Content-Type", "application/json");
          }
          console.log("[API] Retrying request with refreshed token...");
          return await fetch(url, {
            ...init,
            headers: retryHeaders,
            signal: init?.signal ?? (controller ? controller.signal : undefined)
          });
        }
      } catch (retryErr) {
        console.error("[API] Retry after 401 failed:", retryErr);
      }
    }
    
    return response;
  } catch (e: any) {
    if (e.name === 'AbortError' || e.message === 'Aborted') {
      console.debug(`[API] Request aborted: ${path}`);
    } else {
      console.error(`[API] Fetch error for ${path}:`, e.message || e);
    }
    throw e;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function apiJson<T = Json>(path: string, init?: RequestInit & { timeout?: number }): Promise<T> {
  try {
    const res = await apiFetch(path, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[API] Request to ${path} failed with ${res.status}:`, text);
      
      let errorMsg = text || `Request failed (${res.status})`;
      try {
        const json = JSON.parse(text);
        if (json.message) errorMsg = json.message;
        else if (json.error) errorMsg = typeof json.error === 'string' ? json.error : errorMsg;
      } catch(e) {}
      
      if (res.status === 401) {
        // Check if session is completely invalid (refresh token also expired)
        if (!cachedSession || !cachedSession.access_token) {
          throw new Error("Your session has expired. Please log out and log back in to continue.");
        }
        throw new Error("Authentication failed. Please check your connection and try again.");
      }
      throw new Error(errorMsg);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e.message === "Aborted" || e.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection.");
    }
    if (e.message?.includes("Network request failed")) {
      const url = joinUrl(ENV.apiBaseUrl, path);
      console.error(`[API] Network failure while reaching ${url}. Check SSL, firewall, or device connection.`);
      throw new Error(`Connection error: Unable to reach server. Please ensure you have an active internet connection.`);
    }
    throw e;
  }
}
