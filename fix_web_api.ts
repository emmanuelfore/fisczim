import fs from 'fs';
const file = './client/src/lib/api.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace the old caching mechanism with the new synchronous one
const oldCacheRegex = /\/\/ Cache session to avoid calling supabase\.auth\.getSession\(\) on every request[\s\S]*?export async function apiFetch\(input: RequestInfo \| URL, init\?: RequestInit\): Promise<Response> \{/;

const newCacheCode = `// ── Synchronous Session Cache ──
let cachedSession: any = null;
let sessionInitialized = false;

// 1. Initial fetch
supabase.auth.getSession().then(({ data }) => {
    cachedSession = data?.session ?? null;
    sessionInitialized = true;
}).catch(() => {
    sessionInitialized = true;
});

// 2. Keep sync
supabase.auth.onAuthStateChange((event, session) => {
    cachedSession = session;
    sessionInitialized = true;
});

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {`;

content = content.replace(oldCacheRegex, newCacheCode);

// Replace getCachedSession call inside apiFetch
const oldSessionCall = `    const session = await getCachedSession();`;
const newSessionCall = `    let session = null;
    if (!sessionInitialized) {
        const sessionResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise<{ data: { session: null } }>((resolve) => setTimeout(() => resolve({ data: { session: null } }), 2000))
        ]).catch(() => ({ data: { session: null } }));
        session = sessionResult?.data?.session ?? null;
    } else {
        session = cachedSession;
    }`;

content = content.replace(oldSessionCall, newSessionCall);

// Remove the old invalidate functions at the end of the file
const oldInvalidate = `/** Invalidate cached session (call on token refresh or logout) */
export function invalidateSessionCache() {
    cachedSession = null;
    sessionPromise = null;
}

// Invalidate session cache when Supabase token is refreshed
supabase.auth.onAuthStateChange((event) => {
    if (event === "TOKEN_REFRESHED") {
        invalidateSessionCache();
    }
});`;

content = content.replace(oldInvalidate, "");

fs.writeFileSync(file, content);
