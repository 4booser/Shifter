'use client';

import { translate } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';

/**
 * The one place requests go through: attaches the bearer token, renews the
 * session in place on a 401 and retries once, and turns the API's error
 * envelope into a message. Mirrors the old client's interceptor, because the
 * server's contract did not change.
 */

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface ApiError {
  status: number;
  error: string;
  /** Machine name for the dictionary; most errors have none yet. */
  code?: string | null;
  message: string;
}

const SESSION_KEY = 'shifter.session';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    /** Seconds from Retry-After, where the server named a wait. */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

export function readSession(): AuthResponse | null {
  if (typeof localStorage === 'undefined') return null;

  const raw = localStorage.getItem(SESSION_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    localStorage.removeItem(SESSION_KEY);

    return null;
  }
}

export function saveSession(response: AuthResponse): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(response));
  notifySession();
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  notifySession();
}

/** Subscribers hear about sign-in and sign-out; the shell uses it for guards. */
const sessionListeners = new Set<() => void>();

export function onSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener);

  return () => sessionListeners.delete(listener);
}

function notifySession(): void {
  for (const listener of sessionListeners) listener();
}

/**
 * Shares one refresh between everything that hits a 401 at the same time. The
 * server rotates tokens, so a second concurrent call would present an
 * already-spent token and fail — logging the user out mid-session.
 */
let inFlightRefresh: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  inFlightRefresh ??= (async () => {
    const session = readSession();

    if (session === null) return false;

    try {
      const response = await fetch('/shifter/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });

      if (!response.ok) return false;

      saveSession((await response.json()) as AuthResponse);

      return true;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so the callers sharing this promise all read
      // it before a new refresh can start.
      setTimeout(() => (inFlightRefresh = null), 0);
    }
  })();

  return inFlightRefresh;
}

async function errorFrom(response: Response): Promise<HttpError> {
  const retryAfter = Number(response.headers.get('Retry-After')) || null;

  try {
    const body = (await response.json()) as Partial<ApiError>;

    if (typeof body.message === 'string')
      return new HttpError(response.status, body.message, body.code ?? null, retryAfter);
  } catch {
    // Not the envelope; fall through to the status text.
  }

  return new HttpError(response.status, response.statusText || 'Something went wrong.', null, retryAfter);
}

/**
 * The auth sentences, spoken in the reader's language. Keyed by the codes the
 * server now sends on its most-read errors; everything uncoded still falls
 * back to the server's own English words below.
 */
const CODED: Record<string, string> = {
  'auth.invalid': 'Wrong login or password.',
  'auth.code': 'That code did not fit. Codes rotate every 30 seconds.',
  'auth.ticket': 'The code window expired — sign in again.',
  'auth.current': 'The current password did not fit.',
  'auth.reset': 'This link no longer works — ask for a new one.',
};

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpError && error.code !== null) {
    if (error.code === 'auth.locked') {
      const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 900) / 60));

      return `${say('Too many attempts. The door is closed; try again in')} ${minutes} ${say('min')}.`;
    }

    if (error.code in CODED) return say(CODED[error.code]);
  }

  // The server's own words for everything not yet coded; the sentences this
  // function writes itself are its own responsibility and are translated.
  if (error instanceof HttpError) return error.message;

  // A request that never landed. Saying which address was tried turns an
  // unhelpful message into a diagnosis — and it read in English to every
  // Russian and Ukrainian user, because this module is not a component and
  // never went near the dictionary.
  if (error instanceof TypeError) {
    return `${say('Cannot reach the server. Is it running?')} ${location.origin}`;
  }

  return error instanceof Error ? error.message : say('Something went wrong.');
}

/**
 * The dictionary, read outside React. The settings store is a plain zustand
 * store, so its language is available without a hook.
 */
function say(key: string): string {
  return translate(useSettings.getState().settings.language, key);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Raw string body, sent as-is (the webhook test box needs this). */
  rawBody?: string;
  signal?: AbortSignal;
}

/**
 * A file over the same authorized channel.
 *
 * The papers endpoints answer with bytes — a PDF, a CSV, a zip — and the
 * JSON-shaped api() would choke on them. Same bearer, same single refresh
 * retry, but the body comes back as a Blob for downloadBlob to hand over.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const call = async (): Promise<Response> => {
    const session = readSession();

    return fetch(path, {
      headers: session === null ? {} : { Authorization: `Bearer ${session.access_token}` },
    });
  };

  let response = await call();

  if (response.status === 401 && (await refreshOnce())) response = await call();

  if (!response.ok) throw await errorFrom(response);

  return response.blob();
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const call = async (): Promise<Response> => {
    const session = readSession();
    const headers: Record<string, string> = {};

    if (options.body !== undefined || options.rawBody !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (session !== null) headers['Authorization'] = `Bearer ${session.access_token}`;

    return fetch(path, {
      method: options.method ?? (options.body !== undefined || options.rawBody !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
    });
  };

  let response = await call();

  // A 401 from a credential check or from refresh itself is the answer, not a
  // stale token: retrying those would loop.
  const isAuthCall = path.startsWith('/shifter/v1/auth/user/') || path === '/shifter/v1/auth/refresh';

  if (response.status === 401 && !isAuthCall) {
    if (await refreshOnce()) {
      response = await call();
    } else {
      clearSession();

      if (typeof location !== 'undefined' && !location.pathname.startsWith('/login')) {
        location.assign(`/login?returnUrl=${encodeURIComponent(location.pathname)}`);
      }
    }
  }

  if (!response.ok) throw await errorFrom(response);

  if (response.status === 204) return undefined as T;

  const text = await response.text();

  return (text === '' ? undefined : JSON.parse(text)) as T;
}
