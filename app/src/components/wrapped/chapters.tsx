import { Bars, BarRow, Panel } from '@/components/charts/bars';
import { streakOf } from '@/lib/calendar/streak';
import { kindName } from '@/lib/text/kinds';
import { DaysResponse } from '@/lib/calendar/models';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { useI18n } from '@/lib/i18n';

/**
 * The chapters of the year.
 *
 * Each one answers a question the totals cannot, and each returns nothing at
 * all when the year has no answer for it — a year with no fines should not be
 * told it has no fines, it should simply not be asked.
 */

/** Every day of the year, one square each. The shape of the work. */
export function YearGrid({ summary, year }: { summary: DaysResponse; year: number }) {
  const { t, lang } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const earned = new Map(summary.days.map((day) => [day.date, day.earned]));
  const peak = Math.max(1, ...summary.days.map((day) => day.earned));

  if (earned.size === 0) return null;

  // Squares are laid out in week columns, so a year is 53 columns wide and
  // reads the way a wall planner does.
  const start = new Date(Date.UTC(year, 0, 1));
  const weekdayOfFirst = (start.getUTCDay() + 6) % 7;
  const days = Math.round(
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000,
  );

  const cells: { key: string; date: string | null; value: number }[] = [];

  for (let slot = 0; slot < weekdayOfFirst; slot += 1) {
    cells.push({ key: `pad-${slot}`, date: null, value: 0 });
  }

  for (let index = 0; index < days; index += 1) {
    const at = new Date(Date.UTC(year, 0, 1 + index));
    const key = at.toISOString().slice(0, 10);

    cells.push({ key, date: key, value: earned.get(key) ?? 0 });
  }

  /*
   * The twelve initials were written out in Russian, and Ukrainian's months
   * do not share them: «березень» is not «м», «жовтень» is not «о». Asked of
   * the locale, they are right in every language and stay right.
   */
  const narrow = new Intl.DateTimeFormat(lang, { month: 'narrow' });
  const months = Array.from({ length: 12 }, (_, index) =>
    narrow.format(new Date(Date.UTC(2026, index, 15))).toLowerCase(),
  );
  const columnOf = (stamp: number) =>
    Math.floor((weekdayOfFirst + Math.round((stamp - Date.UTC(year, 0, 1)) / 86_400_000)) / 7);
  // 10px squares with a 3px gap, minus the gap the last column does not need.
  const gridWidth = (columnOf(Date.UTC(year, 11, 31)) + 1) * 13 - 3;

  return (
    <Panel title={t('The year, day by day')} hint={t('The denser the square, the more the day brought.')}>
      <div className="overflow-x-auto">
        <div className="flex min-w-max flex-col gap-1">
          <div
            className="grid grid-flow-col grid-rows-7 gap-[3px]"
            style={{ gridAutoColumns: '10px' }}
          >
            {cells.map((cell) => (
              <span
                key={cell.key}
                title={
                  cell.date === null
                    ? undefined
                    : cell.value > 0
                      ? `${cell.date} · ${money(cell.value)}`
                      : cell.date
                }
                className="size-[10px] rounded-[2px]"
                style={{
                  background:
                    cell.date === null
                      ? 'transparent'
                      : cell.value > 0
                        ? 'var(--accent)'
                        : 'var(--surface-2)',
                  opacity:
                    cell.date === null || cell.value === 0
                      ? 1
                      : 0.35 + 0.65 * (cell.value / peak),
                }}
              />
            ))}
          </div>

          {/* Each month sits over the week it starts in. Spreading twelve
              labels evenly under a grid that starts on a Thursday puts every
              one of them over the wrong column. */}
          <div className="relative h-4 text-2xs text-faint" style={{ width: gridWidth }}>
            {months.map((month, index) => (
              <span
                key={`${month}-${index}`}
                className="absolute top-0"
                style={{ left: columnOf(Date.UTC(year, index, 1)) * 13 }}
              >
                {month}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** The year's high-water marks. */
export function Records({ summary }: { summary: DaysResponse }) {
  const { t, n, num, lang } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const worked = summary.days.filter((day) => day.shifts.some((entry) => entry.worked));
  const best = [...summary.days].sort((one, two) => two.earned - one.earned)[0];
  /* The longest single shift, not the longest day: two six-hour shifts on
     one date are not a twelve-hour shift, and calling them one would be the
     app inventing a record nobody worked. */
  const longestShift = summary.days
    .flatMap((day) => day.shifts.filter((entry) => entry.worked).map((entry) => ({ day, entry })))
    .sort((one, two) => two.entry.hours - one.entry.hours)[0];

  const byMonth = new Map<string, number>();

  for (const day of summary.days) {
    const month = day.date.slice(0, 7);

    byMonth.set(month, (byMonth.get(month) ?? 0) + day.earned);
  }

  const bestMonth = [...byMonth.entries()].sort((one, two) => two[1] - one[1])[0];
  const streak = streakOf(worked.map((day) => day.date));

  const facts = [
    best !== undefined && best.earned > 0
      ? { label: t('Best single day'), value: money(best.earned), hint: pretty(best.date, lang) }
      : null,
    bestMonth !== undefined && bestMonth[1] > 0
      ? {
          label: t('Best month'),
          value: money(bestMonth[1]),
          hint: new Date(`${bestMonth[0]}-15T12:00:00`).toLocaleDateString(lang, { month: 'long' }),
        }
      : null,
    longestShift !== undefined && longestShift.entry.hours > 0
      ? {
          label: t('The longest shift'),
          value: `${num(longestShift.entry.hours)} ${t('h')}`,
          hint: pretty(longestShift.day.date, lang),
        }
      : null,
    streak.record > 1
      ? { label: t('No day off'), value: n(streak.record, 'days'), hint: t('in a row') }
      : null,
  ].filter((fact): fact is { label: string; value: string; hint: string } => fact !== null);

  if (facts.length === 0) return null;

  return (
    <Panel title={t('The year’s records')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col">
            <dt className="field-hint">{fact.label}</dt>
            <dd className="text-lg font-bold tabular">{fact.value}</dd>
            <dd className="field-hint">{fact.hint}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

const ZONE_NAMES: Record<string, string> = {
  unset: 'unsaid',
  hall: 'the floor',
  bar: 'the bar',
  terrace: 'the terrace',
  banquet: 'a function',
  takeaway: 'takeaway',
};

/** Where the tips were denser, per hour actually stood there. */
export function ZoneTips({ summary }: { summary: DaysResponse }) {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const rows = summary.by_zone
    .filter((zone) => zone.hours > 0 && zone.tips > 0)
    .sort((one, two) => two.tips_per_hour - one.tips_per_hour)
    .map(
      (zone): BarRow => ({
        key: zone.zone,
        label: ZONE_NAMES[zone.zone] ?? zone.zone,
        value: zone.tips_per_hour,
        shown: `${money(zone.tips_per_hour)}/${t('h')}`,
        hint: `${Math.round(zone.hours)} ${t('h')} · ${zone.shifts} ${t('sh.')}`,
      }),
    );

  if (rows.length < 2) return null;

  return (
    <Panel title={t('Where the tips were thicker')} hint={t('Per hour actually spent there.')}>
      <Bars rows={rows} highlight={rows[0]?.key} />
    </Panel>
  );
}

/** Every time the rate moved, and what the move has been worth since. */
export function Raises({ summary }: { summary: DaysResponse }) {
  const { t, lang } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  if (summary.raises.length === 0) return null;

  return (
    <Panel title={t('How the rate moved')} hint={t('And what it has brought since.')}>
      <ul className="flex flex-col gap-2">
        {summary.raises.slice(0, 6).map((raise) => {
          const up = raise.after >= raise.before;

          return (
            <li
              key={`${raise.shift_id}:${raise.on}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
            >
              <span className="text-sm font-medium">{raise.shift_name}</span>
              <span className="field-hint">{pretty(raise.on, lang)}</span>
              <span className="ml-auto text-sm font-semibold tabular">
                <span className="text-muted-foreground">{money(raise.before)}</span>
                {' → '}
                <span style={{ color: up ? 'var(--good)' : 'var(--danger)' }}>
                  {money(raise.after)}
                </span>
              </span>
              {raise.worth_since !== 0 && (
                <span className="w-full field-hint">
                  {t('since then that has {verb} {money}', {
                    verb: up ? t('brought') : t('cost'),
                    money: money(Math.abs(raise.worth_since)),
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}


/** What the work cost. Never subtracted from anything: it happened after. */
export function CostOfWork({ summary }: { summary: DaysResponse }) {
  const { t, n } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const rows = summary.expenses_by_kind
    .filter((split) => split.amount > 0)
    .map(
      (split): BarRow => ({
        key: split.kind,
        label: t(kindName(split.kind)),
        value: split.amount,
        shown: money(split.amount),
        hint: n(split.count, 'times'),
        colour: 'var(--warn)',
      }),
    );

  if (rows.length === 0) return null;

  return (
    <Panel
      title={t('What the work cost')}
      hint={
        summary.travel_share_of_tips == null
          ? t('This is not taken off the earnings — it happened after them.')
          : t('Travel ate {percent}% of the tips.', {
              percent: Math.round(summary.travel_share_of_tips),
            })
      }
    >
      <Bars rows={rows} />
    </Panel>
  );
}

/** Money that left, or has not arrived yet, and is easy to forget. */
export function Elsewhere({ summary }: { summary: DaysResponse }) {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const facts = [
    summary.tax > 0 ? { label: t('Went in tax'), value: money(summary.tax) } : null,
    summary.tip_out > 0 ? { label: t('Handed to the pool'), value: money(summary.tip_out) } : null,
    summary.deductions > 0 ? { label: t('Withheld'), value: money(summary.deductions) } : null,
    summary.holiday_accrued > 0
      ? { label: t('Holiday pay accrued'), value: money(summary.holiday_accrued) }
      : null,
    summary.overtime_earned > 0
      ? { label: t('For overtime'), value: money(summary.overtime_earned) }
      : null,
    summary.guests_counted > 0
      ? { label: t('Guests served'), value: `${summary.guests_counted}` }
      : null,
    summary.average_cheque != null
      ? { label: t('Average cheque'), value: money(summary.average_cheque) }
      : null,
    summary.night_hours > 0
      ? { label: t('Night hours'), value: `${Math.round(summary.night_hours)}` }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  if (facts.length === 0) return null;

  return (
    <Panel title={t('And this much besides')} hint={t('The things that usually go uncounted.')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col">
            <dt className="field-hint">{fact.label}</dt>
            <dd className="text-sm font-semibold tabular">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function pretty(key: string, lang: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString(lang, {
    day: 'numeric',
    month: 'long',
  });
}
