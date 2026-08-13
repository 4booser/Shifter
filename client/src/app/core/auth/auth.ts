import { HttpClient } from '@angular/common/http';
import { Service, computed, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AuthResponse, CurrentUser, LoginRequest, RegisterRequest } from './auth.models';
import { TokenStorage } from './token-storage';

/** Base path is relative: proxied to the API in dev, same origin in prod. */
export const AUTH_API = '/shifter/v1/auth';

@Service()
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorage);

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

  /** Round-trips the stored token through the API to confirm it still works. */
  me(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>(`${AUTH_API}/me`);
  }

  logout(): void {
    this.storage.clear();
  }
}
