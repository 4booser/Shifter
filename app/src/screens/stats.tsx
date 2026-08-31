import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';

import { Bars, BarRow, Panel, Split } from '@/components/charts/bars';
import { Climb } from '@/components/charts/climb';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/lib/api/calendar';
import { fromKey, keysBetween, monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/**
 * Statistics, rebuilt: one question per card, the climb first.
 *
 * The month against the month before it is the comparison people actually
 * make, so it opens the page; the four figures they quote sit above it, each
 * carrying its own change rather than a separate «vs last month» block.
 */
type Span = 'month' | 'year';

export function Stats() {
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

  const current = useQuery({
    queryKey: ['days', bounds.from, bounds.to],
    queryFn: () => calendarApi.days(bounds.from, bounds.to),
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
            label: 'Заработано',
            value: money(summary.total_earned),
            delta: past === undefined ? null : change(summary.total_earned, past.total_earned),
          },
          {
            label: 'Часов',
            value: `${Math.round(summary.hours)}`,
            delta: past === undefined ? null : change(summary.hours, past.hours),
          },
          {
            label: 'Смен',
            value: `${summary.days_worked}`,
            delta: past === undefined ? null : change(summary.days_worked, past.days_worked),
          },
          {
            label: 'В час',
            value: summary.hours > 0 ? money(summary.total_earned / summary.hours) : '·',
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

    const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
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
          hint: `${seen.days} ${seen.days === 1 ? 'день' : 'дн.'}`,
        };
      });
  }, [summary, settings.mondayFirst]);

  const bestWeekday = [...byWeekday].sort((a, b) => b.value - a.value)[0]?.key;

  const ZONE_NAMES: Record<string, string> = {
    unset: 'не сказано',
    hall: 'зал',
    bar: 'бар',
    terrace: 'терраса',
    banquet: 'банкет',
    takeaway: 'навынос',
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

  const byPlace = (summary?.by_location ?? [])
    .filter((place) => place.earned > 0)
    .sort((a, b) => b.earned - a.earned)
    .map(
      (place): BarRow => ({
        key: `${place.location_id}`,
        label: place.name === '' ? 'без места' : place.name,
        value: place.earned,
        shown: money(place.earned),
        hint: `${place.days_worked} см. · ${Math.round(place.hours)} ч`,
        colour: place.colour === '' ? undefined : place.colour,
      }),
    );

  const REASON_NAMES: Record<string, string> = {
    breakage: 'разбили',
    shortfall: 'недостача',
    late: 'опоздание',
    waste: 'списание',
    uniform: 'форма',
    other: 'другое',
    unsaid: 'без причины',
  };

  const fines = (summary?.deductions_by_reason ?? []).map(
    (split): BarRow => ({
      key: split.reason,
      label: REASON_NAMES[split.reason] ?? split.reason,
      value: split.amount,
      shown: money(split.amount),
      hint: `${split.days} ${split.days === 1 ? 'день' : 'дн.'}`,
      colour: 'var(--danger)',
    }),
  );

  const best = [...(summary?.days ?? [])].sort((a, b) => b.earned - a.earned)[0];

  const extras =
    summary === undefined
      ? []
      : [
          { label: 'Лучший день', value: best === undefined || best.earned <= 0 ? '·' : money(best.earned) },
          { label: 'Ночных часов', value: `${Math.round(summary.night_hours)}` },
          { label: 'Сверх нормы', value: summary.overtime_hours > 0 ? `${Math.round(summary.overtime_hours)} ч` : '·' },
          { label: 'Надбавки', value: summary.premium_earned > 0 ? money(summary.premium_earned) : '·' },
          { label: 'Отдано в котёл', value: summary.tip_out > 0 ? money(summary.tip_out) : '·' },
          { label: 'Удержано', value: summary.deductions > 0 ? money(summary.deductions) : '·' },
          { label: 'Налог', value: summary.tax > 0 ? money(summary.tax) : '·' },
          { label: 'Отпускные копятся', value: summary.holiday_accrued > 0 ? money(summary.holiday_accrued) : '·' },
          { label: 'Гостей', value: summary.guests_counted > 0 ? `${summary.guests_counted}` : '·' },
          { label: 'Средний чек', value: summary.average_cheque == null ? '·' : money(summary.average_cheque) },
          { label: 'Запланировано', value: summary.planned_earned > 0 ? money(summary.planned_earned) : '·' },
          { label: 'Дорога съела чаевых', value: summary.travel_share_of_tips == null ? '·' : `${Math.round(summary.travel_share_of_tips)}%` },
        ].filter((extra) => extra.value !== '·');

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Статистика</h1>

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
                {value === 'month' ? 'Месяц' : 'Год'}
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

          <Panel
            title="Заработано за период"
            hint={`Плотная линия — этот ${span === 'month' ? 'месяц' : 'год'}, бледная — прошлый. Веди курсором — цифры дня.`}
          >
            <Climb points={climb.line} ghost={climb.ghost} height={240} />
          </Panel>

          {/* Columns rather than a grid: the panels are independent answers of very
              different heights, and a grid row would stretch a four-line card to
              match a ten-line one and leave the hole between them. */}
          <div className="columns-1 gap-3 lg:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
            <Panel
              title="Из чего сложились деньги"
              hint={
                gross > summary.total_earned
                  ? `Заработано ${money(gross)}; на руки ${money(summary.total_earned)} — остальное в котёл и удержания.`
                  : 'Ставка, чаевые и всё, что сверху.'
              }
            >
              <Split
                total={money(gross)}
                parts={[
                  {
                    key: 'base',
                    label: 'ставка',
                    // Only the revenue share is inside shifts_earned. The
                    // premiums and the overtime are added to the total beside
                    // it, so subtracting them here made the segments add up to
                    // less than the money and every percentage wrong.
                    value: summary.shifts_earned - summary.revenue_earned,
                    colour: 'var(--s1)',
                  },
                  { key: 'tips', label: 'чаевые', value: summary.tips_earned, colour: 'var(--s2)' },
                  {
                    key: 'premium',
                    label: 'надбавки',
                    value: summary.premium_earned,
                    colour: 'var(--s3)',
                  },
                  {
                    key: 'revenue',
                    label: '% с выручки',
                    value: summary.revenue_earned,
                    colour: 'var(--s4)',
                  },
                  {
                    key: 'sales',
                    label: 'позиции',
                    value: summary.sales_earned,
                    colour: 'var(--s5)',
                  },
                  {
                    key: 'overtime',
                    label: 'переработка',
                    value: summary.overtime_earned,
                    colour: 'var(--warn)',
                  },
                  {
                    key: 'period',
                    label: 'оклад',
                    value: summary.period_earned,
                    colour: 'var(--border-strong)',
                  },
                ]}
              />
            </Panel>

            <Panel title="Какой день недели платит" hint="Средний заработок за отработанный день.">
              <Bars rows={byWeekday} highlight={bestWeekday} />
            </Panel>

            {byZone.length > 0 && (
              <Panel
                title="Где чаевые гуще"
                hint="Чаевые за час, по участкам. Тот самый спор."
              >
                <Bars rows={byZone} highlight={byZone[0]?.key} />
              </Panel>
            )}

            {byPlace.length > 1 && (
              <Panel title="Где заработано" hint="За период, по местам.">
                <Bars rows={byPlace} highlight={byPlace[0]?.key} />
              </Panel>
            )}

            {fines.length > 0 && (
              <Panel title="За что удержали" hint="Штрафы отдельно от питания.">
                <Bars rows={fines} />
              </Panel>
            )}

            <Panel title="Что ещё случилось" hint="Мелочи, которые обычно негде увидеть.">
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
