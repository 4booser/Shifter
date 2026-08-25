/**
 * The previous client shipped an offline-first service worker that cached the
 * whole shell. This one exists to retire it: same URL, so the old worker's
 * update check finds it, installs it, and hands over — at which point every
 * cache is dropped and the worker removes itself. Browsers that never had the
 * old worker never register this one.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();

      const clients = await self.clients.matchAll({ type: 'window' });

      // A reload frees each open tab from the dead worker immediately.
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
