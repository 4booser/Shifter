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
import { hoursWord, shiftsWord } from '@/lib/text/plural';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/**
 * The year: the poster first, then the year written out, then the chapters.
 *
 * The hero is the thesis — the figure and the shape of the year behind it —
 * and everything under it is evidence. Chapters vanish when the fact they
 * need is missing, so a year without fines never explains that nothing
 * happened.
 */
export function Wrapped() {
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
          <h1 className="text-2xl font-bold tracking-tight">Твой год</h1>
          <span className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Прошлый год" onClick={() => setYear((was) => was - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-14 text-center text-lg font-bold tabular">{year}</span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Следующий год"
              disabled={year >= Number(todayKey().slice(0, 4))}
              onClick={() => setYear((was) => was + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </span>
        </div>

        <Button variant="ghost" size="sm" asChild>
          <a href="/wrapped">
            Старая версия
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
          Не дотянулись до сервера.
        </p>
      ) : shifts === 0 ? (
        <p className="card p-6 text-center">
          <span className="block text-lg font-semibold">В {year} году записей пока нет</span>
          <span className="field-hint">Отметьте несколько смен — и год начнёт собираться сам.</span>
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
              {shifts} {shiftsWord(shifts)} · {Math.round(summary.hours)} ч ·{' '}
              {summary.hours > 0 ? `${money(summary.total_earned / summary.hours)}/час` : '—'}
            </p>

            {/* The shape of the year, right in the hero: twelve columns, the
                tallest at full ink and the rest standing back. */}
            {/* Twelve months, tallest at full ink. A month with nothing in it
                draws a floor tick rather than a bar: a stub the height of a
                hairline reads as «a little», and nothing is not a little. */}
            <div className="relative mx-auto mt-6 flex h-24 max-w-lg items-end justify-center gap-1.5">
              {months.map((value, index) => {
                const peak = Math.max(1, ...months);
                const names = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];

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
    `В ${year} году вы отработали ${shifts} ${shiftsWord(shifts)} — ${Math.round(summary.hours)} ${hoursWord(Math.round(summary.hours))}, и они принесли ${money(summary.total_earned)}.`,
    `Час вашего года стоил ${money(perHour)}${
      grew === null
        ? '.'
        : grew === 0
          ? ', ровно столько же, сколько годом раньше.'
          : grew > 0
            ? ` — на ${grew}% больше, чем годом раньше.`
            : ` — на ${Math.abs(grew)}% меньше, чем годом раньше.`
    }`,
  ];

  if (summary.tips_earned > 0) {
    lines.push(`Чаевые принесли ${money(summary.tips_earned)} — ${tipShare}% от всего.`);
  }

  if (summary.night_hours > 0) {
    lines.push(
      `${Math.round((summary.night_hours / Math.max(1, summary.hours)) * 100)}% этих часов были ночными.`,
    );
  }

  if (top !== null && summary.by_location.length > 1) {
    lines.push(
      `Больше всего — ${Math.round((top.earned / summary.total_earned) * 100)}% — принесло ${top.name}.`,
    );
  }

  if (summary.deductions > 0) {
    lines.push(`${money(summary.deductions)} удержано штрафами и питанием.`);
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1.5 text-base font-bold">Ваш год словами</h2>
      <p className="text-[0.98rem] leading-relaxed text-muted-foreground">{lines.join(' ')}</p>
    </section>
  );
}

/** What the year's money was made of, as one bar with its parts named. */
function MadeOf({ summary }: { summary: DaysResponse }) {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const parts = [
    { name: 'Смены', value: summary.shifts_earned - summary.revenue_earned, hue: 'var(--s1)' },
    { name: 'Чаевые', value: summary.tips_earned, hue: 'var(--s3)' },
    { name: 'Процент с выручки', value: summary.revenue_earned, hue: 'var(--s4)' },
    { name: 'Ночные и праздничные', value: summary.premium_earned, hue: 'var(--s2)' },
    { name: 'Продажи', value: summary.sales_earned, hue: 'var(--s5)' },
  ].filter((part) => part.value > 0);

  const total = parts.reduce((sum, part) => sum + part.value, 0);

  if (parts.length < 2 || total <= 0) return null;

  return (
    <section className="card p-5">
      <h2 className="mb-2 text-base font-bold">Из чего сложился год</h2>

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
