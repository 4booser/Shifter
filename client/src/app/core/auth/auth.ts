import { HttpClient } from '@angular/common/http';
import { Service, computed, inject } from '@angular/core';
import { Observable, finalize, shareReplay, tap, throwError } from 'rxjs';

import { AuthResponse, CurrentUser, LoginRequest, RegisterRequest } from './auth.models';
import { TokenStorage } from './token-storage';

/** Base path is relative: proxied to the API in dev, same origin in prod. */
export const AUTH_API = '/shifter/v1/auth';

@Service()
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorage);

  private inFlightRefresh: Observable<AuthResponse> | null = null;

  readonly session = this.storage.session;

  readonly isAuthenticated = computed(() => {
    const session = this.session();

    return session !== null && session.expiresAt.getTime() > Date.now();
  });

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_API}/user/register`, request)
      .pipe(tap((response) => this.storage.save(response)));
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_API}/user/login`, request)
      .pipe(tap((response) => this.storage.save(response)));
  }

  /**
   * Trades the stored refresh token for a fresh pair. The server rotates on
   * every call, so the old token stops working the moment this succeeds.
   */
  refresh(): Observable<AuthResponse> {
    const token = this.storage.refreshToken;

    if (token === null) {
      return throwError(() => new Error('No refresh token stored.'));
    }

    return this.http
      .post<AuthResponse>(`${AUTH_API}/refresh`, { refresh_token: token })
      .pipe(tap((response) => this.storage.save(response)));
  }

  /**
   * Shares one refresh between everything that hits a 401 at the same time.
   * The server rotates tokens, so a second concurrent call would present an
   * already-spent token and fail — logging the user out mid-session.
   */
  refreshOnce(): Observable<AuthResponse> {
    this.inFlightRefresh ??= this.refresh().pipe(
      finalize(() => (this.inFlightRefresh = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.inFlightRefresh;
  }

  /** Round-trips the stored token through the API to confirm it still works. */
  me(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>(`${AUTH_API}/me`);
  }

  /**
   * Revokes the refresh token server-side, then clears the session. The local
   * clear happens either way: a failed call must not leave someone stuck
   * signed in on a shared machine.
   */
  logout(): void {
    const token = this.storage.refreshToken;

    if (token !== null) {
      this.http
        .post(`${AUTH_API}/logout`, { refresh_token: token })
        .subscribe({ error: () => undefined });
    }

    this.storage.clear();
  }

  /** Kills every session on every device; needs a live access token. */
  logoutEverywhere(): Observable<{ revoked: number }> {
    return this.http
      .post<{ revoked: number }>(`${AUTH_API}/logout/all`, {})
      .pipe(tap(() => this.storage.clear()));
  }
}
