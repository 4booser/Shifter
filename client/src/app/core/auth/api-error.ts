import { HttpErrorResponse } from '@angular/common/http';

import { ApiError } from './auth.models';

/** Pulls the message out of the API error envelope, with sane fallbacks. */
export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Something went wrong.';

  // status 0 means the request never reached the server.
  if (error.status === 0) return 'Cannot reach the server.';

  const body = error.error as Partial<ApiError> | string | null;

  if (typeof body === 'object' && body !== null && typeof body.message === 'string') {
    return body.message;
  }

  return error.statusText || 'Something went wrong.';
}
