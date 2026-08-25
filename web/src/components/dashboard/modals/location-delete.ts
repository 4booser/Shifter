'use client';

import { WorkLocation } from '@/lib/calendar/models';
import { catalogueActions } from '@/lib/store/calendar';

/**
 * Deleting a place is a two-step conversation: the server refuses while shift
 * templates point at it, and only then is the destructive detach offered — the
 * second question names what it destroys.
 */
export function confirmDeleteLocation(t: (key: string) => string, location: WorkLocation): void {
  if (!window.confirm(`${location.name} — ${t('Delete this? It cannot be undone.')}`)) return;

  void catalogueActions.deleteLocation(location.id, false, (message) => {
    const question = `${message}\n\n${t('Detach those shifts from the place and delete it anyway?')}`;

    if (window.confirm(question)) void catalogueActions.deleteLocation(location.id, true);
  });
}
