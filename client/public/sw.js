// FiscalStack Service Worker — deliberately minimal.
// IndexedDB + in-app code own ALL offline data/sync (POS works without this
// file doing anything clever). This worker exists only for three jobs:
//   1. Serve the app shell when the device has no connection (offline boot).
//   2. Retry queued sales in the background when connectivity returns.
//   3. Satisfy the PWA installability requirement (fetch handler present).
// App chunks (.js/.css) are content-hashed + served immutable by the server,
// so the browser HTTP cache — not this worker — keeps them consistent and
// available offline. Nothing here caches them, which removes the whole class
// of stale-chunk boot failures.
const CACHE_VERSION = 'v20';
const SHELL_CACHE = `fiscalstack-shell-${CACHE_VERSION}`;
const NAV_CACHE = `fiscalstack-nav-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  // Cache each URL independently — one offline/404 must not fail the install.
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.all(PRECACHE_URLS.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res && res.ok) await cache.put(url, res);
        } catch { /* offline install — activate anyway */ }
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== NAV_CACHE)
            .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', message: 'Offline mode active.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        // Only cache successful pages — never persist an error page as the
        // offline fallback, or every later offline visit serves the error.
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(NAV_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/'))
      )
    );
    return;
  }

  // Everything else (app chunks, images, fonts): straight to network.
  // Chunks are content-hashed + immutable, so the browser HTTP cache keeps
  // them consistent and available offline — no worker caching, no stale mix.
});

const DB_NAME = 'pos-offline';
const DB_VERSION = 10;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getAuthToken() {
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    if (clients.length === 0) return null;
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => resolve(null), 2000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data?.token ?? null);
      };
      clients[0].postMessage({ type: 'GET_AUTH_TOKEN' }, [channel.port2]);
    });
  } catch {
    return null;
  }
}

async function syncSales() {
  console.log('[SW] Starting background sync...');
  try {
    const token = await getAuthToken();
    if (!token) {
      console.warn('[SW] No auth token — skipping sync');
      return;
    }
    const db = await openDB();
    const tx = db.transaction('pendingSales', 'readwrite');
    const store = tx.objectStore('pendingSales');
    const sales = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!sales.length) {
      console.log('[SW] No pending sales.');
      return;
    }
    for (const sale of sales) {
      if (sale.status === 'syncing') continue;
      try {
        const response = await fetch('/api/invoices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Idempotency-Key': sale.idempotencyKey || `sw-${sale.id}-${Date.now()}`
          },
          body: JSON.stringify(sale.invoiceData),
        });
        if (response.ok) {
          await new Promise((resolve, reject) => {
            const req = store.delete(sale.id);
            req.onsuccess = resolve;
            req.onerror = reject;
          });
          console.log(`[SW] Synced sale ${sale.id}`);
        } else {
          console.warn(`[SW] Server rejected sale ${sale.id}: ${response.status}`);
        }
      } catch (err) {
        console.error(`[SW] Failed sale ${sale.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[SW] Sync error:', err);
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sales') {
    event.waitUntil(syncSales());
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});
