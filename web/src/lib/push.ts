'use client';

import { api } from './api/http';
import { Settings } from './settings/settings';

/**
 * The browser half of web push. The server holds the subscription and does
 * the timing; this file's job is the ceremony: permission, service worker,
 * applicationServerKey, and keeping the server's copy of the preferences in
 * step with the local settings.
 */

const API = '/shifter/v1/push';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function wantsPush(settings: Settings): boolean {
  return settings.notifyTomorrow || settings.notifyUnclosed || settings.notifyPayday || settings.notifyDigest;
}

/** The applicationServerKey format PushManager insists on. */
function toKeyBytes(base64url: string): Uint8Array {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();

  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState(settings: Settings): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (!wantsPush(settings)) return 'off';

  return (await currentSubscription()) !== null ? 'on' : 'off';
}

/**
 * Turns notifications on (or updates the stored preferences). Returns the
 * resulting state; 'denied' means the browser said no and the toggles
 * should reflect that rather than pretend.
 */
export async function syncPush(settings: Settings): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';

  if (!wantsPush(settings)) {
    await disablePush();

    return 'off';
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') return 'denied';

  const { key } = await api<{ key: string }>(`${API}/public-key`);
  const registration = await navigator.serviceWorker.register('/sw.js');

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (subscription === null) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKeyBytes(key) as BufferSource,
    });
  }

  const json = subscription.toJSON();

  await api(`${API}/subscription`, {
    method: 'PUT',
    body: {
      endpoint: subscription.endpoint,
      p256dh: json.keys?.['p256dh'] ?? '',
      auth: json.keys?.['auth'] ?? '',
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: settings.language,
      notify_tomorrow: settings.notifyTomorrow,
      notify_unclosed: settings.notifyUnclosed,
      notify_payday: settings.notifyPayday,
      notify_digest: settings.notifyDigest,
      notify_at: settings.notifyAt,
    },
  });

  return 'on';
}

/** Both toggles off: the device stops existing as far as the server knows. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();

  if (subscription === null) return;

  try {
    await api(`${API}/subscription`, {
      method: 'DELETE',
      body: { endpoint: subscription.endpoint },
    });
  } catch {
    // The server row is cleaned up by the dead-endpoint sweep either way.
  }

  await subscription.unsubscribe();
}

/** Fires a real notification at this account's devices, for the settings UI. */
export async function testPush(): Promise<void> {
  await api(`${API}/test`, { method: 'POST' });
}
