'use client';

import { useMemo } from 'react';

import type { RosterPerson, RosterPosition, RosterShift } from '@/lib/api/roster';
import { WEEKDAY_LABELS, formatDayLabelShort } from '@/lib/calendar/calendar-date';
import { readableInk } from '@/lib/calendar/contrast';
import { useI18n } from '@/lib/i18n';
import { BARE, Brush, Tool, USUAL, sameTool, toggleTool } from '@/lib/roster/brushes';
import { cellText, compactHours } from '@/lib/roster/hours';
import { RosterDay, cellKey } from '@/lib/roster/month';
import type { PositionGroup } from '@/lib/roster/rules';
import { Icon } from '@/components/ui/icon';
import { useLongPress } from './long-press';

/** What a click puts in a cell: the usual time, no time, or one of the hour pairs held ready, plus one to make. */
export function ToolRow({
  brushes,
  tool,
  onTool,
  onMake,
}: {
  brushes: Brush[];
  tool: Tool | null;
  onTool: (tool: Tool | null) => void;
  onMake: () => void;
}) {
  const { t } = useI18n();

  const chip = (one: Tool, label: string, tabular = false) => {
    const chosen = sameTool(tool, one);

    return (
      <button
        key={one.kind === 'hours' ? `${one.brush.start}-${one.brush.end}` : one.kind}
        type="button"
        className={`chip !text-[0.82rem] ${tabular ? 'tabular' : ''} ${chosen ? 'chip-accent' : 'hover:bg-surface-2'}`}
        aria-pressed={chosen}
        onClick={() => onTool(toggleTool(tool, one))}
      >
        {label}
      </button>
    );
  };

  const hint =
    tool === null
      ? t('Pick hours and click the days. With none picked, a click opens the cell.')
      : tool.kind === 'usual'
        ? t('Click a day to put a shift at the usual time, click again to take it off. A day with other hours opens instead.')
        : tool.kind === 'bare'
          ? t('Click a day to put a shift with no set time, click again to take it off. A day with hours opens instead.')
          : t('Click a day to set these hours, click it again to clear them.');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="field-label !mb-0 mr-1">{t('Brush')}</span>

      {chip(USUAL, t('As usual'))}
      {chip(BARE, t('No set time'))}
      {brushes.map((brush) => chip({ kind: 'hours', brush }, compactHours(brush.start, brush.end), true))}

      <button type="button" className="chip !text-[0.82rem] hover:bg-surface-2" onClick={onMake}>
        <Icon name="plus" size={12} />
        {t('Other hours')}
      </button>

      <span className="field-hint ml-1">
        {hint}
        {tool !== null && ` ${t('Right-click opens a day.')}`}
      </span>
    </div>
  );
}

/** People by every day of the month, position by position. The names stay put while the days scroll under them. */
export function RosterTable({
  days,
  groups,
  labelled,
  cells,
  onCell,
  onCellMenu,
  onPerson,
}: {
  days: RosterDay[];
  groups: PositionGroup<RosterPerson, RosterPosition>[];
  /** Whether each group gets a line naming its position: only once the roster has any. */
  labelled: boolean;
  cells: Map<string, RosterShift>;
  onCell: (personId: number, date: string) => void;
  /** A right-click or a held finger: open the day whatever the tool. */
  onCellMenu: (personId: number, date: string) => void;
  onPerson: (person: RosterPerson) => void;
}) {
  const { t, lang } = useI18n();
  const hold = useLongPress();

  // Once per month and not per cell: a date formatter is slow to build, and
  // this table can hold two thousand of them.
  const dates = useMemo(() => days.map((day) => formatDayLabelShort(day.key, lang)), [days, lang]);

  return (
    /* No side padding on the scroller: a sticky column stops at its edge, and the days would show through the gap. */
    <section className="card overflow-x-auto py-3">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-r border-border bg-surface py-1 pl-3 pr-2 text-left text-[0.78rem] font-semibold text-muted">
              <span className="sr-only">{t('Who')}</span>
            </th>
            {days.map((day) => (
              <th
                key={day.key}
                scope="col"
                title={day.closed ? t('the venue is closed') : undefined}
                className={`px-0.5 py-1 text-center text-[0.68rem] font-medium last:pr-3 ${
                  day.weekend ? 'bg-surface-2 text-warn-read' : 'text-faint'
                } ${day.weekday === 0 ? 'border-l border-border' : ''} ${day.closed ? 'opacity-45' : ''}`}
              >
                <span className="block">{t(WEEKDAY_LABELS[day.weekday])}</span>
                <span
                  className={`mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-[0.74rem] font-semibold tabular ${
                    day.isToday ? 'bg-(--accent) text-(--accent-ink)' : ''
                  }`}
                  aria-current={day.isToday ? 'date' : undefined}
                >
                  {day.dayOfMonth}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map(({ position, people }) => (
          <tbody key={position?.id ?? 'none'}>
            {labelled && (
              <tr>
                <th
                  scope="rowgroup"
                  className="sticky left-0 z-10 max-w-44 truncate border-r border-t border-border bg-surface py-0.5 pl-3 pr-1 text-left text-[0.7rem] font-semibold text-muted"
                >
                  {position?.name ?? t('No position')}
                </th>
                <td colSpan={days.length} className="border-t border-border py-0.5" />
              </tr>
            )}
            {people.map((person) => (
              <tr key={person.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-44 border-r border-t border-border bg-surface py-1 pl-2 pr-1 text-left font-normal"
                >
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-surface-2"
                    title={t('Edit this person')}
                    onClick={() => onPerson(person)}
                  >
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: person.colour }} />
                    <span className="block min-w-0 truncate text-[0.84rem] font-medium">{person.name}</span>
                  </button>
                </th>
                {days.map((day, index) => {
                  const shift = cells.get(cellKey(person.id, day.key));
                  const hours = shift === undefined ? null : cellText(shift);
                  const said = shift === undefined ? t('day off') : (hours ?? t('no set time'));

                  return (
                    <td
                      key={day.key}
                      className={`border-t border-border p-0.5 last:pr-3 ${
                        day.isToday ? 'bg-(--accent-soft)' : day.weekend ? 'bg-surface-2' : ''
                      } ${day.weekday === 0 ? 'border-l' : ''} ${day.closed && shift === undefined ? 'roster-shut' : ''}`}
                    >
                      <button
                        type="button"
                        aria-label={`${person.name}, ${dates[index]}: ${said}`}
                        className="block h-9 w-full min-w-8 touch-manipulation select-none whitespace-nowrap rounded text-[0.7rem] font-semibold outline-offset-1 [-webkit-touch-callout:none] hover:outline hover:outline-1 hover:outline-(--accent)"
                        style={
                          shift === undefined
                            ? undefined
                            : { background: person.colour, color: readableInk(person.colour) }
                        }
                        {...hold(
                          () => onCell(person.id, day.key),
                          () => onCellMenu(person.id, day.key),
                        )}
                      >
                        {shift === undefined ? null : (hours ?? <span aria-hidden>•</span>)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}
