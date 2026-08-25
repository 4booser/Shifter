'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import {
  YearMonth,
  addMonths,
  currentMonth,
  monthBounds,
  monthLabel,
} from '@/lib/calendar/calendar-date';
import { averagesFor, bestDay } from '@/lib/calendar/insights';
import { CalendarDayData, DaysResponse, EMPTY_SUMMARY } from '@/lib/calendar/models';
import { delta } from '@/lib/calendar/stats-math';
import { punchcard, waterfall } from '@/lib/charts/report-math';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { Donut, PunchcardChart, WaterfallChart } from '@/components/charts/report-charts';
import { Sheet, buildXlsx, downloadBlob } from '@/lib/export/xlsx';
import { Shell } from '@/components/layout/shell';
import { Alert, CountUp, Delta, Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

export default function ReportPage() {
  return (
    <Shell>
      <Report />
    </Shell>
  );
}

const firstOf = ({ year, month }: YearMonth) => `${year}-${`${month}`.padStart(2, '0')}-01`;

/**
 * One month, in full: every worked day on its own line, the money's assembly,
 * the deltas against the month before — the page you would hand to yourself
 * as an accountant. Prints clean: the shell chrome stays on screen.
 */
function Report() {
  const { t, lang } = useI18n();
  const { format } = useMoney();

  const [month, setMonth] = useState<YearMonth>(currentMonth());
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [summary, setSummary] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [previous, setPrevious] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bounds =
      mode === 'month'
        ? monthBounds(firstOf(month))
        : { from: `${month.year}-01-01`, to: `${month.year}-12-31` };
    const before =
      mode === 'month'
        ? monthBounds(firstOf(addMonths(month, -1)))
        : { from: `${month.year - 1}-01-01`, to: `${month.year - 1}-12-31` };

    setLoading(true);
    void Promise.all([
      calendarApi.days(bounds.from, bounds.to),
      calendarApi.days(before.from, before.to),
    ])
      .then(([now, prior]) => {
        setSummary(now);
        setPrevious(prior);
        setError(null);
      })
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setLoading(false));
  }, [month, mode]);

  const averages = averagesFor(summary);
  const beforeAverages = averagesFor(previous);
  const steps = useMemo(() => waterfall(summary), [summary]);
  const card = useMemo(() => punchcard(summary.days), [summary.days]);
  const best = bestDay(summary.days);

  const rows = useMemo(
    () =>
      [...summary.days]
        .filter((day) => day.earned > 0 || day.hours > 0 || (day.tips ?? 0) > 0 || day.sales.length > 0)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [summary.days],
  );

  /** The year reads month by month; day lines would run to three hundred. */
  const monthRows = useMemo(() => {
    if (mode !== 'year') return [];

    const buckets = new Map<string, { hours: number; tips: number; units: number; earned: number; days: number }>();

    for (const day of rows) {
      const key = day.date.slice(0, 7);
      const bucket = buckets.get(key) ?? { hours: 0, tips: 0, units: 0, earned: 0, days: 0 };

      bucket.hours += day.hours;
      bucket.tips += (day.tips ?? 0) + (day.tips_cash ?? 0);
      bucket.units += day.sales.reduce((sum, sale) => sum + sale.quantity, 0);
      bucket.earned += day.earned;
      bucket.days += 1;
      buckets.set(key, bucket);
    }

    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows, mode]);

  const peakMonth = Math.max(1, ...monthRows.map(([, bucket]) => bucket.earned));

  const peakEarned = Math.max(1, ...rows.map((day) => day.earned));

  const weekdayName = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString(lang, { weekday: 'short' });

  const isWeekend = (key: string) => {
    const weekday = new Date(`${key}T00:00:00`).getDay();

    return weekday === 0 || weekday === 6;
  };

  const salesUnits = (day: CalendarDayData) => day.sales.reduce((sum, sale) => sum + sale.quantity, 0);

  const exportXlsx = () => {
    const sheet: Sheet = {
      name: t('Monthly report').slice(0, 28),
      rows: [
        [t('Date'), t('Shifts'), t('Hours'), t('Tips'), t('Sales'), t('Earned')],
        ...rows.map((day) => [
          day.date,
          day.shifts.filter((entry) => entry.worked).map((entry) => entry.name).join(', '),
          day.hours,
          (day.tips ?? 0) + (day.tips_cash ?? 0),
          salesUnits(day),
          day.earned,
        ]),
        [t('Total'), '', summary.hours, summary.tips_earned, rows.reduce((sum, day) => sum + salesUnits(day), 0), summary.total_earned],
      ],
    };

    downloadBlob(`shifter-report-${firstOf(month).slice(0, 7)}.xlsx`, buildXlsx([sheet]));
  };

  const PLACE_TINTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--accent)', 'var(--warn)', 'var(--good)'];

  return (
    <div className="flex flex-col gap-4 print-report">
      {/* ==== Header: the month, and the ways out ==== */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight">
          {t(mode === 'month' ? 'Monthly report' : 'Yearly report')}
        </h1>

        <div className="seg no-print">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`seg-btn ${mode === value ? 'is-active' : ''}`}
              onClick={() => setMode(value)}
            >
              {t(value === 'month' ? 'Month' : 'Year')}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1 no-print">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-label={t('Previous')}
            onClick={() =>
              setMonth((value) =>
                mode === 'month' ? addMonths(value, -1) : { ...value, year: value.year - 1 },
              )
            }
          >
            <Icon name="chevron-left" size={15} />
          </button>
          <strong className="w-36 text-center text-[0.95rem] capitalize">
            {mode === 'month' ? monthLabel(month, lang) : month.year}
          </strong>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-label={t('Next')}
            onClick={() =>
              setMonth((value) =>
                mode === 'month' ? addMonths(value, 1) : { ...value, year: value.year + 1 },
              )
            }
          >
            <Icon name="chevron-right" size={15} />
          </button>
          <button type="button" className="btn btn-sm ml-2" onClick={() => print()}>
            <Icon name="download" size={13} />
            {t('Print or PDF')}
          </button>
          <button type="button" className="btn btn-sm" onClick={exportXlsx}>
            <Icon name="download" size={13} />
            XLSX
          </button>
          <Link href="/stats" className="btn btn-quiet btn-sm">
            {t('Statistics')}
          </Link>
        </div>
        <strong className="hidden text-[0.95rem] capitalize print-only">{mode === 'month' ? monthLabel(month, lang) : month.year}</strong>
      </div>

      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ==== Hero numbers ==== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Hero label={t('Earned')} change={delta(summary.total_earned, previous.total_earned)}>
          <CountUp value={summary.total_earned} className="text-[1.25rem] font-bold text-good" />
        </Hero>
        <Hero label={t('Hours')} change={delta(summary.hours, previous.hours)}>
          <CountUp value={summary.hours} format={(value) => `${Math.round(value)}`} className="text-[1.25rem] font-bold" />
        </Hero>
        <Hero label={t('Days worked')} change={delta(summary.days_worked, previous.days_worked)}>
          <span className="text-[1.25rem] font-bold tabular">{summary.days_worked}</span>
        </Hero>
        <Hero label={t('Per hour')} change={delta(averages.perHour, beforeAverages.perHour)}>
          <Money value={averages.perHour} className="text-[1.25rem] font-bold" />
        </Hero>
        <Hero label={t('Tips')} change={delta(summary.tips_earned, previous.tips_earned)}>
          <Money value={summary.tips_earned} className="text-[1.25rem] font-bold" />
        </Hero>
        <Hero label={t('Take-home')} change={delta(summary.net_earned, previous.net_earned)}>
          <Money value={summary.net_earned} className="text-[1.25rem] font-bold" />
        </Hero>
      </div>

      {loading && summary.days.length === 0 ? (
        <div className="card shimmer h-48" />
      ) : rows.length === 0 ? (
        <div className="card reveal p-8 text-center">
          <p className="text-[1rem] font-semibold">{t('Nothing recorded this month')}</p>
          <p className="field-hint">{t('Pick another month above, or go work a shift.')}</p>
        </div>
      ) : (
        <>
          {/* ==== Money assembly + week shape ==== */}
          <div className="grid gap-3 lg:grid-cols-2">
            {steps.length > 0 && (
              <section className="card reveal p-4">
                <h2 className="mb-2 text-[0.98rem] font-bold">{t('How the money assembled')}</h2>
                <WaterfallChart steps={steps} />
              </section>
            )}
            {card !== null && (
              <section className="card reveal p-4">
                <h2 className="mb-2 text-[0.98rem] font-bold">{t('The shape of your week')}</h2>
                <PunchcardChart card={card} />
              </section>
            )}
          </div>

          {/* ==== By place ==== */}
          {summary.by_location.length > 1 && (
            <section className="card reveal p-4">
              <h2 className="mb-2 text-[0.98rem] font-bold">{t('By place')}</h2>
              <div className="grid items-center gap-3 lg:grid-cols-2">
                <Donut
                  centreLabel={t('Earned')}
                  slices={summary.by_location.map((place, index) => ({
                    label: place.name,
                    value: place.earned,
                    colour: place.colour || PLACE_TINTS[index % PLACE_TINTS.length],
                  }))}
                />
                <table className="w-full border-collapse text-[0.85rem]">
                  <thead>
                    <tr className="border-b border-border text-left text-[0.72rem] uppercase tracking-wide text-muted">
                      <th className="py-1.5 pr-2 font-semibold">{t('Place')}</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">{t('Hours')}</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">{t('Per hour')}</th>
                      <th className="py-1.5 text-right font-semibold">{t('Earned')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_location.map((place) => (
                      <tr key={place.location_id} className="border-b border-border/60">
                        <td className="flex items-center gap-1.5 py-1.5 pr-2">
                          <span className="h-2 w-2 flex-none rounded-full" style={{ background: place.colour }} />
                          {place.name}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular">{Math.round(place.hours * 10) / 10}</td>
                        <td className="py-1.5 pr-2 text-right tabular">{format(place.per_hour)}</td>
                        <td className="py-1.5 text-right font-semibold tabular">{format(place.earned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ==== The ledger ==== */}
          <section className="card reveal overflow-x-auto p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t(mode === 'month' ? 'Day by day' : 'Month by month')}</h2>
            {mode === 'year' && (
              <table className="w-full min-w-[34rem] border-collapse text-[0.85rem]">
                <thead>
                  <tr className="border-b border-border text-left text-[0.72rem] uppercase tracking-wide text-muted">
                    <th className="py-1.5 pr-2 font-semibold">{t('Month')}</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">{t('Days worked')}</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">{t('Hours')}</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">{t('Tips')}</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">{t('Earned')}</th>
                    <th className="w-28 py-1.5 font-semibold" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map(([key, bucket], index) => (
                    <tr key={key} className="cell-in border-b border-border/60" style={{ ['--i' as string]: index }}>
                      <td className="py-1.5 pr-2 capitalize">
                        {new Date(`${key}-01T00:00:00`).toLocaleDateString(lang, { month: 'long' })}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular">{bucket.days}</td>
                      <td className="py-1.5 pr-2 text-right tabular">{Math.round(bucket.hours)}</td>
                      <td className="py-1.5 pr-2 text-right tabular">{bucket.tips > 0 ? format(bucket.tips) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right font-semibold tabular">{format(bucket.earned)}</td>
                      <td className="py-1.5">
                        <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <span
                            className="grow-w block h-full rounded-full bg-(--accent)"
                            style={{ width: `${(bucket.earned / peakMonth) * 100}%`, ['--i' as string]: index }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {mode === 'month' && (
            <table className="w-full min-w-[38rem] border-collapse text-[0.85rem]">
              <thead>
                <tr className="border-b border-border text-left text-[0.72rem] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-2 font-semibold">{t('Date')}</th>
                  <th className="py-1.5 pr-2 font-semibold">{t('Shifts')}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{t('Hours')}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{t('Tips')}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{t('Sales')}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{t('Earned')}</th>
                  <th className="w-24 py-1.5 font-semibold" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {rows.map((day, index) => (
                  <tr
                    key={day.date}
                    className={`cell-in border-b border-border/60 ${isWeekend(day.date) ? 'bg-(--warn-soft)/40' : ''} ${day.date === best?.date ? 'bg-(--good-soft)' : ''}`}
                    style={{ ['--i' as string]: index % 24 }}
                  >
                    <td className="whitespace-nowrap py-1.5 pr-2 tabular">
                      <span className="font-semibold">{day.date.slice(8)}</span>{' '}
                      <span className="text-muted">{weekdayName(day.date)}</span>
                      {day.date === best?.date && ' 🏆'}
                    </td>
                    <td className="max-w-44 truncate py-1.5 pr-2">
                      {day.shifts.filter((entry) => entry.worked).map((entry) => entry.name).join(', ') || '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">{day.hours > 0 ? day.hours : '—'}</td>
                    <td className="py-1.5 pr-2 text-right tabular">
                      {(day.tips ?? 0) + (day.tips_cash ?? 0) > 0 ? format((day.tips ?? 0) + (day.tips_cash ?? 0)) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">{salesUnits(day) > 0 ? salesUnits(day) : '—'}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular">{format(day.earned)}</td>
                    <td className="py-1.5">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="grow-w block h-full rounded-full bg-(--accent)"
                          style={{ width: `${(day.earned / peakEarned) * 100}%`, ['--i' as string]: index % 24 }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[0.9rem] font-bold">
                  <td className="py-2 pr-2">{t('Total')}</td>
                  <td />
                  <td className="py-2 pr-2 text-right tabular">{Math.round(summary.hours * 10) / 10}</td>
                  <td className="py-2 pr-2 text-right tabular">{format(summary.tips_earned)}</td>
                  <td className="py-2 pr-2 text-right tabular">
                    {rows.reduce((sum, day) => sum + salesUnits(day), 0) || '—'}
                  </td>
                  <td className="py-2 pr-2 text-right tabular text-good">{format(summary.total_earned)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Hero({ label, change, children }: { label: string; change: number | null; children: React.ReactNode }) {
  return (
    <div className="card reveal lift glow p-3">
      <span className="field-hint block">{label}</span>
      <span className="flex items-baseline gap-2">
        {children}
        <Delta percent={change} />
      </span>
    </div>
  );
}
