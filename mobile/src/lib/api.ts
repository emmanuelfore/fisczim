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

export async function apiFetch(path: string, init?: RequestInit & { timeout?: number }) {
  let session = null;
  let branchId = null;
  
  // Skip session check for health endpoint to speed up online detection
  if (path !== "/api/health") {
    try {
      if (supabase) {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 10000)
          )
        ]);
        session = sessionResult?.data?.session ?? null;
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
    return await fetch(url, {
      ...init,
      headers,
      signal: init?.signal ?? (controller ? controller.signal : undefined)
    });
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
      throw new Error(text || `Request failed (${res.status})`);
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
