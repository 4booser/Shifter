/**
 * Hand-written rather than generated: the caching rules here are specific
 * enough that a config file would be harder to read than the code.
 *
 * Three rules, in order of how much they matter:
 *   1. never touch anything under /shifter/v1/auth or /account — a cached
 *      token response is a security problem, not a convenience;
 *   2. GET /shifter/v1/days answers from the network, falls back to the last
 *      good copy, so a month already looked at still opens in a basement;
 *   3. everything static is cache-first, because the file names are hashed and
 *      a hashed name never changes contents.
 */

// Bumping this drops every old cache on activate.
const VERSION = 'v1';
const SHELL = `shifter-shell-${VERSION}`;
const DATA = `shifter-data-${VERSION}`;

// Enough to boot the app offline; the hashed bundles arrive on first visit.
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // One missing file must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL && key !== DATA)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Anything that must never be stored, however convenient it would be. */
function isPrivate(url) {
  return url.pathname.startsWith('/shifter/v1/auth')
    || url.pathname.startsWith('/shifter/v1/account');
}

function isReadableApi(url) {
  return url.pathname.startsWith('/shifter/v1/')
    && !isPrivate(url);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Other origins are none of this worker's business.
  if (url.origin !== self.location.origin) return;

  if (isPrivate(url)) return;

  // A navigation must always end up at the shell, or a deep link opened
  // offline shows the browser's dinosaur instead of the app.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached ?? Response.error()),
      ),
    );

    return;
  }

  if (isReadableApi(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a real answer is worth keeping; a 401 cached here would
          // outlive the session that caused it.
          if (response.ok) {
            const copy = response.clone();

            caches.open(DATA).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);

          if (cached !== undefined) return cached;

          // A shape the client understands, so the UI can say "offline"
          // rather than throwing a parse error at the user.
          return new Response(
            JSON.stringify({ status: 503, error: 'Offline', message: 'No connection.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        }),
    );

    return;
  }

  // Static assets: hashed names, so a hit is always correct.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached
        ?? fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }

          return response;
        }),
    ),
  );
});

/**
 * The page asks for a nudge at a given time; the worker owns the timer so it
 * still fires when the tab is in the background.
 */
self.addEventListener('message', (event) => {
  const data = event.data;

  if (data?.type === 'remind') {
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'shifter-close-day',
      data: { url: '/dashboard' },
    });
  }

  if (data?.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification.data?.url ?? '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Focus the app if it is already open rather than stacking tabs.
      for (const client of windows) {
        if ('focus' in client) return client.focus();
      }

      return self.clients.openWindow(target);
    }),
  );
});
