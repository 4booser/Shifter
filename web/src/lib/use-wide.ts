'use client';

import { useSyncExternalStore } from 'react';

const WIDE = '(min-width: 48rem)';

const subscribe = (changed: () => void) => {
  const query = matchMedia(WIDE);

  query.addEventListener('change', changed);

  return () => query.removeEventListener('change', changed);
};

/** Whether there is room for a table. Asked here and not left to CSS, because drawing both layouts and hiding one is two thousand buttons nobody sees. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => true);
}
