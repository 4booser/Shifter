import { Bars, BarRow, Panel } from '@/components/charts/bars';
import { streakOf } from '@/lib/calendar/streak';
import { daysWord, timesWord } from '@/lib/text/plural';
import { kindName } from '@/lib/text/kinds';
import { DaysResponse } from '@/lib/calendar/models';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';

/**
 * The chapters of the year.
 *
 * Each one answers a question the totals cannot, and each returns nothing at
 * all when the year has no answer for it — a year with no fines should not be
 * told it has no fines, it should simply not be asked.
 */

/** Every day of the year, one square each. The shape of the work. */
export function YearGrid({ summary, year }: { summary: DaysResponse; year: number }) {
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

  const months = ['я', 'ф', 'м', 'а', 'м', 'и', 'и', 'а', 'с', 'о', 'н', 'д'];
  const columnOf = (stamp: number) =>
    Math.floor((weekdayOfFirst + Math.round((stamp - Date.UTC(year, 0, 1)) / 86_400_000)) / 7);
  // 10px squares with a 3px gap, minus the gap the last column does not need.
  const gridWidth = (columnOf(Date.UTC(year, 11, 31)) + 1) * 13 - 3;

  return (
    <Panel title="Год по дням" hint="Чем гуще квадрат, тем больше принёс день.">
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
      ? { label: 'Лучший день', value: money(best.earned), hint: pretty(best.date) }
      : null,
    bestMonth !== undefined && bestMonth[1] > 0
      ? {
          label: 'Лучший месяц',
          value: money(bestMonth[1]),
          hint: new Date(`${bestMonth[0]}-15T12:00:00`).toLocaleDateString('ru', { month: 'long' }),
        }
      : null,
    longestShift !== undefined && longestShift.entry.hours > 0
      ? {
          label: 'Самая длинная смена',
          value: `${longestShift.entry.hours} ч`,
          hint: pretty(longestShift.day.date),
        }
      : null,
    streak.record > 1
      ? { label: 'Без выходного', value: `${streak.record} ${daysWord(streak.record)}`, hint: 'подряд' }
      : null,
  ].filter((fact): fact is { label: string; value: string; hint: string } => fact !== null);

  if (facts.length === 0) return null;

  return (
    <Panel title="Рекорды года">
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
  unset: 'не сказано',
  hall: 'зал',
  bar: 'бар',
  terrace: 'терраса',
  banquet: 'банкет',
  takeaway: 'навынос',
};

/** Where the tips were denser, per hour actually stood there. */
export function ZoneTips({ summary }: { summary: DaysResponse }) {
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
        shown: `${money(zone.tips_per_hour)}/ч`,
        hint: `${Math.round(zone.hours)} ч · ${zone.shifts} см.`,
      }),
    );

  if (rows.length < 2) return null;

  return (
    <Panel title="Где чаевые были гуще" hint="За час, действительно проведённый там.">
      <Bars rows={rows} highlight={rows[0]?.key} />
    </Panel>
  );
}

/** Every time the rate moved, and what the move has been worth since. */
export function Raises({ summary }: { summary: DaysResponse }) {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  if (summary.raises.length === 0) return null;

  return (
    <Panel title="Как двигалась ставка" hint="И сколько это принесло с тех пор.">
      <ul className="flex flex-col gap-2">
        {summary.raises.slice(0, 6).map((raise) => {
          const up = raise.after >= raise.before;

          return (
            <li
              key={`${raise.shift_id}:${raise.on}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
            >
              <span className="text-sm font-medium">{raise.shift_name}</span>
              <span className="field-hint">{pretty(raise.on)}</span>
              <span className="ml-auto text-sm font-semibold tabular">
                <span className="text-muted-foreground">{money(raise.before)}</span>
                {' → '}
                <span style={{ color: up ? 'var(--good)' : 'var(--danger)' }}>
                  {money(raise.after)}
                </span>
              </span>
              {raise.worth_since !== 0 && (
                <span className="w-full field-hint">
                  с тех пор это {up ? 'принесло' : 'стоило'} {money(Math.abs(raise.worth_since))}
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
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const rows = summary.expenses_by_kind
    .filter((split) => split.amount > 0)
    .map(
      (split): BarRow => ({
        key: split.kind,
        label: kindName(split.kind),
        value: split.amount,
        shown: money(split.amount),
        hint: `${split.count} ${timesWord(split.count)}`,
        colour: 'var(--warn)',
      }),
    );

  if (rows.length === 0) return null;

  return (
    <Panel
      title="Во что обошлась работа"
      hint={
        summary.travel_share_of_tips == null
          ? 'Это не вычтено из заработка — это случилось после него.'
          : `Дорога съела ${Math.round(summary.travel_share_of_tips)}% чаевых.`
      }
    >
      <Bars rows={rows} />
    </Panel>
  );
}

/** Money that left, or has not arrived yet, and is easy to forget. */
export function Elsewhere({ summary }: { summary: DaysResponse }) {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const facts = [
    summary.tax > 0 ? { label: 'Ушло налогом', value: money(summary.tax) } : null,
    summary.tip_out > 0 ? { label: 'Отдано в котёл', value: money(summary.tip_out) } : null,
    summary.deductions > 0 ? { label: 'Удержано', value: money(summary.deductions) } : null,
    summary.holiday_accrued > 0
      ? { label: 'Отпускных накопилось', value: money(summary.holiday_accrued) }
      : null,
    summary.overtime_earned > 0
      ? { label: 'За переработку', value: money(summary.overtime_earned) }
      : null,
    summary.guests_counted > 0
      ? { label: 'Гостей обслужено', value: `${summary.guests_counted}` }
      : null,
    summary.average_cheque != null
      ? { label: 'Средний чек', value: money(summary.average_cheque) }
      : null,
    summary.night_hours > 0
      ? { label: 'Ночных часов', value: `${Math.round(summary.night_hours)}` }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  if (facts.length === 0) return null;

  return (
    <Panel title="И ещё вот столько" hint="То, что обычно проходит мимо счёта.">
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

function pretty(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString('ru', {
    day: 'numeric',
    month: 'long',
  });
}
