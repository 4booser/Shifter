'use client';

import { useMemo } from 'react';

import { monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { forecastFor } from '@/lib/calendar/forecast';
import { insightsFor } from '@/lib/calendar/insights-feed';
import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { useCalendar } from '@/lib/store/calendar';

const WEEKDAY_KEYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** Substitutes {name} placeholders after translation. */
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}

/**
 * What the numbers are quietly saying, as a row of cards. At most three: an
 * observation feed that scrolls is a report, and nobody reads reports.
 */
export function InsightsPanel() {
  const { t, lang } = useI18n();
  const { format } = useMoney();
  const summary = useCalendar((state) => state.summary);
  const previous = useCalendar((state) => state.previousSummary);
  const days = useCalendar((state) => state.days);

  const insights = useMemo(() => {
    const today = todayKey();

    /*
     * Прогноз строится по тому месяцу, чью сводку мы держим.
     *
     * Раньше сюда шли границы текущего месяца, а дни — показанного: листаешь
     * календарь в август, а темп считается по сентябрьскому окну. Дни августа
     * все оказываются «в прошлом» относительно первого сентября, будущих дней
     * в окне нет, и прогноз выходил около нуля — отсюда «пока на 100% ниже
     * прошлого месяца» над месяцем с двадцатью двумя сменами.
     *
     * Границы теперь берутся у самой сводки; `live` внутри сам решит, есть ли
     * ещё что прогнозировать.
     */
    const first = summary.days[0]?.date ?? today;
    const bounds = monthBounds(first);
    const forecast = forecastFor(summary.days, bounds.from, bounds.to);

    return insightsFor({
      summary,
      previous,
      forecast,
      days: [...days.values()],
      today,
      weekdayNames: WEEKDAY_KEYS.map((key) => t(key)),
      formatMoney: format,
      formatNumber: (value) => value.toLocaleString(lang, { maximumFractionDigits: 1 }),
    }).slice(0, 3);
  }, [summary, previous, days, t, lang, format]);

  if (insights.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map((insight, index) => (
        <div key={insight.id} className="insight reveal" data-tone={insight.tone} style={stagger(index + 8)}>
          <span className="text-[1.1rem] leading-none">{insight.icon}</span>
          <span>{fill(t(insight.key), insight.vars)}</span>
        </div>
      ))}
    </div>
  );
}
