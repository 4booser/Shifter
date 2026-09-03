'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { addMonths, currentMonth, formatPeriod, monthBounds, monthLabel, todayKey } from '@/lib/calendar/calendar-date';
import { averagesFor } from '@/lib/calendar/insights';
import { DaysResponse, EMPTY_SUMMARY } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { AreaChart } from '@/components/charts/charts';
import { Shell } from '@/components/layout/shell';
import { Alert, Delta, Money } from '@/components/ui/bits';

export default function ComparePage() {
  return (
    <Shell>
      <Compare />
    </Shell>
  );
}

type Preset = 'months' | 'years' | 'custom';

interface Range {
  from: string;
  to: string;
  label: string;
}

/**
 * Two stretches of time side by side — the page that answers "did changing
 * jobs actually pay", which is the question all this record-keeping exists
 * for. A is the earlier period, B the later; every delta reads B against A.
 */
function Compare() {
  const { t, lang, num } = useI18n();
  const { format } = useMoney();

  const now = currentMonth();
  const previous = addMonths(now, -1);

  const defaults = useMemo(
    () => ({
      a: {
        ...monthBounds(`${previous.year}-${`${previous.month}`.padStart(2, '0')}-01`),
        label: monthLabel(previous, lang),
      },
      b: { ...monthBounds(todayKey()), label: monthLabel(now, lang) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  const [preset, setPreset] = useState<Preset>('months');
  const [customA, setCustomA] = useState(() => ({ from: defaults.a.from, to: defaults.a.to }));
  const [customB, setCustomB] = useState(() => ({ from: defaults.b.from, to: defaults.b.to }));

  const ranges = useMemo((): { a: Range; b: Range } => {
    if (preset === 'months') return defaults;

    if (preset === 'years') {
      const year = now.year;

      return {
        a: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: `${year - 1}` },
        b: { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}` },
      };
    }

    return {
      a: { ...customA, label: formatPeriod(customA.from, customA.to, lang) },
      b: { ...customB, label: formatPeriod(customB.from, customB.to, lang) },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customA, customB, defaults]);

  const [a, setA] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [b, setB] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      calendarApi.days(ranges.a.from, ranges.a.to),
      calendarApi.days(ranges.b.from, ranges.b.to),
    ])
      .then(([first, second]) => {
        setA(first);
        setB(second);
        setError(null);
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, [ranges.a.from, ranges.a.to, ranges.b.from, ranges.b.to]);

  const avgA = averagesFor(a);
  const avgB = averagesFor(b);

  /** Cumulative from each period's first working day, so shapes start at zero together. */
  const cumulative = (summary: DaysResponse) => {
    const sorted = [...summary.days].sort((x, y) => x.date.localeCompare(y.date));

    let running = 0;

    // A worked day, not a profitable one. Filtering on `earned > 0` dropped
    // any day that closed in the red — deductions over a short shift — and
    // the running total then disagreed with the «Заработано» row of the very
    // table underneath it.
    return sorted
      .filter((day) => day.shifts.some((entry) => entry.worked))
      .map((day, index) => ({ label: `${index + 1}`, value: (running += day.earned) }));
  };

  const seriesA = useMemo(() => cumulative(a), [a]);
  const seriesB = useMemo(() => cumulative(b), [b]);

  /*
   * `unset` marks a figure that is missing rather than nought. The hourly
   * rate is suppressed under an hour of work — there is no rate to quote —
   * and the suppression arrives here as a plain 0, which the table then
   * printed as «0 ₴» beside «↓ −100%»: the hour did not collapse to nothing,
   * it was never counted.
   */
  const facts: { label: string; a: number; b: number; money?: boolean; unset?: (value: number) => boolean }[] = [
    { label: 'Earned', a: a.total_earned, b: b.total_earned, money: true },
    { label: 'Hours', a: a.hours, b: b.hours },
    { label: 'Days worked', a: a.days_worked, b: b.days_worked },
    { label: 'Per hour', a: avgA.perHour, b: avgB.perHour, money: true, unset: (value) => value === 0 },
    { label: 'Per working day', a: avgA.perDay, b: avgB.perDay, money: true },
    { label: 'Tips', a: a.tips_earned, b: b.tips_earned, money: true },
    { label: 'Take-home', a: a.net_earned, b: b.net_earned, money: true },
    { label: 'Overtime', a: a.overtime_earned, b: b.overtime_earned, money: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Compare periods')}</h1>

        <div className="seg ml-auto">
          {(
            [
              { value: 'months', label: 'This month vs last' },
              { value: 'years', label: 'This year vs last' },
              { value: 'custom', label: 'Custom' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className={`seg-btn ${preset === option.value ? 'is-active' : ''}`}
              onClick={() => setPreset(option.value)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="card reveal flex flex-wrap items-end gap-3 p-3">
          {(
            [
              { key: 'a' as const, range: customA, set: setCustomA },
              { key: 'b' as const, range: customB, set: setCustomB },
            ]
          ).map((side) => (
            <div key={side.key} className="flex items-end gap-1.5">
              <span className="pb-2 text-[0.9rem] font-bold uppercase text-muted">{side.key}</span>
              <label>
                <span className="field-hint">{t('From')}</span>
                <input
                  type="date"
                  className="field-input !w-36"
                  value={side.range.from}
                  onChange={(event) => side.set({ ...side.range, from: event.target.value })}
                />
              </label>
              <label>
                <span className="field-hint">{t('To')}</span>
                <input
                  type="date"
                  className="field-input !w-36"
                  value={side.range.to}
                  onChange={(event) => side.set({ ...side.range, to: event.target.value })}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ==== The verdict ==== */}
      <section className="card reveal glow p-4">
        <p className="text-[1.05rem]">
          <strong>{ranges.b.label}</strong>{' '}
          {b.total_earned >= a.total_earned ? (
            <>
              {t('is ahead of')} <strong>{ranges.a.label}</strong> {t('by')}{' '}
              <Money value={b.total_earned - a.total_earned} className="font-bold text-good-read" />
            </>
          ) : (
            <>
              {t('is behind')} <strong>{ranges.a.label}</strong> {t('by')}{' '}
              <Money value={a.total_earned - b.total_earned} className="font-bold text-danger-read" />
            </>
          )}
          {avgA.perHour > 0 && avgB.perHour > 0 && (
            <span className="field-hint block">
              {t('The hour went from')} {format(avgA.perHour)} {t('to')} {format(avgB.perHour)}.
            </span>
          )}
        </p>
      </section>

      {/* ==== Shape ==== */}
      {(seriesA.length > 1 || seriesB.length > 1) && (
        <section className="card reveal p-4">
          <h2 className="mb-1 text-[0.98rem] font-bold">{t('Cumulative, day by working day')}</h2>
          <AreaChart points={seriesB} comparison={seriesA} emptyNote={t('Neither stretch has anything in it yet.')} />
          <p className="field-hint mt-1 flex gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-(--accent)" /> {ranges.b.label}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-faint" /> {ranges.a.label}
            </span>
          </p>
        </section>
      )}

      {/* ==== Facts ==== */}
      <section className="card reveal overflow-x-auto p-4">
        <table className="w-full min-w-[30rem] border-collapse text-[0.88rem]">
          <thead>
            <tr className="border-b border-border text-left text-[0.72rem] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-2 font-semibold" />
              <th className="py-1.5 pr-2 text-right font-semibold">{ranges.a.label}</th>
              <th className="py-1.5 pr-2 text-right font-semibold">{ranges.b.label}</th>
              <th className="py-1.5 text-right font-semibold">Δ</th>
            </tr>
          </thead>
          <tbody>
            {facts
              .filter((fact) => fact.a !== 0 || fact.b !== 0)
              .map((fact, index) => (
                <tr key={fact.label} className="cell-in border-b border-border/60" style={{ ['--i' as string]: index }}>
                  <td className="py-1.5 pr-2 text-muted">{t(fact.label)}</td>
                  <td className="py-1.5 pr-2 text-right tabular">
                    {fact.unset?.(fact.a) === true
                      ? '—'
                      : fact.money === true
                        ? format(fact.a)
                        : num(Math.round(fact.a * 10) / 10)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular">
                    {fact.unset?.(fact.b) === true
                      ? '—'
                      : fact.money === true
                        ? format(fact.b)
                        : num(Math.round(fact.b * 10) / 10)}
                  </td>
                  <td className="py-1.5 text-right">
                    <Delta
                      percent={
                        fact.a === 0 || fact.unset?.(fact.a) === true || fact.unset?.(fact.b) === true
                          ? null
                          : ((fact.b - fact.a) / Math.abs(fact.a)) * 100
                      }
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
