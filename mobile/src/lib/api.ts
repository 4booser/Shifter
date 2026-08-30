import { t } from '@/lib/i18n';
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
  constructor(
    public status: number,
    message: string,
    /** Machine name from the server's envelope; most errors have none yet. */
    public code: string | null = null,
    /** Seconds from Retry-After, where the server named a wait. */
    public retryAfter: number | null = null,
  ) {
    super(message);
  }
}

/**
 * The auth sentences in the reader's language, keyed by the server's codes.
 * Everything uncoded falls back to the server's own English words — same
 * contract as the site.
 */
const CODED: Record<string, string> = {
  'auth.invalid': 'Неверный логин или пароль.',
  'auth.code': 'Код не подошёл. Коды меняются каждые 30 секунд.',
  'auth.ticket': 'Окно кода истекло — войдите заново.',
  'auth.current': 'Текущий пароль не подошёл.',
  'auth.reset': 'Ссылка больше не действует — запросите новую.',
};

const wordError = (status: number, body: { message?: string; code?: string | null }, retryAfter: number | null): ApiError => {
  const code = body.code ?? null;

  if (code === 'auth.locked') {
    const minutes = Math.max(1, Math.ceil((retryAfter ?? 900) / 60));

    return new ApiError(
      status,
      `${t('Слишком много попыток. Дверь закрыта, попробуйте через')} ${minutes} ${t('мин')}.`,
      code,
      retryAfter,
    );
  }

  if (code !== null && code in CODED) return new ApiError(status, t(CODED[code]), code, retryAfter);

  return new ApiError(status, body.message ?? `HTTP ${status}`, code, retryAfter);
};

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
    const retryAfter = Number(response.headers.get('Retry-After')) || null;
    let body: { message?: string; code?: string | null } = {};

    try {
      body = (await response.json()) as { message?: string; code?: string | null };
    } catch {
      // The status alone will have to do.
    }

    throw wordError(response.status, body, retryAfter);
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/**
 * The same door for a file. Multipart cannot go through `api` because that
 * one declares JSON, and a declared Content-Type overrides the boundary
 * fetch would otherwise write for the form.
 */
export async function upload<T>(path: string, form: FormData, retried = false): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: current !== null ? { Authorization: `Bearer ${current.access_token}` } : {},
    body: form,
  });

  if (response.status === 401 && !retried && current !== null) {
    const renewed = await refresh();

    if (renewed !== null) return upload<T>(path, form, true);

    setSession(null);
    authLost?.();
  }

  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || null;
    let body: { message?: string; code?: string | null } = {};

    try {
      body = (await response.json()) as { message?: string; code?: string | null };
    } catch {
      // The status alone will have to do.
    }

    throw wordError(response.status, body, retryAfter);
  }

  return (await response.json()) as T;
}
