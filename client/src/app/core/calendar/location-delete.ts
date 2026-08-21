import { I18n } from '../i18n/i18n';
import { CalendarStore } from './calendar-store';
import { WorkLocation } from './calendar.models';

/**
 * Two questions rather than one, because they are different questions. The
 * first is "did you mean to". The second only appears when days still point at
 * the place, and it is asking whether losing that place's tip-out, meal and tax
 * rules on days already worked is acceptable — which is not something to bury
 * in the first prompt, where nobody would read it.
 *
 * Lives here rather than in a component because a place can now be deleted
 * from two places at once: the row in the sidebar and the list inside the
 * modal. The wording of a question this consequential should not drift between
 * them.
 */
export function confirmDeleteLocation(
  store: CalendarStore,
  i18n: I18n,
  location: WorkLocation,
): void {
  if (!window.confirm(`${location.name} — ${i18n.t('Delete this? It cannot be undone.')}`)) return;

  store.deleteLocation(location.id, false, (message) => {
    const question = `${message}\n\n${i18n.t(
      'Days already worked will lose this place’s tip-out, meal and tax rules, so what they are worth will change. Delete anyway?',
    )}`;

    if (window.confirm(question)) store.deleteLocation(location.id, true);
  });
}
