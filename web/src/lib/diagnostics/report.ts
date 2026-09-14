/** Sends the crashes the page collected before React existed. */

const SENT = 'shifter.errs.sent';

interface ErrorWindow extends Window {
  __errs?: string[];
}

export function reportCollectedErrors(): void {
  const errors = (window as ErrorWindow).__errs;

  if (errors === undefined || errors.length === 0) return;

  // Same faults on a reload are the same faults.
  const signature = errors.join('|');

  try {
    if (sessionStorage.getItem(SENT) === signature) return;
    sessionStorage.setItem(SENT, signature);
  } catch {
    // Private mode, or storage full. Reporting once too often beats not at all.
  }

  void fetch('/shifter/v1/status/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: errors.join(' ;; '),
      path: window.location.pathname,
      build: process.env.NEXT_PUBLIC_BUILD ?? 'dev',
    }),
    // A crash report must never become the reason a page waits.
    keepalive: true,
  }).catch(() => {
    // Nothing to do about it, and nothing worth telling the person using the
    // app: they already saw whatever broke.
  });
}
