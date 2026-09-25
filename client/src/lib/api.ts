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

const COMPANY_PATH = /^\/api\/companies\/(\d+)(?:\/|$)/;

/**
 * A 403 for the currently selected company means the browser is holding an
 * old company selection (for example after a user's access was changed in a
 * different session).  Authentication is still valid, so do not log the user
 * out.  Clear only that stale selection and let the active-company hook select
 * from the freshly authorized company list.
 */
export function recoverFromStaleCompanyAccess(url: string, status: number) {
    if (status !== 403 || typeof window === "undefined") return;

    let pathname: string;
    try {
        pathname = new URL(url, window.location.origin).pathname;
    } catch {
        return;
    }

    const companyId = COMPANY_PATH.exec(pathname)?.[1];
    if (!companyId || localStorage.getItem("selectedCompanyId") !== companyId) return;

    localStorage.removeItem("selectedCompanyId");
    localStorage.removeItem("selectedBranchId");
    window.dispatchEvent(new CustomEvent("company-access-denied", {
        detail: { companyId: Number(companyId) },
    }));
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

        recoverFromStaleCompanyAccess(url.toString(), response.status);

        const urlStr = url.toString();
        const isAuthEndpoint = urlStr.includes('/api/auth/');
        const alreadyRetried = (init as any)?._authRetried === true;
        // Don't cascade 401s from upstream fiscal authority endpoints — those are
        // ZIMRA/Lekuka server rejections, NOT our auth system failing.
        const isFiscalProxy = urlStr.includes('/zimra/') || urlStr.includes('/lekuka/');

        // 401 received: silently try ONE token refresh then retry the original request.
        // Never retry auth endpoints themselves, never retry fiscal proxy 401s, and never retry more than once.
        if (response.status === 401 && !isAuthEndpoint && !alreadyRetried && !isFiscalProxy) {
            let refreshSucceeded = false;
            try {
                const refreshed = await auth.refreshTokens();
                if (refreshed?.accessToken) {
                    refreshSucceeded = true;
                    if (timeoutId) window.clearTimeout(timeoutId);
                    return apiFetch(input, { ...init, _authRetried: true } as any);
                }
            } catch {
                // Fall through — refresh failed, session is dead.
            }

            if (!refreshSucceeded) {
                // Only destroy the session when it is definitively dead: no usable
                // tokens remain in memory or storage (a rejected refresh token clears
                // them via auth.logout()). Transient refresh failures (network/5xx)
                // keep the existing tokens — wiping them turns a momentary blip
                // into a forced logout right after auth.
                let stillHaveTokens = false;
                try {
                    stillHaveTokens = !!auth.getAccessToken() || !!localStorage.getItem('access_token');
                } catch { stillHaveTokens = !!auth.getAccessToken(); }
                if (!stillHaveTokens) {
                    // Refresh token is dead (or missing) — clear session and redirect to login.
                    console.warn('[apiFetch] 401 and no usable tokens remain — clearing session');
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('auth_user');
                    try { const { clearCachedUser } = await import('./offline-db'); await clearCachedUser(); } catch {}
                    invalidateSessionCache();
                    try { sessionStorage.setItem('auth_bounce_reason', 'session-expired'); } catch {}
                    if (typeof window !== 'undefined' && !(window as any).__authRedirecting) {
                        const isElectron = !!(window as any).electronAPI?.isElectron || window.navigator.userAgent.toLowerCase().includes('electron/');
                        const path = window.location.pathname;
                        const isAuthRoute = path.includes('/auth');
                        const isPosLoginRoute = path === '/pos-login' || path.startsWith('/pos-login');
                        const isPublicRoute = path === '/' || path === '' || path.startsWith('/auth') || path.startsWith('/forgot-password') || path.startsWith('/reset-password');
                        if (isElectron) {
                            if (!isPosLoginRoute && !isPublicRoute) {
                                (window as any).__authRedirecting = true;
                                window.location.href = '/pos-login';
                            }
                        } else if (!isAuthRoute && !isPublicRoute) {
                            (window as any).__authRedirecting = true;
                            window.location.href = '/auth?reason=session-expired';
                        }
                    }
                } else {
                    console.warn('[apiFetch] 401 but usable tokens remain — leaving session intact');
                }
            }
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
