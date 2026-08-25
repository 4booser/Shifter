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
  const { t } = useI18n();
  const { format } = useMoney();
  const summary = useCalendar((state) => state.summary);
  const previous = useCalendar((state) => state.previousSummary);
  const days = useCalendar((state) => state.days);

  const insights = useMemo(() => {
    const today = todayKey();
    const bounds = monthBounds(today);
    const forecast = forecastFor(summary.days, bounds.from, bounds.to);

    return insightsFor({
      summary,
      previous,
      forecast,
      days: [...days.values()],
      today,
      weekdayNames: WEEKDAY_KEYS.map((key) => t(key)),
      formatMoney: format,
    }).slice(0, 3);
  }, [summary, previous, days, t, format]);

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
