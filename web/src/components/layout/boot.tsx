'use client';

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Notifications need a living registration; everyone else keeps the old
    // clean-slate behaviour, which is what retired the legacy offline worker.
    const wantsPush = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem('shifter.settings') ?? '{}') as {
          notifyTomorrow?: boolean;
          notifyUnclosed?: boolean;
          notifyPayday?: boolean;
          notifyDigest?: boolean;
        };

        return (
          raw.notifyTomorrow === true ||
          raw.notifyUnclosed === true ||
          raw.notifyPayday === true ||
          raw.notifyDigest === true
        );
      } catch {
        return false;
      }
    })();

    if (!wantsPush) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
    }

    if ('caches' in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  }, []);

  if (!mounted) return null;

  return <>{children}</>;
}
