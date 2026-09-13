'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { Reconciliation } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { MonoAccount, MonoStatementItem, markOf, fromMinor } from '@/lib/mono/mono';
import { recurring } from '@/lib/mono/mono-insights';
import { smoothPath } from '@/lib/charts/math';
import { FlowMoney } from '@/components/ui/flow';
import { habitualDay } from '@/lib/mono/mono-work';
import { Runway, RunwayDay, buildRunway, chargesAhead } from '@/lib/mono/runway';
import { ChartTip, CrossHair, useChartHover } from '@/components/charts/hover';
import { Money } from '@/components/ui/bits';
import { BankTile } from '@/components/bank/hero';

/**
 * Дожить до зарплаты — the one chart in the app that looks forward.
 *
 * The balance walked ahead day by day: standing charges land on their dates,
 * the expected wage lands on the reconciliation's own due date, and ordinary
 * days cost their median. The pinch — the day it gets thinnest — is the
 * number nobody else shows and everybody computes on their fingers.
 *
 * It is drawn as a forecast: dashed, with the assumption written under it in
 * the words «обычный день». The known events are dots with names; the future
 * between them is habit, and the card never pretends otherwise.
 */

/**
 * The walk itself, built once for the page.
 *
 * Both the top band's «ближайшее поступление» tile and the card below it are
 * reading the same walk. Computing it twice meant asking the server for the
 * same reconciliation twice and — worse — risking two answers to one question
 * on one screen.
 */
export function useRunway(account: MonoAccount | null, items: MonoStatementItem[]): Runway | null {
  const [owed, setOwed] = useState<Reconciliation | null>(null);

  useEffect(() => {
    const today = new Date();
    const ahead = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    const key = (date: Date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    void calendarApi
      .schedule(key(today), key(ahead))
      .then(setOwed)
      .catch(() => setOwed(null));
  }, []);

  return useMemo((): Runway | null => {
    if (items.length === 0) return null;

    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp = (date: Date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    const now = new Date();
    const today = stamp(now);
    const tomorrow = stamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

    const perDay = habitualDay(items, today);

    const standing = recurring(items, today);

    const incomes = (owed?.periods ?? [])
      .filter((row) => row.expected > row.paid && row.stream !== 'commission')
      .map((row) => ({
        name: row.location_name,
        amount: row.expected - row.paid,
        // A wage already overdue is expected any day; it lands on the first
        // projected day rather than being left in the past where the curve
        // cannot see it.
        on: row.due_on < tomorrow ? tomorrow : row.due_on,
      }));

    // The account names the credit limit; failing that, the newest
    // transaction's own stamped balance is the bank's word for where things
    // stand. client-info being briefly unreachable must not blank the one
    // forward-looking chart.
    const newest = [...items].sort((one, two) => two.time - one.time)[0];
    const balance =
      account !== null
        ? fromMinor(account.balance - account.creditLimit)
        : fromMinor(newest.balance);

    return buildRunway({
      balance,
      usualPerDay: perDay,
      charges: chargesAhead(standing, tomorrow, 30),
      incomes,
      from: tomorrow,
      horizon: 30,
    });
  }, [account, items, owed]);
}

/** Every day ahead that has a name attached to it, in date order. */
const namedDays = (runway: Runway) =>
  runway.days
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => day.events.length > 0);

/** ==== The band's tile: the next money the app knows is coming ==== */
export function NextMoneyTile({ runway }: { runway: Runway | null }) {
  const { t, lang } = useI18n();

  const next = runway === null
    ? undefined
    : namedDays(runway).find(({ day }) => day.events.some((event) => event.amount > 0));

  const arriving = next?.day.events.filter((event) => event.amount > 0) ?? [];
  const total = arriving.reduce((sum, event) => sum + event.amount, 0);

  return (
    <BankTile
      label={t('Next money in')}
      icon="clock"
      tone="good"
      value={
        next === undefined ? (
          '—'
        ) : (
          new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })
            .format(new Date(`${next.day.day}T12:00:00`))
        )
      }
      hint={
        next === undefined ? (
          <span className="text-faint">{t('the rota knows of nothing owed yet')}</span>
        ) : (
          <>+<Money value={Math.round(total)} /></>
        )
      }
    />
  );
}

