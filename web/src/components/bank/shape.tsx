'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n';
import { MonoStatementItem } from '@/lib/mono/mono';
import { biggestDays, monthDelta, spendingHeat, weekdayShape } from '@/lib/mono/mono-shape';
import { categorise } from '@/lib/mono/mono-rules';
import { useMono } from '@/lib/mono/store';
import { Money } from '@/components/ui/bits';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The month's shape: which weekday eats, which days carried it, what moved
 * against last month.
 *
 * Three small answers to the one question every category chart dodges —
 * "куда всё делось" — each of them checkable down to the transactions it came
 * from.
 */
export function BankShape({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();

  const rules = useMono((state) => state.rules);

  const week = useMemo(() => weekdayShape(items, from, to), [items, from, to]);
  const heat = useMemo(() => spendingHeat(items, from, to), [items, from, to]);
  const heavy = useMemo(() => biggestDays(items, from, to), [items, from, to]);

  const delta = useMemo(() => {
    const [year, month] = from.split('-').map(Number);
    const beforeFrom = new Date(year, month - 2, 1);
    const beforeTo = new Date(year, month - 1, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    const key = (date: Date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    return monthDelta(
      items,
      (item) => categorise(item, rules),
      from, to,
      key(beforeFrom), key(beforeTo),
    );
  }, [items, rules, from, to]);

  const weekPeak = Math.max(1, ...week.map((row) => row.average));
  const monthSpent = heat.reduce((sum, day) => sum + day.spent, 0);
  const heavyShare = monthSpent > 0
    ? Math.round((heavy.reduce((sum, day) => sum + day.spent, 0) / monthSpent) * 100)
    : 0;

  if (items.length === 0) return null;

  return (
    <>
      {/* ==== The week's shape and the heat strip, one card ==== */}
      <section className="card reveal p-4">
        <div className="panel-head mb-3">
          <span>{t('The shape of the spending')}</span>
        </div>

        <div className="flex h-24 gap-1.5">
          {week.map((row) => (
            <div key={row.weekday} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end" title={`${Math.round(row.average)}`}>
                <div
                  className="w-full rounded-t-[4px]"
                  style={{
                    height: `${Math.max(3, (row.average / weekPeak) * 100)}%`,
                    background:
                      row.average === weekPeak
                        ? 'var(--accent)'
                        : 'color-mix(in srgb, var(--accent) 35%, var(--surface-2))',
                  }}
                />
              </div>
              <span className="text-[0.62rem] text-faint">{t(WEEKDAYS[row.weekday])}</span>
            </div>
          ))}
        </div>
        <p className="field-hint mt-1.5">
          {t('Average for that weekday — five Saturdays in a month do not get to win by count.')}
        </p>

        {/* The heat strip: one cell per day that spent anything. */}
        {heat.length > 0 && (
          <div className="mt-3 flex gap-[3px]">
            {heat.map((day) => (
              <div
                key={day.day}
                className="h-6 flex-1 rounded-[3px]"
                title={`${day.day.slice(8)}.${day.day.slice(5, 7)} · ${Math.round(day.spent)}`}
                style={{
                  background: `color-mix(in srgb, var(--danger) ${Math.round(day.heat * 82)}%, var(--surface-2))`,
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ==== The days that carried the month ==== */}
      {heavy.length > 0 && monthSpent > 0 && (
        <section className="card reveal p-4">
          <div className="panel-head mb-2">
            <span>{t('The days that carried the month')}</span>
            <span className="text-faint">{heavyShare}% {t('of all spending')}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {heavy.map((day) => (
              <div key={day.day} className="flex items-baseline justify-between gap-2 text-[0.88rem]">
                <span className="tabular text-muted">
                  {day.day.slice(8)}.{day.day.slice(5, 7)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.82rem] text-faint">
                  {t('mostly')} {day.mostly} (<Money value={Math.round(day.mostlyAmount)} />)
                </span>
                <span className="tabular flex-none font-semibold">
                  <Money value={Math.round(day.spent)} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ==== Against last month ==== */}
      {delta !== null && (
        <section className="card reveal p-4">
          <div className="panel-head mb-2">
            <span>{t('Against last month')}</span>
            <span
              className={`tabular font-semibold ${
                delta.now > delta.before ? 'text-danger' : 'text-good'
              }`}
            >
              {delta.now > delta.before ? '+' : '−'}
              <Money value={Math.round(Math.abs(delta.now - delta.before))} />
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {delta.moves.map((move) => {
              const grew = move.now > move.before;

              return (
                <div key={move.name} className="flex items-baseline justify-between gap-2 text-[0.86rem]">
                  <span className="truncate">{move.name}</span>
                  <span className="tabular flex-none">
                    <span className="text-faint"><Money value={Math.round(move.before)} /></span>
                    {' → '}
                    <span className={grew ? 'text-danger' : 'text-good'}>
                      <Money value={Math.round(move.now)} />
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <p className="field-hint mt-2">
            {t('The categories that moved most. Totals say whether it got dearer; this says where.')}
          </p>
        </section>
      )}
    </>
  );
}
