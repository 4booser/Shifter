'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { Reconciliation } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { MonoAccount, MonoStatementItem, dayOf, fromMinor } from '@/lib/mono/mono';
import { recurring } from '@/lib/mono/mono-insights';
import { smoothPath } from '@/lib/charts/math';
import { FlowMoney } from '@/components/ui/flow';
import { habitualDay } from '@/lib/mono/mono-work';
import { Runway, RunwayDay, buildRunway, chargesAhead } from '@/lib/mono/runway';
import { ChartTip, CrossHair, useChartHover } from '@/components/charts/hover';
import { Money } from '@/components/ui/bits';

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
export function BankForecast({
  account,
  items,
}: {
  account: MonoAccount | null;
  items: MonoStatementItem[];
}) {
  const { t, lang } = useI18n();
  const still = useReducedMotion();

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

  const hoverKit = useChartHover<RunwayDay>();

  const runway = useMemo((): Runway | null => {
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

  if (runway === null) return null;

  const width = 640;
  const height = 150;
  const pad = { top: 18, bottom: 24 };

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
  const y = (value: number) =>
    pad.top + (1 - (value - low) / span) * (height - pad.top - pad.bottom);

  const line = smoothPath(runway.days.map((day, index) => ({ x: x(index), y: y(day.balance) })));

  const zeroY = y(0);
  const crossesZero = low < 0;

  const eventDays = runway.days
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => day.events.length > 0);

  const thinnestIndex = runway.days.indexOf(runway.thinnest);

  const spellDay = (day: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(
      new Date(`${day}T12:00:00`),
    );

  return (
    <section className="card reveal overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <div>
          <span className="field-hint">{t('Until the next money')}</span>
          <div className="tabular text-[1.5rem] font-bold leading-tight">
            {runway.dry !== null ? (
              <span className="text-danger-read">
                {t('runs dry around')} {spellDay(runway.dry)}
              </span>
            ) : (
              <>
                {t('thinnest around')} {spellDay(runway.thinnest.day)}:{' '}
                <FlowMoney value={Math.round(runway.thinnest.balance)} mark="₴" />
              </>
            )}
          </div>
        </div>

        <span className="field-hint tabular">
          {t('an ordinary day costs')} <Money value={Math.round(runway.usualPerDay)} />
        </span>
      </div>

      <div
        ref={hoverKit.ref}
        className="relative mt-1"
        onMouseMove={(event) => {
          const box = hoverKit.ref.current?.getBoundingClientRect();

          if (box === undefined) return;

          hoverKit.onMove(
            event,
            runway.days.map((day, index) => ({
              x: (index / Math.max(1, runway.days.length - 1)) * box.width,
              datum: day,
            })),
          );
        }}
        onMouseLeave={hoverKit.onLeave}
      >
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
        <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" preserveAspectRatio="none">
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
            initial={still === true ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />

          {eventDays.map(({ day, index }) => (
            <g key={day.day}>
              <circle
                cx={x(index)} cy={y(day.balance)} r="3.5"
                fill={day.events.some((event) => event.amount > 0) ? 'var(--good)' : 'var(--warn)'}
              />
            </g>
          ))}

          <circle
            cx={x(thinnestIndex)} cy={y(runway.thinnest.balance)} r="4.5"
            fill="none" stroke={crossesZero ? 'var(--danger)' : 'var(--accent)'} strokeWidth="2"
          />
        </svg>

        {/* Ось не с нуля — и об этом сказано. График, у которого низ не ноль,
            но который об этом молчит, читается как «деньги кончились». */}
        {!crossesZero && !nearZero && (
          <div className="flex justify-between px-4 pb-1 text-[0.68rem] text-faint">
            <span className="tabular">{t('Bottom of the axis')}: <Money value={Math.round(low)} /></span>
            <span>{t('zero is far below')}</span>
          </div>
        )}
      </div>

      {/* The named events under the chart, in order — the part a tooltip
          would hide from a phone. */}
      {eventDays.length > 0 && (
        <div className="flex flex-col gap-1 px-4 pb-3">
          {eventDays.slice(0, 5).map(({ day }) =>
            day.events.map((event) => (
              <div
                key={`${day.day}-${event.name}`}
                className="flex items-baseline justify-between gap-2 text-[0.82rem]"
              >
                <span className="text-muted">
                  {spellDay(day.day)} · {event.name}
                </span>
                <span className={`tabular font-semibold ${event.amount > 0 ? 'text-good-read' : 'text-warn-read'}`}>
                  {event.amount > 0 ? '+' : '−'}
                  <Money value={Math.abs(event.amount)} />
                </span>
              </div>
            )),
          )}
        </div>
      )}

      <p className="field-hint px-4 pb-4">
        {t('A forecast, and drawn like one: known payments land on their dates, the days between cost what a day usually costs you. Nothing here is a promise.')}
      </p>
    </section>
  );
}
