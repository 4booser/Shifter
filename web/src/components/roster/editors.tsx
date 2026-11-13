'use client';

import { useEffect, useRef, useState } from 'react';

import type {
  PersonHoursMode,
  RosterPattern,
  RosterPerson,
  RosterPersonSave,
  RosterPosition,
  RosterShift,
} from '@/lib/api/roster';
import { YearMonth, todayKey } from '@/lib/calendar/calendar-date';
import type { WeekHours } from '@/lib/calendar/models';
import { flatOf } from '@/lib/calendar/shift-hours';
import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import { Brush, sameBrush } from '@/lib/roster/brushes';
import { compactHours, isBare, pairOf, sameHours, validHours } from '@/lib/roster/hours';
import {
  HoursDraft,
  INHERIT,
  MAX_POSITIONS,
  NO_PATTERN,
  POSITION_LENGTH,
  ROSTER_COLOURS,
  cleanPerson,
  draftOf,
  nextFrom,
  patternLabel,
  rowsReady,
} from '@/lib/roster/people';
import { defaultOnWeekday, isoWeekday } from '@/lib/roster/rules';
import { Segmented, SwatchRow } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { HoursFields, OwnHoursFields, takeFocus } from './hours-editor';
import { PatternFields } from './pattern-fields';

export { HoursFields } from './hours-editor';

/**
 * One cell. Nothing to press: hours land as soon as they make a shift, so
 * closing the dialog never loses them and never adds one nobody asked for. The
 * usual time and no time come first, since they are what a day mostly holds;
 * a day somebody else can take is handed over from here.
 */