export function BankForecast({
  account,
  runway,
}: {
  account: MonoAccount | null;
  runway: Runway | null;
}) {
  const { t, lang } = useI18n();
  const { compact } = useMoney();
  const still = useReducedMotion();

  const hoverKit = useChartHover<RunwayDay>();

  const [allEvents, setAllEvents] = useState(false);

  if (runway === null) return null;

  const width = 640;
  const height = 150;
  const inset = 8;
  /*
   * Полоса справа под подписи оси — и графику о ней надо сказать.
   *
   * SVG без заданной высоты в абсолютном позиционировании берёт её из
   * пропорций viewBox, а `bottom` в переспецифицированной раскладке
   * игнорируется: кривая рисовалась на 105 пикселях внутри стапятидесяти, и
   * линии сетки стояли не там, где их же значения на кривой. Ширину и высоту
   * теперь задаём прямо, и курсор считается по той же ширине, что и линия.
   */
  const gutter = 56;

  const lowest = Math.min(...runway.days.map((day) => day.balance));
  const high = Math.max(1, ...runway.days.map((day) => day.balance));

  /*
   * Ноль на оси нужен тогда, когда до него можно дойти.
   *
   * Ось, насильно начинающаяся с нуля, при остатке в восемьдесят тысяч и
   * просадке до шестидесяти прижимала всю линию к верхней кромке, а под ней
   * оставляла три четверти пустого поля. Читать там нечего: кривая выглядит
   * прямой, хотя за месяц теряет пятую часть.
   *
   * Если за окно прогноза остаток не подходит к нулю, растягиваем ось по
   * данным — и тогда обязаны подписать нижнюю отметку, иначе низ графика
   * прочитают как ноль и решат, что деньги кончились.
   */
  const nearZero = lowest < high * 0.25;
  const room = Math.max((high - lowest) * 0.35, high * 0.05);
  const low = nearZero ? Math.min(0, lowest) : lowest - room;
  const span = Math.max(1, high - low);

  const x = (index: number) => (index / Math.max(1, runway.days.length - 1)) * width;
  const y = (value: number) => inset + (1 - (value - low) / span) * (height - inset * 2);

  const line = smoothPath(runway.days.map((day, index) => ({ x: x(index), y: y(day.balance) })));

  const zeroY = y(0);
  const crossesZero = low < 0;

  const eventDays = namedDays(runway);
  const shownEvents = allEvents ? eventDays : eventDays.slice(0, 5);

  const thinnestIndex = runway.days.indexOf(runway.thinnest);

  const spellDay = (day: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(
      new Date(`${day}T12:00:00`),
    );

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('Until the next money')}</h3>
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-muted">
            <i className="h-2 w-2 rounded-full bg-(--accent)" />
            {t('Forecast')}
          </span>
          <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-muted">
            <i className="h-2 w-2 rounded-full bg-(--warn)" />
            {t('Charges')}
          </span>
          <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-muted">
            <i className="h-2 w-2 rounded-full bg-(--good)" />
            {t('Money in')}
          </span>
        </div>
      </div>

      <div className="card-body grid flex-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <div className="tabular text-[1.35rem] font-bold leading-tight">
              {runway.dry !== null ? (
                <span className="text-danger-read">
                  {t('runs dry around')} {spellDay(runway.dry)}
                </span>
              ) : (
                <>
                  {t('thinnest around')} {spellDay(runway.thinnest.day)}:{' '}
                  <FlowMoney
                    value={Math.round(runway.thinnest.balance)}
                    mark={account === null ? undefined : markOf(account.currencyCode)}
                  />
                </>
              )}
            </div>

            <span className="field-hint tabular">
              {t('an ordinary day costs')} <Money value={Math.round(runway.usualPerDay)} />
            </span>
          </div>

          <div
            ref={hoverKit.ref}
            className="relative h-[180px] pr-14"
            onMouseMove={(event) => {
              const box = hoverKit.ref.current?.getBoundingClientRect();

              if (box === undefined) return;

              hoverKit.onMove(
                event,
                runway.days.map((day, index) => ({
                  x: (index / Math.max(1, runway.days.length - 1)) * (box.width - gutter),
                  datum: day,
                })),
              );
            }}
            onMouseLeave={hoverKit.onLeave}
          >
            {/* The axis, as HTML rather than SVG text: the plot is stretched
                to the box and stretched letters are the one thing an axis
                must not do. */}
            <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
              <span className="absolute right-0 top-0 text-[0.66rem] text-faint tabular">
                {compact(Math.round(high))}
              </span>
              <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-border" />
              <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-border" />
              <span className="absolute bottom-0 right-0 text-[0.66rem] text-faint tabular">
                {compact(Math.round(low))}
              </span>
            </div>

            {hoverKit.hover !== null && <CrossHair x={hoverKit.hover.x} />}
            {hoverKit.hover !== null && (
              <ChartTip x={hoverKit.hover.x}>
                <b>{spellDay(hoverKit.hover.datum.day)}</b>
                <div className={`tabular ${hoverKit.hover.datum.balance < 0 ? 'text-danger-read' : ''}`}>
                  ≈<Money value={Math.round(hoverKit.hover.datum.balance)} />
                </div>
                {hoverKit.hover.datum.events.map((event) => (
                  <div key={event.name} className={`tabular text-[0.72rem] ${event.amount > 0 ? 'text-good-read' : 'text-warn-read'}`}>
                    {event.amount > 0 ? '+' : ''}<Money value={event.amount} /> {event.name}
                  </div>
                ))}
              </ChartTip>
            )}

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="absolute left-0 top-0 block h-full w-[calc(100%-3.5rem)]"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="runway-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={crossesZero ? 'var(--danger)' : 'var(--accent)'} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={crossesZero ? 'var(--danger)' : 'var(--accent)'} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* The floor. Only drawn where the curve actually threatens it: a
                  zero line under a comfortable month is a warning about nothing. */}
              {crossesZero && (
                <line
                  x1="0" y1={zeroY} x2={width} y2={zeroY}
                  stroke="var(--danger)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              <motion.path
                d={`${line} L ${width} ${height} L 0 ${height} Z`}
                fill="url(#runway-fill)"
                initial={still === true ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              />

              {/* Dashed on purpose: this line is a forecast and dresses like
                  one. Faded in rather than drawn in — framer's pathLength trick
                  drives stroke-dasharray itself, and fighting it for the dashes
                  left the curve stuck at a stub. The dashes win; they carry
                  meaning and the draw-in only carried charm. */}
              <motion.path
                d={line}
                fill="none"
                stroke={crossesZero ? 'var(--danger)' : 'var(--accent)'}
                strokeWidth="2"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
                initial={still === true ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />

              {eventDays.map(({ day, index }) => (
                <circle
                  key={day.day}
                  cx={x(index)} cy={y(day.balance)} r="3"
                  fill={day.events.some((event) => event.amount > 0) ? 'var(--good)' : 'var(--warn)'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              <circle
                cx={x(thinnestIndex)} cy={y(runway.thinnest.balance)} r="4"
                fill="none" stroke={crossesZero ? 'var(--danger)' : 'var(--accent)'} strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          {/* Ось не с нуля — и об этом сказано. График, у которого низ не ноль,
              но который об этом молчит, читается как «деньги кончились». */}
          {!crossesZero && !nearZero && (
            <p className="field-hint mt-1">{t('zero is far below')}</p>
          )}

          <p className="field-hint mt-1">
            {t('A forecast, and drawn like one: known payments land on their dates, the days between cost what a day usually costs you. Nothing here is a promise.')}
          </p>
        </div>

        {/* The named events beside the chart, in order — the part a tooltip
            would hide from a phone. */}
        <div className="min-w-0">
          <span className="field-hint mb-1 block font-semibold uppercase">{t('Upcoming')}</span>

          {eventDays.length === 0 ? (
            <p className="field-hint">{t('Nothing named is due in the next thirty days.')}</p>
          ) : (
            <div className="flex flex-col">
              {shownEvents.map(({ day }) =>
                day.events.map((event) => (
                  <div
                    key={`${day.day}-${event.name}`}
                    className="flex items-baseline justify-between gap-2 border-b border-border py-1.5 text-[0.8rem] last:border-0"
                  >
                    <span className="min-w-0 truncate" title={`${spellDay(day.day)} · ${event.name}`}>
                      <span className="tabular text-faint">{spellDay(day.day)}</span>{' '}
                      <span className="text-muted">· {event.name}</span>
                    </span>
                    <span className={`tabular flex-none font-semibold ${event.amount > 0 ? 'text-good-read' : 'text-warn-read'}`}>
                      {event.amount > 0 ? '+' : '−'}
                      <Money value={Math.abs(event.amount)} />
                    </span>
                  </div>
                )),
              )}

              {eventDays.length > 5 && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm mt-2 self-center"
                  onClick={() => setAllEvents(!allEvents)}
                >
                  {allEvents ? t('Fewer events') : t('All events')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
