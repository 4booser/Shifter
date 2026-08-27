/**
 * Sends the crashes the page collected before React existed.
 *
 * The inline script in the document head has been pushing errors into
 * `window.__errs` since the first line of script on the page — and until now
 * they went nowhere. Which meant a white screen was something we heard about
 * from the person it happened to, days later, described from memory.
 *
 * Deliberately not a monitoring client: one request, once, on the way in. No
 * retry, no queue, no beacon on unload. A page that is broken enough to crash
 * is not a page to hang more machinery off, and a report that fails to send is
 * a report nobody needed badly enough to chase.
 */

const SENT = 'shifter.errs.sent';

interface ErrorWindow extends Window {
  __errs?: string[];
}

export function reportCollectedErrors(): void {
  const errors = (window as ErrorWindow).__errs;

  if (errors === undefined || errors.length === 0) return;

  // Same faults on a reload are the same faults. Without this, a page that
  // crashes on load reports itself again every time somebody retries — which
  // is exactly when people retry most.
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
