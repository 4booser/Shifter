'use client';

import { useEffect, useState } from 'react';

import { reportCollectedErrors } from '@/lib/diagnostics/report';
import { bindSettingsToDocument } from '@/lib/settings/store';

/**
 * Client-side start-up: binds the settings store to the document (theme,
 * accent, radius, motion) and retires any service worker left by the previous
 * client. The old worker cached the whole shell offline-first; without this,
 * browsers that carry it would keep serving the retired app forever.
 */
export function Boot({ children }: { children: React.ReactNode }) {
  // The exported HTML is a shell: everything on screen depends on stored
  // settings — language, theme, session — none of which exist at build time.
  // Rendering only after mount avoids a hydration fight over every word.
  const [mounted, setMounted] = useState(false);

  useEffect(() => bindSettingsToDocument(), []);
  useEffect(() => setMounted(true), []);

  // Whatever broke before React got here. Sent once, after the app is up, so a
  // failing report cannot be the thing that stops the page rendering.
  useEffect(() => {
    const timer = setTimeout(reportCollectedErrors, 2_000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // The escape hatch stays: set shifter.sw.kill and the next boot returns
    // the app to plain HTTP. It exists because the previous generation of
    // worker could not be evicted any other way, and the lesson keeps.
    if (localStorage.getItem('shifter.sw.kill') !== null) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });

      if ('caches' in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) void caches.delete(key);
        });
      }

      return;
    }

    // Everyone gets the worker now: it is versioned per deploy and sweeps
    // caches that are not its own vintage, so it can die — which is the
    // property the old one lacked and the reason it was unregistered here.
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // A refused registration leaves the site exactly as it was: online-only.
    });

    /*
     * A deploy landing under an open tab.
     *
     * The worker skips waiting and claims its clients, so the new build takes
     * over a page whose JavaScript came from the old one. Next's chunks are
     * hashed, so the first lazy import after that asks for a file the new
     * build no longer has, and the screen it was opening never arrives. One
     * reload, once, the moment the controller changes.
     */
    // Only where one was already in charge: the first registration of a
    // person's first visit also fires this, and reloading them mid-first-page
    // would be the app blinking at somebody for no reason.
    const hadController = navigator.serviceWorker.controller !== null;
    let swapped = false;

    const onSwap = () => {
      if (swapped || !hadController) return;

      swapped = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onSwap);

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onSwap);
  }, []);

  if (!mounted) return null;

  return <>{children}</>;
}
