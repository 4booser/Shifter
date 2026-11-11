'use client';

import { useRef, useState } from 'react';

import type { RosterPerson, RosterPersonSave, RosterShift } from '@/lib/api/roster';
import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import { Brush, sameBrush } from '@/lib/roster/brushes';
import { compactHours, runsOvernight, validHours } from '@/lib/roster/hours';
import { ROSTER_COLOURS, cleanPerson } from '@/lib/roster/people';
import { SwatchRow } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/** Marks where a dialog should open focused. An attribute, because showModal reads it after React's own autoFocus has already run and lost. */
const takeFocus = (node: HTMLElement | null) => node?.setAttribute('autofocus', '');

/** The native time pickers, with what a pair of times means said under them. */
function HoursFields({
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

/** One cell. Nothing to press: hours land as soon as they make a shift, so closing the dialog never loses them and never adds one nobody asked for. */
export function CellForm({
  shift,
  brushes,
  focused,
  onSet,
  onClear,
  onClose,
}: {
  shift: RosterShift | null;
  brushes: Brush[];
  /** A wide screen goes straight to the keyboard; on a phone it would throw a picker over the chips. */
  focused: boolean;
  onSet: (brush: Brush) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [start, setStart] = useState(shift?.start_time ?? '');
  const [end, setEnd] = useState(shift?.end_time ?? '');

  const change = (nextStart: string, nextEnd: string) => {
    setStart(nextStart);
    setEnd(nextEnd);

    if (validHours(nextStart, nextEnd)) onSet({ start: nextStart, end: nextEnd });
  };

  return (
    <div className="flex flex-col gap-3">
      {brushes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {brushes.map((brush) => {
            const chosen = sameBrush(brush, { start, end });

            return (
              <button
                key={`${brush.start}-${brush.end}`}
                type="button"
                className={`chip tabular !text-[0.82rem] ${chosen ? 'chip-accent' : ''}`}
                aria-pressed={chosen}
                onClick={() => {
                  onSet(brush);
                  onClose();
                }}
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

/** Adding someone stays open for the next name, because a crew arrives all at once. Editing has no button: it saves as it goes, like the cells. */
export function PersonForm({
  person,
  suggested,
  busy,
  onAdd,
  onEdit,
  onRemove,
}: {
  person: RosterPerson | null;
  suggested: string;
  busy: boolean;
  onAdd: (save: RosterPersonSave) => Promise<boolean>;
  onEdit: (id: number, save: RosterPersonSave) => void;
  onRemove: (id: number) => void;
}) {
  const { t } = useI18n();
  const nameBox = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(person?.name ?? '');
  const [position, setPosition] = useState(person?.position ?? '');
  const [picked, setPicked] = useState<string | null>(person?.colour ?? null);
  const colour = picked ?? suggested;

  const remove = useArmed(() => {
    if (person !== null) onRemove(person.id);
  });

  const change = (nextName: string, nextPosition: string, nextColour: string) => {
    setName(nextName);
    setPosition(nextPosition);

    // Only a colour someone chose: typing a name must not pin the one suggested.
    if (nextColour !== colour) setPicked(nextColour);

    // An empty name is a word half typed, not a change worth refusing.
    if (person !== null && nextName.trim() !== '') {
      onEdit(person.id, cleanPerson(nextName, nextPosition, nextColour));
    }
  };

  const add = async () => {
    if (!(await onAdd(cleanPerson(name, position, colour)))) return;

    setName('');
    setPosition('');
    setPicked(null);
    nameBox.current?.focus();
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (person === null && name.trim() !== '') void add();
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
          onChange={(event) => change(event.target.value, position, colour)}
        />
      </label>

      <label>
        <span className="field-label">{t('Position')}</span>
        <input
          className="field-input"
          maxLength={40}
          placeholder={t('Bar, hookahs, admin')}
          value={position}
          onChange={(event) => change(name, event.target.value, colour)}
        />
      </label>

      <div>
        <span className="field-label">{t('Colour')}</span>
        <SwatchRow
          colours={ROSTER_COLOURS.map((value) => ({ value, label: value }))}
          value={colour}
          fold={0}
          onPick={(value) => change(name, position, value)}
        />
      </div>

      {person === null ? (
        <button type="submit" className="btn btn-primary self-start" disabled={busy || name.trim() === ''}>
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
