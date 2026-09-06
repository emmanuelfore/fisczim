import { auth } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ── Synchronous Session Cache ──
let cachedSession: any = null;
let sessionInitialized = false;

// 1. Initial fetch from custom auth/localStorage
const customToken = auth.getAccessToken() || localStorage.getItem('access_token');
if (customToken) {
    cachedSession = { access_token: customToken };
    sessionInitialized = true;
} else {
    sessionInitialized = true;
}

export async function getCachedSession(): Promise<{ access_token: string; expires_at?: number } | null> {
    const customToken = auth.getAccessToken() || localStorage.getItem('access_token');
    if (customToken) {
        return { access_token: customToken };
    }
    
    return cachedSession;
}

export function invalidateSessionCache() {
    cachedSession = null;

    // Do NOT reset sessionInitialized to false here, as we don't want to re-trigger getSession races on logout
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let session = await getCachedSession();

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
        const response = await fetch(url, {
            ...init,
            headers,
            signal: init?.signal ?? controller?.signal,
        });

        if (response.status === 401 && !url.toString().includes('/api/auth/login')) {
            console.warn('[apiFetch] 401 Unauthorized - clearing token');
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            invalidateSessionCache();
        }

        return response;
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
