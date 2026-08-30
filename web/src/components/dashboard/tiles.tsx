'use client';

import Link from 'next/link';

import { useEffect, useMemo, useRef, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { fromKey, monthBounds, shiftDays, todayKey } from '@/lib/calendar/calendar-date';
import { forecastFor } from '@/lib/calendar/forecast';
import { bestDay } from '@/lib/calendar/insights';
import { CalendarDayData, Goal, Reconciliation, ShiftTemplate } from '@/lib/calendar/models';
import { activeGoalFor } from '@/lib/calendar/stats-math';
import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
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
import { Icon } from '@/components/ui/icon';

/**
 * The command-centre strip over the calendar: this month at a glance, one
 * fact per tile. Everything is derived from a six-week window around today,
 * so the strip tells the truth about the current month wherever the grid
 * below happens to be navigated.
 */

export const TILE_IDS = ['today', 'pace', 'goal', 'payday', 'streak', 'best', 'hours', 'tips', 'heat'] as const;

export type TileId = (typeof TILE_IDS)[number];

/** Where a tile leads: every fact opens the page that explains it. */
const TILE_LINKS: Partial<Record<TileId, string>> = {
  pace: '/stats',
  goal: '/stats',
  payday: '/payouts',
  streak: '/wrapped',
  best: '/report',
  hours: '/report',
  tips: '/stats',
  heat: '/wrapped',
};

const TILE_NAMES: Record<TileId, string> = {
  today: 'Today',
  pace: 'Heading for',
  goal: 'Goal',
  payday: 'Next money',
  streak: 'Streak',
  best: 'Best day',
  hours: 'Hours',
  tips: 'Tips',
  heat: 'Twelve weeks',
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
  }
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
          {tick.earned === null ? formatElapsed(tick.elapsed) : <Money value={tick.earned} />}
        </span>
        <span className="field-hint flex items-center gap-1.5">
          <span className="live-dot" />
          {tick.earned === null ? template.name : formatElapsed(tick.elapsed)}
        </span>
        <span className="mt-auto flex gap-1">
          <button
            type="button"
            className="btn btn-primary btn-sm min-w-0 flex-1 truncate"
            onClick={() => void finishLiveShift(template)}
          >
            {t('Finish')}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm flex-none !px-2"
            aria-label={t('Cancel')}
            title={t('Cancel')}
            onClick={cancelLiveShift}
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
        <span className="tile-value"><Money value={day?.earned ?? 0} /></span>
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

  const share = Math.min(1, earned / active.target);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <span className="flex items-center gap-2.5">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 flex-none">
        <circle className="ring-track" cx="32" cy="32" r={radius} fill="none" strokeWidth="6" />
        <circle
          className="ring-fill"
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
        />
      </svg>
      <span className="min-w-0">
        <Label icon="target">{t('Goal')}</Label>
        <span className="tile-value block">{Math.round(share * 100)}%</span>
        <span className="field-hint">
          <Money value={active.target} />
        </span>
      </span>
    </span>
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

function HoursTile({ monthDays }: { monthDays: CalendarDayData[] }) {
  const { t, n } = useI18n();
  const hours = monthDays.reduce((sum, day) => sum + day.hours, 0);
  const worked = monthDays.filter((day) => day.shifts.some((entry) => entry.worked)).length;

  return (
    <>
      <Label icon="clock">{t('Hours')}</Label>
      <span className="tile-value">
        <CountUp value={hours} format={(value) => value.toFixed(value % 1 === 0 ? 0 : 1)} />
      </span>
      <span className="field-hint">
        {n(worked, 'shifts')} {t('this month')}
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
