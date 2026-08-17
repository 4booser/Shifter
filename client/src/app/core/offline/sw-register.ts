import { Service, signal } from '@angular/core';

/**
 * Registers the worker and tells the app when a newer build is sitting in the
 * wings. Nothing reloads on its own: swapping the bundle under someone who is
 * halfway through entering a day would lose what they typed.
 */
@Service()
export class ServiceWorkerHost {
  /** True once a new version has installed and is waiting to take over. */
  readonly updateReady = signal(false);

  readonly supported = 'serviceWorker' in navigator;

  private waiting: ServiceWorker | null = null;

  register(): void {
    if (!this.supported) return;

    // After load: registering during startup competes with the very requests
    // the first paint is waiting on.
    addEventListener('load', () => {
      void navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (registration.waiting !== null) this.markReady(registration.waiting);

          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;

            if (installing === null) return;

            installing.addEventListener('statechange', () => {
              // "installed" with a controller present means an update, not a
              // first install.
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                this.markReady(installing);
              }
            });
          });
        })
        .catch(() => undefined);
    });
  }

  /** Applies the waiting version and reloads, at a moment the user chose. */
  applyUpdate(): void {
    if (this.waiting === null) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });

    this.waiting.postMessage({ type: 'skip-waiting' });
  }

  /** Asks the worker to raise a notification; it owns the timer, not the tab. */
  notify(title: string, body: string): void {
    if (!this.supported) return;

    void navigator.serviceWorker.ready.then((registration) =>
      registration.active?.postMessage({ type: 'remind', title, body }),
    );
  }

  private markReady(worker: ServiceWorker): void {
    this.waiting = worker;
    this.updateReady.set(true);
  }
}
