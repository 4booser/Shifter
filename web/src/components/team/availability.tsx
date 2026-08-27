'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Blocked, plannerApi } from '@/lib/api/team';
import { keysBetween, todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { pluralWord } from '@/lib/i18n/plural';
import { Alert } from '@/components/ui/bits';

/**
 * "I cannot work these days." A block list rather than a list of free days:
 * most days are possible, a few are not, and the cheap gesture should be the
 * common one. The crew sees the days; the reason is optional and short.
 */
export function AvailabilityStrip({
  teamId,
  from,
  to,
  onChanged,
}: {
  teamId: number;
  from: string;
  to: string;
  onChanged?: () => void;
}) {
  const { t, lang } = useI18n();
  const [blocks, setBlocks] = useState<Blocked[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void plannerApi
      .availability(teamId, from, to)
      .then(setBlocks)
      .catch(() => setBlocks([]));
  }, [teamId, from, to]);

  useEffect(refresh, [refresh]);

  const mine = new Set(blocks.filter((block) => block.mine).map((block) => block.date));
  const days = keysBetween(from, to).filter((key) => key >= todayKey());

  const toggle = (date: string) => {
    void plannerApi
      .toggleAvailability(teamId, date, null)
      .then(() => {
        refresh();
        onChanged?.();
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  return (
    <section className="card reveal p-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-[0.95rem] font-bold">🚫 {t('Days I cannot work')}</h2>
        {mine.size > 0 && (
          <span className="chip">
            {mine.size} {pluralWord(lang, 'days', mine.size)}
          </span>
        )}
        <button type="button" className="btn btn-sm ml-auto" onClick={() => setOpen((value) => !value)}>
          {open ? t('Done') : t('Mark days')}
        </button>
      </header>

      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {open ? (
        <>
          <p className="field-hint mt-2">{t('Tap the days you are not available. The manager sees them while planning.')}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {days.map((key) => {
              const off = mine.has(key);

              return (
                <button
                  key={key}
                  type="button"
                  className={`rounded-(--radius) border px-2 py-1 text-[0.78rem] tabular transition-colors ${
                    off
                      ? 'border-danger/50 bg-(--danger-soft) text-danger'
                      : 'border-border hover:border-(--accent) hover:text-(--accent)'
                  }`}
                  onClick={() => toggle(key)}
                >
                  {new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${key}T00:00:00`))}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="field-hint mt-1">
          {mine.size === 0
            ? t('Nothing blocked in this window.')
            : [...mine]
                .sort()
                .map((key) =>
                  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${key}T00:00:00`)),
                )
                .join(' · ')}
        </p>
      )}
    </section>
  );
}