export function CellForm({
  shift,
  usual,
  brushes,
  free,
  focused,
  onSet,
  onClear,
  onSwap,
  onClose,
}: {
  shift: RosterShift | null;
  /** This person's usual time that day, or null when nothing gives them one. */
  usual: Brush | null;
  brushes: Brush[];
  /** Who is free that day, in the order they are listed. */
  free: RosterPerson[];
  /** A wide screen goes straight to the keyboard; on a phone it would throw a picker over the chips. */
  focused: boolean;
  /** Null is a day with no set time. */
  onSet: (hours: Brush | null) => void;
  onClear: () => void;
  onSwap: (personId: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const held = shift === null ? null : pairOf(shift);
  const [start, setStart] = useState(held?.start ?? '');
  const [end, setEnd] = useState(held?.end ?? '');

  const change = (nextStart: string, nextEnd: string) => {
    setStart(nextStart);
    setEnd(nextEnd);

    if (validHours(nextStart, nextEnd)) onSet({ start: nextStart, end: nextEnd });
  };

  const put = (hours: Brush | null) => () => {
    onSet(hours);
    onClose();
  };

  const bare = shift !== null && isBare(shift);
  const usualHere = usual !== null && shift !== null && sameHours(held, usual);
  // The usual pair has its own chip up front.
  const pairs = usual === null ? brushes : brushes.filter((brush) => !sameBrush(brush, usual));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {usual !== null && (
          <button
            type="button"
            className={`chip !text-[0.82rem] ${usualHere ? 'chip-accent' : 'hover:bg-surface-2'}`}
            aria-pressed={usualHere}
            onClick={put(usual)}
          >
            {t('As usual')} · <span className="tabular">{compactHours(usual.start, usual.end)}</span>
          </button>
        )}
        <button
          type="button"
          className={`chip !text-[0.82rem] ${bare ? 'chip-accent' : 'hover:bg-surface-2'}`}
          aria-pressed={bare}
          onClick={put(null)}
        >
          {t('No set time')}
        </button>
      </div>

      {pairs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pairs.map((brush) => {
            const chosen = sameBrush(brush, { start, end });

            return (
              <button
                key={`${brush.start}-${brush.end}`}
                type="button"
                className={`chip tabular !text-[0.82rem] ${chosen ? 'chip-accent' : 'hover:bg-surface-2'}`}
                aria-pressed={chosen}
                onClick={put(brush)}
              >
                {compactHours(brush.start, brush.end)}
              </button>
            );
          })}
        </div>
      )}

      <HoursFields start={start} end={end} focused={focused} onChange={change} />

      {shift !== null && (
        <button
          type="button"
          className="btn btn-sm self-start"
          onClick={() => {
            onClear();
            onClose();
          }}
        >
          <Icon name="trash" size={14} />
          {t('Clear')}
        </button>
      )}

      {shift !== null && free.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="field-label !mb-0">{t('Replace with')}</span>
          <div className="flex flex-wrap gap-1.5">
            {free.map((person) => (
              <button
                key={person.id}
                type="button"
                className="chip min-h-8 max-w-full !text-[0.8rem] hover:bg-surface-2"
                onClick={() => {
                  onSwap(person.id);
                  onClose();
                }}
              >
                <Icon name="swap" size={11} className="flex-none" />
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: person.colour }} />
                <span className="min-w-0 truncate">{person.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The one brush that does not exist yet. */
export function BrushForm({ onMade }: { onMade: (brush: Brush) => void }) {
  const { t } = useI18n();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <HoursFields
        start={start}
        end={end}
        focused
        onChange={(nextStart, nextEnd) => {
          setStart(nextStart);
          setEnd(nextEnd);
        }}
      />
      <button
        type="button"
        className="btn btn-primary self-start"
        disabled={!validHours(start, end)}
        onClick={() => onMade({ start, end })}
      >
        {t('Use these hours')}
      </button>
    </div>
  );
}

/** What a person's time is today, in one line, for the folded section that changes it: today's own weekday row when there is one. */
export function usualLine(
  hours: HoursDraft<PersonHoursMode>,
  positionId: number | null,
  positions: RosterPosition[],
  venueHours: WeekHours[],
  t: (key: string) => string,
  today = todayKey(),
): string {
  const weekday = isoWeekday(today);

  if (hours.mode === 'own') {
    // Rows half set count for nothing yet, as on save.
    const week = rowsReady(hours.rows) ? flatOf(hours.rows) : [];
    const usual = defaultOnWeekday(
      { position_id: positionId, hours: { mode: 'own', start_time: hours.start, end_time: hours.end, week_hours: week } },
      [],
      [],
      weekday,
    );

    return validHours(hours.start, hours.end) && usual !== null
      ? `${t('Own hours')} · ${compactHours(usual.start_time, usual.end_time)}`
      : t('Own hours');
  }

  const position = positions.find((one) => one.id === positionId);
  const usual = defaultOnWeekday({ position_id: positionId, hours: INHERIT }, positions, venueHours, weekday);

  if (usual === null) return t('No set time');

  const hoursText = compactHours(usual.start_time, usual.end_time);

  return position?.hours.mode === 'own' ? `${t('As their position')} · ${hoursText}` : `${t('As the venue')} · ${hoursText}`;
}

/** The position chips, and one more that turns into a box for a position the roster does not have yet. */
function PositionPick({
  positionId,
  positions,
  busy,
  onPick,
  onAddPosition,
}: {
  positionId: number | null;
  positions: RosterPosition[];
  busy: boolean;
  onPick: (positionId: number | null) => void;
  onAddPosition: (name: string) => Promise<RosterPosition | null>;
}) {
  const { t } = useI18n();
  const [typing, setTyping] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const boxOpen = typing !== null;

  // Once, as the box opens. A ref that focused would run on every render of
  // the form, and pull the caret back here from the name while it is typed.
  useEffect(() => {
    if (boxOpen) box.current?.focus();
  }, [boxOpen]);

  const ordered = [...positions].sort((one, two) => one.id - two.id);

  const add = async () => {
    const name = (typing ?? '').trim();

    if (name === '') return setProblem(t('Position is required.'));
    if (name.length > POSITION_LENGTH) return setProblem(t('Position must be at most 40 characters.'));
    if (positions.some((one) => one.name.trim().toLowerCase() === name.toLowerCase())) {
      return setProblem(t('A position with that name is already on this roster.'));
    }

    const made = await onAddPosition(name);

    if (made === null) return;

    setTyping(null);
    setProblem(null);
    onPick(made.id);
  };

  return (
    <div>
      <span className="field-label">{t('Position')}</span>

      {typing === null ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Position')}>
          {[null, ...ordered].map((position) => {
            const id = position?.id ?? null;
            const chosen = positionId === id;

            return (
              <button
                key={id ?? 'none'}
                type="button"
                className={`chip max-w-full !text-[0.82rem] ${chosen ? 'chip-accent' : 'hover:bg-surface-2'}`}
                aria-pressed={chosen}
                onClick={() => onPick(id)}
              >
                <span className="min-w-0 truncate">{position?.name ?? t('No position')}</span>
              </button>
            );
          })}
          {positions.length < MAX_POSITIONS && (
            <button type="button" className="chip !text-[0.82rem] hover:bg-surface-2" onClick={() => setTyping('')}>
              <Icon name="plus" size={12} />
              {t('New position')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              ref={box}
              className="field-input min-w-0 flex-1"
              aria-label={t('New position')}
              maxLength={POSITION_LENGTH}
              placeholder={t('Bartender, hookah master, admin')}
              value={typing}
              onChange={(event) => {
                setTyping(event.target.value);
                setProblem(null);
              }}
              onKeyDown={(event) => {
                // The person form around it would take Enter as adding the person.
                if (event.key !== 'Enter') return;

                event.preventDefault();
                void add();
              }}
            />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void add()}>
              {t('Add')}
            </button>
            <button
              type="button"
              className="btn btn-quiet !px-2"
              aria-label={t('Cancel')}
              onClick={() => {
                setTyping(null);
                setProblem(null);
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {problem !== null && <p className="field-hint !text-danger-read">{problem}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Adding someone stays open for the next name, because a crew arrives all at
 * once, and keeps the position, hours and days, since the next person is
 * usually the same kind. Editing has no button: it saves as it goes, like the
 * cells, once every section is whole.
 */
export function PersonForm({
  person,
  suggested,
  positions,
  venueHours,
  month,
  busy,
  onAdd,
  onEdit,
  onRemove,
  onAddPosition,
}: {
  person: RosterPerson | null;
  suggested: string;
  positions: RosterPosition[];
  venueHours: WeekHours[];
  /** The month on screen, which the working days are shown against. */
  month: YearMonth;
  busy: boolean;
  onAdd: (save: RosterPersonSave) => Promise<boolean>;
  onEdit: (id: number, save: RosterPersonSave) => void;
  onRemove: (id: number) => void;
  onAddPosition: (name: string) => Promise<RosterPosition | null>;
}) {
  const { t, lang } = useI18n();
  const nameBox = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(person?.name ?? '');
  const [picked, setPicked] = useState<string | null>(person?.colour ?? null);
  const [positionId, setPositionId] = useState<number | null>(person?.position_id ?? null);
  const [hours, setHours] = useState<HoursDraft<PersonHoursMode>>(() => draftOf(person?.hours ?? INHERIT));
  const [pattern, setPattern] = useState<RosterPattern>(person?.pattern ?? NO_PATTERN);
  const [daysOpen, setDaysOpen] = useState(person === null || person.pattern.kind !== 'none');
  const [hoursOpen, setHoursOpen] = useState(person !== null && person.hours.mode === 'own');
  const colour = picked ?? suggested;

  const fields = { name, colour, positionId, hours, pattern };

  const remove = useArmed(() => {
    if (person !== null) onRemove(person.id);
  });

  const change = (next: Partial<typeof fields>) => {
    const all = { ...fields, ...next };

    setName(all.name);
    setPositionId(all.positionId);
    setHours(all.hours);
    setPattern(all.pattern);

    // Only a colour someone chose: typing a name must not pin the one suggested.
    if (all.colour !== colour) setPicked(all.colour);

    if (person === null) return;

    // A name half typed or a section half set is a change in progress, not one worth refusing.
    const save = cleanPerson(all);

    if (save !== null) onEdit(person.id, save);
  };

  const save = cleanPerson(fields);

  const add = async () => {
    if (save === null || !(await onAdd(save))) return;

    setName('');
    setPicked(null);
    setPattern(nextFrom(pattern));
    nameBox.current?.focus();
  };

  const inherits = positions.some((one) => one.id === positionId) ? t('As their position') : t('As the venue');

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (person === null) void add();
      }}
    >
      <label>
        <span className="field-label">{t('First name')}</span>
        <input
          ref={(node) => {
            nameBox.current = node;
            takeFocus(node);
          }}
          className="field-input"
          maxLength={40}
          value={name}
          onChange={(event) => change({ name: event.target.value })}
        />
      </label>

      <PositionPick
        positionId={positionId}
        positions={positions}
        busy={busy}
        onPick={(id) => change({ positionId: id })}
        onAddPosition={onAddPosition}
      />

      <div>
        <span className="field-label">{t('Colour')}</span>
        <SwatchRow
          colours={ROSTER_COLOURS.map((value) => ({ value, label: value }))}
          value={colour}
          fold={0}
          onPick={(value) => change({ colour: value })}
        />
      </div>

      <details
        className="rounded-(--radius) border border-border p-2.5"
        open={daysOpen}
        onToggle={(event) => setDaysOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer items-center gap-2 text-[0.86rem] font-semibold">
          <span className="flex-1">{t('Working days')}</span>
          <span className="truncate text-[0.8rem] font-medium text-muted">{patternLabel(pattern, t, lang)}</span>
        </summary>
        <div className="mt-2.5">
          <PatternFields pattern={pattern} month={month} onChange={(next) => change({ pattern: next })} />
        </div>
      </details>

      <details
        className="rounded-(--radius) border border-border p-2.5"
        open={hoursOpen}
        onToggle={(event) => setHoursOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer items-center gap-2 text-[0.86rem] font-semibold">
          <span className="flex-1">{t('Own hours')}</span>
          <span className="truncate text-[0.8rem] font-medium text-muted">
            {usualLine(hours, positionId, positions, venueHours, t)}
          </span>
        </summary>
        <div className="mt-2.5 flex flex-col gap-2.5">
          <Segmented<PersonHoursMode>
            size="sm"
            value={hours.mode}
            options={[
              { value: 'inherit', label: inherits },
              { value: 'own', label: t('Own hours') },
            ]}
            onChange={(mode) => {
              // Own hours start from what the person has today, which is usually close.
              const today = defaultOnWeekday(
                { position_id: positionId, hours: INHERIT },
                positions,
                venueHours,
                isoWeekday(todayKey()),
              );

              change({
                hours:
                  mode === 'own' && hours.start === '' && hours.end === ''
                    ? { ...hours, mode, start: today?.start_time ?? '', end: today?.end_time ?? '' }
                    : { ...hours, mode },
              });
            }}
          />
          {hours.mode === 'own' && <OwnHoursFields hours={hours} onChange={(next) => change({ hours: next })} />}
        </div>
      </details>

      {person !== null && <p className="field-hint">{t('Shifts from today that sit at the usual time move to the new one.')}</p>}

      {person === null ? (
        <button type="submit" className="btn btn-primary self-start" disabled={busy || save === null}>
          <Icon name="plus" size={14} />
          {t('Add')}
        </button>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            className={`btn btn-sm ${remove.armed ? 'btn-armed' : ''}`}
            onClick={remove.press}
          >
            <Icon name="trash" size={14} />
            {t(remove.armed ? 'Press again to remove' : 'Remove')}
          </button>
          <p className="field-hint">{t('Their shifts go too, in every month.')}</p>
        </div>
      )}
    </form>
  );
}

/** A roster needs a title before it can exist. */
export function NewRosterForm({ busy, onCreate }: { busy: boolean; onCreate: (title: string) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (title.trim() !== '') onCreate(title.trim());
      }}
    >
      <label>
        <span className="field-label">{t('Title')}</span>
        <input
          ref={takeFocus}
          className="field-input"
          maxLength={60}
          placeholder={t('Our bar')}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary self-start" disabled={busy || title.trim() === ''}>
        {t('Create')}
      </button>
    </form>
  );
}
