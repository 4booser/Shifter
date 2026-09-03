import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  CostOfWork,
  Elsewhere,
  Raises,
  Records,
  YearGrid,
  ZoneTips,
} from '@/components/wrapped/chapters';
import { Skeleton } from '@/components/ui/skeleton';
import { calendarApi } from '@/lib/api/calendar';
import { DaysResponse } from '@/lib/calendar/models';
import { todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * The year: the poster first, then the year written out, then the chapters.
 *
 * The hero is the thesis — the figure and the shape of the year behind it —
 * and everything under it is evidence. Chapters vanish when the fact they
 * need is missing, so a year without fines never explains that nothing
 * happened.
 */
export function Wrapped() {
  const { t, n, lang } = useI18n();
  // Asked of the locale: Ukrainian's month initials are not Russian's.
  const MONTH_INITIALS = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(lang, { month: 'narrow' })
      .format(new Date(Date.UTC(2026, index, 15)))
      .toUpperCase(),
  );
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  const [year, setYear] = useState(Number(todayKey().slice(0, 4)));

  const current = useQuery({
    queryKey: ['days', `${year}-01-01`, `${year}-12-31`],
    queryFn: () => calendarApi.days(`${year}-01-01`, `${year}-12-31`),
  });
  const previous = useQuery({
    queryKey: ['days', `${year - 1}-01-01`, `${year - 1}-12-31`],
    queryFn: () => calendarApi.days(`${year - 1}-01-01`, `${year - 1}-12-31`),
  });

  const summary = current.data;

  const months = useMemo(() => {
    if (summary === undefined) return [];

    const totals = new Array(12).fill(0) as number[];

    for (const day of summary.days) totals[Number(day.date.slice(5, 7)) - 1] += day.earned;

    return totals;
  }, [summary]);

  const shifts =
    summary?.days.reduce(
      (count, day) => count + day.shifts.filter((entry) => entry.worked).length,
      0,
    ) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{t('Your year')}</h1>
          <span className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label={t('Last year')} onClick={() => setYear((was) => was - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-14 text-center text-lg font-bold tabular">{year}</span>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('Next year')}
              disabled={year >= Number(todayKey().slice(0, 4))}
              onClick={() => setYear((was) => was + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </span>
        </div>

        <Button variant="ghost" size="sm" asChild>
          <a href="/wrapped">
            {t('Old version')}
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      </header>

      {current.isPending ? (
        <>
          <Skeleton className="h-64 rounded-[var(--radius-card)]" />
          <Skeleton className="h-40 rounded-[var(--radius-card)]" />
        </>
      ) : summary === undefined ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          {t('Could not reach the server.')}
        </p>
      ) : shifts === 0 ? (
        <p className="card p-6 text-center">
          <span className="block text-lg font-semibold">{t('Nothing written down for {year} yet', { year })}</span>
          <span className="field-hint">{t('Mark a few shifts and the year starts assembling itself.')}</span>
        </p>
      ) : (
        <>
          <section className="card relative overflow-hidden p-8 text-center">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 grid select-none place-items-center font-black leading-none tracking-tighter"
              style={{ fontSize: 'clamp(9rem, 30vw, 22rem)', color: 'var(--accent)', opacity: 0.07 }}
            >
              {year}
            </span>

            <p className="relative text-5xl font-black tabular text-good sm:text-6xl">
              {money(summary.total_earned)}
            </p>
            <p className="field-hint relative mt-2">
              {n(shifts, 'shifts')} · {Math.round(summary.hours)} {t('h')} ·{' '}
              {/* An hour is the floor, not nought: a shift closed after fifty
                  seconds priced the hour at −₴3 805 on the other client. This
                  is the last of five copies of that rule. */}
              {summary.hours >= 1 ? `${money(summary.total_earned / summary.hours)}/${t('h')}` : '—'}
            </p>

            {/* The shape of the year, right in the hero: twelve columns, the
                tallest at full ink and the rest standing back. */}
            {/* Twelve months, tallest at full ink. A month with nothing in it
                draws a floor tick rather than a bar: a stub the height of a
                hairline reads as «a little», and nothing is not a little. */}
            <div className="relative mx-auto mt-6 flex h-24 max-w-lg items-end justify-center gap-1.5">
              {months.map((value, index) => {
                const peak = Math.max(1, ...months);
                const names = MONTH_INITIALS;

                return (
                  <span key={index} className="flex h-full w-full max-w-8 flex-col justify-end gap-1">
                    {value > 0 ? (
                      <span
                        className="rounded-t-[3px]"
                        style={{
                          height: `${Math.max(6, (value / peak) * 100)}%`,
                          background: 'var(--accent)',
                          opacity: value === peak ? 1 : 0.5,
                        }}
                        title={money(value)}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="h-px w-full"
                        style={{ background: 'var(--border-strong)' }}
                      />
                    )}
                    <span className="text-2xs text-faint">{names[index]}</span>
                  </span>
                );
              })}
            </div>
          </section>

          <YearStory year={year} summary={summary} previous={previous.data} />

          <YearGrid summary={summary} year={year} />

          {/* Columns, so a two-line chapter does not stretch to match a
              ten-line one and leave a hole where the year should be. */}
          <div className="columns-1 gap-3 lg:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
            <MadeOf summary={summary} />
            <Records summary={summary} />
            <ZoneTips summary={summary} />
            <Raises summary={summary} />
            <CostOfWork summary={summary} />
            <Elsewhere summary={summary} />
          </div>
        </>
      )}
    </div>
  );
}

/** The year in one paragraph, each sentence guarded by the fact it needs. */
function YearStory({
  year,
  summary,
  previous,
}: {
  year: number;
  summary: DaysResponse;
  previous: DaysResponse | undefined;
}) {
  const { t, n } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const shifts = summary.days.reduce(
    (count, day) => count + day.shifts.filter((entry) => entry.worked).length,
    0,
  );
  const perHour = summary.hours > 0 ? summary.total_earned / summary.hours : 0;
  const beforeHour =
    previous !== undefined && previous.hours > 0 ? previous.total_earned / previous.hours : 0;
  const grew = beforeHour > 0 ? Math.round((perHour / beforeHour - 1) * 100) : null;
  const tipShare =
    summary.total_earned > 0 ? Math.round((summary.tips_earned / summary.total_earned) * 100) : 0;
  const top =
    [...summary.by_location]
      .filter((place) => place.location_id !== 0 && place.name.trim() !== '')
      .sort((one, two) => two.earned - one.earned)[0] ?? null;

  const lines: string[] = [
    t('In {year} you worked {shifts} — {hours}, and they brought {money}.', {
      year,
      shifts: n(shifts, 'shifts'),
      hours: n(Math.round(summary.hours), 'hours'),
      money: money(summary.total_earned),
    }),
    t('An hour of your year was worth {money}.', { money: money(perHour) }).replace(/\.$/, '') +
      (grew === null
        ? '.'
        : grew === 0
          ? t(', exactly as much as the year before.')
          : grew > 0
            ? t(' — {percent}% more than the year before.', { percent: grew })
            : t(' — {percent}% less than the year before.', { percent: Math.abs(grew) })),
  ];

  if (summary.tips_earned > 0) {
    lines.push(
      t('Tips brought {money} — {percent}% of everything.', {
        money: money(summary.tips_earned),
        percent: tipShare,
      }),
    );
  }

  if (summary.night_hours > 0) {
    lines.push(
      t('{percent}% of those hours were at night.', {
        percent: Math.round((summary.night_hours / Math.max(1, summary.hours)) * 100),
      }),
    );
  }

  if (top !== null && summary.by_location.length > 1) {
    lines.push(
      t('Most of it — {percent}% — came from {place}.', {
        percent: Math.round((top.earned / summary.total_earned) * 100),
        place: top.name,
      }),
    );
  }

  if (summary.deductions > 0) {
    lines.push(t('{money} was withheld in fines and meals.', { money: money(summary.deductions) }));
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1.5 text-base font-bold">{t('Your year, written out')}</h2>
      <p className="text-[0.98rem] leading-relaxed text-muted-foreground">{lines.join(' ')}</p>
    </section>
  );
}

/** What the year's money was made of, as one bar with its parts named. */
function MadeOf({ summary }: { summary: DaysResponse }) {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const parts = [
    { name: t('Shifts'), value: summary.shifts_earned - summary.revenue_earned, hue: 'var(--s1)' },
    { name: t('Tips'), value: summary.tips_earned, hue: 'var(--s3)' },
    { name: t('A percentage of takings'), value: summary.revenue_earned, hue: 'var(--s4)' },
    { name: t('Night and holiday'), value: summary.premium_earned, hue: 'var(--s2)' },
    { name: t('Sales'), value: summary.sales_earned, hue: 'var(--s5)' },
  ].filter((part) => part.value > 0);

  const total = parts.reduce((sum, part) => sum + part.value, 0);

  if (parts.length < 2 || total <= 0) return null;

  return (
    <section className="card p-5">
      <h2 className="mb-2 text-base font-bold">{t('What the year was made of')}</h2>

      <div className="flex h-5 gap-[2px] overflow-hidden rounded-full">
        {parts.map((part) => (
          <span
            key={part.name}
            style={{ width: `${(part.value / total) * 100}%`, background: part.hue }}
            title={`${part.name} — ${money(part.value)}`}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {parts.map((part) => (
          <li key={part.name} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <i className="size-2 flex-none rounded-full" style={{ background: part.hue }} />
              <span className="truncate" title={part.name}>{part.name}</span>
            </span>
            <span className={cn('flex-none tabular')}>
              {money(part.value)}{' '}
              <span className="text-faint">{Math.round((part.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
