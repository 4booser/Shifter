import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Mirrors the web client's AuthResponse. */
export interface Session {
  access_token: string;
  refresh_token: string;
}

const KEY = 'shifter.session';

/**
 * One secret store for every platform: Keychain/Keystore on the phones,
 * localStorage when the very same bundle runs as a web preview.
 */
export const sessionStore = {
  async load(): Promise<Session | null> {
    try {
      const raw =
        Platform.OS === 'web'
          ? globalThis.localStorage?.getItem(KEY) ?? null
          : await SecureStore.getItemAsync(KEY);

      return raw === null ? null : (JSON.parse(raw) as Session);
    } catch {
      return null;
    }
  },
  async save(session: Session | null): Promise<void> {
    if (Platform.OS === 'web') {
      if (session === null) globalThis.localStorage?.removeItem(KEY);
      else globalThis.localStorage?.setItem(KEY, JSON.stringify(session));

      return;
    }

    if (session === null) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  },
};

/**
 * EXPO_PUBLIC_API_BASE wins (prod, LAN address for a physical phone),
 * app.json extra second, localhost covers simulator-against-local last.
 */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE
  ?? (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase
  ?? 'http://localhost:5208';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let current: Session | null = null;
let refreshing: Promise<Session | null> | null = null;
let authLost: (() => void) | null = null;

/** The session store hangs its sign-out here; api() cannot import it back. */
export function onAuthLost(callback: () => void): void {
  authLost = callback;
}

export function setSession(session: Session | null): void {
  current = session;
  void sessionStore.save(session);
}

export function getSession(): Session | null {
  return current;
}

async function refresh(): Promise<Session | null> {
  if (current === null) return null;

  refreshing ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/shifter/v1/auth/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: current?.refresh_token }),
      });

      if (!response.ok) return null;

      const next = (await response.json()) as Session;

      setSession(next);

      return next;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/** The one door to the backend: bearer header, one retry through a refresh. */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(current !== null ? { Authorization: `Bearer ${current.access_token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && !retried && current !== null) {
    const renewed = await refresh();

    if (renewed !== null) return api<T>(path, options, true);

    // The key is dead — a stale simulator session, a revoked device. Holding
    // onto it would strand the person on error screens; the login door is
    // the honest place to put them.
    setSession(null);
    authLost?.();
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      const body = (await response.json()) as { message?: string };

      if (typeof body.message === 'string') message = body.message;
    } catch {
      // The status alone will have to do.
    }

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
