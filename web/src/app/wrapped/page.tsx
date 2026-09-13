'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { api } from '@/lib/api/http';
import { apiErrorMessage } from '@/lib/api/http';
import { currentMonth, fromKey, todayKey } from '@/lib/calendar/calendar-date';
import { forecastFor } from '@/lib/calendar/forecast';
import { averagesFor, bestDay, bestWeek, change, countShifts, longestStreak, restDays } from '@/lib/calendar/insights';
import { DaysResponse, EMPTY_SUMMARY, placeName } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { currentCardTheme } from '@/lib/export/share-card';
import { drawStoryCard } from '@/lib/export/story-card';
import { downloadBlob } from '@/lib/export/xlsx';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { Shell } from '@/components/layout/shell';
import { Stories, Story } from '@/components/wrapped/stories';
import { BadgeWall } from '@/components/achievements/badges';
import { useReveal } from '@/lib/fx';
import { HEAT_LEVELS, Heatmap } from '@/components/charts/charts';
import { Alert, CountUp, Delta, Money } from '@/components/ui/bits';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Empty } from '@/components/ui/empty';
import { Icon } from '@/components/ui/icon';
import { useTitle } from '@/lib/use-title';
import { YearStory } from '@/components/wrapped/year-story';
import { CostOfWork, MadeOf, OwedLater, RaiseTrail, RoomCounted, ZoneTips } from '@/components/wrapped/year-charts';
import { earnedTone } from '@/lib/tone';

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
  const { t, n, lang, num } = useI18n();

  useTitle('Your year');
  const revealHost = useReveal<HTMLDivElement>();

  const [year, setYear] = useState(currentMonth().year);
  const [summary, setSummary] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [previous, setPrevious] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);
  const settings = useSettings((state) => state.settings);

  const [shelf, setShelf] = useState<{
    cheers: { period: string; period_from: string; amount: number }[];
  } | null>(null);
  const [cities, setCities] = useState<{ city: string; per_hour: number }[]>([]);

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

    // The year's other chapters: absent where the data is, honestly.
    void api<{ cheers: { period: string; period_from: string; amount: number }[] }>(
      '/shifter/v1/goals/history',
    ).then(setShelf).catch(() => setShelf(null));
    void api<{ city: string; per_hour: number }[]>('/shifter/v1/gigs/cities')
      .then(setCities)
      .catch(() => setCities([]));
  }, [year]);

  const yearCheers = (shelf?.cheers ?? []).filter(
    (cheer) => cheer.period_from.startsWith(`${year}-`),
  );

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
      before: beforeTotals[index],
      /** Доля от лучшего месяца — ширина полосы в строке. */
      share: Math.max(2, (value / peak) * 100),
      peak: value === peak && value > 0,
      beforeHeight: beforeTotals[index] > 0 ? Math.max(2, (beforeTotals[index] / peak) * 100) : 0,
    }));
  }, [days, previous.days, year, lang]);

  /*
   * Три меры одного ритма, а не три разных блока.
   *
   * Деньги отвечают «какой день кормит», часы — «где я стою дольше всего», а
   * ставка — «какой день стоит дороже». Это один и тот же вопрос с трёх
   * сторон, и разводить их по карточкам значит просить человека собирать
   * ответ самому.
   */
  const [rhythmBy, setRhythmBy] = useState<'money' | 'hours' | 'rate'>('money');

  const weekdayRhythm = useMemo(() => {
    const money = new Array(7).fill(0) as number[];
    const hours = new Array(7).fill(0) as number[];

    for (const day of days) {
      const index = (fromKey(day.date).getDay() + 6) % 7;

      money[index] += day.earned;
      hours[index] += day.hours;
    }

    const names = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    // Час не считается там, где отработано меньше часа: две минуты делятся в
    // ставку в тысячах и выигрывают «лучший день» на пустом месте.
    const values = money.map((earned, index) =>
      rhythmBy === 'money' ? earned
      : rhythmBy === 'hours' ? hours[index]
      : hours[index] >= 1 ? earned / hours[index] : 0,
    );

    const peak = Math.max(...values, 1);

    return values.map((value, index) => ({
      // 2026-01-05 was a Monday, so index 0 lands on Monday in every locale.
      label: names.format(new Date(2026, 0, 5 + index)),
      value,
      share: Math.max(2, (value / peak) * 100),
      peak: value === peak && value > 0,
    }));
  }, [days, lang, rhythmBy]);

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
  /** Год в плюсе — герой заливается акцентом; год в минусе остаётся светлым. */
  const filled = summary.total_earned >= 0;

  const heatValues = useMemo(() => new Map(days.map((day) => [day.date, day.earned])), [days]);

  const dayLabel = (key: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(fromKey(key));

  /**
   * The year as a poster. The same 9:16 card the month already draws, because
   * the thing people actually post at the end of December is a picture, not a
   * screenshot of a dashboard with a browser bar across the top.
   */
  const poster = () => {
    setPosting(true);
    setError(null);

    const lines = [
      `${tier.emoji} ${t(tier.name)}`,
      best !== null ? `${t('Best day')}: ${formatMoney(settings, best.value)}` : null,
      favouriteShift !== null ? `${t('Favourite shift')}: ${favouriteShift.name}` : null,
      topPlace !== null ? `${t('Top place')}: ${placeName(topPlace, t('No place set'))}` : null,
      summary.tips_earned > 0 ? `${t('Tips')}: ${formatMoney(settings, summary.tips_earned)}` : null,
      // Never fewer than three: a card with a hole in it reads as broken.
      averages.perHour === null
        ? `${t('Hours')}: ${num(Math.round(summary.hours))}`
        : `${t('Per hour')}: ${formatMoney(settings, averages.perHour)}`,
    ].filter((line): line is string => line !== null);

    const peak = Math.max(1, ...weekdayRhythm.map((day) => day.value));

    void drawStoryCard(
      {
        period: `${year}`,
        earned: formatMoney(settings, summary.total_earned),
        meta: `${n(totalShifts, 'shifts')} · ${n(Math.round(summary.hours), 'hours')}`,
        lines,
        rhythm: weekdayRhythm.map((day) => day.value / peak),
        brand: 'shifter.ink',
      },
      currentCardTheme(),
    )
      .then((blob) => downloadBlob(`shifter-${year}.png`, blob))
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setPosting(false));
  };

  /**
   * The year as a sequence rather than a page. One fact per card, because the
   * thing people share is a card and the thing they scroll past is a page.
   */
  const stories: Story[] = [
    {
      label: `${year}`,
      value: formatMoney(settings, summary.total_earned),
      meta: `${n(totalShifts, 'shifts')} · ${n(Math.round(summary.hours), 'hours')}`,
      money: true,
      lines:
        averages.perHour === null
          ? []
          : [`${t('Per hour')}: ${formatMoney(settings, averages.perHour)}`],
    },
    {
      label: t('Hours'),
      value: `${Math.round(summary.hours)}`,
      meta: t('on your feet, over the year'),
      lines: [`${n(totalShifts, 'shifts')}`],
    },
    best !== null
      ? {
          label: t('Best day'),
          value: formatMoney(settings, best.value),
          meta: best.date,
          money: true,
        }
      : null,
    topPlace !== null
      ? {
          label: t('Top place'),
          value: placeName(topPlace, t('No place set')),
          meta: `${n(Math.round(topPlace.hours), 'hours')}`,
        }
      : null,
    nightShare > 0
      ? {
          label: t('Nights'),
          value: `${Math.round(nightShare)}%`,
          meta: t('of your shifts started after eight'),
        }
      : null,
    summary.tips_earned > 0
      ? {
          label: t('Tips'),
          value: formatMoney(settings, summary.tips_earned),
          meta: t('handed to you directly'),
          money: true,
        }
      : null,
  ].filter((card): card is Story => card !== null);

  return (
    /* Во всю ширину оболочки, как остальные страницы. `max-w-3xl` держал
       годовой отчёт в колонке 768 px посреди полутора тысяч: на мониторе он
       выглядел уже и беднее статистики, хотя рассказывает про целый год. */
    <div ref={revealHost} className="mx-auto flex max-w-[1380px] flex-col gap-4">
      {storiesOpen && (
        <Stories
          stories={stories}
          rhythm={weekdayRhythm.map((day) => day.value / Math.max(1, ...weekdayRhythm.map((entry) => entry.value)))}
          year={year}
          onClose={() => setStoriesOpen(false)}
        />
      )}
      <div className="flex items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Your year')}</h1>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="btn btn-sm !px-2" onClick={() => setYear((value) => value - 1)} aria-label={t('Previous')}>
            <Icon name="chevron-left" size={15} />
          </button>
          <span className="w-14 text-center text-[1.05rem] font-bold tabular">{year}</span>
          <button
            type="button"
            className="btn btn-sm !px-2"
            disabled={isCurrentYear}
            onClick={() => setYear((value) => value + 1)}
            aria-label={t('Next')}
          >
            <Icon name="chevron-right" size={15} />
          </button>
        </span>
      </div>

      {days.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {/* The sequence first: a card is the thing people share, and one
              static poster asks somebody to decide before they have seen it. */}
          <button type="button" className="btn btn-sm" onClick={() => setStoriesOpen(true)}>
            {t('See it as cards')}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={posting} onClick={poster}>
            <Icon name="download" size={13} />
            {posting ? t('Drawing…') : t('Download the poster')}
          </button>
        </div>
      )}

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <SkeletonRows rows={3} height="5.5rem" />
      ) : days.length === 0 ? (
        <Empty
          icon="trophy"
          title={t('This year has nothing in it yet')}
          action={{ label: t('Open the calendar'), href: '/dashboard' }}
        >
          {t('Mark a few shifts and this page fills itself: your hours, your best day, the shift you worked most — and a poster you can post.')}
        </Empty>
      ) : (
        <>
          {/*
            ==== The poster: a year that fills the screen ====

            Filled with the accent, and it swallowed the four summary tiles
            that used to sit under it as separate cards. The year's biggest
            number and the four figures explaining it were competing for the
            same attention a hand's width apart; now the four are a quiet band
            along the bottom edge of the one thing the page is about.

            A year in the red keeps the plain surface: white-on-accent cannot
            carry a loss, and colour here has to stay honest.
          */}
          <section
            className={`reveal relative flex min-h-[52dvh] flex-col items-center justify-center overflow-hidden rounded-[calc(var(--radius)*1.8)] border p-6 pb-0 text-center ${
              filled ? 'border-(--accent) bg-(--accent) text-(--accent-ink)' : 'border-border bg-surface'
            }`}
          >
            {/* The year itself is the wallpaper — enormous and half-there. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 grid select-none place-items-center font-extrabold leading-none tracking-tighter ${
                filled ? 'text-(--accent-ink)' : 'text-(--accent-read)'
              }`}
              style={{ fontSize: 'clamp(9rem, 32vw, 24rem)', opacity: filled ? 0.12 : 0.07 }}
            >
              {year}
            </span>
            <span className="pop text-[4rem] leading-none" style={{ ['--i' as string]: 1 }}>{tier.emoji}</span>
            <h2 className="pop mt-2 text-[1.6rem] font-extrabold tracking-tight" style={{ ['--i' as string]: 2 }}>
              {t(tier.name)}
            </h2>
            <span
              className="pop mt-4 block"
              style={{ fontSize: 'clamp(3rem, 9vw, 5.5rem)', lineHeight: 1, ['--i' as string]: 3 } as React.CSSProperties}
            >
              {/* На заливке тон по знаку не нужен: отрицательный год сюда не
                  попадает вовсе — он остаётся на светлой подложке выше. */}
              <CountUp
                value={summary.total_earned}
                className={`font-extrabold tabular tracking-tight ${filled ? '' : earnedTone(summary.total_earned)}`}
              />
            </span>
            <p
              className={`pop mt-3 text-[1.05rem] ${filled ? 'opacity-80' : 'text-muted'}`}
              style={{ ['--i' as string]: 4 }}
            >
              {n(totalShifts, 'shifts')} · {n(Math.round(summary.hours), 'hours')}
              {averages.perHour !== null && (
                <>
                  {' · '}
                  <Money value={averages.perHour} className={`font-semibold ${filled ? '' : 'text-ink'}`} />/{t('hour')}
                </>
              )}
            </p>
            {live && (
              <p
                className={`pop chip mt-4 ${
                  filled
                    ? '!border-(--accent-ink)/45 !bg-(--accent-ink)/25 !text-(--accent-ink)'
                    : '!border-(--accent)/40 !bg-(--accent-soft) !text-(--accent-read)'
                }`}
                style={{ ['--i' as string]: 5 }}
              >
                {t('On pace for')} {n(Math.round(projectedHours), 'hours')} {t('this year')}
              </p>
            )}
            {/* Четыре числа, объяснявшие сумму, стояли отдельными карточками
                на ладонь ниже и тянули внимание на себя. Теперь это полоса по
                нижнему краю самого героя: та же информация, но она явно
                принадлежит числу над ней. */}
            <div className="grid w-full grid-cols-2 md:grid-cols-4">
              <Big label={t('Earned')} delta={change(summary.total_earned, previous.total_earned)}>
                <CountUp
                  value={summary.total_earned}
                  className={`text-[1.35rem] font-extrabold tracking-tight ${filled ? '' : earnedTone(summary.total_earned)}`}
                />
              </Big>
              <Big label={t('Hours worked')} delta={change(summary.hours, previous.hours)}>
                <CountUp value={Math.round(summary.hours)} format={(value) => `${Math.round(value).toLocaleString(lang)}`} className="text-[1.35rem] font-extrabold tracking-tight" />
              </Big>
              <Big label={t('Shifts')} delta={change(totalShifts, countShifts(previous.days))}>
                <span className="text-[1.35rem] font-extrabold tabular tracking-tight">{totalShifts}</span>
              </Big>
              <Big
                label={t('Per hour')}
                delta={
                  averages.perHour === null || before.perHour === null
                    ? null
                    : change(averages.perHour, before.perHour)
                }
              >
                {averages.perHour === null ? (
                  <span className="text-[1.35rem] font-extrabold tabular tracking-tight">—</span>
                ) : (
                  <Money value={averages.perHour} className="text-[1.35rem] font-extrabold tracking-tight" />
                )}
              </Big>
            </div>
          </section>

          {/*
            ==== Twelve months, against last year ====

            Строками, а не столбиками. Двенадцать вертикальных полос под
            одной буквой каждая не давали прочесть ни одной суммы, а месяцы
            без записей рисовались двухпиксельными огрызками — двенадцать
            намёков на данные, которых нет. Теперь месяц, полоса, сумма и
            сравнение с тем же месяцем год назад стоят в строке, а пустые
            месяцы не рисуются вовсе.
          */}
          <section className="card reveal">
            <div className="card-head">
              <h2 className="card-head-title">{t('Month by month')}</h2>
              <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-faint">
                {t('against the same month last year')}
              </span>
            </div>
            <div className="card-body">
              {monthBars.every((bar) => bar.value === 0) ? (
                <p className="field-hint">{t('Nothing recorded this year yet.')}</p>
              ) : (
                <div className="flex flex-col">
                  {monthBars
                    .filter((bar) => bar.value !== 0)
                    .map((bar) => (
                      <div
                        key={bar.title}
                        className="flex items-center gap-3 border-b border-border py-2 last:border-b-0"
                      >
                        <span className={`w-24 shrink-0 text-[0.85rem] ${bar.peak ? 'font-bold' : 'text-muted'}`}>
                          {bar.title}
                        </span>
                        <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                          {/* Тот же месяц год назад — отметка, которую видно
                              сквозь полосу, а не второй столбик рядом. */}
                          {bar.beforeHeight > 0 && (
                            <span
                              aria-hidden
                              className="absolute inset-y-0 w-px bg-faint"
                              style={{ left: `${bar.beforeHeight}%` }}
                            />
                          )}
                          <span
                            className="grow-x absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${bar.share}%`,
                              background: bar.peak
                                ? 'var(--accent)'
                                : 'color-mix(in srgb, var(--accent) 55%, var(--surface-2))',
                            }}
                          />
                        </span>
                        <Money
                          value={bar.value}
                          className={`w-28 shrink-0 text-right text-[0.9rem] tabular ${bar.peak ? 'font-bold' : ''}`}
                        />
                        <span className="w-16 shrink-0 text-right">
                          <Delta percent={bar.before > 0 ? change(bar.value, bar.before) : null} />
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>

          {/* ==== The whole year as one grid — trimmed to the lived part.
               January-to-December on a March account is mostly desert, and
               the audit watched it bury the only month with anything in it. */}
          <section className="card reveal">
            <div className="card-head">
              <h2 className="card-head-title">{t('The shape of the year')}</h2>
              {/* Легенда теми же пятью ступенями, что и сетка: второй набор
                  цветов рядом — это то, с чего легенда начинает врать. */}
              <span className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-faint">
                {t('less')}
                {HEAT_LEVELS.map((level) => (
                  <span
                    key={level}
                    className="h-3 w-3 rounded-[3px] border border-border"
                    style={{ background: level }}
                  />
                ))}
                {t('more')}
              </span>
            </div>
            <div className="card-body">
            <Heatmap
              fill
              labels
              values={heatValues}
              from={(() => {
                const first = [...heatValues.keys()].sort()[0];

                return first !== undefined && first.startsWith(`${year}-`)
                  ? `${first.slice(0, 7)}-01`
                  : `${year}-01-01`;
              })()}
              to={year === currentMonth().year ? todayKey() : `${year}-12-31`}
            />
            </div>
          </section>

          <YearStory year={year} summary={summary} previous={previous} />

          <MadeOf summary={summary} />

          {/* ==== Superlatives ==== */}
          {/* Одной карточкой на весь список, а не семью подряд. */}
          <section className="card reveal">
            <div className="card-head">
              <h2 className="card-head-title">{t('Best of the year')}</h2>
            </div>
            <div className="card-body pt-0">
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
            {yearCheers.length > 0 && (
              <Superlative emoji="🏅" title={t('Goals closed')}>
                {yearCheers.length} · {t('the biggest')}{' '}
                <Money
                  value={Math.max(...yearCheers.map((cheer) => cheer.amount))}
                  className="text-[1.15rem] font-bold"
                />
              </Superlative>
            )}
            {cities.length >= 2 && (
              <Superlative emoji="🗺️" title={t('Dearest hour (all history)')}>
                {cities[0].city} ·{' '}
                <Money value={cities[0].per_hour} className="text-[1.15rem] font-bold" />/{t('h')}
              </Superlative>
            )}
            {favouriteShift !== null && (
              <Superlative emoji={favouriteShift.symbol ?? '⭐️'} title={t('Favourite shift')}>
                {favouriteShift.name} · {n(favouriteShift.count, 'times')}
              </Superlative>
            )}
            {topPlace !== null && (
              <Superlative emoji="🏠" title={t('Top place')}>
                {placeName(topPlace, t('No place set'))} ·{' '}
                <Money value={topPlace.earned} currency={topPlace.currency} className="font-bold" />
              </Superlative>
            )}
            {topSale !== null && (
              <Superlative emoji="🛍️" title={t('Most sold')}>
                {topSale.name} · {n(topSale.quantity, 'units')}
              </Superlative>
            )}
            <Superlative emoji="🌙" title={t('Nights')}>
              {Math.round(nightShare)}% {t('of shifts started after 20:00')}
            </Superlative>
            <Superlative emoji="🛌" title={t('Rest')}>
              {n(rest, 'days')} {t('of rest')}
            </Superlative>
            </div>
          </section>

          {/* ==== Разбор года — кладкой ====

              Ниже идут карточки, половина которых в конкретном году не
              рисуется вовсе: у кого-то не было зон, у кого-то не менялась
              ставка. Одна под другой во всю ширину они оставляли полосы
              пустоты; кладка ставит следующую там, где кончилась
              предыдущая. */}
          <div className="deck">
          {/* ==== Weekday rhythm ==== */}
          <section className="card reveal">
            <div className="card-head">
              <h2 className="card-head-title">{t('Weekday rhythm')}</h2>
              <div className="seg">
                {(['money', 'hours', 'rate'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`seg-btn ${rhythmBy === mode ? 'is-active' : ''}`}
                    onClick={() => setRhythmBy(mode)}
                  >
                    {/* Не 'Rate': этот ключ в словаре занят глаголом «оценить»,
                        и переключатель показывал «Деньги · Часы · Оценить». */}
                    {t(mode === 'money' ? 'Money' : mode === 'hours' ? 'Hours' : 'The rate')}
                  </button>
                ))}
              </div>
            </div>
            <ul className="card-body flex flex-col gap-1.5">
              {/* Дни без записей не рисуются вовсе: строка с нулём и полоской
                  в два пикселя — это намёк на данные, которых нет. */}
              {weekdayRhythm.filter((day) => day.value > 0).map((day) => (
                <li key={day.label} className="grid grid-cols-[2.6rem_1fr_auto] items-center gap-2 text-[0.85rem]">
                  <span className="capitalize text-muted">{day.label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${day.share}%`, background: day.peak ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 50%, var(--surface-2))' }}
                    />
                  </span>
                  {rhythmBy === 'hours' ? (
                    <span className="tabular">{n(Math.round(day.value), 'hours')}</span>
                  ) : (
                    <Money value={day.value} className="tabular" />
                  )}
                </li>
              ))}
            </ul>
          </section>

          <ZoneTips zones={summary.by_zone} />

          <RaiseTrail summary={summary} />

          <RoomCounted summary={summary} />

          <CostOfWork
            expenses={summary.expenses_by_kind}
            total={summary.expenses}
            travelShare={summary.travel_share_of_tips}
            withheld={summary.deductions}
            fines={summary.deductions_by_reason}
          />

          <OwedLater summary={summary} />
          </div>

          {/* ==== Badges ==== */}
          <BadgeWall />

          {/* ==== Where the year is heading ==== */}
          {live && (

            <section className="card !border-(--accent)/40 p-4">
              <h2 className="mb-1 text-[0.98rem] font-bold">{t('Where the year is heading')}</h2>
              <p className="text-[0.9rem]">
                {t('At today’s pace the year ends at')} <Money value={forecast.projected} className="font-bold text-good-read" />{' '}
                {t('and')} <strong className="tabular">{n(Math.round(projectedHours), 'hours')}</strong> —{' '}
                <Money value={Math.max(0, forecast.projected - forecast.earnedSoFar)} /> {t('still ahead')}.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One of the four figures along the bottom edge of the hero.
 *
 * It used to be a card of its own; inside a filled hero a card border and a
 * card background are two edges too many, so the cells are separated by a
 * hairline of the ink colour instead and inherit the hero's white.
 */
function Big({ label, delta, children }: { label: string; delta: number | null; children: React.ReactNode }) {
  return (
    <div className="reveal border-t border-(--accent-ink)/15 px-3 py-3.5 text-center first:border-l-0 md:border-l md:border-l-(--accent-ink)/15 md:first:border-l-0">
      {children}
      <span className="mt-0.5 flex items-center justify-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide opacity-70">
        {label} <Delta percent={delta} />
      </span>
    </div>
  );
}

/**
 * Одна строка в списке рекордов года.
 *
 * Было семь отдельных карточек с бордюром и тенью каждая: семь рамок ради
 * семи коротких фраз, и между ними больше воздуха, чем текста. Теперь это
 * строки одной таблицы — рамка одна, на весь список.
 */
function Superlative({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="w-7 shrink-0 text-center text-[1.15rem]">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="field-hint block leading-tight">{title}</span>
        <span className="text-[0.92rem]">{children}</span>
      </span>
    </div>
  );
}
