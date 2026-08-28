'use client';

import { RefObject, useEffect } from 'react';

/**
 * The things a native <dialog> gives you and a <div> does not.
 *
 * Most overlays in the app are real dialogs and get focus trapping, Escape and
 * an inert page behind them for free. A few cannot be — the command palette,
 * the year-in-review, the tour — because they overlay in ways the element does
 * not allow. Those were left with Escape at best, which means somebody on a
 * keyboard could tab straight out of an open overlay into the page behind it
 * and operate a form they cannot see.
 */

/** Everything focusable, in the order the browser would visit it. */
export const focusable = (root: HTMLElement): HTMLElement[] =>
  [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.offsetParent !== null || element === document.activeElement);

/**
 * Where Tab should land, wrapping at both ends.
 *
 * Returns null where the trap has nothing to do — no focusable elements, or
 * focus is in the middle of the list and the browser's own behaviour is
 * already right. Pure, so the wrap can be tested without a browser.
 */
export function nextFocus(
  elements: HTMLElement[],
  current: HTMLElement | null,
  backwards: boolean,
): HTMLElement | null {
  if (elements.length === 0) return null;

  const at = current === null ? -1 : elements.indexOf(current);

  // Focus somewhere outside the overlay altogether: pull it back to the edge
  // the tab was heading for.
  if (at === -1) return backwards ? elements[elements.length - 1] : elements[0];

  if (backwards && at === 0) return elements[elements.length - 1];
  if (!backwards && at === elements.length - 1) return elements[0];

  return null;
}

/**
 * Escape, a focus trap, and focus back where it came from.
 *
 * Restoring focus matters as much as trapping it: an overlay that closes and
 * drops focus onto the document body leaves a keyboard user at the top of the
 * page, having lost the place they spent twenty presses reaching.
 */
export function useDialogKeys(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    const returnTo = document.activeElement as HTMLElement | null;

    const onKey = (event: KeyboardEvent) => {
      const root = ref.current;

      if (root === null) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();

        return;
      }

      if (event.key !== 'Tab') return;

      const next = nextFocus(
        focusable(root),
        document.activeElement as HTMLElement | null,
        event.shiftKey,
      );

      if (next === null) return;

      event.preventDefault();
      next.focus();
    };

    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);

      // Only if focus is still adrift: something inside the closing overlay
      // may have deliberately moved it somewhere better.
      if (document.activeElement === document.body) returnTo?.focus();
    };
  }, [open, ref, onClose]);
}
