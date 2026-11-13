'use client';

import { useState } from 'react';

import { WEEKDAY_LABELS } from '@/lib/calendar/calendar-date';
import { WeekRow, toggleWeekday } from '@/lib/calendar/shift-hours';
import { useI18n } from '@/lib/i18n';
import { runsOvernight } from '@/lib/roster/hours';
import { HoursDraft } from '@/lib/roster/people';
import { Icon } from '@/components/ui/icon';

/** Marks where a dialog should open focused. An attribute, because showModal reads it after React's own autoFocus has already run and lost. */
export const takeFocus = (node: HTMLElement | null) => node?.setAttribute('autofocus', '');

/** The native time pickers, with what a pair of times means said under them. */
export function HoursFields({
  start,
  end,
  focused,
  onChange,
}: {
  start: string;
  end: string;
  focused: boolean;
  onChange: (start: string, end: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="field-label">{t('Start')}</span>
          <input
            ref={focused ? takeFocus : undefined}
            type="time"
            className="field-input"
            value={start}
            onChange={(event) => onChange(event.target.value, end)}
          />
        </label>
        <label>
          <span className="field-label">{t('Ends')}</span>
          <input
            type="time"
            className="field-input"
            value={end}
            onChange={(event) => onChange(start, event.target.value)}
          />
        </label>
      </div>
      {start !== '' && start === end && (
        <p className="field-hint !text-danger-read">{t('Start and end time must differ.')}</p>
      )}
      {runsOvernight(start, end) && (
        <p className="field-hint">{t('It ends the next day and stays on this date.')}</p>
      )}
    </div>
  );
}

/** Weekdays sharing a set of hours, a row each: the template editor's way of saying a week, here for the venue and for anybody's late Friday. */
export function WeekRowsEditor({
  rows,
  start,
  end,
  onChange,
  emptyHint,
}: {
  rows: WeekRow[];
  /** The hours a new row starts with. */
  start: string;
  end: string;
  onChange: (rows: WeekRow[]) => void;
  /** What the days in no row do, already in the reader's language. */
  emptyHint: string;
}) {
  const { t } = useI18n();

  const changeRow = (index: number, change: Partial<WeekRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={index} className="rounded-(--radius) border border-border p-2">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                className={`btn btn-sm !px-0 ${row.weekdays.includes(day + 1) ? 'btn-primary' : 'btn-quiet'}`}
                aria-pressed={row.weekdays.includes(day + 1)}
                onClick={() => onChange(toggleWeekday(rows, index, day + 1))}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="time"
              className="field-input min-w-0 flex-1"
              aria-label={t('Start')}
              value={row.start}
              onChange={(event) => changeRow(index, { start: event.target.value })}
            />
            <span className="text-faint">–</span>
            <input
              type="time"
              className="field-input min-w-0 flex-1"
              aria-label={t('Ends')}
              value={row.end}
              onChange={(event) => changeRow(index, { end: event.target.value })}
            />
            <button
              type="button"
              className="btn btn-quiet btn-sm btn-danger flex-none"
              aria-label={t('Remove')}
              onClick={() => onChange(rows.filter((_, at) => at !== index))}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
          {row.weekdays.length === 0 && (
            <p className="field-hint mt-1 !text-danger-read">{t('Pick the days for each set of hours, or remove the row.')}</p>
          )}
          {/* Whatever holds the save back is said under its row, as HoursFields says it for the main pair. */}
          {(row.start === '' || row.end === '') && (
            <p className="field-hint mt-1 !text-danger-read">{t('Fill in both times.')}</p>
          )}
          {row.start !== '' && row.start === row.end && (
            <p className="field-hint mt-1 !text-danger-read">{t('Start and end time must differ.')}</p>
          )}
        </div>
      ))}

      <button
        type="button"
        className="btn btn-quiet btn-sm self-start"
        onClick={() => onChange([...rows, { weekdays: [], start, end }])}
      >
        <Icon name="plus" size={12} />
        {t('Add hours')}
      </button>

      <p className="field-hint">{emptyHint}</p>
    </div>
  );
}

/** A pair of hours of one's own, a position's or a person's, with the odd weekday folded away under it. */
export function OwnHoursFields<Mode extends string>({
  hours,
  onChange,
}: {
  hours: HoursDraft<Mode>;
  onChange: (hours: HoursDraft<Mode>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(hours.rows.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <HoursFields
        start={hours.start}
        end={hours.end}
        focused={false}
        onChange={(start, end) => onChange({ ...hours, start, end })}
      />

      <details
        className="rounded-(--radius) border border-border p-2.5"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-[0.86rem] font-semibold">{t('Other hours on some days')}</summary>
        <div className="mt-2">
          <WeekRowsEditor
            rows={hours.rows}
            start={hours.start}
            end={hours.end}
            emptyHint={t('Days in no row run the main time above.')}
            onChange={(rows) => onChange({ ...hours, rows })}
          />
        </div>
      </details>
    </div>
  );
}
