'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { currentMonth, fromKey, todayKey } from '@/lib/calendar/calendar-date';
import { forecastFor } from '@/lib/calendar/forecast';
import { averagesFor, bestDay, bestWeek, change, countShifts, longestStreak, restDays } from '@/lib/calendar/insights';
import { DaysResponse, EMPTY_SUMMARY } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { Shell } from '@/components/layout/shell';
import { Heatmap } from '@/components/charts/charts';
import { Alert, CountUp, Delta, Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/** Earned by hours worked in the year — the badge at the top of the page. */
const TIERS: { hours: number; name: string; emoji: string }[] = [
  { hours: 1800, name: 'Legend of the floor', emoji: '👑' },
  { hours: 1200, name: 'Iron shift', emoji: '🔥' },
  { hours: 800, name: 'Backbone of the place', emoji: '💪' },
  { hours: 400, name: 'Steady hand', emoji: '⚓️' },
  { hours: 150, name: 'Getting the rhythm', emoji: '🎯' },
  { hours: 0, name: 'Just getting started', emoji: '🌱' },
];

export default function WrappedPage() {
  return (
    <Shell>
      <Wrapped />
    </Shell>
  );
}

/**
 * The year in review: a handful of superlatives, each given a whole card, and
 * — while the year still runs — where it is heading at today's pace.
 */
function Wrapped() {
  const { t, lang } = useI18n();

  const [year, setYear] = useState(currentMonth().year);
  const [summary, setSummary] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [previous, setPrevious] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    void Promise.all([
      calendarApi.days(`${year}-01-01`, `${year}-12-31`),
      calendarApi.days(`${year - 1}-01-01`, `${year - 1}-12-31`),
    ])
      .then(([current, before]) => {
        setSummary(current);
        setPrevious(before);
      })
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setLoading(false));
  }, [year]);

  const days = summary.days;
  const averages = averagesFor(summary);
  const before = averagesFor(previous);
  const totalShifts = countShifts(days);
  const isCurrentYear = year === currentMonth().year;
  const forecast = forecastFor(days, `${year}-01-01`, `${year}-12-31`);
  const live = isCurrentYear && forecast.live;
  const projectedHours =
    forecast.elapsed === 0 ? summary.hours : (summary.hours / forecast.elapsed) * (forecast.elapsed + forecast.remaining);
  const tier = TIERS.find((entry) => (live ? projectedHours : summary.hours) >= entry.hours) ?? TIERS[TIERS.length - 1];

  const favouriteShift = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; hours: number; symbol: string | null }>();

    for (const day of days) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        const bucket = counts.get(entry.name) ?? { name: entry.name, count: 0, hours: 0, symbol: entry.symbol };

        bucket.count += 1;
        bucket.hours += entry.hours;
        counts.set(entry.name, bucket);
      }
    }

    return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  }, [days]);

  const topPlace = [...summary.by_location].sort((a, b) => b.earned - a.earned)[0] ?? null;

  const topSale = useMemo(() => {
    const counts = new Map<string, { name: string; quantity: number; earned: number }>();

    for (const day of days) {
      for (const entry of day.sales) {
        const bucket = counts.get(entry.name) ?? { name: entry.name, quantity: 0, earned: 0 };

        bucket.quantity += entry.quantity;
        bucket.earned += entry.earned;
        counts.set(entry.name, bucket);
      }
    }

    return [...counts.values()].sort((a, b) => b.quantity - a.quantity)[0] ?? null;
  }, [days]);

  /** Twelve bars, this year against last on one scale. */
  const monthBars = useMemo(() => {
    const totals = new Array(12).fill(0) as number[];
    const beforeTotals = new Array(12).fill(0) as number[];

    for (const day of days) totals[Number(day.date.slice(5, 7)) - 1] += day.earned;
    for (const day of previous.days) beforeTotals[Number(day.date.slice(5, 7)) - 1] += day.earned;

    const peak = Math.max(...totals, ...beforeTotals, 1);
    const initial = new Intl.DateTimeFormat(lang, { month: 'narrow' });
    const full = new Intl.DateTimeFormat(lang, { month: 'long' });

    return totals.map((value, index) => ({
      label: initial.format(new Date(year, index, 1)),
      title: full.format(new Date(year, index, 1)),
      value,
      height: Math.max(2, (value / peak) * 100),
      peak: value === peak && value > 0,
      beforeHeight: beforeTotals[index] > 0 ? Math.max(2, (beforeTotals[index] / peak) * 100) : 0,
    }));
  }, [days, previous.days, year, lang]);

  const weekdayRhythm = useMemo(() => {
    const totals = new Array(7).fill(0) as number[];

    for (const day of days) totals[(fromKey(day.date).getDay() + 6) % 7] += day.earned;

    const peak = Math.max(...totals, 1);
    const names = new Intl.DateTimeFormat(lang, { weekday: 'short' });

    return totals.map((value, index) => ({
      // 2026-01-05 was a Monday, so index 0 lands on Monday in every locale.
      label: names.format(new Date(2026, 0, 5 + index)),
      value,
      share: Math.max(2, (value / peak) * 100),
      peak: value === peak && value > 0,
    }));
  }, [days, lang]);

  const nightShare = useMemo(() => {
    let nights = 0;
    let all = 0;

    for (const day of days) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        all += 1;

        const hour = Number(entry.start_time.slice(0, 2));

        if (hour >= 20 || hour < 5) nights += 1;
      }
    }

    return all === 0 ? 0 : (nights / all) * 100;
  }, [days]);

  const best = bestDay(days);
  const week = bestWeek(days);
  const streak = longestStreak(days);
  const rest = restDays(days, `${year}-01-01`, isCurrentYear ? todayKey() : `${year}-12-31`);
  const heatValues = useMemo(() => new Map(days.map((day) => [day.date, day.earned])), [days]);

  const dayLabel = (key: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(fromKey(key));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Your year')}</h1>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="btn btn-sm px-2" onClick={() => setYear((value) => value - 1)} aria-label={t('Previous')}>
            <Icon name="chevron-left" size={15} />
          </button>
          <span className="w-14 text-center text-[1.05rem] font-bold tabular">{year}</span>
          <button
            type="button"
            className="btn btn-sm px-2"
            disabled={isCurrentYear}
            onClick={() => setYear((value) => value + 1)}
            aria-label={t('Next')}
          >
            <Icon name="chevron-right" size={15} />
          </button>
        </span>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <p className="field-hint">{t('Loading…')}</p>
      ) : days.length === 0 ? (
        <p className="field-hint">{t('Nothing recorded this year yet.')}</p>
      ) : (
        <>
          {/* ==== The badge ==== */}
          <section className="card rise p-6 text-center">
            <span className="text-[2.6rem]">{tier.emoji}</span>
            <h2 className="text-[1.35rem] font-bold">{t(tier.name)}</h2>
            <p className="field-hint">
              {live
                ? `${t('On pace for')} ${Math.round(projectedHours)} ${t('hours this year')}`
                : `${Math.round(summary.hours)} ${t('hours')}`}
            </p>
          </section>

          {/* ==== Headline numbers ==== */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Big label={t('Earned')} delta={change(summary.total_earned, previous.total_earned)}>
              <CountUp value={summary.total_earned} className="text-[1.3rem] font-bold text-good" />
            </Big>
            <Big label={t('Minutes worked')} delta={change(summary.hours, previous.hours)}>
              <CountUp value={Math.round(summary.hours * 60)} format={(value) => `${Math.round(value).toLocaleString(lang)}`} className="text-[1.3rem] font-bold" />
            </Big>
            <Big label={t('Shifts')} delta={change(totalShifts, countShifts(previous.days))}>
              <span className="text-[1.3rem] font-bold tabular">{totalShifts}</span>
            </Big>
            <Big label={t('Per hour')} delta={change(averages.perHour, before.perHour)}>
              <Money value={averages.perHour} className="text-[1.3rem] font-bold" />
            </Big>
          </div>

          {/* ==== Twelve months, against last year ==== */}
          <section className="card p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('Month by month')}</h2>
            <div className="flex h-36 items-end gap-1.5">
              {monthBars.map((bar) => (
                <div key={bar.title} className="group flex h-full flex-1 flex-col justify-end" title={bar.title}>
                  <div className="relative flex h-full items-end">
                    {/* Last year's same month, behind: the mark to beat. */}
                    {bar.beforeHeight > 0 && (
                      <span className="absolute bottom-0 left-0 w-full rounded-t bg-faint/30" style={{ height: `${bar.beforeHeight}%` }} />
                    )}
                    <span
                      className="relative w-full rounded-t"
                      style={{ height: `${bar.height}%`, background: bar.peak ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, var(--surface-2))' }}
                    />
                  </div>
                  <span className="mt-0.5 text-center text-[0.66rem] text-faint">{bar.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ==== The whole year as one grid ==== */}
          <section className="card p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('The shape of the year')}</h2>
            <Heatmap values={heatValues} from={`${year}-01-01`} to={`${year}-12-31`} />
          </section>

          {/* ==== Superlatives ==== */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {best !== null && (
              <Superlative emoji="🏆" title={t('Best day')}>
                <Money value={best.value} className="text-[1.15rem] font-bold" /> · {dayLabel(best.date)}
              </Superlative>
            )}
            {week !== null && (
              <Superlative emoji="📈" title={t('Best week')}>
                <Money value={week.value} className="text-[1.15rem] font-bold" /> · {dayLabel(week.from)} — {dayLabel(week.to)}
              </Superlative>
            )}
            {streak !== null && (
              <Superlative emoji="🔥" title={t('Longest streak')}>
                {streak.length} {t('days running')} · {dayLabel(streak.from)} — {dayLabel(streak.to)}
              </Superlative>
            )}
            {favouriteShift !== null && (
              <Superlative emoji={favouriteShift.symbol ?? '⭐️'} title={t('Favourite shift')}>
                {favouriteShift.name} · {favouriteShift.count} {t('times')}
              </Superlative>
            )}
            {topPlace !== null && (
              <Superlative emoji="🏠" title={t('Top place')}>
                {topPlace.name} · <Money value={topPlace.earned} className="font-bold" />
              </Superlative>
            )}
            {topSale !== null && (
              <Superlative emoji="🛍️" title={t('Most sold')}>
                {topSale.name} · {topSale.quantity} {t('units')}
              </Superlative>
            )}
            <Superlative emoji="🌙" title={t('Nights')}>
              {Math.round(nightShare)}% {t('of shifts started after 20:00')}
            </Superlative>
            <Superlative emoji="�_2" title={t('Rest')}>
              {rest} {t('days off')}
            </Superlative>
          </div>

          {/* ==== Weekday rhythm ==== */}
          <section className="card p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('Weekday rhythm')}</h2>
            <ul className="flex flex-col gap-1.5">
              {weekdayRhythm.map((day) => (
                <li key={day.label} className="grid grid-cols-[2.6rem_1fr_auto] items-center gap-2 text-[0.85rem]">
                  <span className="capitalize text-muted">{day.label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${day.share}%`, background: day.peak ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 50%, var(--surface-2))' }}
                    />
                  </span>
                  <Money value={day.value} className="tabular" />
                </li>
              ))}
            </ul>
          </section>

          {/* ==== Where the year is heading ==== */}
          {live && (
            <section className="card border-(--accent)/40 p-4">
              <h2 className="mb-1 text-[0.98rem] font-bold">{t('Where the year is heading')}</h2>
              <p className="text-[0.9rem]">
                {t('At today’s pace the year ends at')} <Money value={forecast.projected} className="font-bold text-good" />{' '}
                {t('and')} <strong className="tabular">{Math.round(projectedHours)}</strong> {t('hours')} —{' '}
                <Money value={Math.max(0, forecast.projected - forecast.earnedSoFar)} /> {t('still ahead')}.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Big({ label, delta, children }: { label: string; delta: number | null; children: React.ReactNode }) {
  return (
    <div className="card rise p-3 text-center">
      {children}
      <span className="field-hint flex items-center justify-center gap-1.5">
        {label} <Delta percent={delta} />
      </span>
    </div>
  );
}

function Superlative({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card rise flex items-center gap-3 p-3.5">
      <span className="text-[1.6rem]">{emoji === '�_2' ? '🛌' : emoji}</span>
      <span className="min-w-0">
        <span className="field-hint block">{title}</span>
        <span className="text-[0.92rem]">{children}</span>
      </span>
    </div>
  );
}
