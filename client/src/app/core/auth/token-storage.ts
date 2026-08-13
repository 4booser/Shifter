import { Service, signal } from '@angular/core';

import { AuthResponse, AuthSession } from './auth.models';

const STORAGE_KEY = 'shifter.session';

/** Persists the auth session in localStorage and exposes it as a signal. */
@Service()
export class TokenStorage {
  private readonly _session = signal<AuthSession | null>(read());

  readonly session = this._session.asReadonly();

  get accessToken(): string | null {
    return this._session()?.accessToken ?? null;
  }

  save(response: AuthResponse): AuthSession {
    const session: AuthSession = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: new Date(response.expires_at),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(response));
    this._session.set(session);

    return session;
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._session.set(null);
  }
}

function read(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) return null;

  try {
    const response = JSON.parse(raw) as AuthResponse;

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: new Date(response.expires_at),
    };
  } catch {
    // Corrupted payload: drop it rather than booting into a broken session.
    localStorage.removeItem(STORAGE_KEY);

    return null;
  }
}
