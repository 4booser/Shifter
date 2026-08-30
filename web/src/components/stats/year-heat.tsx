'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { todayKey } from '@/lib/calendar/calendar-date';
import { HeatCell, heatGrid } from '@/lib/stats/year-heat';
import { useRouter } from 'next/navigation';

import { calendarActions, useCalendar } from '@/lib/store/calendar';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';

/**
 * The year as a strip of week columns — where the season fed the wallet and
 * where it starved it. An empty cell is a day nobody recorded; a cold one is
 * a recorded zero. Those are different facts and get different paint.
 */
export function YearHeat() {
  const { t, lang } = useI18n();
  const { format } = useMoney();

  const router = useRouter();
  const [days, setDays] = useState<{ date: string; earned: number }[] | null>(null);
  const [picked, setPicked] = useState<HeatCell | null>(null);

  useEffect(() => {
    const today = todayKey();
    const start = new Date(`${today}T12:00:00`);

    start.setDate(start.getDate() - 53 * 7);

    const from = start.toISOString().slice(0, 10);

    void calendarApi
      .days(from, today)
      .then((summary) => setDays(summary.days.map((day) => ({ date: day.date, earned: day.earned }))))
      .catch(() => setDays([]));
  }, []);

  const grid = useMemo(
    () => (days === null ? null : heatGrid(days, todayKey())),
    [days],
  );

  // The strip opens on the freshest weeks; the far left is a year ago.
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (grid !== null && strip.current !== null)
      strip.current.scrollLeft = strip.current.scrollWidth;
  }, [grid]);

  if (grid === null || days === null || days.length < 30) return null;

  const monthName = (month: number) =>
    new Date(2026, month - 1, 15).toLocaleDateString(lang, { month: 'short' });

  const say = (cell: HeatCell) => {
    const label = new Date(`${cell.date}T12:00:00`).toLocaleDateString(lang, {
      day: 'numeric',
      month: 'long',
    });

    if (cell.earned === null) return `${label} — ${t('not recorded')}`;

    return `${label} · ${format(cell.earned)}`;
  };

  return (
    <section className="panel p-5">
      <h2 className="text-[0.98rem] font-bold">{t('The year in squares')}</h2>
      <p className="mt-0.5 text-[0.78rem] text-muted">
        {t('Colour is the earnings quartile among the paid days. An empty cell is a day without a record — that is not a zero.')}
      </p>

      <div ref={strip} className="mt-3 overflow-x-auto pb-1">
        <div className="min-w-fit">
          <div className="relative ml-8 h-4 text-[0.62rem] text-faint" style={{ width: grid.weeks.length * 14 }}>
            {grid.months.map((month) => (
              <span
                key={`${month.index}-${month.label}`}
                className="absolute top-0 whitespace-nowrap"
                style={{ left: month.index * 14 }}
              >
                {monthName(month.label)}
              </span>
            ))}
          </div>

          <div className="mt-1 flex gap-[3px]">
            <div className="flex w-8 flex-col gap-[3px] pr-1 text-right text-[0.62rem] text-faint">
              {[t('Mon'), '', t('Wed'), '', t('Fri'), '', ''].map((label, row) => (
                <div key={row} className="h-[11px] leading-[11px]">{label}</div>
              ))}
            </div>

            {grid.weeks.map((week, index) => (
              <div key={index} className="flex shrink-0 flex-col gap-[3px]">
                {week.map((cell) => (
                  <button
                    key={cell.date}
                    type="button"
                    aria-label={say(cell)}
                    onMouseEnter={() => setPicked(cell)}
                    onFocus={() => setPicked(cell)}
                    onMouseLeave={() => setPicked(null)}
                    onClick={() => {
                      // The hover already names the date; a click owes the
                      // reader the day itself.
                      useCalendar.setState({
                        month: { year: Number(cell.date.slice(0, 4)), month: Number(cell.date.slice(5, 7)) },
                      });
                      calendarActions.select(cell.date);
                      router.push('/dashboard');
                    }}
                    className="h-[11px] w-[11px] rounded-[3px] border"
                    style={
                      cell.level === null
                        ? { borderColor: 'var(--border)', background: 'transparent' }
                        : {
                            borderColor: 'transparent',
                            background: `color-mix(in oklab, var(--accent) ${[14, 32, 55, 78, 100][cell.level]}%, var(--surface))`,
                          }
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[0.72rem] text-muted">
        <span className="min-h-[1rem]">{picked !== null ? say(picked) : ''}</span>
        <span className="flex items-center gap-1">
          {t('less')}
          {[14, 32, 55, 78, 100].map((share) => (
            <i
              key={share}
              className="inline-block h-[9px] w-[9px] rounded-[2px]"
              style={{ background: `color-mix(in oklab, var(--accent) ${share}%, var(--surface))` }}
            />
          ))}
          {t('more')}
        </span>
      </div>
    </section>
  );
}
