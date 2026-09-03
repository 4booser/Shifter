'use client';

import { Gig } from '@/lib/api/gigs';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/ui/icon';

/**
 * Where the number went.
 *
 * Transparency for transparency: the board asks people for a phone number and
 * then goes quiet about it. This says who opened it and when, without anybody
 * having to go looking, and it sits under the reply it belongs to rather than
 * on a settings page nobody visits.
 *
 * It says "nobody has opened them yet" out loud too. Silence there would read
 * as a broken feature, and the reassuring case is the common one.
 */
export function ContactAudit({ gig }: { gig: Gig }) {
  const { t, lang } = useI18n();

  // Nothing was shared, so there is nothing to account for. A card that
  // reported "0 views" on contacts that were never given would be noise
  // dressed as a privacy feature.
  if (gig.contact_seen_at === null && gig.contact_seen_count === 0) {
    return (
      <p className="field-hint flex items-center gap-1.5 px-1"><Icon name="lock" size={12} />{t('Nobody has opened your contacts yet.')}</p>
    );
  }

  const last = gig.contact_seen_last ?? gig.contact_seen_at;
  const when =
    last === null
      ? null
      : new Intl.DateTimeFormat(lang, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(last));

  return (
    <p className="field-hint px-1">
      <Icon name="eye" size={12} />{' '}
      {t('The venue opened your contacts')} {gig.contact_seen_count}{' '}
      {gig.contact_seen_count === 1 ? t('once') : t('occasions')}
      {when !== null && <>, {t('last')} {when}</>}
    </p>
  );
}
