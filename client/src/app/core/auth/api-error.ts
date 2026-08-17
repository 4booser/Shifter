import { HttpErrorResponse } from '@angular/common/http';

import { ApiError } from './auth.models';

/** Pulls the message out of the API error envelope, with sane fallbacks. */
export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Something went wrong.';

  // Status 0 means the request never left the browser or never landed. Saying
  // which address was tried turns an unhelpful message into a diagnosis: the
  // usual cause is a page kept alive by a service worker at an address whose
  // server has since been stopped, where "cannot reach the server" is true but
  // says nothing about which one.
  if (error.status === 0) {
    return `Cannot reach the server at ${location.origin}. Is it running at this address?`;
  }

  const body = error.error as Partial<ApiError> | string | null;

  if (typeof body === 'object' && body !== null && typeof body.message === 'string') {
    return body.message;
  }

  return error.statusText || 'Something went wrong.';
}
