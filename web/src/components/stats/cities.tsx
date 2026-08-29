'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api/http';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';

interface CityRow {
  city: string;
  hours: number;
  days: number;
  per_hour: number;
  market: { median: number; low: number; high: number; employers: number; listings: number } | null;
}

/**
 * «Где мой час дороже» — the seasonal worker's own history, city by city.
 *
 * Rates come from their own worked hourly shifts at places they tagged with
 * a city; the market band appears only where the public sample clears the
 * same anonymity thresholds the gig board uses. One city or none tagged —
 * the card stays off the page.
 */
export function CitiesCard() {
  const { t, n } = useI18n();
  const { format } = useMoney();

  const [rows, setRows] = useState<CityRow[]>([]);

  useEffect(() => {
    void api<CityRow[]>('/shifter/v1/gigs/cities')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows.length < 2) return null;

  const top = rows[0].per_hour;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Your cities')}</h2>
      <p className="field-hint mb-3">
        {t('Your own hourly rate, season against season. Set a city on a place to include it.')}
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.city} className="flex items-center gap-3">
            <span className="w-24 flex-none truncate text-[0.9rem] font-semibold">{row.city}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-(--accent)/55"
                style={{ width: `${Math.max(6, (row.per_hour / top) * 100)}%` }}
              />
            </div>
            <span className="w-20 flex-none text-right text-[0.9rem] font-bold tabular">
              {format(row.per_hour)}/{t('h')}
            </span>
            <span className="w-24 flex-none text-right text-[0.75rem] text-muted tabular">
              {n(row.days, 'days')}
            </span>
          </div>
        ))}
      </div>

      {rows.some((row) => row.market !== null) && (
        <div className="mt-3 border-t border-border pt-2">
          {rows
            .filter((row) => row.market !== null)
            .map((row) => (
              <p key={row.city} className="text-[0.82rem] text-muted">
                {t('Board in')} {row.city}: {format(row.market!.low)}–{format(row.market!.high)}/{t('h')},{' '}
                {t('median')} {format(row.market!.median)} ·{' '}
                {row.market!.employers} {t('employers')}
              </p>
            ))}
          <p className="field-hint mt-1">
            {t('Shown only where enough different venues posted — a thin sample identifies somebody.')}
          </p>
        </div>
      )}
    </section>
  );
}
