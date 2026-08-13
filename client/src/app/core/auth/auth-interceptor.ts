import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AUTH_API } from './auth';
import { TokenStorage } from './token-storage';

/** Attaches the bearer token to API calls only, never to third-party hosts. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/shifter/')) return next(req);

  const storage = inject(TokenStorage);
  const router = inject(Router);

  const token = storage.accessToken;

  const authorized = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      // A 401 from register or login means "wrong credentials" and belongs to
      // the form. Anywhere else it means the session died, so drop it.
      const isCredentialsCheck = req.url.startsWith(`${AUTH_API}/user/`);

      if (error.status === 401 && !isCredentialsCheck) {
        storage.clear();
        router.navigate(['/login']);
      }

      return throwError(() => error);
    }),
  );
};
