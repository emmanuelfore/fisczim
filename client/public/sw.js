const CACHE_VERSION = 'v15';
const STATIC_CACHE = `fiscalstack-static-${CACHE_VERSION}`;
const NAV_CACHE = `fiscalstack-nav-${CACHE_VERSION}`;
const FONT_CACHE = `fiscalstack-fonts-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== NAV_CACHE && k !== FONT_CACHE)
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

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(NAV_CACHE).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/'))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.woff2'))) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

const DB_NAME = 'pos-offline';
const DB_VERSION = 5;

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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
