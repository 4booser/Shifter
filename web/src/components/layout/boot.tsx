'use client';

import { useEffect, useState } from 'react';

import { reportCollectedErrors } from '@/lib/diagnostics/report';
import { loadDictionary } from '@/lib/i18n';
import { bindSettingsToDocument, useSettings } from '@/lib/settings/store';

/** Client-side start-up: binds the settings store to the document (theme, accent, radius, motion) and retires… */
export function Boot({ children }: { children: React.ReactNode }) {
  // The exported HTML is a shell: everything on screen depends on stored settings — language, theme, session …
  const [mounted, setMounted] = useState(false);

  useEffect(() => bindSettingsToDocument(), []);

  /* The dictionary is fetched before the first word is drawn. */
  useEffect(() => {
    let alive = true;

    void loadDictionary(useSettings.getState().settings.language).finally(() => {
      if (alive) setMounted(true);
    });

    return () => {
      alive = false;
    };
  }, []);

  /* A file dropped anywhere else is a file that is not opened. */
  useEffect(() => {
    const swallow = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files') !== true) return;

      event.preventDefault();
    };

    document.addEventListener('dragover', swallow);
    document.addEventListener('drop', swallow);

    return () => {
      document.removeEventListener('dragover', swallow);
      document.removeEventListener('drop', swallow);
    };
  }, []);

  // Whatever broke before React got here. Sent once, after the app is up, so a
  // failing report cannot be the thing that stops the page rendering.
  useEffect(() => {
    const timer = setTimeout(reportCollectedErrors, 2_000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // The escape hatch stays: set shifter.sw.kill and the next boot returns the app to plain HTTP.
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

    // Everyone gets the worker now: it is versioned per deploy and sweeps caches that are not its own vintage, so…
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // A refused registration leaves the site exactly as it was: online-only.
    });

    /* A deploy landing under an open tab. */
    // Only where one was already in charge: the first registration of a person's first visit also fires this, and…
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
