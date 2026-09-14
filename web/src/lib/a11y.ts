'use client';

import { RefObject, useEffect } from 'react';

/** The things a native <dialog> gives you and a <div> does not. */

/** Everything focusable, in the order the browser would visit it. */
export const focusable = (root: HTMLElement): HTMLElement[] =>
  [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.offsetParent !== null || element === document.activeElement);

/** Where Tab should land, wrapping at both ends. */
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

/** Escape closes what a click outside closes. */
export function useEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

/** Escape, a focus trap, and focus back where it came from. */
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
