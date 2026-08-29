import fs from 'fs';
const file = './mobile/src/lib/api.ts';
let content = fs.readFileSync(file, 'utf8');

const sessionInitCode = `import { getSelectedBranchId } from "./storage";

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

export async function apiFetch(path: string, init?: RequestInit & { timeout?: number }) {`;

// Replace the imports and function signature
content = content.replace(
  `import { getSelectedBranchId } from "./storage";

export async function apiFetch(path: string, init?: RequestInit & { timeout?: number }) {`,
  sessionInitCode
);

const oldSessionFetch = `  // Skip session check for health endpoint to speed up online detection
  if (path !== "/api/health") {
    try {
      if (supabase) {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: any } }>((_, reject) =>
            setTimeout(() => reject(new Error("Network delay: Unable to verify session in time. Please check your connection.")), 8000)
          )
        ]);
        session = sessionResult?.data?.session ?? null;
      }
      
      // Get branch ID for scoping
      branchId = await getSelectedBranchId();
    } catch (e) {
      console.warn("[API] Context fetch failed:", e);
    }
  }`;

const newSessionFetch = `  // Skip session check for health endpoint to speed up online detection
  if (path !== "/api/health") {
    try {
      // If the cache isn't ready yet (e.g., app just launched), wait up to 2 seconds.
      // After initialization, this is completely synchronous and cannot hang!
      if (supabase && !sessionInitialized) {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) => setTimeout(() => resolve({ data: { session: null } }), 2000))
        ]).catch(() => ({ data: { session: null } }));
        session = sessionResult?.data?.session ?? null;
      } else {
        session = cachedSession;
      }
      
      // Get branch ID for scoping
      branchId = await getSelectedBranchId();
    } catch (e) {
      console.warn("[API] Context fetch failed:", e);
    }
  }`;

content = content.replace(oldSessionFetch, newSessionFetch);

fs.writeFileSync(file, content);
