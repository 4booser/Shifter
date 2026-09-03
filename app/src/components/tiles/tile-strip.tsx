import { Link } from '@tanstack/react-router';
import {
  Building2,
  CalendarClock,
  CalendarRange,
  Clock,
  Coins,
  Flame,
  Moon,
  Receipt,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { CalendarDayData, DaysResponse } from '@/lib/calendar/models';
import { streakOf } from '@/lib/calendar/streak';
import { fromKey, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { perHour } from '@/lib/text/rate';

/**
 * The strip of facts, rebuilt.
 *
 * One tile is one sentence somebody would say out loud, and every tile leads
 * to the page that explains it. The grid is dense on a laptop and two-wide on
 * a phone, because this is read standing up between two tables.
 */
interface Tile {
  id: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  to: string;
  tone?: 'good' | 'warn' | 'danger';
}

export function TileStrip({ days, summary }: { days: CalendarDayData[]; summary: DaysResponse }) {
  const { t, n, w, lang } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const worked = days.filter((day) => day.shifts.some((entry) => entry.worked));
  const streak = streakOf(worked.map((day) => day.date));
  const daysInMonth =
    days.length === 0
      ? 0
      : new Date(Number(days[0]!.date.slice(0, 4)), Number(days[0]!.date.slice(5, 7)), 0).getDate();
  const shifts = days.reduce(
    (count, day) => count + day.shifts.filter((entry) => entry.worked).length,
    0,
  );
  const rate = perHour(summary.total_earned, summary.hours);
  const tips = summary.tips_earned;
  const best = [...worked].sort((one, two) => two.earned - one.earned)[0] ?? null;
  const ahead = days.filter(
    (day) => day.date > todayKey() && day.shifts.some((entry) => !entry.worked),
  );
  const nights = summary.night_hours;
  const withheld = summary.deductions;

  const tiles: Tile[] = [
    {
      id: 'earned',
      icon: Coins,
      label: t('Earned'),
      value: money(summary.total_earned),
      hint: `${n(shifts, 'shifts')} · ${Math.round(summary.hours)} ${t('h')}`,
      to: '/stats',
      tone: 'good',
    },
    {
      id: 'hourly',
      icon: Clock,
      label: t('Your hour'),
      value: rate === null ? '·' : money(rate),
      hint:
        summary.hours > 0
          ? `${Math.round(summary.hours)} ${t('h')} ${t('this month')}`
          : t('No hours yet'),
      to: '/stats',
    },
    {
      id: 'tips',
      icon: Sparkles,
      label: t('Tips'),
      value: money(tips),
      hint:
        summary.total_earned > 0
          ? `${Math.round((tips / summary.total_earned) * 100)}% ${t('of earnings')}`
          : t('this month'),
      to: '/stats',
    },
    {
      id: 'best',
      icon: Trophy,
      label: t('Best day'),
      value: best === null ? '·' : money(best.earned),
      hint:
        best === null
          ? t('this month')
          : fromKey(best.date).toLocaleDateString(lang, { day: 'numeric', month: 'long' }),
      to: '/stats',
    },
    {
      id: 'nights',
      icon: Moon,
      label: t('Night hours'),
      value: `${Math.round(nights)}`,
      // A share needs an hour under it to mean anything. Two shifts of a few
      // minutes each made this tile read «0» over «100% of all hours» — both
      // numbers true, the pair of them a contradiction.
      hint:
        summary.hours >= 1
          ? `${Math.round((nights / summary.hours) * 100)}% ${t('of all hours')}`
          : t('this month'),
      to: '/stats',
    },
    {
      id: 'planned',
      icon: CalendarClock,
      label: t('Still ahead'),
      value: ahead.length > 0 ? money(ahead.reduce((sum, day) => sum + day.planned, 0)) : '·',
      // Days with something planned, which is what `ahead` counts — calling
      // them shifts made a day with two of them read as one.
      hint:
        ahead.length > 0
          ? `${n(ahead.length, 'days')} ${t('ahead')}`
          : t('Nothing put down yet'),
      to: '/payouts',
    },
    {
      id: 'overtime',
      icon: TrendingUp,
      label: t('Overtime'),
      value: `${Math.round(summary.overtime_hours)}`,
      hint: summary.overtime_hours > 0 ? t('hours past the norm') : t('nothing past the norm'),
      to: '/stats',
      tone: summary.overtime_hours > 0 ? 'warn' : undefined,
    },
    {
      id: 'withheld',
      icon: Receipt,
      label: t('Withheld'),
      value: withheld > 0 ? money(withheld) : '·',
      hint: withheld > 0 ? t('fines and meals') : t('nothing withheld'),
      to: '/payouts',
      tone: withheld > 0 ? 'danger' : undefined,
    },
    {
      id: 'streak',
      icon: Flame,
      label: t('In a row'),
      value: `${streak.run}`,
      hint:
        streak.record > streak.run
          ? `${w(streak.run, 'days')} ${t('with no day off')} · ${t('record')} ${streak.record}`
          : `${w(streak.run, 'days')} ${t('with no day off')}`,
      to: '/wrapped',
    },
    {
      id: 'places',
      icon: Building2,
      label: t('Where the money comes from'),
      value: topPlace(summary) ?? '·',
      hint: topShare(summary, t),
      to: '/stats',
    },
    {
      id: 'guests',
      icon: Users,
      label: t('Guests'),
      value: `${summary.guests_counted}`,
      hint:
        summary.guests_counted > 0 && tips > 0
          ? `${money(tips / summary.guests_counted)} ${t('a guest')}`
          : t('where they were counted'),
      to: '/stats',
    },
    {
      id: 'week',
      icon: CalendarRange,
      label: t('Days worked'),
      value: `${worked.length}`,
      // Days the server has a row for, not days in the month: a month with
      // fourteen worked days and two coloured ones read «из 16 в месяце».
      hint: t('of {days} in the month', { days: daysInMonth }),
      to: '/stats',
    },
  ];

  return (
    /* A row that scrolls sideways on a phone, a grid from tablet up. Twelve
       tiles stacked two-wide put six screens of scrolling between somebody
       and the calendar they opened the app for. */
    <section
      aria-label={t('Overview')}
      className={cn(
        'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1',
        '[&>*]:w-[62%] [&>*]:flex-none [&>*]:snap-start',
        'sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 sm:[&>*]:w-auto xl:grid-cols-6',
      )}
    >
      {tiles.map((tile) => (
        <Link
          key={tile.id}
          to={tile.to as '/'}
          className="card group flex flex-col gap-1 p-3.5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
        >
          <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-faint">
            <tile.icon className="size-3.5" />
            {tile.label}
          </span>
          <span
            className={cn(
              'tabular text-xl font-bold leading-tight',
              tile.tone === 'good' && 'text-good',
              tile.tone === 'warn' && 'text-warn',
              tile.tone === 'danger' && 'text-danger',
            )}
          >
            {tile.value}
          </span>
          <span className="field-hint">{tile.hint}</span>
        </Link>
      ))}
    </section>
  );
}

/** Days in a row up to today, counted backwards from the newest worked day. */
function topPlace(summary: DaysResponse): string | null {
  const named = summary.by_location.filter(
    (place) => place.location_id !== 0 && place.name.trim() !== '',
  );

  return [...named].sort((one, two) => two.earned - one.earned)[0]?.name ?? null;
}

function topShare(summary: DaysResponse, t: (key: string) => string): string {
  const named = summary.by_location.filter(
    (place) => place.location_id !== 0 && place.name.trim() !== '',
  );
  const top = [...named].sort((one, two) => two.earned - one.earned)[0];

  if (top === undefined || summary.total_earned <= 0) return t('this month');

  return `${Math.round((top.earned / summary.total_earned) * 100)}% ${t('of the month')}`;
}
