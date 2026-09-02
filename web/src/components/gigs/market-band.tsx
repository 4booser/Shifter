'use client';

import { useEffect, useState } from 'react';

import { MarketBand, marketApi } from '@/lib/api/gigs';
import { useI18n } from '@/lib/i18n';
import { Money } from '@/components/ui/bits';

/**
 * "Барменам в Киеве платят 220 в час."
 *
 * The one fact in this trade that nobody can look up and everybody wants. It
 * comes out of listings, which venues published on purpose — never out of what
 * people privately record, which would be a far better number and a far worse
 * idea.
 *
 * It goes quiet more often than it speaks: below five separate employers, or
 * with one of them posting most of the board, there is no figure. A city with
 * three venues on it gets silence, which is the correct answer.
 */
export function MarketBandCard({ city, category }: { city: string; category: string | null }) {
  const { t } = useI18n();

  const [band, setBand] = useState<MarketBand | null>(null);

  useEffect(() => {
    // Both halves of the question, or there is no question. "What do bartenders
    // get" has no answer without a city, and neither has "what does Kyiv pay".
    if (city.trim() === '' || category === null) {
      setBand(null);

      return;
    }

    void marketApi
      .band(city, category)
      .then(setBand)
      .catch(() => setBand(null));
  }, [city, category]);

  if (band === null || band.median === null || band.low === null || band.high === null) return null;

  const standing = band.standing;

  return (
    <section className="card reveal p-4">
      <div className="panel-head mb-2">
        <span>{t('What this pays here')}</span>
        <span className="text-faint">
          {band.listings} {t('postings')} · {band.employers} {t('venues')}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular text-[1.5rem] font-bold">
          <Money value={band.median} />
          <span className="text-[0.9rem] font-normal text-muted">/{t('h')}</span>
        </span>
        {/* The spread is the honest half of the answer. A single number invites
            somebody to treat one city's middle as their own entitlement. */}
        <span className="tabular text-[0.86rem] text-muted">
          {t('most between')} <Money value={band.low} /> {t('and')} <Money value={band.high} />
        </span>
      </div>

      {band.mine !== null && standing !== null && (
        <p className="mt-2 text-[0.88rem]">
          {t('Your hourly rate')}: <strong className="tabular"><Money value={band.mine} /></strong>/{t('h')} —{' '}
          {standing === 'below' && (
            <span className="text-warn-read">{t('below what this city usually posts')}</span>
          )}
          {standing === 'usual' && <span className="text-muted">{t('in the usual range')}</span>}
          {standing === 'above' && (
            <span className="text-good-read">{t('above what this city usually posts')}</span>
          )}
        </p>
      )}

      <p className="field-hint mt-2">
        {t('From posted rates on this board over the last six months, never from anybody’s records.')}
      </p>
    </section>
  );
}
