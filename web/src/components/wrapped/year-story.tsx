'use client';

import { DaysResponse } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';

/**
 * The year, written out.
 *
 * Every number on this page is a fact standing alone; a person reading their
 * own year wants the sentences those facts make together — «столько часов, из
 * них столько ночью, и час стоил вот столько, а к концу года — вот столько».
 * Composed here rather than on the server because it is the same arithmetic
 * the cards below already did, and a paragraph is not worth a round trip.
 *
 * Nothing is invented and nothing is advice: where a figure is missing the
 * sentence about it simply does not appear.
 */
export function YearStory({
  year,
  summary,
  previous,
}: {
  year: number;
  summary: DaysResponse;
  previous: DaysResponse;
}) {
  const { t, n, lang } = useI18n();
  const { format } = useMoney();

  const shifts = summary.days.reduce(
    (count, day) => count + day.shifts.filter((entry) => entry.worked).length,
    0,
  );

  if (shifts === 0) return null;

  const perHour = summary.hours >= 1 ? summary.total_earned / summary.hours : 0;
  const beforeHour = previous.hours > 0 ? previous.total_earned / previous.hours : 0;
  const tipShare =
    summary.total_earned > 0 ? Math.round((summary.tips_earned / summary.total_earned) * 100) : 0;
  const nightShare =
    summary.hours >= 1 ? Math.round((summary.night_hours / summary.hours) * 100) : 0;
  const grew = beforeHour > 0 ? Math.round((perHour / beforeHour - 1) * 100) : null;
  // Only a place somebody actually named: «came from No location» is the app
  // reading its own placeholder out loud.
  const topPlace =
    [...summary.by_location]
      .filter((place) => place.location_id !== 0 && place.name.trim() !== '')
      .sort((one, two) => two.earned - one.earned)[0] ?? null;
  const raise = summary.raises[0] ?? null;
  const days = new Set(
    summary.days.filter((day) => day.shifts.some((entry) => entry.worked)).map((day) => day.date),
  ).size;

  // The sentences, each guarded by the fact it needs. Joined with spaces so
  // the paragraph reads as prose rather than as a list wearing a paragraph's
  // clothes.
  const lines: string[] = [];

  lines.push(
    `${t('In the year')} ${year} ${t('you worked')} ${n(shifts, 'shifts')} ${t('across')} ${n(days, 'days')} — ${n(Math.round(summary.hours), 'hours')} ${t('in all')}, ${t('and they came to')} ${format(summary.total_earned)}.`,
  );

  lines.push(
    `${t('An hour of your year was worth')} ${format(perHour)}${
      grew === null
        ? '.'
        : grew === 0
          ? `, ${t('exactly what it was worth last year')}.`
          : grew > 0
            ? ` — ${t('on')} ${grew}% ${t('more than last year')}.`
            : ` — ${t('on')} ${Math.abs(grew)}% ${t('less than last year')}.`
    }`,
  );

  if (summary.tips_earned > 0) {
    lines.push(
      `${t('Tips brought')} ${format(summary.tips_earned)}${tipShare > 0 ? ` — ${tipShare}% ${t('of everything')}` : ''}.`,
    );
  }

  if (summary.night_hours > 0) {
    lines.push(
      `${nightShare}% ${t('of those hours were night ones')} — ${n(Math.round(summary.night_hours), 'hours')} ${t('after the city went quiet')}.`,
    );
  }

  if (summary.overtime_hours > 0) {
    lines.push(
      `${n(Math.round(summary.overtime_hours), 'hours')} ${t('went past the week’s ceiling')}${
        summary.overtime_earned > 0 ? `, ${t('and the premium for them was')} ${format(summary.overtime_earned)}` : ''
      }.`,
    );
  }

  if (topPlace !== null && summary.by_location.length > 1) {
    const share = Math.round((topPlace.earned / summary.total_earned) * 100);

    lines.push(`${t('Most of it')} — ${share}% — ${t('came from')} ${topPlace.name}.`);
  }

  if (raise !== null) {
    lines.push(
      `${t('Your rate moved on')} ${new Date(`${raise.on}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long' })}: ${format(raise.before)} → ${format(raise.after)}${
        raise.worth_since > 0 ? `, ${t('worth')} ${format(raise.worth_since)} ${t('since')}` : ''
      }.`,
    );
  }

  if (summary.deductions > 0) {
    lines.push(`${format(summary.deductions)} ${t('was withheld in fines and meals')}.`);
  }

  if (summary.expenses > 0) {
    lines.push(
      `${t('Getting to work cost')} ${format(summary.expenses)}${
        summary.travel_share_of_tips !== null
          ? ` — ${summary.travel_share_of_tips}% ${t('of the tips')}`
          : ''
      }.`,
    );
  }

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1.5 text-[0.98rem] font-bold">{t('Your year, written out')}</h2>
      <p className="text-[0.95rem] leading-relaxed text-muted">{lines.join(' ')}</p>
      <p className="field-hint mt-2">
        {t('Every figure here is your own record. Nothing is an estimate and nothing is advice.')}
      </p>
    </section>
  );
}
