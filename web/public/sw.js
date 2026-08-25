/**
 * Two jobs, both small. First, keep retiring the old offline-first worker:
 * on activate every cache is dropped, so nothing stale can ever be served
 * again — and there is deliberately no fetch handler here. Second, show
 * push notifications: the server sends {title, body, url} and a click
 * focuses the app on that page.
 *
 * Unlike the pure killer this worker stays registered — push needs a living
 * registration — but for browsers that never enable notifications the app
 * still unregisters it on boot, which keeps the old behaviour.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
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
