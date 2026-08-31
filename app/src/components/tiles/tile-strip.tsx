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
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const worked = days.filter((day) => day.shifts.some((entry) => entry.worked));
  const streak = streakOf(worked.map((day) => day.date));
  const shifts = days.reduce(
    (count, day) => count + day.shifts.filter((entry) => entry.worked).length,
    0,
  );
  const perHour = summary.hours > 0 ? summary.total_earned / summary.hours : 0;
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
      label: 'Заработано',
      value: money(summary.total_earned),
      hint: `${shifts} смен · ${Math.round(summary.hours)} ч`,
      to: '/stats',
      tone: 'good',
    },
    {
      id: 'hourly',
      icon: Clock,
      label: 'Твой час',
      value: perHour > 0 ? money(perHour) : '·',
      hint: summary.hours > 0 ? `${Math.round(summary.hours)} ч в этом месяце` : 'Часов пока нет',
      to: '/stats',
    },
    {
      id: 'tips',
      icon: Sparkles,
      label: 'Чаевые',
      value: money(tips),
      hint:
        summary.total_earned > 0
          ? `${Math.round((tips / summary.total_earned) * 100)}% от заработка`
          : 'в этом месяце',
      to: '/stats',
    },
    {
      id: 'best',
      icon: Trophy,
      label: 'Лучший день',
      value: best === null ? '·' : money(best.earned),
      hint:
        best === null
          ? 'в этом месяце'
          : fromKey(best.date).toLocaleDateString('ru', { day: 'numeric', month: 'long' }),
      to: '/report',
    },
    {
      id: 'nights',
      icon: Moon,
      label: 'Ночные часы',
      value: `${Math.round(nights)}`,
      hint:
        summary.hours > 0 ? `${Math.round((nights / summary.hours) * 100)}% всех часов` : 'в этом месяце',
      to: '/stats',
    },
    {
      id: 'planned',
      icon: CalendarClock,
      label: 'Ещё впереди',
      value: ahead.length > 0 ? money(ahead.reduce((sum, day) => sum + day.planned, 0)) : '·',
      hint: ahead.length > 0 ? `${ahead.length} смен впереди` : 'Пока ничего не поставлено',
      to: '/payouts',
    },
    {
      id: 'overtime',
      icon: TrendingUp,
      label: 'Переработка',
      value: `${Math.round(summary.overtime_hours)}`,
      hint: summary.overtime_hours > 0 ? 'часов сверх нормы' : 'ничего сверх нормы',
      to: '/report',
      tone: summary.overtime_hours > 0 ? 'warn' : undefined,
    },
    {
      id: 'withheld',
      icon: Receipt,
      label: 'Удержано',
      value: withheld > 0 ? money(withheld) : '·',
      hint: withheld > 0 ? 'штрафы и питание' : 'ничего не удержано',
      to: '/payslip',
      tone: withheld > 0 ? 'danger' : undefined,
    },
    {
      id: 'streak',
      icon: Flame,
      label: 'Подряд',
      value: `${streak.run}`,
      hint:
        streak.record > streak.run
          ? `дней без выходного · рекорд ${streak.record}`
          : 'дней без выходного',
      to: '/wrapped',
    },
    {
      id: 'places',
      icon: Building2,
      label: 'Откуда деньги',
      value: topPlace(summary) ?? '·',
      hint: topShare(summary),
      to: '/report',
    },
    {
      id: 'guests',
      icon: Users,
      label: 'Гостей',
      value: `${summary.guests_counted}`,
      hint:
        summary.guests_counted > 0 && tips > 0
          ? `${money(tips / summary.guests_counted)} с гостя`
          : 'там, где считали',
      to: '/stats',
    },
    {
      id: 'week',
      icon: CalendarRange,
      label: 'Дней отработано',
      value: `${worked.length}`,
      hint: `из ${days.length} в месяце`,
      to: '/report',
    },
  ];

  return (
    <section aria-label="Обзор" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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

function topShare(summary: DaysResponse): string {
  const named = summary.by_location.filter(
    (place) => place.location_id !== 0 && place.name.trim() !== '',
  );
  const top = [...named].sort((one, two) => two.earned - one.earned)[0];

  if (top === undefined || summary.total_earned <= 0) return 'в этом месяце';

  return `${Math.round((top.earned / summary.total_earned) * 100)}% месяца`;
}
