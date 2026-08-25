'use client';

import { useEffect, useRef, useState } from 'react';

import { authApi } from '@/lib/api/auth';

/** The slice of Google Identity Services this app uses. */
interface GoogleAccounts {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    if (window.google !== undefined) return resolve();

    const script = document.createElement('script');

    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in failed to load.'));
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * Google draws its own button into the host. The client id comes from the
 * server, so the same build works against any deployment and an unconfigured
 * server simply keeps the button hidden.
 */
export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void authApi
      .googleConfig()
      .then(async (config) => {
        const clientId = config.client_id?.trim();

        if (!clientId || cancelled || host.current === null) return;

        await loadScript();

        if (cancelled || window.google === undefined || host.current === null) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredential(response.credential),
        });

        const dark = ['dark', 'night', 'ocean', 'plum', 'gradient'].includes(
          document.documentElement.dataset['theme'] ?? '',
        );

        window.google.accounts.id.renderButton(host.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: host.current.clientWidth || 320,
        });

        setAvailable(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // onCredential is stable enough per page; re-rendering the Google iframe
    // on every parent render would flicker it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className={available ? 'flex justify-center' : 'hidden'} />;
}
