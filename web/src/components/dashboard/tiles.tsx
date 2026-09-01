'use client';

import Link from 'next/link';

import { useEffect, useMemo, useRef, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { fromKey, keyOf, monthBounds, shiftDays, todayKey } from '@/lib/calendar/calendar-date';
import { forecastFor } from '@/lib/calendar/forecast';
import { bestDay } from '@/lib/calendar/insights';
import { CalendarDayData, Goal, Reconciliation, ShiftTemplate } from '@/lib/calendar/models';
import { activeGoalFor } from '@/lib/calendar/stats-math';
import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import {
  cancelLiveShift,
  finishLiveShift,
  formatElapsed,
  liveTick,
  startLiveShift,
  useLive,
} from '@/lib/live/live-shift';
import { useMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { useCalendar } from '@/lib/store/calendar';
import { CountUp, Money } from '@/components/ui/bits';
import { FlowMoney } from '@/components/ui/flow';
import { Icon } from '@/components/ui/icon';
import { useMono } from '@/lib/mono/store';
import { fromMinor } from '@/lib/mono/mono';

/**
 * The command-centre strip over the calendar: this month at a glance, one
 * fact per tile. Everything is derived from a six-week window around today,
 * so the strip tells the truth about the current month wherever the grid
 * below happens to be navigated.
 */

export const TILE_IDS = [
  'today', 'pace', 'goal', 'payday', 'bank', 'streak', 'best', 'hours', 'tips', 'heat',
  'hourly', 'nights', 'overtime', 'planned', 'places', 'weekday', 'deductions', 'week',
  'guests', 'rest',
] as const;

export type TileId = (typeof TILE_IDS)[number];

/** Where a tile leads: every fact opens the page that explains it. */
const TILE_LINKS: Partial<Record<TileId, string>> = {
  pace: '/stats',
  goal: '/stats',
  payday: '/payouts',
  bank: '/bank',
  streak: '/wrapped',
  best: '/report',
  hours: '/report',
  tips: '/stats',
  heat: '/wrapped',
  hourly: '/stats',
  nights: '/stats',
  overtime: '/report',
  planned: '/payouts',
  places: '/report',
  weekday: '/stats',
  deductions: '/payslip',
  week: '/schedule',
  guests: '/stats',
  rest: '/stats',
};

const TILE_NAMES: Record<TileId, string> = {
  today: 'Today',
  pace: 'Heading for',
  goal: 'Goal',
  payday: 'Next money',
  bank: 'Bank',
  streak: 'Streak',
  best: 'Best day',
  hours: 'Hours',
  tips: 'Tips',
  heat: 'Twelve weeks',
  hourly: 'Your hour',
  nights: 'Night hours',
  overtime: 'Overtime',
  planned: 'Still to come',
  places: 'Where it comes from',
  weekday: 'Best weekday',
  deductions: 'Taken off',
  week: 'This week',
  guests: 'Guests served',
  rest: 'Shortest rest',
};

export function TileStrip() {
  const { t } = useI18n();
  const tiles = useSettings((state) => state.settings.dashboardTiles);
  const update = useSettings((state) => state.update);
  const storeDays = useCalendar((state) => state.days);
  const templates = useCalendar((state) => state.templates);
  const saving = useCalendar((state) => state.saving);

  const [windowDays, setWindowDays] = useState<CalendarDayData[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [schedule, setSchedule] = useState<Reconciliation | null>(null);
  const [customising, setCustomising] = useState(false);

  const today = todayKey();
  const bounds = monthBounds(today);

  // The tiles' own window: six weeks back for streaks, the month for totals.
  // Re-fetched after every save, debounced so a burst of painting is one call.
  useEffect(() => {
    const handle = setTimeout(() => {
      void calendarApi
        .days(shiftDays(bounds.from, -84), bounds.to)
        .then((response) => setWindowDays(response.days))
        .catch(() => undefined);
    }, 400);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeDays, saving]);

  useEffect(() => {
    void calendarApi.goals().then(setGoals).catch(() => setGoals([]));
    void calendarApi
      .schedule(shiftDays(today, -31), shiftDays(today, 62))
      .then(setSchedule)
      .catch(() => setSchedule(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthDays = useMemo(
    () => windowDays.filter((day) => day.date >= bounds.from && day.date <= bounds.to),
    [windowDays, bounds.from, bounds.to],
  );

  const order: TileId[] = (tiles as TileId[] | undefined) ?? [...TILE_IDS];
  const visible = order.filter((id): id is TileId => (TILE_IDS as readonly string[]).includes(id));

  if (visible.length === 0 && !customising) return null;

  return (
    <section aria-label={t('Overview')} data-tour="tiles">
      {/* The customiser rides the section's own header: hanging under the
          grid it left a stray gap and read as a stranded control. */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-[0.72rem] font-semibold uppercase tracking-wide text-faint">{t('Overview')}</h2>
        <div className="relative">
          <button
            type="button"
            className="btn btn-quiet btn-sm text-muted"
            onClick={() => setCustomising((open) => !open)}
          >
            <Icon name="sliders" size={13} />
            {t('Tiles')}
          </button>
          {customising && <TilePicker order={order} setCustomising={setCustomising} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:[grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">
        {visible.map((id, index) => {
          const body = (
            <Tile
              id={id}
              monthDays={monthDays}
              window={windowDays}
              goals={goals}
              schedule={schedule}
              templates={templates}
            />
          );
          const href = TILE_LINKS[id];

          return href === undefined ? (
            <div key={id} className="tile glow tilt reveal" style={stagger(index)}>
              {body}
            </div>
          ) : (
            <Link key={id} href={href} className="tile glow tilt reveal" style={stagger(index)}>
              {body}
            </Link>
          );
        })}
      </div>

    </section>
  );
}


/** The tile drawer: which tiles show, and in what order. */
function TilePicker({
  order,
  setCustomising,
}: {
  order: TileId[];
  setCustomising: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const update = useSettings((state) => state.update);

  return (
    <>
              <div className="fixed inset-0 z-40" onClick={() => setCustomising(false)} />
              <div className="card absolute right-0 z-50 mt-1 w-60 p-2 shadow-(--shadow-lg)">
                {TILE_IDS.map((id) => {
                  const at = order.indexOf(id);
                  const on = at !== -1;

                  const move = (delta: number) => {
                    const next = [...order];
                    const to = at + delta;

                    if (to < 0 || to >= next.length) return;

                    next.splice(to, 0, ...next.splice(at, 1));
                    update('dashboardTiles', next);
                  };

                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-(--radius) px-1.5 py-1 hover:bg-surface-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        className={`h-4 w-7 flex-none rounded-full transition-colors ${on ? 'bg-(--accent)' : 'bg-surface-2 border border-border'}`}
                        onClick={() =>
                          update(
                            'dashboardTiles',
                            on ? order.filter((item) => item !== id) : [...order, id],
                          )
                        }
                      >
                        <span
                          className={`block h-3 w-3 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                        />
                      </button>
                      <span className="flex-1 text-[0.85rem]">{t(TILE_NAMES[id])}</span>
                      {on && (
                        <span className="flex gap-0.5">
                          <button type="button" className="btn btn-quiet btn-sm !px-1" aria-label={t('Up')} onClick={() => move(-1)}>
                            ↑
                          </button>
                          <button type="button" className="btn btn-quiet btn-sm !px-1" aria-label={t('Down')} onClick={() => move(1)}>
                            ↓
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
    </>
  );
}

function Tile(props: {
  id: TileId;
  monthDays: CalendarDayData[];
  window: CalendarDayData[];
  goals: Goal[];
  schedule: Reconciliation | null;
  templates: ShiftTemplate[];
}) {
  switch (props.id) {
    case 'today':
      return <TodayTile window={props.window} templates={props.templates} />;
    case 'pace':
      return <PaceTile monthDays={props.monthDays} />;
    case 'goal':
      return <GoalTile monthDays={props.monthDays} goals={props.goals} />;
    case 'payday':
      return <PaydayTile schedule={props.schedule} />;
    case 'bank':
      return <BankTile />;
    case 'streak':
      return <StreakTile window={props.window} />;
    case 'best':
      return <BestTile monthDays={props.monthDays} />;
    case 'hours':
      return <HoursTile monthDays={props.monthDays} />;
    case 'tips':
      return <TipsTile monthDays={props.monthDays} />;
    case 'heat':
      return <HeatTile window={props.window} />;
    case 'hourly':
      return <HourlyTile monthDays={props.monthDays} />;
    case 'nights':
      return <NightsTile monthDays={props.monthDays} />;
    case 'overtime':
      return <OvertimeTile monthDays={props.monthDays} />;
    case 'planned':
      return <PlannedTile monthDays={props.monthDays} />;
    case 'places':
      return <PlacesTile monthDays={props.monthDays} />;
    case 'weekday':
      return <WeekdayTile monthDays={props.monthDays} />;
    case 'deductions':
      return <DeductionsTile monthDays={props.monthDays} />;
    case 'week':
      return <WeekTile window={props.window} />;
    case 'guests':
      return <GuestsTile monthDays={props.monthDays} />;
    case 'rest':
      return <RestTile window={props.window} />;
  }
}

/**
 * The card's balance on the strip — the bank's one number a morning glance
 * wants. Reads what the bank page already holds in this browser; with no
 * bank connected it extends the same quiet invitation the goal tile does.
 */
function BankTile() {
  const { t } = useI18n();
  const token = useMono((state) => state.token);
  const client = useMono((state) => state.client);
  const accountId = useMono((state) => state.accountId);
  const items = useMono((state) => state.items);
  const hydrate = useMono((state) => state.hydrate);

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (token === null || token === undefined) {
    return (
      <>
        <Label icon="coins">{t('Bank')}</Label>
        <span className="tile-value text-[0.95rem] font-semibold text-muted">
          {t('Connect the statement')} →
        </span>
        <span className="field-hint">{t('It stays in this browser')}</span>
      </>
    );
  }

  const account = (client?.accounts ?? []).find((entry) => entry.id === accountId);
  const balance = account === undefined ? null : fromMinor(account.balance - account.creditLimit);

  const monthStart = new Date();

  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const since = monthStart.getTime() / 1000;
  const spent = items
    .filter((item) => item.time >= since && item.amount < 0 && !item.hold)
    .reduce((sum, item) => sum + fromMinor(-item.amount), 0);

  return (
    <>
      <Label icon="coins">{t('Bank')}</Label>
      <span className="tile-value">
        {balance !== null ? <FlowMoney value={Math.round(balance)} mark="₴" /> : '—'}
      </span>
      <span className="field-hint tabular">
        −<Money value={Math.round(spent)} /> {t('this month')}
      </span>
    </>
  );
}

/** What an hour of this month actually paid — the figure people quote. */
function HourlyTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const hours = monthDays.reduce((sum, day) => sum + day.hours, 0);
  const earned = monthDays.reduce((sum, day) => sum + day.earned, 0);

  return (
    <>
      <Label icon="clock">{t('Your hour')}</Label>
      <span className="tile-value">
        {hours > 0 ? <FlowMoney value={Math.round(earned / hours)} /> : '—'}
      </span>
      <span className="field-hint">
        {hours > 0 ? `${Math.round(hours)} ${t('h this month')}` : t('No hours yet')}
      </span>
    </>
  );
}

/** Hours worked after ten in the evening: the ones that cost sleep. */
function NightsTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const nights = monthDays.reduce(
    (sum, day) =>
      sum
      + day.shifts
        .filter((entry) => entry.worked && Number(entry.end_time.slice(0, 2)) <= 6)
        .reduce((hours, entry) => hours + entry.hours, 0),
    0,
  );
  const hours = monthDays.reduce((sum, day) => sum + day.hours, 0);

  return (
    <>
      <Label icon="moon">{t('Night hours')}</Label>
      <span className="tile-value">
        <CountUp value={nights} format={(value) => `${Math.round(value)}`} />
      </span>
      <span className="field-hint">
        {hours > 0 ? `${Math.round((nights / hours) * 100)}% ${t('of all hours')}` : t('this month')}
      </span>
    </>
  );
}

/** Hours past the week's agreed ceiling, where a place sets one. */
function OvertimeTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  // Weeks that ran past forty hours, counted from the days themselves: the
  // server prices the premium, this only says how much time it was.
  const byWeek = new Map<number, number>();

  for (const day of monthDays) {
    const at = fromKey(day.date);
    const week = Math.floor((at.getTime() - new Date(at.getFullYear(), 0, 1).getTime()) / (7 * 86_400_000));

    byWeek.set(week, (byWeek.get(week) ?? 0) + day.hours);
  }

  const over = [...byWeek.values()].reduce((sum, hours) => sum + Math.max(0, hours - 40), 0);

  return (
    <>
      <Label icon="spark">{t('Overtime')}</Label>
      <span className={`tile-value ${over > 0 ? 'text-warn' : ''}`}>
        <CountUp value={over} format={(value) => `${Math.round(value)}`} />
      </span>
      <span className="field-hint">
        {over > 0 ? t('hours past forty a week') : t('nothing past forty a week')}
      </span>
    </>
  );
}

/** Shifts already on the calendar but not yet worked. */
function PlannedTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t, n } = useI18n();
  const today = todayKey();
  const ahead = monthDays.filter(
    (day) => day.date > today && day.shifts.some((entry) => !entry.worked),
  );
  const money = ahead.reduce((sum, day) => sum + day.planned, 0);

  return (
    <>
      <Label icon="calendar">{t('Still to come')}</Label>
      <span className="tile-value">
        {money > 0 ? <FlowMoney value={Math.round(money)} /> : '—'}
      </span>
      <span className="field-hint">
        {ahead.length > 0 ? `${n(ahead.length, 'shifts')} ${t('ahead')}` : t('Nothing planned yet')}
      </span>
    </>
  );
}

/** Which place pays most of this month's money. */
function PlacesTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const byPlace = new Map<string, number>();

  for (const day of monthDays) {
    for (const entry of day.shifts) {
      if (!entry.worked) continue;

      byPlace.set(entry.name, (byPlace.get(entry.name) ?? 0) + entry.earned);
    }
  }

  const ranked = [...byPlace.entries()].sort((one, two) => two[1] - one[1]);
  const top = ranked[0];
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);

  return (
    <>
      <Label icon="business">{t('Where it comes from')}</Label>
      <span className="tile-value truncate text-[1.15rem]">{top?.[0] ?? '—'}</span>
      <span className="field-hint">
        {top !== undefined && total > 0
          ? `${Math.round((top[1] / total) * 100)}% ${t('of the month')}`
          : t('this month')}
      </span>
    </>
  );
}

/** The weekday that pays best per shift — the one worth asking for. */
function WeekdayTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = new Map<number, { total: number; count: number }>();

  for (const day of monthDays) {
    if (!day.shifts.some((entry) => entry.worked)) continue;

    const weekday = fromKey(day.date).getDay();
    const bucket = byDay.get(weekday) ?? { total: 0, count: 0 };

    bucket.total += day.earned;
    bucket.count += 1;
    byDay.set(weekday, bucket);
  }

  const best = [...byDay.entries()]
    .map(([weekday, bucket]) => ({ weekday, average: bucket.total / bucket.count }))
    .sort((one, two) => two.average - one.average)[0];

  return (
    <>
      <Label icon="chart">{t('Best weekday')}</Label>
      <span className="tile-value">{best === undefined ? '—' : t(names[best.weekday])}</span>
      <span className="field-hint">
        {best === undefined ? t('this month') : <><Money value={Math.round(best.average)} /> {t('a shift')}</>}
      </span>
    </>
  );
}

/** Fines, breakages and meals: money that left before it arrived. */
function DeductionsTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const taken = monthDays.reduce((sum, day) => sum + day.deductions, 0);
  const days = monthDays.filter((day) => day.deductions > 0).length;

  return (
    <>
      <Label icon="alert">{t('Taken off')}</Label>
      <span className={`tile-value ${taken > 0 ? 'text-danger' : ''}`}>
        {taken > 0 ? <FlowMoney value={Math.round(taken)} /> : '—'}
      </span>
      <span className="field-hint">
        {days > 0 ? `${days} ${t('days this month')}` : t('nothing withheld')}
      </span>
    </>
  );
}

/** The seven days somebody is actually inside right now. */
function WeekTile({ window }: { window: CalendarDayData[] }) {
  const { t } = useI18n();
  const today = fromKey(todayKey());
  const monday = new Date(today);

  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const from = keyOf(monday);
  const to = keyOf(new Date(monday.getTime() + 6 * 86_400_000));
  const inside = window.filter((day) => day.date >= from && day.date <= to);
  const hours = inside.reduce((sum, day) => sum + day.hours, 0);
  const earned = inside.reduce((sum, day) => sum + day.earned, 0);

  return (
    <>
      <Label icon="calendar">{t('This week')}</Label>
      <span className="tile-value">
        <FlowMoney value={Math.round(earned)} />
      </span>
      <span className="field-hint">{Math.round(hours * 10) / 10} {t('h so far')}</span>
    </>
  );
}

/** How many people went through the room, where anybody counted. */
function GuestsTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const counted = monthDays.flatMap((day) => day.shifts.filter((entry) => entry.guests !== null));
  const guests = counted.reduce((sum, entry) => sum + (entry.guests ?? 0), 0);
  const tips = monthDays.reduce((sum, day) => sum + (day.tips ?? 0) + (day.tips_cash ?? 0), 0);

  return (
    <>
      <Label icon="users">{t('Guests served')}</Label>
      <span className="tile-value">
        <CountUp value={guests} format={(value) => `${Math.round(value)}`} />
      </span>
      <span className="field-hint">
        {guests > 0 && tips > 0
          ? <><Money value={Math.round((tips / guests) * 100) / 100} /> {t('a guest in tips')}</>
          : t('where anybody counted')}
      </span>
    </>
  );
}

/** The shortest gap between leaving and coming back this fortnight. */
function RestTile({ window }: { window: CalendarDayData[] }) {
  const { t } = useI18n();
  const spans: { start: number; end: number }[] = [];

  for (const day of window) {
    for (const entry of day.shifts) {
      if (!entry.worked) continue;

      const start = new Date(`${day.date}T${entry.actual_start ?? entry.start_time}:00`).getTime();
      let end = new Date(`${day.date}T${entry.actual_end ?? entry.end_time}:00`).getTime();

      if (end <= start) end += 86_400_000;

      spans.push({ start, end });
    }
  }

  spans.sort((one, two) => one.start - two.start);

  let shortest: number | null = null;

  for (let index = 1; index < spans.length; index += 1) {
    const gap = (spans[index].start - spans[index - 1].end) / 3_600_000;

    if (gap >= 0 && (shortest === null || gap < shortest)) shortest = gap;
  }

  return (
    <>
      <Label icon="moon">{t('Shortest rest')}</Label>
      <span className={`tile-value ${shortest !== null && shortest < 11 ? 'text-warn' : ''}`}>
        {shortest === null ? '—' : `${Math.round(shortest)} ${t('h')}`}
      </span>
      <span className="field-hint">
        {shortest === null ? t('nothing to compare yet') : t('between two shifts')}
      </span>
    </>
  );
}

function Label({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="tile-label">
      <Icon name={icon} size={12} />
      {children}
    </span>
  );
}

/** Today's shift: idle, startable, live and ticking, or a day off. */
function TodayTile({ window, templates }: { window: CalendarDayData[]; templates: ShiftTemplate[] }) {
  const { t, n } = useI18n();
  const live = useLive((state) => state.live);
  const events = useCalendar((state) => state.events);
  const today = todayKey();
  const day = window.find((item) => item.date === today);
  const event = events.find((item) => item.start_date <= today && item.end_date >= today);
  const planned = day?.shifts.find((entry) => !entry.worked);
  const worked = day?.shifts.find((entry) => entry.worked);
  const template = templates.find((item) => item.id === (live?.shiftId ?? planned?.shift_id));

  const [, force] = useState(0);
  const discard = useArmed(cancelLiveShift);

  useEffect(() => {
    if (live === null) return;

    const handle = setInterval(() => force((n) => n + 1), 1000);

    return () => clearInterval(handle);
  }, [live]);

  if (live !== null && template !== undefined) {
    const tick = liveTick(template, live, Date.now());

    return (
      <>
        <Label icon="spark">{t('On shift')}</Label>
        <span className="tile-value text-good">
          {tick.earned === null ? formatElapsed(tick.elapsed) : <FlowMoney value={tick.earned} />}
        </span>
        <span className={`field-hint flex items-center gap-1.5 ${discard.armed ? 'text-danger' : ''}`}>
          {discard.armed ? '✕' : <span className="live-dot" />}
          {discard.armed
            ? t('Press again to discard')
            : tick.earned === null
              ? template.name
              : formatElapsed(tick.elapsed)}
        </span>
        <span className="mt-auto flex gap-1">
          <button
            type="button"
            className="btn btn-primary btn-sm min-w-0 flex-1 truncate"
            onClick={() => void finishLiveShift(template)}
          >
            {t('Finish')}
          </button>
          {/*
            Discarding a running shift used to be one press away from the
            button that banks it. It arms first now, and the line above says
            what the next press does.
          */}
          <button
            type="button"
            className={`btn btn-sm flex-none !px-2 ${discard.armed ? 'btn-armed' : 'btn-quiet'}`}
            aria-label={t('Discard shift')}
            title={t(discard.armed ? 'Press again to discard' : 'Discard shift')}
            onClick={discard.press}
          >
            ✕
          </button>
        </span>
      </>
    );
  }

  if (planned !== undefined) {
    return (
      <>
        <Label icon="spark">{t('Today')}</Label>
        <span className="tile-value truncate">{planned.name}</span>
        <span className="field-hint">
          {planned.start_time}–{planned.end_time}
        </span>
        {template !== undefined && (
          <button
            type="button"
            className="btn btn-primary btn-sm mt-auto"
            onClick={() => startLiveShift(template)}
          >
            {t('Start shift')}
          </button>
        )}
      </>
    );
  }

  if (worked !== undefined) {
    return (
      <>
        <Label icon="spark">{t('Today')}</Label>
        <span className="tile-value"><FlowMoney value={day?.earned ?? 0} /></span>
        <span className="field-hint truncate">{worked.name}</span>
      </>
    );
  }

  // A day off used to be an em dash. It is the one day the tile has room to
  // say something, and the thing anybody wants from a day off is knowing how
  // much of it is left — so it counts down to the next shift instead.
  const next = window
    .filter((item) => item.date > today && item.shifts.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const away = next === undefined ? null : Math.round((fromKey(next.date).getTime() - fromKey(today).getTime()) / 86_400_000);

  // The big word says what today is, which is what the tile is for. What
  // comes next goes under it — that is the thing a day off leaves you
  // wondering, and it used to be an em dash.
  return (
    <>
      <Label icon="spark">{t('Today')}</Label>
      <span className="tile-value truncate">
        {event === undefined ? t('Day off') : `${event.symbol ?? ''} ${event.name}`.trim()}
      </span>
      <span className="field-hint truncate">
        {next === undefined || away === null
          ? t('Nothing ahead')
          : `${away === 1 ? t('Tomorrow') : `${t('In')} ${n(away, 'days')}`}: ${next.shifts[0].name}, ${next.shifts[0].start_time}`}
      </span>
    </>
  );
}

function PaceTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const bounds = monthBounds(todayKey());
  const forecast = forecastFor(monthDays, bounds.from, bounds.to);

  // The month so far as a tiny cumulative line under the number.
  const spark = useMemo(() => {
    const sorted = [...monthDays].filter((day) => day.date <= todayKey()).sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const values = sorted.map((day) => (running += day.earned));
    const peak = Math.max(1, ...values);

    return values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${24 - (value / peak) * 22}`).join(' ');
  }, [monthDays]);

  return (
    <>
      <Label icon="chart">{t('Heading for')}</Label>
      <span className="tile-value">
        <CountUp value={forecast.projected} />
      </span>
      <span className="field-hint">
        <Money value={forecast.earnedSoFar} /> {t('so far')}
      </span>
      {spark.length > 0 && (
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="fade-in mt-auto h-6 w-full" aria-hidden="true">
          <polyline points={spark} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.8" />
        </svg>
      )}
    </>
  );
}

function GoalTile({ monthDays, goals }: { monthDays: CalendarDayData[]; goals: Goal[] }) {
  const { t } = useI18n();
  const bounds = monthBounds(todayKey());
  const active = activeGoalFor(goals, bounds.from, bounds.to);
  const earned = monthDays.reduce((sum, day) => sum + day.earned, 0);

  if (active === null) {
    // The audit called the dash a dead tile. The tile already links to
    // statistics — let it say so instead of shrugging.
    return (
      <>
        <Label icon="target">{t('Goal')}</Label>
        <span className="mt-1 text-[0.86rem] font-semibold text-(--accent)">{t('Set one in statistics')} →</span>
        <span className="field-hint">{t('The period fills this meter.')}</span>
      </>
    );
  }

  /*
   * Two readings, and the solid one is always the banked one. The meter shows
   * where the shifts already on the calendar would land, the percentage counts
   * only money that has been worked, and the line underneath names the second
   * figure as a plan.
   */
  const ahead = monthDays.reduce((sum, day) => sum + day.planned, 0);
  const share = Math.min(1, earned / active.target);
  const withPlan = Math.min(1, (earned + ahead) / active.target);

  return (
    <>
      <Label icon="target">{t('Goal')}</Label>
      <span className="tile-value block">{Math.round(share * 100)}%</span>
      <span className="goal-bar block" aria-hidden>
        {ahead > 0 && <i className="booked" style={{ width: `${withPlan * 100}%` }} />}
        <i className="banked" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="field-hint block">
        <Money value={earned} /> {t('of')} <Money value={active.target} />
      </span>
      {ahead > 0 && (
        <span className="field-hint block">
          {t('booked')} {Math.round(withPlan * 100)}%
        </span>
      )}
    </>
  );
}

function PaydayTile({ schedule }: { schedule: Reconciliation | null }) {
  const { t } = useI18n();
  const today = todayKey();

  const next = useMemo(() => {
    const ahead = (schedule?.periods ?? [])
      .filter((row) => row.paid === 0 && row.due_on >= today && row.expected > 0)
      .sort((a, b) => a.due_on.localeCompare(b.due_on));

    if (ahead.length === 0) return null;

    const sameDay = ahead.filter((row) => row.due_on === ahead[0].due_on);
    const days = Math.round(
      (new Date(`${ahead[0].due_on}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
    );

    return { days, amount: sameDay.reduce((sum, row) => sum + row.expected, 0) };
  }, [schedule, today]);

  return (
    <>
      <Label icon="wallet">{t('Next money')}</Label>
      <span className="tile-value">{next === null ? '—' : <CountUp value={next.amount} />}</span>
      <span className="field-hint">
        {next === null
          ? t('Nothing due yet')
          : next.days === 0
            ? t('lands today')
            : `${t('in')} ${next.days} ${t('d.')}`}
      </span>
    </>
  );
}

function StreakTile({ window }: { window: CalendarDayData[] }) {
  const { t } = useI18n();
  const byDate = new Map(window.map((day) => [day.date, day]));
  const today = todayKey();

  const workedOn = (key: string) => byDate.get(key)?.shifts.some((entry) => entry.worked) === true;

  let run = 0;
  let cursor = workedOn(today) ? today : shiftDays(today, -1);

  while (workedOn(cursor)) {
    run += 1;
    cursor = shiftDays(cursor, -1);
  }

  // The best run inside the loaded window, so the current one has a target.
  let record = 0;
  let current = 0;

  for (const day of [...window].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!day.shifts.some((entry) => entry.worked)) continue;

    current = record === 0 || workedOn(shiftDays(day.date, -1)) ? current + 1 : 1;
    record = Math.max(record, current);
  }

  return (
    <>
      <Label icon="flame">{t('Streak')}</Label>
      <span className={`tile-value ${run >= 3 ? 'text-warn' : ''}`}>
        {run} {run >= 3 && '🔥'}
      </span>
      <span className="field-hint">
        {t('days running')}
        {record > run && ` · ${t('record')} ${record}`}
      </span>
    </>
  );
}

function BestTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t, lang } = useI18n();
  const best = bestDay(monthDays);

  return (
    <>
      <Label icon="trophy">{t('Best day')}</Label>
      <span className="tile-value">{best === null ? '—' : <CountUp value={best.value} />}</span>
      <span className="field-hint">
        {best === null
          ? t('Nothing yet this month')
          : new Date(`${best.date}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}
      </span>
    </>
  );
}

/**
 * Часы месяца целиком, и сколько из них уже отстояно.
 *
 * `day.hours` — это часы смен, отмеченных отработанными. Плитка показывала
 * только их, и первого числа месяц с двадцатью поставленными сменами читался
 * как ноль часов: всё, что впереди, для неё не существовало. Наверху теперь
 * весь месяц — план и факт вместе, — а строкой ниже сказано, сколько из
 * этого уже позади.
 *
 * Подпись раньше считала дни, а называла их сменами: день с двумя выходами
 * шёл за один. Считаем смены.
 */
function HoursTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t, n } = useI18n();
  const all = monthDays.reduce(
    (sum, day) => sum + day.shifts.reduce((inner, entry) => inner + entry.hours, 0),
    0,
  );
  const done = monthDays.reduce((sum, day) => sum + day.hours, 0);
  const shifts = monthDays.reduce(
    (sum, day) => sum + day.shifts.filter((entry) => entry.worked).length,
    0,
  );
  const round = (value: number) => value.toFixed(value % 1 === 0 ? 0 : 1);

  return (
    <>
      <Label icon="clock">{t('Hours')}</Label>
      <span className="tile-value">
        <CountUp value={all} format={round} />
      </span>
      <span className="field-hint">
        {done < all
          ? `${t('worked')} ${round(done)} ${t('h')} · ${n(shifts, 'shifts')}`
          : `${n(shifts, 'shifts')} ${t('this month')}`}
      </span>
    </>
  );
}

/** Twelve weeks as a spark of weekly sums — the year page has the full map. */
function HeatTile({ window }: { window: CalendarDayData[] }) {
  const { t } = useI18n();
  const today = todayKey();
  const byDate = new Map(window.map((day) => [day.date, day.earned]));

  const weekday = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const start = shiftDays(today, -(11 * 7 + weekday));

  const weeks = Array.from({ length: 12 }, (_, weekIndex) => {
    let sum = 0;

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const key = shiftDays(start, weekIndex * 7 + dayIndex);

      if (key <= today) sum += byDate.get(key) ?? 0;
    }

    return sum;
  });

  const peak = Math.max(1, ...weeks);
  const W = 120;
  const H = 36;
  const step = W / 11;
  const points = weeks
    .map((sum, index) => `${index * step},${H - 3 - (sum / peak) * (H - 8)}`)
    .join(' ');

  return (
    <>
      <Label icon="calendar">{t('Twelve weeks')}</Label>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-auto w-full" aria-hidden>
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={11 * step}
          cy={H - 3 - (weeks[11] / peak) * (H - 8)}
          r="3"
          fill="var(--accent)"
        />
      </svg>
    </>
  );
}

function TipsTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t } = useI18n();
  const tips = monthDays.reduce((sum, day) => sum + (day.tips ?? 0) + (day.tips_cash ?? 0), 0);
  const earned = monthDays.reduce((sum, day) => sum + day.earned, 0);

  return (
    <>
      <Label icon="coins">{t('Tips')}</Label>
      <span className="tile-value">
        <CountUp value={tips} />
      </span>
      <span className="field-hint">
        {earned > 0 ? `${Math.round((tips / earned) * 100)}% ${t('of earnings')}` : t('this month')}
      </span>
    </>
  );
}
