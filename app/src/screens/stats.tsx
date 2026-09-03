import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';

import { Bars, BarRow, Panel, Split } from '@/components/charts/bars';
import { Climb } from '@/components/charts/climb';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/lib/api/calendar';
import { fromKey, keysBetween, monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney, formatMoneyIn } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * Statistics, rebuilt: one question per card, the climb first.
 *
 * The month against the month before it is the comparison people actually
 * make, so it opens the page; the four figures they quote sit above it, each
 * carrying its own change rather than a separate «vs last month» block.
 */
type Span = 'month' | 'year';

export function Stats() {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  const [span, setSpan] = useState<Span>('month');

  const now = todayKey();
  const year = Number(now.slice(0, 4));
  const bounds =
    span === 'month'
      ? monthBounds(now)
      : { from: `${year}-01-01`, to: `${year}-12-31` };
  const before =
    span === 'month'
      ? monthBounds(`${now.slice(0, 8)}01`.replace(/^(\d{4})-(\d{2})/, (_, y: string, m: string) => {
          const month = Number(m) - 1;

          return month === 0 ? `${Number(y) - 1}-12` : `${y}-${`${month}`.padStart(2, '0')}`;
        }))
      : { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };

  /* The base currency is asked for so the server restates a range that mixes
     them. Without it, two places in two countries are added together into a
     number in nothing and printed with one symbol. */
  const base = settings.baseCurrency;

  const current = useQuery({
    queryKey: ['days', bounds.from, bounds.to, base],
    queryFn: () => calendarApi.days(bounds.from, bounds.to, base),
  });
  const previous = useQuery({
    queryKey: ['days', before.from, before.to],
    queryFn: () => calendarApi.days(before.from, before.to),
  });

  const climb = useMemo(() => {
    if (current.data === undefined) return { line: [], ghost: [] };

    const run = (days: { date: string; earned: number }[], from: string, to: string) => {
      const byDate = new Map(days.map((day) => [day.date, day.earned]));
      let sum = 0;

      return keysBetween(from, to).map((key) => {
        sum += byDate.get(key) ?? 0;

        return { label: key, value: sum };
      });
    };

    return {
      line: run(current.data.days, bounds.from, bounds.to),
      ghost:
        previous.data === undefined ? [] : run(previous.data.days, before.from, before.to),
    };
  }, [current.data, previous.data, bounds.from, bounds.to, before.from, before.to]);

  const summary = current.data;
  const past = previous.data;

  const change = (value: number, was: number) =>
    was > 0 ? Math.round((value / was - 1) * 100) : null;

  const facts =
    summary === undefined
      ? []
      : [
          {
            // Restated where the range mixes currencies: the raw total there
            // is 20 000 ₴ and 4 000 zł added together, which is a number in
            // nothing and would be printed with one of the two symbols.
            label: t('Earned'),
            value:
              summary.conversion === null
                ? money(summary.total_earned)
                : formatMoneyIn(
                    settings,
                    summary.conversion.base_currency,
                    Math.round(summary.conversion.total_earned),
                  ),
            delta: past === undefined ? null : change(summary.total_earned, past.total_earned),
          },
          {
            label: t('Hours'),
            value: `${Math.round(summary.hours)}`,
            delta: past === undefined ? null : change(summary.hours, past.hours),
          },
          {
            label: t('Shifts'),
            value: `${summary.days_worked}`,
            delta: past === undefined ? null : change(summary.days_worked, past.days_worked),
          },
          {
            label: t('Per hour'),
            value:
              summary.hours <= 0
                ? '·'
                : summary.conversion === null
                  ? money(summary.total_earned / summary.hours)
                  : formatMoneyIn(
                      settings,
                      summary.conversion.base_currency,
                      Math.round(summary.conversion.total_earned / summary.hours),
                    ),
            delta:
              past === undefined || past.hours === 0 || summary.hours === 0
                ? null
                : change(summary.total_earned / summary.hours, past.total_earned / past.hours),
          },
        ];

  /* What was earned before anything was taken off it. The server's total is
     already net of the tip-out and the deductions, so a bar of the parts
     could never add up to it. */
  const gross =
    summary === undefined
      ? 0
      : summary.shifts_earned +
        summary.sales_earned +
        summary.tips_earned +
        summary.period_earned +
        summary.overtime_earned +
        summary.premium_earned;

  /* Averaged per day worked rather than totalled: a month with five Fridays
     and four Saturdays would otherwise make Friday look like the better
     shift when it is only the more frequent one. */
  const byWeekday = useMemo((): BarRow[] => {
    if (summary === undefined) return [];

    const names = [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];
    const totals = new Map<number, { earned: number; days: number }>();

    for (const day of summary.days) {
      if (day.earned <= 0) continue;

      const weekday = fromKey(day.date).getDay();
      const seen = totals.get(weekday) ?? { earned: 0, days: 0 };

      totals.set(weekday, { earned: seen.earned + day.earned, days: seen.days + 1 });
    }

    const order = settings.mondayFirst ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

    return order
      .filter((weekday) => totals.has(weekday))
      .map((weekday) => {
        const seen = totals.get(weekday)!;
        const average = seen.earned / seen.days;

        return {
          key: `${weekday}`,
          label: names[weekday]!,
          value: average,
          shown: money(average),
          hint: `${seen.days} ${seen.days === 1 ? t('day') : t('d.')}`,
        };
      });
  }, [summary, settings.mondayFirst]);

  const bestWeekday = [...byWeekday].sort((a, b) => b.value - a.value)[0]?.key;

  const ZONE_NAMES: Record<string, string> = {
    unset: t('unsaid'),
    hall: t('the floor'),
    bar: t('the bar'),
    terrace: t('the terrace'),
    banquet: t('a function'),
    takeaway: t('takeaway'),
  };

  const byZone = (summary?.by_zone ?? [])
    .filter((zone) => zone.hours > 0 && zone.tips > 0)
    .sort((a, b) => b.tips_per_hour - a.tips_per_hour)
    .map(
      (zone): BarRow => ({
        key: zone.zone,
        label: ZONE_NAMES[zone.zone] ?? zone.zone,
        value: zone.tips_per_hour,
        shown: `${money(zone.tips_per_hour)}/ч`,
        hint: `${Math.round(zone.hours)} ч`,
      }),
    );

  /* Where a range mixes currencies the bars have to be comparable, so they
     are drawn on the converted figures and labelled with what was actually
     earned there. A bar drawn on 8 000 zł beside one on 40 000 ₴ would say
     the Kraków job was a fifth of the Kyiv one when it is nearly twice it. */
  const converted = new Map(
    (summary?.conversion?.by_location ?? []).map((place) => [place.location_id, place]),
  );

  const byPlace = (summary?.by_location ?? [])
    .filter((place) => place.earned > 0)
    .map((place) => ({ place, restated: converted.get(place.location_id) }))
    .sort((a, b) => (b.restated?.earned ?? b.place.earned) - (a.restated?.earned ?? a.place.earned))
    .map(
      ({ place, restated }): BarRow => ({
        key: `${place.location_id}`,
        label: place.name === '' ? t('no place') : place.name,
        value: restated?.earned ?? place.earned,
        shown:
          place.currency !== '' && place.currency !== undefined
            ? formatMoneyIn(settings, place.currency, Math.round(place.earned))
            : money(place.earned),
        hint: `${place.days_worked} см. · ${Math.round(place.hours)} ч`,
        colour: place.colour === '' ? undefined : place.colour,
      }),
    );

  const REASON_NAMES: Record<string, string> = {
    breakage: t('breakage'),
    shortfall: t('shortfall'),
    late: t('lateness'),
    waste: t('write-off'),
    uniform: t('uniform'),
    other: t('something else'),
    unsaid: t('no reason'),
  };

  const fines = (summary?.deductions_by_reason ?? []).map(
    (split): BarRow => ({
      key: split.reason,
      label: REASON_NAMES[split.reason] ?? split.reason,
      value: split.amount,
      shown: money(split.amount),
      hint: `${split.days} ${split.days === 1 ? t('day') : t('d.')}`,
      colour: 'var(--danger)',
    }),
  );

  const best = [...(summary?.days ?? [])].sort((a, b) => b.earned - a.earned)[0];

  const extras =
    summary === undefined
      ? []
      : [
          { label: t('Best single day'), value: best === undefined || best.earned <= 0 ? '·' : money(best.earned) },
          { label: t('Night hours'), value: `${Math.round(summary.night_hours)}` },
          { label: t('Past the norm'), value: summary.overtime_hours > 0 ? `${Math.round(summary.overtime_hours)} ч` : '·' },
          { label: t('Premiums'), value: summary.premium_earned > 0 ? money(summary.premium_earned) : '·' },
          { label: t('Handed to the pool'), value: summary.tip_out > 0 ? money(summary.tip_out) : '·' },
          { label: t('Withheld'), value: summary.deductions > 0 ? money(summary.deductions) : '·' },
          { label: t('Tax'), value: summary.tax > 0 ? money(summary.tax) : '·' },
          { label: t('Holiday pay accruing'), value: summary.holiday_accrued > 0 ? money(summary.holiday_accrued) : '·' },
          { label: t('Guests'), value: summary.guests_counted > 0 ? `${summary.guests_counted}` : '·' },
          { label: t('Average cheque'), value: summary.average_cheque == null ? '·' : money(summary.average_cheque) },
          { label: t('Planned'), value: summary.planned_earned > 0 ? money(summary.planned_earned) : '·' },
          { label: t('Travel ate this much of the tips'), value: summary.travel_share_of_tips == null ? '·' : `${Math.round(summary.travel_share_of_tips)}%` },
        ].filter((extra) => extra.value !== '·');

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('Stats')}</h1>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border p-0.5">
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                  span === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => setSpan(value)}
              >
                {value === 'month' ? t('Month') : t('Year')}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" asChild>
            <a href="/stats">
              Старая версия
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </header>

      {current.isPending ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-[var(--radius-card)]" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-[var(--radius-card)]" />
        </>
      ) : summary === undefined ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="card p-4">
                <span className="field-hint">{fact.label}</span>
                <span className="mt-0.5 block text-2xl font-bold tabular">{fact.value}</span>
                {fact.delta !== null && fact.delta !== 0 && (
                  <span
                    className={cn(
                      'text-xs font-semibold tabular',
                      fact.delta > 0 ? 'text-good' : 'text-danger',
                    )}
                  >
                    {fact.delta > 0 ? '↑' : '↓'} {Math.abs(fact.delta)}%
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* A total that adds two currencies together is a number in
              nothing. Say so, and say what it comes to restated — including
              the currencies the bank had no rate for, which are simply not
              in it. */}
          {summary.currencies.length > 1 && (
            <p
              className="card flex flex-wrap items-baseline gap-x-2 p-3 text-sm"
              style={{ background: 'var(--warn-soft)' }}
            >
              <span className="font-semibold">{t('The period mixes currencies:')}</span>
              <span>{summary.currencies.join(', ')}.</span>
              {summary.conversion !== null ? (
                <>
                  <span>
                    Всего это{' '}
                    <b className="tabular">
                      {formatMoneyIn(
                        settings,
                        summary.conversion.base_currency,
                        Math.round(summary.conversion.total_earned),
                      )}
                    </b>{' '}
                    по сегодняшнему курсу.
                  </span>
                  {summary.conversion.unconverted.length > 0 && (
                    <span className="field-hint">
                      Курса нет для: {summary.conversion.unconverted.join(', ')} — эти деньги в
                      пересчёт не вошли.
                    </span>
                  )}
                </>
              ) : (
                <span className="field-hint">
                  Валюта пересчёта не выбрана — суммы выше просто сложены.
                </span>
              )}
            </p>
          )}

          <Panel
            title={t('Earned over the period')}
            hint={`Плотная линия — этот ${span === 'month' ? t('month') : t('year')}, бледная — прошлый. Веди курсором — цифры дня.`}
          >
            <Climb points={climb.line} ghost={climb.ghost} height={240} />
          </Panel>

          {/* Columns rather than a grid: the panels are independent answers of very
              different heights, and a grid row would stretch a four-line card to
              match a ten-line one and leave the hole between them. */}
          <div className="columns-1 gap-3 lg:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
            <Panel
              title={t('What the money is made of')}
              hint={
                summary.conversion !== null
                  ? t('Shares are counted from the sums as they stand — the currencies differ, so the percentages are truer than the figures.')
                  : gross > summary.total_earned
                    ? `Заработано ${money(gross)}; на руки ${money(summary.total_earned)} — остальное в котёл и удержания.`
                    : t('The rate, the tips and everything on top.')
              }
            >
              <Split
                total={money(gross)}
                parts={[
                  {
                    key: 'base',
                    label: t('the rate'),
                    // Only the revenue share is inside shifts_earned. The
                    // premiums and the overtime are added to the total beside
                    // it, so subtracting them here made the segments add up to
                    // less than the money and every percentage wrong.
                    value: summary.shifts_earned - summary.revenue_earned,
                    colour: 'var(--s1)',
                  },
                  { key: 'tips', label: t('tips'), value: summary.tips_earned, colour: 'var(--s2)' },
                  {
                    key: 'premium',
                    label: t('premiums'),
                    value: summary.premium_earned,
                    colour: 'var(--s3)',
                  },
                  {
                    key: 'revenue',
                    label: t('% of takings'),
                    value: summary.revenue_earned,
                    colour: 'var(--s4)',
                  },
                  {
                    key: 'sales',
                    label: t('sales'),
                    value: summary.sales_earned,
                    colour: 'var(--s5)',
                  },
                  {
                    key: 'overtime',
                    label: t('overtime'),
                    value: summary.overtime_earned,
                    colour: 'var(--warn)',
                  },
                  {
                    key: 'period',
                    label: t('salary'),
                    value: summary.period_earned,
                    colour: 'var(--border-strong)',
                  },
                ]}
              />
            </Panel>

            <Panel title={t('Which weekday pays')} hint={t('Average earnings per worked day.')}>
              <Bars rows={byWeekday} highlight={bestWeekday} />
            </Panel>

            {byZone.length > 0 && (
              <Panel
                title={t('Where the tips are thicker')}
                hint={t('Tips per hour, by station. The argument itself.')}
              >
                <Bars rows={byZone} highlight={byZone[0]?.key} />
              </Panel>
            )}

            {byPlace.length > 1 && (
              <Panel title={t('Where it was earned')} hint={t('Over the period, by place.')}>
                <Bars rows={byPlace} highlight={byPlace[0]?.key} />
              </Panel>
            )}

            {fines.length > 0 && (
              <Panel title={t('What was withheld for')} hint={t('Fines apart from meals.')}>
                <Bars rows={fines} />
              </Panel>
            )}

            <Panel title={t('What else happened')} hint={t('The small things there is usually nowhere to see.')}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {extras.map((extra) => (
                  <div key={extra.label} className="flex flex-col">
                    <dt className="field-hint">{extra.label}</dt>
                    <dd className="text-sm font-semibold tabular">{extra.value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
