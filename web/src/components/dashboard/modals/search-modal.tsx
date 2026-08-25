'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { CalendarDayData } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { ALL_TIME, calendarActions } from '@/lib/store/calendar';
import { Money } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/**
 * Finds a day by what was written on it. Notes are where people put the things
 * the schema has no column for, and the only other way back to one is
 * scrolling the calendar.
 */
export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<CalendarDayData[]>([]);

  // One request for the whole history: a search that only looked at the month
  // on screen would miss precisely the day being hunted for.
  useEffect(() => {
    if (!open) return;

    setLoading(true);

    void calendarApi
      .days(ALL_TIME.from, ALL_TIME.to)
      .then((response) => setAll(response.days))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open]);

  const hits = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle.length < 2) return [];

    const format = new Intl.DateTimeFormat(lang, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return all
      .map((day) => ({
        date: day.date,
        label: format.format(new Date(`${day.date}T00:00:00`)),
        note: day.note,
        shifts: day.shifts.map((entry) => entry.name).join(', '),
        earned: day.earned,
      }))
      // The date is searchable too, so "2026-03" jumps to a month.
      .filter((hit) => `${hit.note ?? ''} ${hit.shifts} ${hit.date}`.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60);
  }, [query, all, lang]);

  return (
    <Modal open={open} wide title={t('Search')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input
          type="search"
          autoFocus
          className="field-input"
          value={query}
          placeholder={t('covered for Ann, 2026-03…')}
          onChange={(event) => setQuery(event.target.value)}
        />

        {loading ? (
          <p className="field-hint">{t('Loading…')}</p>
        ) : query.trim().length < 2 ? (
          <p className="field-hint">{t('Type at least two characters.')}</p>
        ) : hits.length === 0 ? (
          <p className="field-hint">{t('Nothing found.')}</p>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {hits.map((hit) => (
              <button
                key={hit.date}
                type="button"
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-(--radius) border border-border px-3 py-2 text-left hover:border-border-strong"
                onClick={() => {
                  calendarActions.openDate(hit.date);
                  onClose();
                }}
              >
                <span className="text-[0.88rem] font-semibold capitalize">{hit.label}</span>
                {hit.shifts && <span className="text-[0.8rem] text-muted">{hit.shifts}</span>}
                {hit.note && <span className="w-full truncate text-[0.8rem] text-faint">{hit.note}</span>}
                <Money value={hit.earned} className="ml-auto text-[0.85rem] font-semibold text-good" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
