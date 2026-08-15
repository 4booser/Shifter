import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AUTH_API, Auth } from './auth';
import { TokenStorage } from './token-storage';

/**
 * Attaches the bearer token to API calls, and renews the session in place when
 * the access token has expired. Without this the 15-minute access lifetime
 * would throw the user back to the login page mid-shift.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/shifter/')) return next(req);

  const auth = inject(Auth);
  const storage = inject(TokenStorage);
  const router = inject(Router);

  // A 401 from a credential check or from refresh itself is the answer, not a
  // stale token: retrying those would loop.
  const isAuthCall =
    req.url.startsWith(`${AUTH_API}/user/`) || req.url === `${AUTH_API}/refresh`;

  return next(withToken(req, storage.accessToken)).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthCall) return throwError(() => error);

      return auth.refreshOnce().pipe(
        // Read the token again rather than closing over the old one: refresh
        // has just replaced it.
        switchMap(() => next(withToken(req, storage.accessToken))),
        catchError((refreshError: unknown) => {
          storage.clear();
          router.navigate(['/login']);

          return throwError(() => refreshError);
        }),
      );
    }),
  );
};

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token === null
    ? req
    : req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
