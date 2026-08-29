/**
 * The offline shell, versioned so it can die.
 *
 * The legacy worker survived three deploys because nothing in it ever
 * changed; this one carries a build stamp in its cache names, and on every
 * activation it deletes каждый cache that is not its own vintage. A deploy
 * rewrites the stamp, the browser sees new bytes, installs, skips waiting,
 * claims the clients and sweeps the old caches — death by version, by
 * construction.
 *
 * Caching policy, deliberately boring:
 *  - hashed build assets: cache-first (their names ARE their versions);
 *  - pages and API GETs: network-first, cache as the fallback for the
 *    basement where half of every shift is worked;
 *  - anything that is not GET: straight through, never cached — the offline
 *    QUEUE owns writes, and a cache pretending a PUT happened would be the
 *    silent merge this app refuses everywhere else.
 *
 * The push half is unchanged from the previous worker.
 */
const STAMP = '__BUILD__';
const SHELL = `shifter-shell-${STAMP}`;
const DATA = `shifter-data-${STAMP}`;

const SHELL_PATHS = ['/', '/dashboard/', '/login/', '/payouts/', '/stats/', '/bank/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);

      // Best-effort: an uncached page at install simply stays online-only.
      await Promise.allSettled(SHELL_PATHS.map((path) => cache.add(path)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) => key !== SHELL && key !== DATA)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Hashed forever-assets: the name is the version.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        if (cached) return cached;

        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(SHELL);

          void cache.put(request, response.clone());
        }

        return response;
      })(),
    );

    return;
  }

  // Auth is never cached: a token response replayed offline is a lie about
  // being signed in, and refresh must fail honestly.
  if (url.pathname.startsWith('/shifter/v1/auth/')) return;

  const isApi = url.pathname.startsWith('/shifter/v1/');
  const isPage = request.mode === 'navigate';

  if (!isApi && !isPage) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(isApi ? DATA : SHELL);

          void cache.put(request, response.clone());
        }

        return response;
      } catch {
        const cached = await caches.match(request, { ignoreVary: true });

        if (cached) return cached;

        // A page the shell never met: fall back to the calendar shell so
        // the app can boot and show its own offline state.
        if (isPage) {
          const shell = await caches.match('/dashboard/');

          if (shell) return shell;
        }

        throw new Error('offline and uncached');
      }
    })(),
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Shifter', body: '', url: '/dashboard' };

  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // An unreadable payload still deserves a notification shell.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? '/dashboard';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);

          return;
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});
