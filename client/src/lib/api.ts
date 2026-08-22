import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Cache session to avoid calling supabase.auth.getSession() on every request
let cachedSession: { access_token: string; expires_at: number } | null = null;
let sessionPromise: Promise<{ access_token: string; expires_at: number } | null> | null = null;

export async function getCachedSession(): Promise<{ access_token: string; expires_at: number } | null> {
    // Return cached session if still valid (with 5 min buffer)
    if (cachedSession && cachedSession.expires_at > Date.now() + 300000) {
        return cachedSession;
    }

    // Deduplicate concurrent getSession calls
    if (sessionPromise) {
        return sessionPromise;
    }

    sessionPromise = (async () => {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session ?? null;
            if (session?.access_token) {
                cachedSession = {
                    access_token: session.access_token,
                    expires_at: session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000
                };
                return cachedSession;
            }
            return null;
        } catch (e) {
            console.warn("[apiFetch] getSession failed:", e);
            return null;
        } finally {
            sessionPromise = null;
        }
    })();

    return sessionPromise;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const session = await getCachedSession();

    const headers = new Headers(init?.headers);

    if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
    }

    if (!(init?.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    // Prepend API_BASE for relative paths (e.g. /api/...)
    const url = typeof input === "string" && input.startsWith("/")
        ? `${API_BASE}${input}`
        : input;

    // multi-branch support: inject current branch ID if available
    const branchId = localStorage.getItem("selectedBranchId");
    const companyId = localStorage.getItem("selectedCompanyId");
    if (branchId) {
        headers.set("X-Branch-ID", branchId);
    }
    if (companyId) {
        headers.set("X-Company-ID", companyId);
    }

    const controller = (init?.signal || typeof AbortController === 'undefined') ? null : new AbortController();
    const timeoutId = (controller && typeof window !== 'undefined') ? window.setTimeout(() => {
        console.warn(`[apiFetch] Request to ${url} timed out after 120s - aborting.`);
        try {
            controller.abort("TIMEOUT");
        } catch (e) {
            controller.abort();
        }
    }, 120000) : null;

    try {
        return await fetch(url, {
            ...init,
            headers,
            signal: init?.signal ?? controller?.signal,
        });
    } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
    }
}

/** Helper to update selected branch in storage */
export function setSelectedBranchId(id: number | null) {
    if (id) {
        localStorage.setItem("selectedBranchId", id.toString());
    } else {
        localStorage.removeItem("selectedBranchId");
    }
}

/** Invalidate cached session (call on token refresh or logout) */
export function invalidateSessionCache() {
    cachedSession = null;
    sessionPromise = null;
}

// Invalidate session cache when Supabase token is refreshed
supabase.auth.onAuthStateChange((event) => {
    if (event === "TOKEN_REFRESHED") {
        invalidateSessionCache();
    }
});
